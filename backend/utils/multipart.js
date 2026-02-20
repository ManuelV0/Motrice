const HttpError = require('./httpError');

const BOUNDARY_SAFE_RE = /^[0-9A-Za-z'()+_,\-./:=?]{1,200}$/;

function parseContentDisposition(value) {
  const nameMatch = /name="([^"]+)"/i.exec(value || '');
  const fileMatch = /filename="([^"]*)"/i.exec(value || '');
  return {
    fieldName: nameMatch ? nameMatch[1] : null,
    fileName: fileMatch ? fileMatch[1] : null
  };
}

function readStream(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new HttpError(413, `Payload too large. Max ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (error) => reject(error));
  });
}

async function parseMultipartForm(
  req,
  {
    maxBytes = 6 * 1024 * 1024,
    maxParts = 30,
    maxFieldCount = 20,
    maxFileCount = 10,
    maxFieldBytes = 100 * 1024,
    maxFileBytes = 5 * 1024 * 1024
  } = {}
) {
  const contentType = String(req.headers['content-type'] || '');
  const boundaryMatch = /boundary=([^;]+)/i.exec(contentType);
  if (!boundaryMatch) {
    throw new HttpError(400, 'Invalid multipart form: boundary missing');
  }

  const contentLengthRaw = req.headers['content-length'];
  if (contentLengthRaw !== undefined) {
    const contentLength = Number(contentLengthRaw);
    if (!Number.isInteger(contentLength) || contentLength < 0) {
      throw new HttpError(400, 'Invalid content-length');
    }
    if (contentLength > maxBytes) {
      throw new HttpError(413, `Payload too large. Max ${maxBytes} bytes`);
    }
  }

  const boundaryValue = String(boundaryMatch[1] || '')
    .trim()
    .replace(/^"|"$/g, '');
  if (!BOUNDARY_SAFE_RE.test(boundaryValue)) {
    throw new HttpError(400, 'Invalid multipart boundary');
  }

  const boundary = `--${boundaryValue}`;
  const buffer = await readStream(req, maxBytes);
  const body = buffer.toString('latin1');
  const rawParts = body.split(boundary).slice(1, -1);
  if (rawParts.length > maxParts) {
    throw new HttpError(413, `Too many multipart parts. Max ${maxParts}`);
  }

  const fields = {};
  const files = {};
  let fieldCount = 0;
  let fileCount = 0;

  for (const rawPart of rawParts) {
    let part = rawPart;
    if (part.startsWith('\r\n')) part = part.slice(2);
    if (part.endsWith('\r\n')) part = part.slice(0, -2);

    const separatorIndex = part.indexOf('\r\n\r\n');
    if (separatorIndex < 0) continue;

    const headerText = part.slice(0, separatorIndex);
    const payloadText = part.slice(separatorIndex + 4);
    if (headerText.length > 16 * 1024) {
      throw new HttpError(400, 'Multipart header too large');
    }

    const headers = {};
    for (const line of headerText.split('\r\n')) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      headers[key] = value;
    }

    const disposition = parseContentDisposition(headers['content-disposition']);
    if (!disposition.fieldName) continue;

    const payloadBuffer = Buffer.from(payloadText, 'latin1');
    if (disposition.fileName !== null && disposition.fileName !== '') {
      fileCount += 1;
      if (fileCount > maxFileCount) {
        throw new HttpError(413, `Too many files. Max ${maxFileCount}`);
      }
      if (payloadBuffer.length > maxFileBytes) {
        throw new HttpError(413, `File too large. Max ${maxFileBytes} bytes`);
      }

      const filePayload = {
        fieldName: disposition.fieldName,
        originalName: disposition.fileName,
        mimeType: headers['content-type'] || 'application/octet-stream',
        size: payloadBuffer.length,
        buffer: payloadBuffer
      };
      if (!files[disposition.fieldName]) {
        files[disposition.fieldName] = [];
      }
      files[disposition.fieldName].push(filePayload);
      continue;
    }

    fieldCount += 1;
    if (fieldCount > maxFieldCount) {
      throw new HttpError(413, `Too many form fields. Max ${maxFieldCount}`);
    }
    if (payloadBuffer.length > maxFieldBytes) {
      throw new HttpError(413, `Field too large. Max ${maxFieldBytes} bytes`);
    }

    const value = payloadBuffer.toString('utf8');
    if (fields[disposition.fieldName] === undefined) {
      fields[disposition.fieldName] = value;
    } else if (Array.isArray(fields[disposition.fieldName])) {
      fields[disposition.fieldName].push(value);
    } else {
      fields[disposition.fieldName] = [fields[disposition.fieldName], value];
    }
  }

  return { fields, files };
}

module.exports = {
  parseMultipartForm
};

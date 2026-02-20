const net = require('net');
const HttpError = require('../utils/httpError');

const DEFAULT_HOST = process.env.CLAMAV_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.CLAMAV_PORT || 3310);
const DEFAULT_TIMEOUT = Number(process.env.CLAMAV_TIMEOUT_MS || 8000);

function isEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.CLAMAV_ENABLED || '').toLowerCase());
}

function isFailOpen() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.CLAMAV_FAIL_OPEN || '').toLowerCase());
}

function parseScanResponse(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return { status: 'error', reason: 'Empty ClamAV response' };
  }
  if (text.includes('FOUND')) {
    return { status: 'infected', reason: text };
  }
  if (text.includes('OK')) {
    return { status: 'clean', reason: text };
  }
  return { status: 'error', reason: text };
}

function scanBufferWithClamd(buffer, { host = DEFAULT_HOST, port = DEFAULT_PORT, timeoutMs = DEFAULT_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    let response = '';

    function finishError(error) {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    }

    function finishSuccess(payload) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(payload);
    }

    socket.setTimeout(timeoutMs, () => {
      finishError(new Error(`ClamAV timeout after ${timeoutMs}ms`));
    });

    socket.on('error', (error) => {
      finishError(error);
    });

    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });

    socket.on('end', () => {
      finishSuccess(parseScanResponse(response));
    });

    socket.on('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0', 'utf8'));

      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const piece = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
        const len = Buffer.alloc(4);
        len.writeUInt32BE(piece.length, 0);
        socket.write(len);
        socket.write(piece);
      }

      const end = Buffer.alloc(4);
      end.writeUInt32BE(0, 0);
      socket.write(end);
      socket.end();
    });
  });
}

async function scanUploadBufferOrThrow(buffer, { fieldLabel = 'file' } = {}) {
  if (!isEnabled()) {
    return { enabled: false, scanned: false, status: 'skipped' };
  }

  try {
    const result = await scanBufferWithClamd(buffer);

    if (result.status === 'infected') {
      throw new HttpError(400, `${fieldLabel} blocked: malware detected`);
    }

    if (result.status !== 'clean') {
      if (isFailOpen()) {
        return { enabled: true, scanned: false, status: 'unavailable', detail: result.reason };
      }
      throw new HttpError(503, `Security scan unavailable for ${fieldLabel}`);
    }

    return { enabled: true, scanned: true, status: 'clean', detail: result.reason };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (isFailOpen()) {
      return { enabled: true, scanned: false, status: 'unavailable', detail: error.message };
    }

    throw new HttpError(503, `Security scan unavailable for ${fieldLabel}`);
  }
}

module.exports = {
  scanUploadBufferOrThrow
};

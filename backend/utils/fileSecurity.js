const HttpError = require('./httpError');

const MIME = {
  PDF: 'application/pdf',
  JPG: 'image/jpeg',
  PNG: 'image/png'
};

const pdfDangerPatterns = [
  /\/JavaScript\b/i,
  /\/JS\b/i,
  /\/Launch\b/i,
  /\/OpenAction\b/i,
  /\/AA\b/i,
  /\/RichMedia\b/i,
  /\/EmbeddedFile\b/i,
  /\/XFA\b/i,
  /\/SubmitForm\b/i
];

function sniffMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return MIME.PDF;
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return MIME.JPG;
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return MIME.PNG;
  }

  return null;
}

function assertSafePdfBuffer(buffer) {
  const content = buffer.toString('latin1');
  if (!content.includes('%PDF-')) {
    throw new HttpError(400, 'Invalid PDF structure');
  }

  if (!content.includes('%%EOF')) {
    throw new HttpError(400, 'Invalid PDF ending');
  }

  const suspiciousToken = pdfDangerPatterns.find((pattern) => pattern.test(content));
  if (suspiciousToken) {
    throw new HttpError(400, 'PDF blocked by security policy');
  }
}

function validateUploadBuffer(buffer, declaredMimeType, fieldLabel = 'file') {
  const sniffedMime = sniffMimeFromBuffer(buffer);
  if (!sniffedMime) {
    throw new HttpError(400, `${fieldLabel} type is invalid`);
  }

  if (declaredMimeType && declaredMimeType !== sniffedMime) {
    throw new HttpError(400, `${fieldLabel} MIME type mismatch`);
  }

  if (sniffedMime === MIME.PDF) {
    assertSafePdfBuffer(buffer);
  }

  return sniffedMime;
}

module.exports = {
  MIME,
  validateUploadBuffer
};

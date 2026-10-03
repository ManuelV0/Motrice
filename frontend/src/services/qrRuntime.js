let qrCodeRuntimePromise = null;
let qrScannerRuntimePromise = null;

function retryableImport(loader, reset) {
  return loader().catch((error) => {
    reset();
    throw error;
  });
}

export function loadQrCodeRuntime() {
  if (!qrCodeRuntimePromise) {
    qrCodeRuntimePromise = retryableImport(
      () => import('qrcode').then((module) => module.default || module),
      () => {
        qrCodeRuntimePromise = null;
      }
    );
  }
  return qrCodeRuntimePromise;
}

export async function createQrDataUrl(value, options) {
  const qrCode = await loadQrCodeRuntime();
  return qrCode.toDataURL(value, options);
}

export function loadQrScannerRuntime() {
  if (!qrScannerRuntimePromise) {
    qrScannerRuntimePromise = retryableImport(
      () => import('@zxing/browser').then((module) => module.BrowserQRCodeReader),
      () => {
        qrScannerRuntimePromise = null;
      }
    );
  }
  return qrScannerRuntimePromise;
}

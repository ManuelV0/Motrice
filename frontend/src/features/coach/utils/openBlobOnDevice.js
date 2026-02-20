function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function openBlobOnDevice(blob, { fallbackFileName = 'documento', forceDownload = false } = {}) {
  const url = URL.createObjectURL(blob);

  if (forceDownload) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fallbackFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }

  if (isMobileDevice()) {
    window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return;
  }

  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.assign(url);
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export { openBlobOnDevice };

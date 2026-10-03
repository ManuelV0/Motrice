const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'fetch failed',
  'load failed',
  'network error',
  'network request failed',
  'err_internet_disconnected',
  'err_network_changed',
  'the internet connection appears to be offline'
];

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function collectErrorMessages(error, messages = []) {
  if (!error) return messages;
  if (typeof error === 'string') {
    messages.push(error);
    return messages;
  }
  if (error?.message) messages.push(String(error.message));
  if (error?.cause && error.cause !== error) collectErrorMessages(error.cause, messages);
  return messages;
}

export function isNetworkError(error) {
  if (isBrowserOffline()) return true;
  const message = collectErrorMessages(error).join(' ').toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function getReadableLoadError(error, fallback = 'Impossibile aggiornare i dati') {
  if (isNetworkError(error)) {
    return 'Connessione assente. Controlla la rete e riprova.';
  }
  return String(error?.message || fallback).trim() || fallback;
}

export function normalizeCameraPermission(value) {
  const permission = String(value || '').toLowerCase();
  if (permission === 'granted') return 'granted';
  if (permission === 'prompt' || permission === 'prompt-with-rationale') return 'prompt';
  if (permission === 'denied') return 'denied';
  return 'unavailable';
}

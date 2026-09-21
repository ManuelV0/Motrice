export function normalizeCameraPermission(value) {
  const permission = String(value || '').toLowerCase();
  if (permission === 'granted') return 'granted';
  if (permission === 'prompt' || permission === 'prompt-with-rationale') return 'prompt';
  if (permission === 'denied') return 'denied';
  return 'unavailable';
}

export async function checkNativeProfileCameraPermission(plugin) {
  const result = await plugin.checkCameraPermission();
  return normalizeCameraPermission(result?.camera);
}

export async function requestNativeProfileCameraPermission(plugin) {
  const result = await plugin.requestCameraPermission();
  return normalizeCameraPermission(result?.camera);
}

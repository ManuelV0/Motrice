export const MAPLIBRE_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron'
};

const OPENSTREETMAP_RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const RASTER_TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';

export function getAndroidMajorVersion(userAgent = '') {
  const match = String(userAgent).match(/Android\s+([0-9]+)/i);
  return match ? Number(match[1]) : null;
}

export function shouldUseCompatibleMapRenderer({
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  deviceMemory = typeof navigator === 'undefined' ? null : navigator.deviceMemory
} = {}) {
  const androidMajor = getAndroidMajorVersion(userAgent);
  if (androidMajor != null && androidMajor <= 10) return true;
  return Number.isFinite(Number(deviceMemory)) && Number(deviceMemory) > 0 && Number(deviceMemory) <= 3;
}

export function canUseAcceleratedMapRenderer({
  documentRef = typeof document === 'undefined' ? null : document,
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  deviceMemory = typeof navigator === 'undefined' ? null : navigator.deviceMemory
} = {}) {
  if (!documentRef || shouldUseCompatibleMapRenderer({ userAgent, deviceMemory })) return false;
  try {
    const canvas = documentRef.createElement('canvas');
    const context = canvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
      powerPreference: 'low-power'
    });
    const available = Boolean(context);
    context?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
    return available;
  } catch {
    return false;
  }
}

export function getHighDefinitionPixelRatio() {
  if (typeof window === 'undefined') return 1.5;
  const ratio = Number(window.devicePixelRatio) || 1;
  const deviceMemory = Number(window.navigator?.deviceMemory);
  const safeMaximum = shouldUseCompatibleMapRenderer({
    userAgent: window.navigator?.userAgent || '',
    deviceMemory
  }) ? 1.5 : 2;
  return Math.min(safeMaximum, Math.max(1.25, ratio));
}

export function getHighDefinitionRasterTiles() {
  return {
    url: OPENSTREETMAP_RASTER_URL,
    options: {
      attribution: RASTER_TILE_ATTRIBUTION,
      maxZoom: 20,
      maxNativeZoom: 19,
      tileSize: 256,
      crossOrigin: true,
      detectRetina: true,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2
    }
  };
}

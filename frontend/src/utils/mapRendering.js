const OPENSTREETMAP_RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const SATELLITE_RASTER_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export const SATELLITE_TILE_ATTRIBUTION = 'Tiles &copy; Esri — Sources: Esri, Vantor, Earthstar Geographics, and the GIS User Community';

export const MAPLIBRE_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
  satellite: {
    version: 8,
    name: 'Motrice Satellite Hybrid',
    sources: {
      'motrice-satellite': {
        type: 'raster',
        tiles: [SATELLITE_RASTER_URL],
        tileSize: 256,
        maxzoom: 19,
        attribution: SATELLITE_TILE_ATTRIBUTION
      },
      'motrice-satellite-labels': {
        type: 'raster',
        tiles: [SATELLITE_LABELS_URL],
        tileSize: 256,
        maxzoom: 19
      }
    },
    layers: [
      {
        id: 'motrice-satellite-background',
        type: 'background',
        paint: { 'background-color': '#101510' }
      },
      {
        id: 'motrice-satellite-imagery',
        type: 'raster',
        source: 'motrice-satellite',
        paint: { 'raster-opacity': 1, 'raster-resampling': 'linear' }
      },
      {
        id: 'motrice-satellite-reference',
        type: 'raster',
        source: 'motrice-satellite-labels',
        paint: { 'raster-opacity': 0.96, 'raster-resampling': 'linear' }
      }
    ]
  }
};

export const RASTER_TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';

export function applyLocalizedMapLabels(map, { language = 'it' } = {}) {
  if (!map?.getStyle || !map?.setLayoutProperty) return 0;

  let layers;
  try {
    layers = map.getStyle()?.layers;
  } catch {
    return 0;
  }
  if (!Array.isArray(layers)) return 0;

  const localizedTextField = [
    'coalesce',
    ['get', `name_${language}`],
    ['get', `name:${language}`],
    ['get', 'name'],
    ['get', 'name_en'],
    ['get', 'name:latin']
  ];
  let updatedLayers = 0;

  layers.forEach((layer) => {
    const textField = layer?.layout?.['text-field'];
    if (layer?.type !== 'symbol' || textField == null) return;
    const serializedTextField = JSON.stringify(textField);
    if (!/name_en|name:nonlatin|name:latin/.test(serializedTextField)) return;
    try {
      map.setLayoutProperty(layer.id, 'text-field', localizedTextField);
      updatedLayers += 1;
    } catch {
      // A third-party style can expose immutable or transient layers while it
      // is loading. One label must never prevent the rest of the map opening.
    }
  });

  return updatedLayers;
}

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

export function getHighDefinitionRasterTiles(theme = 'light') {
  const sharedOptions = {
    maxZoom: 20,
    maxNativeZoom: 19,
    tileSize: 256,
    crossOrigin: true,
    detectRetina: true,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 2
  };

  if (theme === 'satellite') {
    return {
      url: SATELLITE_RASTER_URL,
      overlayUrl: SATELLITE_LABELS_URL,
      options: { ...sharedOptions, attribution: SATELLITE_TILE_ATTRIBUTION },
      overlayOptions: { ...sharedOptions, attribution: '' }
    };
  }

  return {
    url: OPENSTREETMAP_RASTER_URL,
    overlayUrl: null,
    options: { ...sharedOptions, attribution: RASTER_TILE_ATTRIBUTION },
    overlayOptions: null
  };
}

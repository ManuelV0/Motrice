const OPENSTREETMAP_RASTER_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const SATELLITE_RASTER_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export const SATELLITE_TILE_ATTRIBUTION = 'Tiles &copy; Esri — Sources: Esri, Vantor, Earthstar Geographics, and the GIS User Community';

export const MAPLIBRE_STYLES = {
  // Dark deliberately starts from the same cartographic document as light.
  // We recolor its layers after load so streets, labels and detail levels stay
  // perfectly aligned instead of drifting between two independent styles.
  dark: 'https://tiles.openfreemap.org/styles/positron',
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

const DARK_BASE_LAYER_COLORS = {
  background: '#101612',
  land: '#171d19',
  residential: '#1d231f',
  park: '#1b2a20',
  wood: '#18271e',
  ice: '#354143',
  water: '#16333d',
  building: '#282f2b',
  buildingOutline: '#36403a',
  aeroway: '#303833',
  roadArea: '#272e29',
  path: '#3d4741',
  minorRoad: '#55615a',
  majorRoad: '#87948b',
  motorway: '#a0ad95',
  roadCasing: '#2b322e',
  railway: '#626c66',
  railwayDash: '#a0a9a3',
  boundary: '#7b877f',
  waterway: '#3f7180',
  label: '#edf2ed',
  secondaryLabel: '#c8d1ca',
  waterLabel: '#98c8d5',
  labelHalo: '#0c120e'
};

function getDerivedDarkPaint(layer) {
  const id = String(layer?.id || '').toLowerCase();
  const sourceLayer = String(layer?.['source-layer'] || '').toLowerCase();
  const colors = DARK_BASE_LAYER_COLORS;

  if (layer?.type === 'background') {
    return { 'background-color': colors.background };
  }

  if (layer?.type === 'fill') {
    if (sourceLayer === 'water' || id.includes('water')) return { 'fill-color': colors.water };
    if (sourceLayer === 'park' || id.includes('park')) return { 'fill-color': colors.park };
    if (id.includes('wood')) return { 'fill-color': colors.wood };
    if (id.includes('ice') || id.includes('glacier')) return { 'fill-color': colors.ice };
    if (id.includes('residential')) return { 'fill-color': colors.residential };
    if (sourceLayer === 'building' || id.includes('building')) {
      return {
        'fill-color': colors.building,
        'fill-outline-color': colors.buildingOutline
      };
    }
    if (sourceLayer === 'aeroway' || id.includes('aeroway')) return { 'fill-color': colors.aeroway };
    if (id.includes('road') || id.includes('pier')) return { 'fill-color': colors.roadArea };
    return { 'fill-color': colors.land };
  }

  if (layer?.type === 'line') {
    if (sourceLayer === 'waterway' || id.includes('waterway')) return { 'line-color': colors.waterway };
    if (sourceLayer === 'boundary' || id.includes('boundary')) return { 'line-color': colors.boundary };
    if (sourceLayer === 'aeroway' || id.includes('aeroway')) return { 'line-color': colors.railway };
    if (id.includes('railway')) {
      return { 'line-color': id.includes('dash') ? colors.railwayDash : colors.railway };
    }
    if (id.includes('motorway')) {
      return { 'line-color': id.includes('casing') ? colors.roadCasing : colors.motorway };
    }
    if (id.includes('major')) {
      return { 'line-color': id.includes('casing') ? colors.roadCasing : colors.majorRoad };
    }
    if (id.includes('minor')) return { 'line-color': colors.minorRoad };
    if (id.includes('path')) return { 'line-color': colors.path };
    if (id.includes('road') || sourceLayer === 'transportation') return { 'line-color': colors.minorRoad };
    return { 'line-color': colors.secondaryLabel };
  }

  if (layer?.type === 'symbol') {
    const isWater = sourceLayer.includes('water') || id.includes('water');
    const isRoad = sourceLayer.includes('transportation') || id.includes('highway') || id.includes('road');
    return {
      'text-color': isWater ? colors.waterLabel : isRoad ? colors.secondaryLabel : colors.label,
      'text-halo-color': colors.labelHalo,
      'text-halo-width': isRoad ? 1.15 : 1.45,
      'text-halo-blur': 0.35
    };
  }

  return null;
}

export function applyDerivedDarkMapStyle(map) {
  if (!map?.getStyle || !map?.setPaintProperty) return 0;

  let layers;
  try {
    layers = map.getStyle()?.layers;
  } catch {
    return 0;
  }
  if (!Array.isArray(layers)) return 0;

  let updatedLayers = 0;
  layers.forEach((layer) => {
    // Only the shared OpenFreeMap base is recolored. Motrice pins, routes,
    // geofences and live GPS overlays retain their semantic colors.
    if (layer?.type !== 'background' && layer?.source !== 'openmaptiles') return;
    const paint = getDerivedDarkPaint(layer);
    if (!paint) return;

    let changed = false;
    Object.entries(paint).forEach(([property, value]) => {
      try {
        map.setPaintProperty(layer.id, property, value);
        changed = true;
      } catch {
        // Third-party styles can expose transient or unsupported properties.
      }
    });
    if (changed) updatedLayers += 1;
  });

  return updatedLayers;
}

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
  // Android WebView can draw raster sources correctly while leaving a vector
  // style with only its background visible. Prefer the compatible raster path
  // on every Android version so theme changes can never expose a blank map.
  // Desktop browsers keep the accelerated vector renderer.
  if (androidMajor != null) return true;
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

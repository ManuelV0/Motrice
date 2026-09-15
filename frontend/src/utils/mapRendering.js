export const MAPLIBRE_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
};

const RASTER_STYLES = {
  dark: 'dark_all',
  light: 'light_all'
};

export const RASTER_TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; CARTO';

export function getHighDefinitionPixelRatio() {
  if (typeof window === 'undefined') return 1.5;
  const ratio = Number(window.devicePixelRatio) || 1;
  return Math.min(3, Math.max(1.5, ratio));
}

export function getHighDefinitionRasterTiles(theme = 'light') {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
  return {
    url: `https://{s}.basemaps.cartocdn.com/${RASTER_STYLES[normalizedTheme]}/{z}/{x}/{y}{r}.png`,
    options: {
      attribution: RASTER_TILE_ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 20,
      maxNativeZoom: 20,
      tileSize: 256,
      crossOrigin: true,
      updateWhenIdle: false,
      updateWhenZooming: false,
      keepBuffer: 4
    }
  };
}

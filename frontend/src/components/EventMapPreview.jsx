import { useMemo, useState } from 'react';
import { isGymEvent } from '../utils/eventVenueAccess';
import { createEventPinSvg, getEventActivityType } from '../utils/eventMapMarkers';
import styles from '../styles/components/eventMapPreview.module.css';

const MAP_THEME_KEY = 'motrice.map.theme';
const TILE_SIZE = 256;
const PREVIEW_ZOOM = 14;
const ROUTE_PREVIEW_ZOOM = 13;

function getSavedMapTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(MAP_THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function validPoint(point) {
  return Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1]));
}

function toWorldPoint(lat, lng, zoom) {
  const safeLat = Math.max(-85.0511, Math.min(85.0511, Number(lat)));
  const scale = 2 ** zoom;
  const latitudeRadians = safeLat * Math.PI / 180;
  return {
    x: ((Number(lng) + 180) / 360) * scale,
    y: ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * scale
  };
}

function buildTiles(center, zoom, theme) {
  const worldCenter = toWorldPoint(center[1], center[0], zoom);
  const centerTileX = Math.floor(worldCenter.x);
  const centerTileY = Math.floor(worldCenter.y);
  const tileCount = 2 ** zoom;
  const mapStyle = theme === 'light' ? 'light_all' : 'dark_all';
  const tiles = [];

  for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      const rawX = centerTileX + xOffset;
      const rawY = centerTileY + yOffset;
      if (rawY < 0 || rawY >= tileCount) continue;
      const tileX = ((rawX % tileCount) + tileCount) % tileCount;
      const subdomain = ['a', 'b', 'c', 'd'][Math.abs(rawX + rawY) % 4];
      tiles.push({
        key: `${zoom}-${rawX}-${rawY}`,
        src: `https://${subdomain}.basemaps.cartocdn.com/${mapStyle}/${zoom}/${tileX}/${rawY}@2x.png`,
        left: (rawX - worldCenter.x) * TILE_SIZE,
        top: (rawY - worldCenter.y) * TILE_SIZE
      });
    }
  }

  return tiles;
}

function buildRoutePoints(routePoints, center, zoom) {
  if (routePoints.length < 2) return '';
  const worldCenter = toWorldPoint(center[1], center[0], zoom);
  return routePoints
    .map(([lat, lng]) => {
      const point = toWorldPoint(lat, lng, zoom);
      const x = (point.x - worldCenter.x) * TILE_SIZE;
      const y = (point.y - worldCenter.y) * TILE_SIZE;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function EventMapPreview({ event, routePoints = [], className = '' }) {
  const [loadedTiles, setLoadedTiles] = useState(0);
  const [failedTiles, setFailedTiles] = useState(0);
  const theme = useMemo(getSavedMapTheme, []);
  const usableRoute = routePoints
    .filter(validPoint)
    .map(([lat, lng]) => [Number(lat), Number(lng)]);
  const eventLat = Number(event?.lat);
  const eventLng = Number(event?.lng);
  const center = Number.isFinite(eventLat) && Number.isFinite(eventLng)
    ? [eventLng, eventLat]
    : usableRoute.length
      ? [usableRoute[0][1], usableRoute[0][0]]
      : null;

  const zoom = usableRoute.length >= 2 ? ROUTE_PREVIEW_ZOOM : PREVIEW_ZOOM;
  const centerKey = center ? `${center[0]},${center[1]}` : '';
  const tiles = useMemo(
    () => center ? buildTiles(center, zoom, theme) : [],
    [centerKey, theme, zoom]
  );
  const routeKey = usableRoute.map(([lat, lng]) => `${lat},${lng}`).join('|');
  const routePolyline = useMemo(
    () => center ? buildRoutePoints(usableRoute, center, zoom) : '',
    [centerKey, routeKey, zoom]
  );
  const selectedPinSvg = createEventPinSvg(getEventActivityType(event), {
    selected: true,
    saved: Boolean(event?.is_saved),
    gym: isGymEvent(event)
  });
  const ready = loadedTiles > 0;
  const failed = tiles.length > 0 && failedTiles === tiles.length;

  if (!center) return null;

  return (
    <div
      className={`${styles.preview} ${className}`}
      data-theme={theme}
      data-ready={ready ? 'true' : 'false'}
      role="img"
      aria-label={`Mappa dell’evento ${event?.title || event?.sport_name || ''}`}
    >
      <div className={styles.tiles} aria-hidden="true">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.src}
            alt=""
            draggable="false"
            className={styles.tile}
            style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)` }}
            onLoad={() => setLoadedTiles((current) => current + 1)}
            onError={() => setFailedTiles((current) => current + 1)}
          />
        ))}
      </div>
      {routePolyline ? (
        <svg className={styles.routeOverlay} aria-hidden="true">
          <polyline className={styles.routeShadow} points={routePolyline} />
          <polyline className={styles.routeLine} points={routePolyline} />
        </svg>
      ) : null}
      <span
        className={styles.eventMarker}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: selectedPinSvg }}
      />
      <div className={styles.mapShade} aria-hidden="true" />
      <span className={styles.mapBadge}>
        {failed ? 'MAPPA NON DISPONIBILE' : ready ? 'MAPPA MOTRICE' : 'CARICO MAPPA'}
      </span>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import {
  Check,
  LocateFixed,
  MapPinOff,
  Minus,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { api } from '../services/api';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import { useUserLocation } from '../hooks/useUserLocation';
import { geocodeEventLocation } from '../services/geocoding';
import { readFiltersFromSearch, writeFiltersToSearch } from '../utils/queryFilters';
import EventCard from '../components/EventCard';
import styles from '../styles/pages/map.module.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const baseFilters = {
  q: '',
  sport: 'all',
  dateRange: 'all',
  distance: 'all',
  level: 'all',
  timeOfDay: 'all',
  sortBy: 'soonest'
};

const DEFAULT_CENTER = { lat: 42.6, lng: 12.5 };
const MAP_THEME_KEY = 'motrice.map.theme';
const MAP_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
};
const USER_RADIUS_SOURCE = 'user-radius-src';
const USER_RADIUS_FILL = 'user-radius-fill';
const USER_RADIUS_LINE = 'user-radius-line';
const USER_VIEW_RADIUS_KM = 8;
const EVENT_CLUSTER_OVERLAP_PX = 12;
const EVENT_MARKERS_SOURCE = 'motrice-event-markers';
const EVENT_PINS_LAYER = 'motrice-event-pins';
const EVENT_CLUSTERS_LAYER = 'motrice-event-clusters';
const EVENT_SELECTED_LABEL_LAYER = 'motrice-event-selected-label';
const EVENT_PIN_FILL = '#ccff00';
const EVENT_PIN_SAVED_FILL = '#ffffff';
const EMPTY_EVENT_MARKERS = { type: 'FeatureCollection', features: [] };
const eventMarkerImageCache = new Map();

const EVENT_ACTIVITY_ICON_NODES = {
  running: [
    [
      'path',
      {
        d: 'M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-3.7 12.4 1-4.4 2.1 2v6h2V14l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.6 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.2L6 6.8v4.7h2V8.2l1.8-.7-1.6 8.1-4.9-1-.4 2 6.9 1.3Z',
        fill: 'currentColor',
        stroke: 'none'
      }
    ]
  ],
  gym: [
    ['rect', { x: 1.7, y: 8, width: 3.8, height: 8, rx: 1.9, fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: 5, y: 6.2, width: 3.3, height: 11.6, rx: 1.65, fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: 7.7, y: 10.35, width: 8.6, height: 3.3, rx: 1.65, fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: 15.7, y: 6.2, width: 3.3, height: 11.6, rx: 1.65, fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: 18.5, y: 8, width: 3.8, height: 8, rx: 1.9, fill: 'currentColor', stroke: 'none' }]
  ],
  tennis: [
    ['ellipse', { cx: 8.8, cy: 8.1, rx: 5.1, ry: 6.8, transform: 'rotate(-38 8.8 8.1)', fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'm12.6 13.5 6.8 7', 'stroke-width': 3.25 }],
    ['circle', { cx: 18.8, cy: 6.4, r: 2.45, fill: 'currentColor', stroke: 'none' }]
  ],
  football: [
    ['circle', { cx: 12, cy: 12, r: 9.2 }],
    ['path', { d: 'm12 7.8 3.6 2.6-1.4 4.2H9.8l-1.4-4.2z', fill: 'currentColor' }],
    ['path', { d: 'm12 7.8.1-5' }],
    ['path', { d: 'm15.6 10.4 4.8-1.5' }],
    ['path', { d: 'm14.2 14.6 3 4.2' }],
    ['path', { d: 'm9.8 14.6-3 4.2' }],
    ['path', { d: 'm8.4 10.4-4.8-1.5' }]
  ],
  basketball: [
    ['circle', { cx: 12, cy: 12, r: 9.3, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'M3.1 12h17.8M12 2.7v18.6M5.3 5.5c4.7 2.1 8.7 8.9 13.4 13M18.7 5.5c-4.7 2.1-8.7 8.9-13.4 13', stroke: 'var(--event-pin-fill)', 'stroke-width': 1.45 }]
  ],
  yoga: [
    ['circle', { cx: 12, cy: 4.6, r: 2.7, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'M12 8.4v6.2M12 10.6 7.2 14M12 10.6l4.8 3.4M4 17.2c3.5 0 5.6-1 8-2.6 2.4 1.6 4.5 2.6 8 2.6M5.1 20.2c2.8-2 4.8-2.4 6.9-2.4s4.1.4 6.9 2.4', 'stroke-width': 3.15 }]
  ],
  trekking: [
    ['path', { d: 'm2.6 19.7 6-9.4 3.1 4.2 2.8-4.4 6.9 9.6H2.6Z', fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'm8.6 10.3 1.7 2.3-2.4 1.2-1.1-1.3', stroke: 'var(--event-pin-fill)', 'stroke-width': 1.25 }]
  ],
  cycling: [
    ['circle', { cx: 6.2, cy: 17.1, r: 3.55 }],
    ['circle', { cx: 17.8, cy: 17.1, r: 3.55 }],
    ['circle', { cx: 13.1, cy: 5.2, r: 1.8, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'm10.2 8.1 3.8.5 2.1 3.4M10.2 8.1 7.5 12l4.3 2.2 2.1 3M10.2 8.1l2.9-1.3', 'stroke-width': 2.1 }]
  ],
  swimming: [
    ['path', { d: 'M2 17c1.3 0 1.9-1 3.2-1s1.9 1 3.2 1 1.9-1 3.2-1 1.9 1 3.2 1 1.9-1 3.2-1 1.9 1 3.2 1', 'stroke-width': 2.1 }],
    ['path', { d: 'M3.2 20c1.2 0 1.8-.8 3-.8s1.8.8 3 .8 1.8-.8 3-.8 1.8.8 3 .8 1.8-.8 3-.8 1.8.8 3 .8', 'stroke-width': 2.1 }],
    ['circle', { cx: 15.8, cy: 7, r: 2.1, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'm5.2 14.7 5.1-5.1 4.2 2.2 3.2-1.1', 'stroke-width': 2.5 }]
  ],
  activity: [
    ['path', { d: 'M3 12h4l2.2-5.2 4.1 10.4 2.2-5.2H21', 'stroke-width': 3.1 }]
  ]
};

function getEventActivityType(event) {
  const activity = `${event?.sport_name || ''} ${event?.title || ''}`.toLocaleLowerCase('it-IT');

  if (/(calcio|calcetto|football|soccer|futsal)/.test(activity)) return 'football';
  if (/(tennis|padel|racchett|pickleball)/.test(activity)) return 'tennis';
  if (/(basket|pallacanestro)/.test(activity)) return 'basketball';
  if (/(yoga|pilates|meditazione|mindfulness)/.test(activity)) return 'yoga';
  if (/(trekking|escursion|hiking|camminata|walking|montagna)/.test(activity)) return 'trekking';
  if (/(ciclismo|bicicletta|bici|cycling|bike|mtb)/.test(activity)) return 'cycling';
  if (/(nuoto|swimming|piscina|acqua)/.test(activity)) return 'swimming';
  if (/(palestra|gym|fitness|forza|functional|workout|crossfit|hiit|calisthenics|bodybuild)/.test(activity)) return 'gym';
  if (/(corsa|running|jogging|trail|maratona)/.test(activity)) return 'running';
  return 'activity';
}

function escapeSvgAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderEventActivityNodes(activityType, pinFill) {
  return EVENT_ACTIVITY_ICON_NODES[activityType]
    .map(([tagName, attributes]) => {
      const serializedAttributes = Object.entries(attributes)
        .map(([name, value]) => {
          const normalizedValue = String(value)
            .replaceAll('currentColor', '#050705')
            .replaceAll('var(--event-pin-fill)', pinFill);
          return `${name}="${escapeSvgAttribute(normalizedValue)}"`;
        })
        .join(' ');
      return `<${tagName} ${serializedAttributes}/>`;
    })
    .join('');
}

function getEventPinImageId(activityType, saved = false, selected = false) {
  return `motrice-pin-${activityType}-${saved ? 'saved' : 'default'}${selected ? '-selected' : ''}`;
}

function createEventPinSvg(activityType, { saved = false, selected = false, cluster = false } = {}) {
  const pinFill = saved ? EVENT_PIN_SAVED_FILL : EVENT_PIN_FILL;
  const activityNodes = cluster ? '' : renderEventActivityNodes(activityType, pinFill);
  const selectedOutline = selected
    ? '<path d="M24 2.5C12.7 2.5 3.5 11.4 3.5 22.4c0 13.7 15.2 27.6 20.5 32.4 5.3-4.8 20.5-18.7 20.5-32.4C44.5 11.4 35.3 2.5 24 2.5Z" fill="none" stroke="#ffffff" stroke-width="4.6"/>'
    : '<path d="M24 2.5C12.7 2.5 3.5 11.4 3.5 22.4c0 13.7 15.2 27.6 20.5 32.4 5.3-4.8 20.5-18.7 20.5-32.4C44.5 11.4 35.3 2.5 24 2.5Z" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="3.4"/>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="112" viewBox="0 0 48 56">
    <ellipse cx="24" cy="53.1" rx="7.4" ry="2.2" fill="rgba(0,0,0,.34)"/>
    ${selectedOutline}
    <path d="M24 2.5C12.7 2.5 3.5 11.4 3.5 22.4c0 13.7 15.2 27.6 20.5 32.4 5.3-4.8 20.5-18.7 20.5-32.4C44.5 11.4 35.3 2.5 24 2.5Z" fill="${pinFill}" stroke="#050705" stroke-width="2.5" stroke-linejoin="round"/>
    ${cluster ? '' : `<g transform="translate(12 9)" fill="none" stroke="#050705" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">${activityNodes}</g>`}
  </svg>`;
}

function svgToMapImage(svgMarkup) {
  if (eventMarkerImageCache.has(svgMarkup)) return eventMarkerImageCache.get(svgMarkup);

  const imagePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 112;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        reject(new Error('Canvas non disponibile per i segnaposto'));
        return;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(context.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = () => reject(new Error('Impossibile generare il segnaposto'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  });

  eventMarkerImageCache.set(svgMarkup, imagePromise);
  return imagePromise;
}

async function ensureEventMarkerImages(map) {
  const imageDefinitions = [];

  Object.keys(EVENT_ACTIVITY_ICON_NODES).forEach((activityType) => {
    [false, true].forEach((saved) => {
      [false, true].forEach((selected) => {
        imageDefinitions.push({
          id: getEventPinImageId(activityType, saved, selected),
          svg: createEventPinSvg(activityType, { saved, selected })
        });
      });
    });
  });

  imageDefinitions.push(
    { id: 'motrice-pin-cluster', svg: createEventPinSvg('activity', { cluster: true }) },
    { id: 'motrice-pin-cluster-selected', svg: createEventPinSvg('activity', { cluster: true, selected: true }) }
  );

  const images = await Promise.all(
    imageDefinitions.map(async ({ id, svg }) => ({ id, data: await svgToMapImage(svg) }))
  );

  images.forEach(({ id, data }) => {
    if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: 2 });
  });
}

async function ensureEventMarkerLayers(map) {
  if (!map?.isStyleLoaded()) return false;
  await ensureEventMarkerImages(map);
  if (!map.isStyleLoaded()) return false;

  if (!map.getSource(EVENT_MARKERS_SOURCE)) {
    map.addSource(EVENT_MARKERS_SOURCE, {
      type: 'geojson',
      data: EMPTY_EVENT_MARKERS,
      cluster: true,
      clusterRadius: EVENT_CLUSTER_OVERLAP_PX,
      clusterMaxZoom: 17,
      clusterProperties: {
        selectedCount: ['+', ['get', 'selected']]
      }
    });
  }

  if (!map.getLayer(EVENT_CLUSTERS_LAYER)) {
    map.addLayer({
      id: EVENT_CLUSTERS_LAYER,
      type: 'symbol',
      source: EVENT_MARKERS_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': ['case', ['>', ['get', 'selectedCount'], 0], 'motrice-pin-cluster-selected', 'motrice-pin-cluster'],
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 15,
        'text-font': ['Open Sans Bold'],
        'text-anchor': 'center',
        'text-offset': [0, -1.72],
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#050705'
      }
    });
  }

  if (!map.getLayer(EVENT_PINS_LAYER)) {
    map.addLayer({
      id: EVENT_PINS_LAYER,
      type: 'symbol',
      source: EVENT_MARKERS_SOURCE,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'selected']
      }
    });
  }

  if (!map.getLayer(EVENT_SELECTED_LABEL_LAYER)) {
    map.addLayer({
      id: EVENT_SELECTED_LABEL_LAYER,
      type: 'symbol',
      source: EVENT_MARKERS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'selected'], 1]],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-font': ['Open Sans Bold'],
        'text-anchor': 'bottom',
        'text-offset': [0, -4.8],
        'text-max-width': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(5,7,5,.96)',
        'text-halo-width': 4,
        'text-halo-blur': 1
      }
    });
  }

  return true;
}

function buildEventMarkerGeoJson(events, selectedEventId) {
  return {
    type: 'FeatureCollection',
    features: events.map((event) => {
      const selected = String(event.id) === String(selectedEventId) ? 1 : 0;
      const activityType = getEventActivityType(event);
      const saved = Boolean(event.is_saved);
      return {
        type: 'Feature',
        id: String(event.id),
        geometry: {
          type: 'Point',
          coordinates: [Number(event.lng), Number(event.lat)]
        },
        properties: {
          eventId: String(event.id),
          selected,
          icon: getEventPinImageId(activityType, saved, Boolean(selected)),
          label: event.sport_name || event.title || 'Evento'
        }
      };
    })
  };
}

function hasValidCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  if (lat === '' || lng === '') return false;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return false;
  return true;
}

function createAnchoredMarker(element, anchor = 'bottom') {
  return new maplibregl.Marker({
    element,
    anchor,
    // DOM marker coordinates are rounded by default at moveend. Keeping
    // sub-pixel precision prevents the pin from snapping away from its
    // geographic point at the end of a zoom animation.
    subpixelPositioning: true
  });
}

function computeBounds(lat, lng, radiusKm) {
  const latDelta = radiusKm / 110.574;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngDelta = radiusKm / Math.max(111.32 * Math.abs(cosLat), 0.0001);
  return [
    [lng - lngDelta, lat - latDelta],
    [lng + lngDelta, lat + latDelta]
  ];
}

function getMapFitPadding(map, sheetElement, minimumBottom = 72) {
  if (typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches) {
    return 56;
  }

  const mapRect = map.getContainer().getBoundingClientRect();
  const sheetRect = sheetElement?.getBoundingClientRect();
  const sheetOverlap = sheetRect
    ? Math.max(0, Math.min(mapRect.bottom, sheetRect.bottom) - Math.max(mapRect.top, sheetRect.top))
    : 0;
  const top = Math.min(108, Math.max(64, Math.round(mapRect.height * 0.18)));
  const bottom = Math.min(
    Math.max(minimumBottom, Math.round(sheetOverlap + 24)),
    Math.max(minimumBottom, Math.round(mapRect.height - top - 140))
  );

  return { top, right: 42, bottom, left: 42 };
}

function buildRadiusPolygon(lat, lng, radiusKm) {
  const ring = [];
  for (let i = 0; i <= 96; i += 1) {
    const angle = (i / 96) * Math.PI * 2;
    const dy = (radiusKm * Math.sin(angle)) / 110.574;
    const dx = (radiusKm * Math.cos(angle)) / (111.32 * Math.max(Math.abs(Math.cos((lat * Math.PI) / 180)), 0.0001));
    ring.push([lng + dx, lat + dy]);
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [ring]
        },
        properties: {}
      }
    ]
  };
}

function isEventInViewport(event, viewport) {
  if (!viewport) return true;
  return event.lng >= viewport.west && event.lng <= viewport.east && event.lat >= viewport.south && event.lat <= viewport.north;
}

function distanceKm(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getMapAreaLabel(events, hasLocation, selectedRadiusKm) {
  if (hasLocation) return selectedRadiusKm ? `RAGGIO ${selectedRadiusKm} KM` : 'LA TUA ZONA';

  const locations = events
    .map((event) => String(event.city || event.location_name || '').trim())
    .filter(Boolean)
    .map((location) => location.split(',').at(-1)?.trim() || location);

  if (!locations.length) return 'ASCOLI PICENO';

  const counts = locations.reduce((result, location) => {
    const key = location.toLocaleUpperCase('it-IT');
    result.set(key, (result.get(key) || 0) + 1);
    return result;
  }, new Map());

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function applyUserRadiusOverlay(map, lat, lng, radiusKm, mapTheme) {
  const data = buildRadiusPolygon(lat, lng, radiusKm);
  const fillColor = mapTheme === 'light' ? 'rgba(139,207,0,0.18)' : 'rgba(168,240,0,0.18)';
  const lineColor = mapTheme === 'light' ? 'rgba(129,189,0,0.72)' : 'rgba(184,255,53,0.84)';
  const beforeMarkerLayer = map.getLayer(EVENT_CLUSTERS_LAYER) ? EVENT_CLUSTERS_LAYER : undefined;

  if (!map.getSource(USER_RADIUS_SOURCE)) {
    map.addSource(USER_RADIUS_SOURCE, { type: 'geojson', data });
  } else {
    map.getSource(USER_RADIUS_SOURCE).setData(data);
  }

  if (!map.getLayer(USER_RADIUS_FILL)) {
    map.addLayer({
      id: USER_RADIUS_FILL,
      type: 'fill',
      source: USER_RADIUS_SOURCE,
      paint: {
        'fill-color': fillColor,
        'fill-opacity': 1
      }
    }, beforeMarkerLayer);
  } else {
    map.setPaintProperty(USER_RADIUS_FILL, 'fill-color', fillColor);
  }

  if (!map.getLayer(USER_RADIUS_LINE)) {
    map.addLayer({
      id: USER_RADIUS_LINE,
      type: 'line',
      source: USER_RADIUS_SOURCE,
      paint: {
        'line-color': lineColor,
        'line-opacity': 1,
        'line-width': 2
      }
    }, beforeMarkerLayer);
  } else {
    map.setPaintProperty(USER_RADIUS_LINE, 'line-color', lineColor);
  }
}

function removeUserRadiusOverlay(map) {
  if (!map) return;
  if (map.getLayer(USER_RADIUS_FILL)) map.removeLayer(USER_RADIUS_FILL);
  if (map.getLayer(USER_RADIUS_LINE)) map.removeLayer(USER_RADIUS_LINE);
  if (map.getSource(USER_RADIUS_SOURCE)) map.removeSource(USER_RADIUS_SOURCE);
}

function MapSearchBar({ value, onChange, onFilterClick, activeFilterCount, filtersOpen, filterButtonRef }) {
  return (
    <div className={styles.searchBar}>
      <Search size={17} aria-hidden="true" />
      <input value={value} onChange={onChange} placeholder="Cerca sport o città" aria-label="Cerca sport o città" />
      <button
        ref={filterButtonRef}
        type="button"
        className={`${styles.searchFilterButton} ${activeFilterCount > 0 ? styles.searchFilterButtonActive : ''}`}
        onClick={onFilterClick}
        aria-label={activeFilterCount > 0 ? `Apri filtri, ${activeFilterCount} attivi` : 'Apri filtri'}
        aria-expanded={filtersOpen}
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
        {activeFilterCount > 0 ? <span>{activeFilterCount}</span> : null}
      </button>
    </div>
  );
}

function ActiveFilterPills({ items, onRemove }) {
  if (!items.length) return null;

  return (
    <div className={styles.activeFilterRail} aria-label="Filtri attivi">
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          className={styles.activeFilterPill}
          onClick={() => onRemove(item.key)}
          aria-label={`Rimuovi filtro ${item.label}`}
        >
          <span>{item.label}</span>
          <X size={13} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function MapFloatingControls({ onZoomIn, onZoomOut, onGps }) {
  return (
    <div className={styles.fabStack} aria-label="Controlli mappa">
      <div className={styles.zoomControlGroup}>
        <button
          type="button"
          className={`${styles.fab} ${styles.fabNeutral}`}
          onClick={onZoomIn}
          aria-label="Aumenta zoom"
        >
          <Plus size={18} aria-hidden="true" />
          <span>Zoom avanti</span>
        </button>
        <button
          type="button"
          className={`${styles.fab} ${styles.fabNeutral}`}
          onClick={onZoomOut}
          aria-label="Riduci zoom"
        >
          <Minus size={18} aria-hidden="true" />
          <span>Zoom indietro</span>
        </button>
        <button
          type="button"
          className={`${styles.fab} ${styles.fabNeutral} ${onGps.active ? styles.fabPrimary : ''}`}
          onClick={onGps.onAction}
          disabled={onGps.requesting}
          aria-label={onGps.active ? 'Disattiva Segui posizione' : 'Attiva Segui posizione'}
          aria-pressed={onGps.active}
        >
          <LocateFixed size={18} aria-hidden="true" />
          <span>{onGps.requesting ? 'Cerco posizione' : onGps.active ? 'Segui attivo' : 'Centra posizione'}</span>
        </button>
      </div>
    </div>
  );
}

function MapFiltersDrawer({
  open,
  filters,
  setFilters,
  sports,
  mapTheme,
  onClose,
  onApply,
  onReset,
  onMapThemeChange
}) {
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const selectedOptionsCount = [
    filters.sport !== baseFilters.sport,
    filters.dateRange !== baseFilters.dateRange,
    filters.distance !== baseFilters.distance,
    filters.sortBy !== baseFilters.sortBy
  ].filter(Boolean).length;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;

      const focusable = [...drawerRef.current.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className={`${styles.filtersBackdrop} ${styles.filtersBackdropOpen}`}
        aria-label="Chiudi filtri"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className={`${styles.filtersDrawer} ${styles.filtersDrawerOpen}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-filters-title"
      >
        <div className={styles.sheetHandle} aria-hidden="true" />
        <div className={styles.sheetHeaderRow}>
          <div className={styles.sheetTitleGroup}>
            <span className={styles.sheetTitleIcon} aria-hidden="true">
              <SlidersHorizontal size={19} />
            </span>
            <div>
              <h2 id="map-filters-title">Filtra gli eventi</h2>
              <p>
                {selectedOptionsCount > 0
                  ? `${selectedOptionsCount} ${selectedOptionsCount === 1 ? 'preferenza attiva' : 'preferenze attive'}`
                  : 'Personalizza ciò che appare sulla mappa'}
              </p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" className={styles.sheetToggle} onClick={onClose} aria-label="Chiudi filtri">
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.sheetFiltersGrid}>
          <label className={styles.mapField}>
            <span className={styles.fieldLabel}>Sport</span>
            <select value={filters.sport} onChange={(event) => setFilters((prev) => ({ ...prev, sport: event.target.value }))}>
              <option value="all">Tutti gli sport</option>
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.mapField}>
            <span className={styles.fieldLabel}>Periodo</span>
            <select value={filters.dateRange} onChange={(event) => setFilters((prev) => ({ ...prev, dateRange: event.target.value }))}>
              <option value="all">Qualsiasi data</option>
              <option value="today">Oggi</option>
              <option value="week">Questa settimana</option>
              <option value="month">Questo mese</option>
            </select>
          </label>

          <label className={styles.mapField}>
            <span className={styles.fieldLabel}>Distanza</span>
            <select
              value={filters.distance}
              onChange={(event) => setFilters((prev) => ({ ...prev, distance: event.target.value }))}
            >
              <option value="all">Qualsiasi distanza</option>
              <option value="5">Entro 5 km</option>
              <option value="15">Entro 15 km</option>
              <option value="30">Entro 30 km</option>
            </select>
          </label>

          <label className={styles.mapField}>
            <span className={styles.fieldLabel}>Ordina per</span>
            <select value={filters.sortBy} onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value }))}>
              <option value="soonest">Prima disponibilità</option>
              <option value="closest">Più vicini a te</option>
              <option value="popular">Più popolari</option>
            </select>
          </label>

          <fieldset className={styles.mapAppearanceField}>
            <legend>Aspetto mappa</legend>
            <div className={styles.mapThemeSwitch}>
              <button
                type="button"
                className={mapTheme === 'dark' ? styles.mapThemeActive : ''}
                aria-pressed={mapTheme === 'dark'}
                onClick={() => onMapThemeChange('dark')}
              >
                Scura
              </button>
              <button
                type="button"
                className={mapTheme === 'light' ? styles.mapThemeActive : ''}
                aria-pressed={mapTheme === 'light'}
                onClick={() => onMapThemeChange('light')}
              >
                Chiara
              </button>
            </div>
          </fieldset>
        </div>

        <div className={styles.drawerActions}>
          <button type="button" className={styles.drawerGhost} onClick={onReset}>
            <RotateCcw size={16} aria-hidden="true" />
            Ripristina
          </button>
          <button type="button" className={styles.drawerApply} onClick={onApply}>
            <Check size={17} aria-hidden="true" />
            Applica filtri
          </button>
        </div>
      </div>
    </>
  );
}

function MapPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedEventId = searchParams.get('eventId');

  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const resultsSheetRef = useRef(null);
  const filterButtonRef = useRef(null);
  const userMarkerRef = useRef(null);
  const eventLookupRef = useRef(new Map());
  const focusEventRef = useRef(null);
  const coordinateAttemptsRef = useRef(new Set());
  const hasAutoFitEventsRef = useRef(false);
  const shouldRecenterRef = useRef(true);
  const focusTimerRef = useRef(null);
  const sheetDragRef = useRef(null);
  const sheetTransitionTimerRef = useRef(null);
  const mapStyleThemeRef = useRef(null);
  const hasLoadedEventsRef = useRef(false);

  const [filters, setFilters] = useState(() => readFiltersFromSearch(searchParams, baseFilters));
  const [searchInput, setSearchInput] = useState(() => filters.q || '');
  const [sports, setSports] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [resolvedCoordinates, setResolvedCoordinates] = useState({});
  const [resolvingCoordinates, setResolvingCoordinates] = useState(false);
  const [savingIds, setSavingIds] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [sheetSnap, setSheetSnap] = useState('compact');
  const [followUser, setFollowUser] = useState(false);
  const [viewportBounds, setViewportBounds] = useState(null);
  const [mapTheme, setMapTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      const persisted = window.localStorage.getItem(MAP_THEME_KEY);
      return persisted === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(baseFilters);
  const [draftMapTheme, setDraftMapTheme] = useState(mapTheme);
  const [lifecycleTick, setLifecycleTick] = useState(() => Date.now());

  const { coords, hasLocation, permission, error: locationError, requesting, requestLocation, originParams } = useUserLocation();

  usePageMeta({
    title: 'Mappa Eventi | Motrice',
    description: 'Visualizza sessioni e luoghi consigliati su mappa interattiva.'
  });

  useEffect(() => {
    api.listSports().then(setSports);
  }, []);

  useEffect(() => {
    const refreshLifecycle = () => setLifecycleTick(Date.now());
    const timer = window.setInterval(refreshLifecycle, 60 * 1000);
    document.addEventListener('visibilitychange', refreshLifecycle);
    window.addEventListener('focus', refreshLifecycle);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshLifecycle);
      window.removeEventListener('focus', refreshLifecycle);
    };
  }, []);

  useEffect(() => {
    setSearchInput(filters.q || '');
  }, [filters.q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.q === searchInput ? current : { ...current, q: searchInput }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    if (!hasLoadedEventsRef.current) setLoading(true);
    setLoadError('');
    api
      .listEvents({ ...filters, ...originParams, activeOnly: true })
      .then((rows) => {
        if (active) setEvents(rows || []);
      })
      .catch((error) => {
        if (active) {
          setEvents([]);
          setLoadError(error?.message || 'Impossibile caricare gli eventi da Supabase');
        }
      })
      .finally(() => {
        if (active) {
          hasLoadedEventsRef.current = true;
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [filters, lifecycleTick, originParams]);

  useEffect(() => {
    const next = writeFiltersToSearch(searchParams, filters, baseFilters);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filters, searchParams, setSearchParams]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MAP_THEME_KEY, mapTheme);
    } catch {
      // Ignore persistence failures.
    }
  }, [mapTheme]);

  useEffect(() => {
    const missing = events.filter((event) => {
      if (hasValidCoordinates(event.lat, event.lng)) return false;
      if (Object.prototype.hasOwnProperty.call(resolvedCoordinates, String(event.id))) return false;
      return !coordinateAttemptsRef.current.has(String(event.id));
    });
    if (!missing.length) return undefined;

    let active = true;
    const controller = new AbortController();
    setResolvingCoordinates(true);

    async function resolveMissingCoordinates() {
      for (const event of missing) {
        if (!active) return;
        const eventId = String(event.id);
        coordinateAttemptsRef.current.add(eventId);
        try {
          const coordinates = await geocodeEventLocation(event, { signal: controller.signal });
          if (!active) return;
          setResolvedCoordinates((prev) => ({ ...prev, [eventId]: coordinates }));

          if (event.source === 'supabase' && event.created_by === 'me' && typeof api.updateEventCoordinates === 'function') {
            await api.updateEventCoordinates(event.id, coordinates).catch(() => null);
          }
        } catch (error) {
          if (error?.name === 'AbortError') return;
          if (active) setResolvedCoordinates((prev) => ({ ...prev, [eventId]: null }));
        }
      }
    }

    resolveMissingCoordinates().finally(() => {
      if (active) setResolvingCoordinates(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [events, resolvedCoordinates]);

  const withCoords = useMemo(
    () =>
      events
        .map((event) => {
          const fallback = resolvedCoordinates[String(event.id)];
          const lat = hasValidCoordinates(event.lat, event.lng) ? event.lat : fallback?.lat;
          const lng = hasValidCoordinates(event.lat, event.lng) ? event.lng : fallback?.lng;
          if (!hasValidCoordinates(lat, lng)) return null;
          return { ...event, lat: Number(lat), lng: Number(lng) };
        })
        .filter(Boolean),
    [events, resolvedCoordinates]
  );

  const selectedRadiusKm = useMemo(() => {
    if (filters.distance === 'all') return null;
    const parsedDistance = Number(filters.distance);
    return Number.isFinite(parsedDistance) && parsedDistance > 0 ? parsedDistance : null;
  }, [filters.distance]);

  const eventsWithoutCoordinates = Math.max(0, events.length - withCoords.length);

  const eventsInRadius = useMemo(() => {
    if (!selectedRadiusKm || !coords) return withCoords;
    return withCoords.filter((event) => distanceKm(coords.lat, coords.lng, event.lat, event.lng) <= selectedRadiusKm);
  }, [coords, selectedRadiusKm, withCoords]);

  const visibleEvents = useMemo(
    () => eventsInRadius.filter((event) => isEventInViewport(event, viewportBounds)),
    [eventsInRadius, viewportBounds]
  );

  const mapAreaLabel = useMemo(
    () => getMapAreaLabel(eventsInRadius, hasLocation, selectedRadiusKm),
    [eventsInRadius, hasLocation, selectedRadiusKm]
  );

  const activeFilterPills = useMemo(() => {
    const pills = [];
    if (filters.sport !== 'all') {
      const sport = sports.find((item) => String(item.id) === String(filters.sport));
      pills.push({ key: 'sport', label: sport?.name || 'Sport selezionato' });
    }
    if (filters.dateRange !== 'all') {
      const dateLabels = { today: 'Oggi', week: 'Questa settimana', month: 'Questo mese' };
      pills.push({ key: 'dateRange', label: dateLabels[filters.dateRange] || 'Periodo selezionato' });
    }
    if (filters.distance !== 'all') pills.push({ key: 'distance', label: `Entro ${filters.distance} km` });
    if (filters.sortBy !== 'soonest') {
      const sortLabels = { closest: 'Più vicini', popular: 'Più popolari' };
      pills.push({ key: 'sortBy', label: sortLabels[filters.sortBy] || 'Ordine personalizzato' });
    }
    return pills;
  }, [filters.dateRange, filters.distance, filters.sortBy, filters.sport, sports]);

  // Before the first map measurement, keep the full filtered result set. Once
  // bounds exist, an empty viewport must stay empty instead of showing events
  // from a different area as a fallback.
  const sheetEvents = viewportBounds ? visibleEvents : eventsInRadius;

  const focusEvent = useCallback((event) => {
    const map = mapRef.current;
    if (!map || !event) return;
    setSelectedEventId(String(event.id));
    setSheetSnap('medium');

    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    const centerEvent = () => {
      if (mapRef.current !== map) return;

      let offset = [0, 0];
      if (window.matchMedia('(max-width: 767px)').matches) {
        const mapRect = map.getContainer().getBoundingClientRect();
        const sheetRect = resultsSheetRef.current?.getBoundingClientRect();
        const sheetOverlap = sheetRect
          ? Math.max(0, Math.min(mapRect.bottom, sheetRect.bottom) - Math.max(mapRect.top, sheetRect.top))
          : 0;
        const visibleHeight = Math.max(160, mapRect.height - sheetOverlap);
        const safeTop = Math.min(92, visibleHeight * 0.38);
        const safeBottom = 44;
        const targetY = safeTop + Math.max(0, visibleHeight - safeTop - safeBottom) / 2;
        offset = [0, Math.round(targetY - mapRect.height / 2)];
      }

      const currentZoom = map.getZoom();
      const targetZoom = Math.max(14.6, currentZoom);
      map.stop();
      map.flyTo({
        center: [event.lng, event.lat],
        zoom: targetZoom,
        offset,
        duration: currentZoom < 12 ? 520 : 380,
        curve: 1.25,
        essential: true
      });
    };

    if (sheetSnap === 'medium') window.requestAnimationFrame(centerEvent);
    else focusTimerRef.current = window.setTimeout(centerEvent, 285);
  }, [sheetSnap]);

  useEffect(() => {
    focusEventRef.current = focusEvent;
  }, [focusEvent]);

  useEffect(() => {
    eventLookupRef.current = new Map(eventsInRadius.map((event) => [String(event.id), event]));
  }, [eventsInRadius]);

  function handleCustomChip() {
    setDraftFilters(filters);
    setDraftMapTheme(mapTheme);
    setFiltersDrawerOpen(true);
  }

  function closeCustomFilters() {
    setDraftFilters(filters);
    setDraftMapTheme(mapTheme);
    setFiltersDrawerOpen(false);
    window.requestAnimationFrame(() => filterButtonRef.current?.focus());
  }

  function removeActiveFilter(filterKey) {
    setFilters((prev) => ({ ...prev, [filterKey]: baseFilters[filterKey] }));
  }

  async function handleGpsAction() {
    let nextCoords = coords;
    if (!nextCoords) nextCoords = await requestLocation();
    if (!nextCoords) {
      showToast('Posizione non disponibile. Controlla il permesso e riprova.', 'info');
      return;
    }

    if (followUser) {
      setFollowUser(false);
      showToast('Segui posizione disattivato', 'info');
      return;
    }

    shouldRecenterRef.current = true;
    setFollowUser(true);
    showToast('Posizione centrata e aggiornamento attivo', 'success');
  }

  function getSheetSnapHeights() {
    const sheet = resultsSheetRef.current;
    const stage = sheet?.parentElement;
    const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    const compact = 6.3 * rootFontSize;
    const stageHeight = stage?.getBoundingClientRect().height || window.innerHeight;
    const medium = Math.min(19 * rootFontSize, Math.max(compact, stageHeight - 14 * rootFontSize));
    const full = Math.max(medium, stageHeight - 5.2 * rootFontSize);
    return { compact, medium, full };
  }

  function onSheetPointerDown(event) {
    if (window.matchMedia('(min-width: 768px)').matches || !resultsSheetRef.current) return;
    const sheet = resultsSheetRef.current;
    if (sheetTransitionTimerRef.current) window.clearTimeout(sheetTransitionTimerRef.current);
    sheet.style.removeProperty('height');
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sheetDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: performance.now(),
      velocity: 0,
      startHeight: sheet.getBoundingClientRect().height,
      currentHeight: sheet.getBoundingClientRect().height,
      moved: false
    };
    sheet.classList.add(styles.resultsSheetDragging);
  }

  function onSheetPointerMove(event) {
    const drag = sheetDragRef.current;
    const sheet = resultsSheetRef.current;
    if (!drag || !sheet || drag.pointerId !== event.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastTime);
    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = now;
    const { compact, full } = getSheetSnapHeights();
    drag.currentHeight = Math.min(full, Math.max(compact, drag.startHeight - (event.clientY - drag.startY)));
    drag.moved ||= Math.abs(event.clientY - drag.startY) > 5;
    sheet.style.height = `${drag.currentHeight}px`;
  }

  function finishSheetDrag(event) {
    const drag = sheetDragRef.current;
    const sheet = resultsSheetRef.current;
    if (!drag || !sheet || drag.pointerId !== event.pointerId) return;
    const heights = getSheetSnapHeights();
    const snaps = [
      ['compact', heights.compact],
      ['medium', heights.medium],
      ['full', heights.full]
    ];
    let nextSnap;

    if (event.type === 'pointercancel') {
      nextSnap = sheetSnap;
    } else if (!drag.moved) {
      nextSnap = sheetSnap === 'compact' ? 'medium' : sheetSnap === 'medium' ? 'full' : 'medium';
    } else {
      const projectedHeight = drag.currentHeight - drag.velocity * 150;
      nextSnap = snaps.reduce((best, candidate) =>
        Math.abs(candidate[1] - projectedHeight) < Math.abs(best[1] - projectedHeight) ? candidate : best
      )[0];
    }

    sheetDragRef.current = null;
    sheet.classList.remove(styles.resultsSheetDragging);
    sheet.style.height = `${drag.currentHeight}px`;
    setSheetSnap(nextSnap);
    window.requestAnimationFrame(() => {
      if (!resultsSheetRef.current) return;
      resultsSheetRef.current.style.height = `${heights[nextSnap]}px`;
      sheetTransitionTimerRef.current = window.setTimeout(() => {
        resultsSheetRef.current?.style.removeProperty('height');
      }, 280);
    });
  }

  function zoomMap(direction) {
    const map = mapRef.current;
    if (!map) return;
    const nextZoom = direction === 'in' ? map.getZoom() + 1 : map.getZoom() - 1;
    map.easeTo({ zoom: nextZoom, duration: 220 });
  }

  const syncViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    setViewportBounds({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    });
  }, []);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;

    const startCenter = coords ? [coords.lng, coords.lat] : [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat];

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: mapTheme === 'light' ? MAP_STYLES.light : MAP_STYLES.dark,
      center: startCenter,
      zoom: coords ? 10.4 : 6.1,
      pitch: 0,
      bearing: 0,
      maxZoom: 18,
      minZoom: 3,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false
    });

    const handleMapLoad = () => {
      syncViewport();
    };
    const handleMoveEnd = () => {
      // The visible bounds are the source of truth: after every pan, pinch or
      // zoom the event list updates automatically without an extra CTA.
      syncViewport();
    };
    const handleMoveStart = (event) => {
      if (!event.originalEvent || window.matchMedia('(min-width: 768px)').matches) return;
      setSelectedEventId(null);
      setSheetSnap('compact');
    };
    const getInteractiveMarkerLayers = () =>
      [EVENT_PINS_LAYER, EVENT_CLUSTERS_LAYER].filter((layerId) => Boolean(map.getLayer(layerId)));
    const handleMapClick = (event) => {
      const interactiveLayers = getInteractiveMarkerLayers();
      if (!interactiveLayers.length) return;
      const [feature] = map.queryRenderedFeatures(event.point, { layers: interactiveLayers });
      if (!feature) return;

      if (feature.layer.id === EVENT_PINS_LAYER) {
        const selectedEvent = eventLookupRef.current.get(String(feature.properties?.eventId));
        if (selectedEvent) focusEventRef.current?.(selectedEvent);
        return;
      }

      const clusterId = Number(feature.properties?.cluster_id);
      const source = map.getSource(EVENT_MARKERS_SOURCE);
      if (!Number.isFinite(clusterId) || !source?.getClusterExpansionZoom) return;
      source
        .getClusterExpansionZoom(clusterId)
        .then((expansionZoom) => {
          if (mapRef.current !== map || !feature.geometry?.coordinates) return;
          map.easeTo({
            center: feature.geometry.coordinates,
            zoom: Math.min(18, Math.max(map.getZoom() + 1, expansionZoom)),
            duration: 340,
            essential: true
          });
        })
        .catch(() => {
          // The source may be recreated while the map theme is changing.
        });
    };
    const handleMapMouseMove = (event) => {
      const interactiveLayers = getInteractiveMarkerLayers();
      const hasInteractiveFeature = interactiveLayers.length
        ? map.queryRenderedFeatures(event.point, { layers: interactiveLayers }).length > 0
        : false;
      map.getCanvas().style.cursor = hasInteractiveFeature ? 'pointer' : '';
    };
    const handleMapMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    mapStyleThemeRef.current = mapTheme;
    map.on('load', handleMapLoad);
    map.on('movestart', handleMoveStart);
    map.on('moveend', handleMoveEnd);
    map.on('click', handleMapClick);
    map.on('mousemove', handleMapMouseMove);
    map.getCanvas().addEventListener('mouseleave', handleMapMouseLeave);

    mapRef.current = map;
    let resizeFrame = null;
    let lastSize = { width: 0, height: 0 };
    const syncResize = () => {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        const rect = mapNodeRef.current?.getBoundingClientRect();
        if (!rect) return;
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (width === lastSize.width && height === lastSize.height) return;
        lastSize = { width, height };
        map.resize();
      });
    };
    window.addEventListener('resize', syncResize, { passive: true });

    const observer = new ResizeObserver(syncResize);
    observer.observe(mapNodeRef.current);

    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncResize);
    window.addEventListener('orientationchange', syncResize);

    requestAnimationFrame(syncResize);

    return () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      vv?.removeEventListener('resize', syncResize);
      window.removeEventListener('orientationchange', syncResize);
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      map.off('load', handleMapLoad);
      map.off('movestart', handleMoveStart);
      map.off('moveend', handleMoveEnd);
      map.off('click', handleMapClick);
      map.off('mousemove', handleMapMouseMove);
      map.getCanvas().removeEventListener('mouseleave', handleMapMouseLeave);
      window.removeEventListener('resize', syncResize);
      map.remove();
      mapRef.current = null;
    };
  }, [syncViewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mapStyleThemeRef.current === mapTheme) return;

    mapStyleThemeRef.current = mapTheme;
    map.setStyle(mapTheme === 'light' ? MAP_STYLES.light : MAP_STYLES.dark);
  }, [mapTheme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const markerData = buildEventMarkerGeoJson(eventsInRadius, selectedEventId);

    const applyMarkerData = async () => {
      try {
        const ready = await ensureEventMarkerLayers(map);
        if (!ready || cancelled || mapRef.current !== map) return;
        map.getSource(EVENT_MARKERS_SOURCE)?.setData(markerData);
      } catch (error) {
        if (!cancelled) console.error('Errore nel rendering dei segnaposto Motrice', error);
      }
    };

    if (map.isStyleLoaded()) applyMarkerData();
    else map.once('style.load', applyMarkerData);

    return () => {
      cancelled = true;
      map.off('style.load', applyMarkerData);
    };
  }, [eventsInRadius, mapTheme, selectedEventId]);

  useEffect(() => () => {
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
    if (sheetTransitionTimerRef.current) window.clearTimeout(sheetTransitionTimerRef.current);
  }, []);

  useEffect(() => {
    hasAutoFitEventsRef.current = false;
  }, [filters.dateRange, filters.distance, filters.q, filters.sortBy, filters.sport]);

  useEffect(() => {
    if (!requestedEventId) return;
    const requestedEvent = withCoords.find((event) => String(event.id) === String(requestedEventId));
    if (!requestedEvent || !mapRef.current) return;
    hasAutoFitEventsRef.current = true;
    focusEvent(requestedEvent);
  }, [focusEvent, requestedEventId, withCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !eventsInRadius.length || hasAutoFitEventsRef.current) return;
    hasAutoFitEventsRef.current = true;

    if (eventsInRadius.length === 1) {
      map.flyTo({ center: [eventsInRadius[0].lng, eventsInRadius[0].lat], zoom: 12.4, duration: 420, essential: true });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    eventsInRadius.forEach((event) => bounds.extend([event.lng, event.lat]));
    map.fitBounds(bounds, {
      padding: getMapFitPadding(map, resultsSheetRef.current),
      duration: 420,
      maxZoom: 13
    });
  }, [eventsInRadius]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    if (!userMarkerRef.current) {
      const userElement = document.createElement('div');
      userElement.className = styles.userLiveDot;
      userMarkerRef.current = createAnchoredMarker(userElement, 'center')
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([coords.lng, coords.lat]);
    }

    const applyFocus = () => {
      if (!map.isStyleLoaded()) return;
      if (selectedRadiusKm) {
        applyUserRadiusOverlay(map, coords.lat, coords.lng, selectedRadiusKm, mapTheme);
      } else {
        removeUserRadiusOverlay(map);
      }
      const focusRadius = selectedRadiusKm || USER_VIEW_RADIUS_KM;
      if (shouldRecenterRef.current || followUser) {
        map.fitBounds(computeBounds(coords.lat, coords.lng, focusRadius), {
          padding: getMapFitPadding(map, resultsSheetRef.current, 48),
          duration: followUser ? 220 : 340,
          maxZoom: 13
        });
        if (shouldRecenterRef.current) shouldRecenterRef.current = false;
      }
      syncViewport();
    };

    if (map.isStyleLoaded()) applyFocus();
    else map.once('style.load', applyFocus);
  }, [coords, followUser, mapTheme, selectedRadiusKm, syncViewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords || !selectedRadiusKm) return;
    map.fitBounds(computeBounds(coords.lat, coords.lng, selectedRadiusKm), {
      padding: getMapFitPadding(map, resultsSheetRef.current, 48),
      duration: 280,
      maxZoom: 13
    });
    syncViewport();
  }, [coords, selectedRadiusKm, syncViewport]);

  async function toggleSaveEvent(event) {
    const eventId = event.id;
    setSavingIds((prev) => [...prev, eventId]);
    try {
      if (event.is_saved) {
        await api.unsaveEvent(eventId);
        showToast('Evento rimosso dai tuoi eventi', 'info');
      } else {
        await api.saveEvent(eventId);
        showToast('Evento salvato nei tuoi eventi', 'success');
      }

      const refreshed = await api.listEvents({ ...filters, ...originParams, activeOnly: true });
      setEvents(refreshed);
    } catch (error) {
      showToast(error.message || 'Impossibile aggiornare i tuoi eventi', 'error');
    } finally {
      setSavingIds((prev) => prev.filter((id) => id !== eventId));
    }
  }

  function applyCustomFilters() {
    if (draftFilters.distance !== 'all' && !coords) {
      requestLocation();
      showToast('Attiva la posizione per calcolare la distanza reale dagli eventi', 'info');
    }
    setFilters(draftFilters);
    setMapTheme(draftMapTheme);
    setFiltersDrawerOpen(false);
    window.requestAnimationFrame(() => filterButtonRef.current?.focus());
  }

  return (
    <section className={`${styles.page} ${mapTheme === 'light' ? styles.themeLight : styles.themeDark}`}>
      <div className={styles.pageInner}>
        <section className={styles.mapStage} aria-label="Mappa interattiva degli eventi" data-sheet-snap={sheetSnap}>
          <div className={styles.mapViewport}>
            <div ref={mapNodeRef} className={styles.mapCanvas} />
            <div className={styles.mapShade} aria-hidden="true" />

            <div className={styles.mapTopOverlay}>
              <MapSearchBar
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onFilterClick={handleCustomChip}
                activeFilterCount={activeFilterPills.length}
                filtersOpen={filtersDrawerOpen}
                filterButtonRef={filterButtonRef}
              />
              <ActiveFilterPills items={activeFilterPills} onRemove={removeActiveFilter} />
              {!hasLocation && (permission === 'denied' || locationError) ? (
                <button
                  type="button"
                  className={styles.locationNotice}
                  onClick={handleGpsAction}
                  disabled={requesting}
                >
                  <LocateFixed size={18} aria-hidden="true" />
                  <span>
                    <strong>Posizione disattivata</strong>
                    <small>{permission === 'denied' ? 'Abilita il permesso e riprova' : locationError}</small>
                  </span>
                  <b>{requesting ? 'Attendo…' : 'Riprova'}</b>
                </button>
              ) : null}
            </div>

            {resolvingCoordinates ? <span className={styles.mapSyncBadge}>Aggiorno posizioni…</span> : null}

            <MapFloatingControls
              onZoomIn={() => zoomMap('in')}
              onZoomOut={() => zoomMap('out')}
              onGps={{ onAction: handleGpsAction, active: followUser, requesting }}
            />
          </div>

          <section
            ref={resultsSheetRef}
            className={`${styles.resultsSheet} ${styles[`resultsSheet${sheetSnap[0].toUpperCase()}${sheetSnap.slice(1)}`]}`}
            aria-labelledby="map-events-title"
            data-snap={sheetSnap}
          >
            <button
              type="button"
              className={styles.resultsSheetHandle}
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={finishSheetDrag}
              onPointerCancel={finishSheetDrag}
              aria-label={sheetSnap === 'full' ? 'Riduci pannello eventi' : 'Espandi pannello eventi'}
              aria-expanded={sheetSnap === 'full'}
            >
              <span aria-hidden="true" />
            </button>

            <div className={styles.resultsSheetHeader}>
              <div>
                <span className={styles.eyebrow}>VICINO A TE · {mapAreaLabel}</span>
                <h2 id="map-events-title">
                  {sheetEvents.length} {sheetEvents.length === 1 ? 'evento in questa zona' : 'eventi in questa zona'}
                </h2>
              </div>
              <span className={styles.sheetModeLabel}>LISTA</span>
            </div>

            {loading ? (
              <div className={styles.sheetLoading}><LoadingSkeleton rows={2} /></div>
            ) : sheetEvents.length > 0 ? (
              <div className={styles.sheetEventList} aria-label="Eventi visibili sulla mappa">
                {sheetEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    variant="compact"
                    context="map"
                    selected={String(event.id) === String(selectedEventId)}
                    onSelect={focusEvent}
                    onToggleSave={toggleSaveEvent}
                    saving={savingIds.includes(event.id)}
                    detailsIconOnly
                    showProgress={false}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.sheetEmpty}>
                <MapPinOff size={24} aria-hidden="true" />
                <div>
                  <strong>{loadError ? 'Errore nel caricamento' : 'Nessun evento vicino'}</strong>
                  <p>{loadError || (eventsWithoutCoordinates > 0 ? `${eventsWithoutCoordinates} eventi non hanno ancora coordinate valide.` : 'Sposta la mappa o cambia i filtri.')}</p>
                </div>
                <button type="button" onClick={() => navigate('/create')}>Crea</button>
              </div>
            )}
          </section>
        </section>
      </div>

      <MapFiltersDrawer
        open={filtersDrawerOpen}
        filters={draftFilters}
        setFilters={setDraftFilters}
        sports={sports}
        mapTheme={draftMapTheme}
        onClose={closeCustomFilters}
        onApply={applyCustomFilters}
        onReset={() => {
          setDraftFilters(baseFilters);
          setDraftMapTheme('dark');
        }}
        onMapThemeChange={setDraftMapTheme}
      />

      <div className={styles.a11yStatus}>
        {resolvingCoordinates
          ? 'Localizzazione eventi in corso'
          : hasLocation
          ? 'Posizione attiva'
          : permission === 'denied'
            ? 'Permesso posizione negato'
            : requesting
              ? 'Richiesta posizione in corso'
              : locationError || 'Posizione non disponibile'}
      </div>
    </section>
  );
}

export default MapPage;

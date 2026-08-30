import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  LockKeyhole,
  LocateFixed,
  MapPin,
  MapPinOff,
  Minus,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  Users
} from 'lucide-react';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import { useBilling } from '../context/BillingContext';
import PaywallModal from '../components/PaywallModal';
import { useToast } from '../context/ToastContext';
import { useUserLocation } from '../hooks/useUserLocation';
import { geocodeEventLocation } from '../services/geocoding';
import { readFiltersFromSearch, writeFiltersToSearch } from '../utils/queryFilters';
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
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

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

function createEventActivityIcon(event) {
  const activityType = getEventActivityType(event);
  const icon = document.createElement('span');
  icon.className = styles.eventPinIcon;
  icon.dataset.activity = activityType;
  icon.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.15');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  EVENT_ACTIVITY_ICON_NODES[activityType].forEach(([tagName, attributes]) => {
    const node = document.createElementNS(SVG_NAMESPACE, tagName);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    svg.appendChild(node);
  });

  icon.appendChild(svg);
  return icon;
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

function computeBounds(lat, lng, radiusKm) {
  const latDelta = radiusKm / 110.574;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngDelta = radiusKm / Math.max(111.32 * Math.abs(cosLat), 0.0001);
  return [
    [lng - lngDelta, lat - latDelta],
    [lng + lngDelta, lat + latDelta]
  ];
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

function clusterEventsByScreenPosition(map, events, radiusPx = EVENT_CLUSTER_OVERLAP_PX) {
  if (!map) return [];

  const clusters = events.reduce((result, event) => {
    const point = map.project([event.lng, event.lat]);
    const nearbyCluster = result.find((cluster) =>
      cluster.screenPoints.every((clusterPoint) => {
        const dx = point.x - clusterPoint.x;
        const dy = point.y - clusterPoint.y;
        return Math.sqrt(dx * dx + dy * dy) <= radiusPx;
      })
    );

    if (!nearbyCluster) {
      result.push({
        events: [event],
        screenPoints: [point],
        screenX: point.x,
        screenY: point.y,
        lng: event.lng,
        lat: event.lat
      });
      return result;
    }

    const previousCount = nearbyCluster.events.length;
    const nextCount = previousCount + 1;
    nearbyCluster.events.push(event);
    nearbyCluster.screenPoints.push(point);
    nearbyCluster.screenX = (nearbyCluster.screenX * previousCount + point.x) / nextCount;
    nearbyCluster.screenY = (nearbyCluster.screenY * previousCount + point.y) / nextCount;
    nearbyCluster.lng = (nearbyCluster.lng * previousCount + event.lng) / nextCount;
    nearbyCluster.lat = (nearbyCluster.lat * previousCount + event.lat) / nextCount;
    return result;
  }, []);

  return clusters.map((cluster) => {
    const visualCenter = map.unproject([cluster.screenX, cluster.screenY]);
    return { ...cluster, lng: visualCenter.lng, lat: visualCenter.lat };
  });
}

function zoomToEventCluster(map, cluster) {
  if (!map || !cluster?.events?.length) return;

  const bounds = new maplibregl.LngLatBounds();
  cluster.events.forEach((event) => bounds.extend([event.lng, event.lat]));
  const northEast = bounds.getNorthEast();
  const southWest = bounds.getSouthWest();
  const isSamePoint =
    Math.abs(northEast.lng - southWest.lng) < 0.00001 && Math.abs(northEast.lat - southWest.lat) < 0.00001;

  if (isSamePoint) {
    map.flyTo({
      center: [cluster.lng, cluster.lat],
      zoom: Math.min(17, map.getZoom() + 2.4),
      duration: 360,
      essential: true
    });
    return;
  }

  map.fitBounds(bounds, {
    padding: 76,
    duration: 380,
    maxZoom: Math.min(16, map.getZoom() + 3)
  });
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

function formatEventDay(dateValue) {
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return 'PROSSIMO';

  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startEvent = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDelta = Math.round((startEvent.getTime() - startToday.getTime()) / 86400000);

  if (dayDelta === 0) return 'OGGI';
  if (dayDelta === 1) return 'DOMANI';
  return date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' }).toUpperCase();
}

function formatEventTime(dateValue) {
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function applyUserRadiusOverlay(map, lat, lng, radiusKm, mapTheme) {
  const data = buildRadiusPolygon(lat, lng, radiusKm);
  const fillColor = mapTheme === 'light' ? 'rgba(139,207,0,0.18)' : 'rgba(168,240,0,0.18)';
  const lineColor = mapTheme === 'light' ? 'rgba(129,189,0,0.72)' : 'rgba(184,255,53,0.84)';

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
    });
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
    });
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

function MapSearchBar({ value, onChange, onFilterClick, activeFilterCount, filtersOpen }) {
  return (
    <div className={styles.searchBar}>
      <Search size={17} aria-hidden="true" />
      <input value={value} onChange={onChange} placeholder="Cerca sport o città" aria-label="Cerca sport o città" />
      <button
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
      </div>
      <button
        type="button"
        className={`${styles.fab} ${styles.fabNeutral} ${styles.locationFab} ${onGps.active ? styles.fabPrimary : ''}`}
        onClick={onGps.onClick}
        aria-label="Centra sulla mia posizione"
      >
        <LocateFixed size={18} aria-hidden="true" />
        <span>La mia posizione</span>
      </button>
    </div>
  );
}

function MapFiltersDrawer({
  open,
  filters,
  setFilters,
  sports,
  entitlements,
  mapTheme,
  onClose,
  onApply,
  onReset,
  onPaywall,
  onMapThemeChange
}) {
  const selectedOptionsCount = [
    filters.sport !== baseFilters.sport,
    filters.dateRange !== baseFilters.dateRange,
    filters.distance !== baseFilters.distance,
    filters.sortBy !== baseFilters.sortBy,
    mapTheme !== 'dark'
  ].filter(Boolean).length;

  return (
    <>
      <button
        type="button"
        className={`${styles.filtersBackdrop} ${open ? styles.filtersBackdropOpen : ''}`}
        aria-label="Chiudi filtri"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <div
        className={`${styles.filtersDrawer} ${open ? styles.filtersDrawerOpen : styles.filtersDrawerClosed}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-filters-title"
        aria-hidden={!open}
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
          <button type="button" className={styles.sheetToggle} onClick={onClose} aria-label="Chiudi filtri">
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
            <span className={styles.fieldLabel}>
              Distanza
              {!entitlements.canUseAdvancedFilters ? (
                <small className={styles.premiumLabel}><LockKeyhole size={10} aria-hidden="true" /> Premium</small>
              ) : null}
            </span>
            <select
              value={filters.distance}
              onChange={(event) => {
                if (!entitlements.canUseAdvancedFilters) {
                  onPaywall();
                  return;
                }
                setFilters((prev) => ({ ...prev, distance: event.target.value }));
              }}
              disabled={!entitlements.canUseAdvancedFilters}
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
  const { entitlements } = useBilling();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedEventId = searchParams.get('eventId');

  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const eventMarkersRef = useRef([]);
  const coordinateAttemptsRef = useRef(new Set());
  const hasAutoFitEventsRef = useRef(false);
  const shouldRecenterRef = useRef(true);
  const gpsTapRef = useRef(0);
  const mapStyleThemeRef = useRef(null);
  const mapThemeBeforeDrawerRef = useRef('dark');
  const eventsSectionRef = useRef(null);
  const eventCardRefs = useRef(new Map());

  const [filters, setFilters] = useState(() => readFiltersFromSearch(searchParams, baseFilters));
  const [sports, setSports] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [resolvedCoordinates, setResolvedCoordinates] = useState({});
  const [resolvingCoordinates, setResolvingCoordinates] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [savingIds, setSavingIds] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
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

  const { coords, hasLocation, permission, error: locationError, requesting, requestLocation, originParams } = useUserLocation();

  usePageMeta({
    title: 'Mappa Eventi | Motrice',
    description: 'Visualizza sessioni e luoghi consigliati su mappa interattiva.'
  });

  useEffect(() => {
    api.listSports().then(setSports);
  }, []);

  useEffect(() => {
    const base = entitlements.canUseAdvancedFilters
      ? filters
      : { ...filters, distance: 'all', level: 'all', timeOfDay: 'all' };

    let active = true;
    setLoading(true);
    setLoadError('');
    api
      .listEvents({ ...base, ...originParams })
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
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [entitlements.canUseAdvancedFilters, filters, originParams]);

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
    if (!entitlements.canUseAdvancedFilters || filters.distance === 'all') return null;
    const parsedDistance = Number(filters.distance);
    return Number.isFinite(parsedDistance) && parsedDistance > 0 ? parsedDistance : null;
  }, [entitlements.canUseAdvancedFilters, filters.distance]);

  const eventsWithoutCoordinates = Math.max(0, events.length - withCoords.length);

  const eventsInRadius = useMemo(() => {
    if (!selectedRadiusKm || !coords) return withCoords;
    return withCoords.filter((event) => distanceKm(coords.lat, coords.lng, event.lat, event.lng) <= selectedRadiusKm);
  }, [coords, selectedRadiusKm, withCoords]);

  const visibleEvents = useMemo(
    () => eventsInRadius.filter((event) => isEventInViewport(event, viewportBounds)),
    [eventsInRadius, viewportBounds]
  );

  const activeEventsCount = useMemo(() => {
    const now = Date.now();
    return eventsInRadius.filter((event) => {
      const eventAt = Date.parse(event.event_datetime);
      const durationMinutes = Math.max(15, Number(event.duration_minutes) || 120);
      const eventEndsAt = eventAt + durationMinutes * 60 * 1000;
      return Number.isFinite(eventAt) && eventEndsAt >= now;
    }).length;
  }, [eventsInRadius]);

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

  const focusEvent = useCallback((event, { scrollToCard = false } = {}) => {
    const map = mapRef.current;
    if (!map || !event) return;
    setSelectedEventId(String(event.id));
    map.flyTo({ center: [event.lng, event.lat], zoom: Math.max(12.8, map.getZoom()), duration: 320, essential: true });

    if (scrollToCard) {
      window.setTimeout(() => {
        eventCardRefs.current.get(String(event.id))?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 120);
    }
  }, []);

  function handleCustomChip() {
    mapThemeBeforeDrawerRef.current = mapTheme;
    setDraftFilters(filters);
    setFiltersDrawerOpen(true);
  }

  function closeCustomFilters() {
    setDraftFilters(filters);
    setMapTheme(mapThemeBeforeDrawerRef.current);
    setFiltersDrawerOpen(false);
  }

  function removeActiveFilter(filterKey) {
    setFilters((prev) => ({ ...prev, [filterKey]: baseFilters[filterKey] }));
  }

  function onGpsAction() {
    const now = Date.now();
    const isDoubleTap = now - gpsTapRef.current <= 320;
    gpsTapRef.current = now;

    if (isDoubleTap) {
      setFollowUser((prev) => {
        const next = !prev;
        showToast(next ? 'Follow me attivato' : 'Follow me disattivato', 'info');
        return next;
      });
      return;
    }

    if (!coords) {
      requestLocation();
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    shouldRecenterRef.current = true;
    setFollowUser(false);
    map.flyTo({ center: [coords.lng, coords.lat], zoom: Math.max(11.4, map.getZoom()), duration: 280, essential: true });
  }

  function zoomMap(direction) {
    const map = mapRef.current;
    if (!map) return;
    const nextZoom = direction === 'in' ? map.getZoom() + 1 : map.getZoom() - 1;
    map.easeTo({ zoom: nextZoom, duration: 220 });
  }

  const hasRestrictiveFilters = useMemo(() => {
    return (
      String(filters.q || '').trim().length > 0 ||
      String(filters.sport) !== 'all' ||
      String(filters.dateRange) !== 'all' ||
      String(filters.distance) !== 'all' ||
      String(filters.level) !== 'all' ||
      String(filters.timeOfDay) !== 'all'
    );
  }, [filters]);

  const createSuggested = useMemo(() => eventsInRadius.length === 0 && hasRestrictiveFilters, [eventsInRadius.length, hasRestrictiveFilters]);

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

    mapStyleThemeRef.current = mapTheme;
    map.on('load', syncViewport);
    map.on('moveend', syncViewport);
    map.on('zoomend', syncViewport);

    mapRef.current = map;
    const onWindowResize = () => map.resize();
    window.addEventListener('resize', onWindowResize, { passive: true });

    let resizeTimer = null;
    const syncResize = () => {
      map.resize();
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => map.resize(), 220);
    };

    const observer = new ResizeObserver(syncResize);
    observer.observe(mapNodeRef.current);

    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncResize);
    vv?.addEventListener('scroll', syncResize);
    window.addEventListener('orientationchange', syncResize);

    requestAnimationFrame(syncResize);

    return () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      observer.disconnect();
      vv?.removeEventListener('resize', syncResize);
      vv?.removeEventListener('scroll', syncResize);
      window.removeEventListener('orientationchange', syncResize);
      eventMarkersRef.current.forEach((marker) => marker.remove());
      eventMarkersRef.current = [];
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      map.off('load', syncViewport);
      map.off('moveend', syncViewport);
      map.off('zoomend', syncViewport);
      window.removeEventListener('resize', onWindowResize);
      map.remove();
      mapRef.current = null;
    };
  }, [coords, mapTheme, syncViewport]);

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

    eventMarkersRef.current.forEach((marker) => marker.remove());
    eventMarkersRef.current = [];

    const markerEvents = eventsInRadius.filter((event) => isEventInViewport(event, viewportBounds));
    const clusters = clusterEventsByScreenPosition(map, markerEvents, EVENT_CLUSTER_OVERLAP_PX);

    clusters.forEach((cluster) => {
      if (cluster.events.length > 1) {
        const element = document.createElement('button');
        element.type = 'button';
        const includesSelected = cluster.events.some((event) => String(event.id) === String(selectedEventId));
        element.className = `${styles.eventCluster} ${includesSelected ? styles.eventClusterSelected : ''}`;
        element.title = `${cluster.events.length} eventi in questa zona`;
        element.setAttribute('aria-label', `${element.title}. Tocca per avvicinare la mappa.`);

        const count = document.createElement('strong');
        count.textContent = String(cluster.events.length);
        element.appendChild(count);

        element.addEventListener('click', () => zoomToEventCluster(map, cluster));

        const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
          .setLngLat([cluster.lng, cluster.lat])
          .addTo(map);
        eventMarkersRef.current.push(marker);
        return;
      }

      const event = cluster.events[0];
      const element = document.createElement('button');
      element.type = 'button';
      const isSelected = String(event.id) === String(selectedEventId);
      const isSaved = Boolean(event.is_saved);
      element.className = `${styles.eventPin} ${isSaved ? styles.eventPinSaved : styles.eventPinDefault} ${isSelected ? styles.eventPinSelected : ''}`;
      element.title = `${event.sport_name || 'Evento'} - ${event.location_name || ''}`;
      element.setAttribute('aria-label', element.title);
      element.appendChild(createEventActivityIcon(event));

      const label = document.createElement('span');
      label.className = styles.eventPinLabel;
      label.textContent = event.sport_name || event.title || 'Evento';
      element.appendChild(label);

      element.addEventListener('click', () => {
        focusEvent(event, { scrollToCard: true });
      });

      const marker = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([event.lng, event.lat]).addTo(map);
      eventMarkersRef.current.push(marker);
    });

    return () => {
      eventMarkersRef.current.forEach((marker) => marker.remove());
      eventMarkersRef.current = [];
    };
  }, [eventsInRadius, focusEvent, selectedEventId, viewportBounds]);

  useEffect(() => {
    if (!requestedEventId) return;
    const requestedEvent = withCoords.find((event) => String(event.id) === String(requestedEventId));
    if (!requestedEvent || !mapRef.current) return;
    hasAutoFitEventsRef.current = true;
    focusEvent(requestedEvent);
  }, [focusEvent, requestedEventId, withCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !withCoords.length || hasAutoFitEventsRef.current) return;
    hasAutoFitEventsRef.current = true;

    if (withCoords.length === 1) {
      map.flyTo({ center: [withCoords[0].lng, withCoords[0].lat], zoom: 12.4, duration: 420, essential: true });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    withCoords.forEach((event) => bounds.extend([event.lng, event.lat]));
    map.fitBounds(bounds, { padding: 72, duration: 420, maxZoom: 13 });
  }, [withCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    if (!userMarkerRef.current) {
      const userElement = document.createElement('div');
      userElement.className = styles.userLiveDot;
      userMarkerRef.current = new maplibregl.Marker({ element: userElement, anchor: 'center' })
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
          padding: 32,
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
      padding: 32,
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

      const effectiveFilters = entitlements.canUseAdvancedFilters
        ? filters
        : { ...filters, distance: 'all', level: 'all', timeOfDay: 'all' };
      const refreshed = await api.listEvents({ ...effectiveFilters, ...originParams });
      setEvents(refreshed);
    } catch (error) {
      showToast(error.message || 'Impossibile aggiornare i tuoi eventi', 'error');
    } finally {
      setSavingIds((prev) => prev.filter((id) => id !== eventId));
    }
  }

  function applyCustomFilters() {
    setFilters(draftFilters);
    setFiltersDrawerOpen(false);
  }

  return (
    <section className={`${styles.page} ${mapTheme === 'light' ? styles.themeLight : styles.themeDark}`}>
      <div className={styles.pageInner}>
        <header className={styles.pageHeader}>
          <div className={styles.pageHeading}>
            <span className={styles.eyebrow}>MAPPA LIVE</span>
            <h1>Allenati vicino a te</h1>
            <p>Scopri gli eventi attivi nella tua zona e scegli dove muoverti.</p>
          </div>
          <button
            type="button"
            className={`${styles.locationPill} ${hasLocation ? styles.locationPillActive : ''}`}
            onClick={() => {
              if (hasLocation) onGpsAction();
              else requestLocation();
            }}
          >
            <MapPin size={16} aria-hidden="true" />
            <span>{hasLocation ? 'Vicino a te' : requesting ? 'Attivazione…' : 'Attiva GPS'}</span>
          </button>
        </header>

        <div className={styles.topControls}>
          <MapSearchBar
            value={filters.q || ''}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            onFilterClick={handleCustomChip}
            activeFilterCount={activeFilterPills.length}
            filtersOpen={filtersDrawerOpen}
          />
          <ActiveFilterPills items={activeFilterPills} onRemove={removeActiveFilter} />
        </div>

        <section className={styles.mapStage} aria-label="Mappa interattiva degli eventi">
          <div className={styles.mapStageHeader}>
            <div>
              <span className={styles.mapStageKicker}>{mapAreaLabel}</span>
              <strong>{activeEventsCount} {activeEventsCount === 1 ? 'evento attivo' : 'eventi attivi'}</strong>
            </div>
            {resolvingCoordinates ? <span className={styles.mapSync}>Aggiorno posizioni…</span> : null}
          </div>

          <div className={styles.mapViewport}>
            <div ref={mapNodeRef} className={styles.mapCanvas} />
            <div className={styles.mapShade} aria-hidden="true" />
            <div className={styles.mapLegend} aria-label="Legenda della mappa">
              <span><i className={`${styles.legendDot} ${styles.legendEvent}`} aria-hidden="true" />Evento</span>
              <span><i className={`${styles.legendDot} ${styles.legendSaved}`} aria-hidden="true" />Salvato</span>
              <span><i className={`${styles.legendDot} ${styles.legendUser}`} aria-hidden="true" />Tu</span>
            </div>
            <MapFloatingControls
              onZoomIn={() => zoomMap('in')}
              onZoomOut={() => zoomMap('out')}
              onGps={{ onClick: onGpsAction, active: followUser }}
            />
          </div>
        </section>

        <section ref={eventsSectionRef} className={styles.eventsSection} aria-labelledby="map-events-title">
          <div className={styles.eventsHeader}>
            <div>
              <span className={styles.eyebrow}>VICINO A TE</span>
              <h2 id="map-events-title">Eventi sulla mappa</h2>
            </div>
            <span className={styles.eventsCount}>{visibleEvents.length}</span>
          </div>

          {loading ? (
            <div className={styles.loadingWrap}>
              <LoadingSkeleton rows={3} />
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className={styles.emptyWrap}>
              <EmptyState
                icon={MapPinOff}
                imageSrc="/images/default-sport.svg"
                imageAlt="Mappa vuota"
                title={loadError ? 'Errore nel caricamento' : resolvingCoordinates ? 'Localizzo gli eventi' : 'Nessun evento vicino'}
                description={
                  loadError ||
                  (resolvingCoordinates
                    ? 'Sto convertendo le località degli eventi in coordinate.'
                    : eventsWithoutCoordinates > 0
                      ? `${eventsWithoutCoordinates} eventi non hanno ancora una posizione riconoscibile.`
                      : 'Sposta la mappa, cambia i filtri oppure crea il primo evento nella tua area.')
                }
                primaryActionLabel="Crea evento"
                onPrimaryAction={() => navigate('/create')}
              />
            </div>
          ) : (
            <ul className={styles.eventList}>
              {visibleEvents.map((event) => {
                const isSelected = String(event.id) === String(selectedEventId);
                return (
                  <li key={event.id}>
                    <article
                      ref={(node) => {
                        if (node) eventCardRefs.current.set(String(event.id), node);
                        else eventCardRefs.current.delete(String(event.id));
                      }}
                      className={`${styles.eventCard} ${isSelected ? styles.eventCardSelected : ''}`}
                    >
                      <button type="button" className={styles.eventCardMain} onClick={() => focusEvent(event)}>
                        <span className={styles.eventAccent} aria-hidden="true" />
                        <span className={styles.eventMeta}>
                          <span className={styles.eventDay}>{formatEventDay(event.event_datetime)}</span>
                          <span>
                            {event.location_name || event.city || 'Luogo da definire'}
                            {formatEventTime(event.event_datetime) ? ` · ${formatEventTime(event.event_datetime)}` : ''}
                          </span>
                        </span>
                        <strong>{event.title || event.sport_name}</strong>
                        <span className={styles.eventCardFoot}>
                          <span>
                            <Users size={15} aria-hidden="true" />
                            {Number(event.participants_count || 0)}/{Number(event.max_participants || 0)} partecipanti
                          </span>
                          <span className={styles.focusHint}>Mostra sulla mappa</span>
                        </span>
                      </button>

                      <div className={styles.eventCardActions}>
                        <button
                          type="button"
                          className={`${styles.inlineAction} ${event.is_saved ? styles.inlineActionActive : ''}`}
                          onClick={() => toggleSaveEvent(event)}
                          disabled={savingIds.includes(event.id)}
                        >
                          {event.is_saved ? <BookmarkCheck size={14} aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}
                          {event.is_saved ? 'Salvato' : 'Salva'}
                        </button>
                        <Link className={styles.eventLink} to={`/events/${event.id}`}>
                          Dettagli <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`${styles.createPrompt} ${createSuggested ? styles.createPromptSuggested : ''}`}>
          <button type="button" className={styles.createPromptIcon} onClick={() => navigate('/create')} aria-label="Crea un evento">
            <Plus size={23} aria-hidden="true" />
          </button>
          <div>
            <h2>Nessun evento adatto?</h2>
            <p>Crea il primo nella tua zona e invita gli altri.</p>
          </div>
          <button type="button" className={styles.createButton} onClick={() => navigate('/create')}>
            Crea
          </button>
        </section>
      </div>

      <MapFiltersDrawer
        open={filtersDrawerOpen}
        filters={draftFilters}
        setFilters={setDraftFilters}
        sports={sports}
        entitlements={entitlements}
        mapTheme={mapTheme}
        onClose={closeCustomFilters}
        onApply={applyCustomFilters}
        onReset={() => {
          setDraftFilters(baseFilters);
          setMapTheme('dark');
        }}
        onPaywall={() => setPaywallOpen(true)}
        onMapThemeChange={setMapTheme}
      />

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} feature="Filtri avanzati mappa" />

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

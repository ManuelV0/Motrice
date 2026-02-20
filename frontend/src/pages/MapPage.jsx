import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  LocateFixed,
  List,
  MapPinOff,
  Moon,
  Plus,
  Search,
  Sun
} from 'lucide-react';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import { useBilling } from '../context/BillingContext';
import PaywallModal from '../components/PaywallModal';
import { useToast } from '../context/ToastContext';
import { useUserLocation } from '../hooks/useUserLocation';
import { writeFiltersToSearch } from '../utils/queryFilters';
import styles from '../styles/pages/map.module.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const baseFilters = {
  q: '',
  sport: 'all',
  dateRange: 'all',
  distance: 'all',
  level: 'all',
  timeOfDay: 'all',
  sortBy: 'closest'
};

const RADIUS_CYCLE_KM = [0, 10, 20, 30, 40];
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

function applyUserRadiusOverlay(map, lat, lng, radiusKm, mapTheme) {
  const data = buildRadiusPolygon(lat, lng, radiusKm);
  const fillColor = mapTheme === 'light' ? 'rgba(251,146,60,0.18)' : 'rgba(253,186,116,0.18)';
  const lineColor = mapTheme === 'light' ? 'rgba(251,146,60,0.72)' : 'rgba(253,186,116,0.84)';

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

function MapSearchBar({ value, onChange }) {
  return (
    <label className={styles.searchBar}>
      <Search size={17} aria-hidden="true" />
      <input value={value} onChange={onChange} placeholder="Cerca sport o città" />
    </label>
  );
}

function MapFilterChips({
  selectedChip,
  selectedRadiusKm,
  activeEventsCount,
  customApplied,
  onRadiusCycle,
  onEventsClick,
  onCustomClick
}) {
  return (
    <div className={styles.chipRail} role="tablist" aria-label="Filtri rapidi mappa">
      <button
        type="button"
        role="tab"
        aria-selected={selectedChip === '0-350+'}
        className={selectedChip === '0-350+' ? styles.chipActive : styles.chip}
        onClick={onRadiusCycle}
      >
        <span>{`KM ${selectedRadiusKm || 0}`}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={selectedChip === 'Eventi'}
        className={selectedChip === 'Eventi' ? styles.chipActive : styles.chip}
        onClick={onEventsClick}
      >
        <span>{`Eventi ${activeEventsCount}`}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={selectedChip === 'Personalizzata'}
        className={selectedChip === 'Personalizzata' ? styles.chipActive : styles.chip}
        onClick={onCustomClick}
      >
        <span>Personalizzata</span>
        {customApplied && <span className={styles.chipDot} aria-hidden="true" />}
      </button>
    </div>
  );
}

function MapFloatingControls({ listOpen, onToggleList, onCreate, onGps, onToggleTheme, mapTheme }) {
  return (
    <div className={styles.fabStack}>
      <button
        type="button"
        className={`${styles.fab} ${styles.fabNeutral} ${listOpen ? styles.fabPrimary : ''}`}
        onClick={onToggleList.onClick}
        onPointerDown={onToggleList.onPointerDown}
        onPointerUp={onToggleList.onPointerUp}
        onPointerCancel={onToggleList.onPointerUp}
        aria-pressed={listOpen}
      >
        <List size={18} aria-hidden="true" />
        <span>Lista</span>
      </button>
      <button
        type="button"
        className={`${styles.fab} ${styles.fabAccent} ${onCreate.suggested ? styles.fabSuggested : ''}`}
        onClick={onCreate.onClick}
      >
        <Plus size={18} aria-hidden="true" />
        <span>Crea</span>
      </button>
      <button type="button" className={`${styles.fab} ${styles.fabNeutral} ${onGps.active ? styles.fabPrimary : ''}`} onClick={onGps.onClick}>
        <LocateFixed size={18} aria-hidden="true" />
        <span>GPS</span>
      </button>
      <button type="button" className={`${styles.fab} ${styles.fabNeutral}`} onClick={onToggleTheme}>
        {mapTheme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        <span>{mapTheme === 'dark' ? 'Chiaro' : 'Scuro'}</span>
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
  onClose,
  onApply,
  onPaywall
}) {
  return (
    <div className={`${styles.filtersDrawer} ${open ? styles.filtersDrawerOpen : styles.filtersDrawerClosed}`} aria-hidden={!open}>
      <div className={styles.sheetHandle} aria-hidden="true" />
      <div className={styles.sheetHeaderRow}>
        <h2>Filtri personalizzati</h2>
        <button type="button" className={styles.sheetToggle} onClick={onClose}>
          <span>Chiudi</span>
          <ChevronDown size={16} />
        </button>
      </div>

      <div className={styles.sheetFiltersGrid}>
        <label className={styles.mapField}>
          <span>Sport</span>
          <select value={filters.sport} onChange={(event) => setFilters((prev) => ({ ...prev, sport: event.target.value }))}>
            <option value="all">Tutti</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.mapField}>
          <span>Periodo</span>
          <select value={filters.dateRange} onChange={(event) => setFilters((prev) => ({ ...prev, dateRange: event.target.value }))}>
            <option value="all">Qualsiasi</option>
            <option value="today">Oggi</option>
            <option value="week">Questa settimana</option>
            <option value="month">Questo mese</option>
          </select>
        </label>

        <label className={styles.mapField}>
          <span>Distanza</span>
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
            <option value="all">0-350+ km</option>
            <option value="5">Entro 5 km</option>
            <option value="15">Entro 15 km</option>
            <option value="30">Entro 30 km</option>
          </select>
        </label>

        <label className={styles.mapField}>
          <span>Ordina</span>
          <select value={filters.sortBy} onChange={(event) => setFilters((prev) => ({ ...prev, sortBy: event.target.value }))}>
            <option value="soonest">Più vicini nel tempo</option>
            <option value="closest">Più vicini a te</option>
            <option value="popular">Più popolari</option>
          </select>
        </label>
      </div>

      <div className={styles.drawerActions}>
        <button type="button" className={styles.drawerGhost} onClick={() => setFilters(baseFilters)}>
          Reset
        </button>
        <button type="button" className={styles.drawerApply} onClick={onApply}>
          Applica
        </button>
      </div>
    </div>
  );
}

function MapPage() {
  const { showToast } = useToast();
  const { entitlements } = useBilling();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const eventMarkersRef = useRef([]);
  const shouldRecenterRef = useRef(true);
  const gpsTapRef = useRef(0);
  const listLongPressRef = useRef({ timer: null, longTriggered: false });
  const mapStyleThemeRef = useRef(null);

  const [filters, setFilters] = useState(baseFilters);
  const [sports, setSports] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [savingIds, setSavingIds] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const [selectedChip, setSelectedChip] = useState(null);
  const [selectedRadiusKm, setSelectedRadiusKm] = useState(null);
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
    api
      .listEvents({ ...base, ...originParams })
      .then((rows) => {
        if (active) setEvents(rows || []);
      })
      .catch(() => {
        if (active) setEvents([]);
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

  const withCoords = useMemo(
    () =>
      events
        .filter((event) => hasValidCoordinates(event.lat, event.lng))
        .map((event) => ({
          ...event,
          lat: Number(event.lat),
          lng: Number(event.lng)
        })),
    [events]
  );

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
      return Number.isFinite(eventAt) && eventAt >= now;
    }).length;
  }, [eventsInRadius]);

  const hasCustomFiltersApplied = useMemo(() => {
    return (
      String(filters.q || '').trim().length > 0 ||
      String(filters.sport) !== 'all' ||
      String(filters.dateRange) !== 'all' ||
      String(filters.distance) !== 'all' ||
      String(filters.level) !== 'all' ||
      String(filters.timeOfDay) !== 'all' ||
      String(filters.sortBy) !== 'closest'
    );
  }, [filters]);

  const build3DPath = useCallback((event) => {
    const params = new URLSearchParams();
    params.set('eventId', String(event.id));
    params.set('lat', String(event.lat));
    params.set('lng', String(event.lng));
    if (event.location_name) params.set('focus', event.location_name);
    params.set('radiusKm', '2');
    return `/game?${params.toString()}`;
  }, []);

  const open3D = useCallback(
    (event) => {
      if (!event || event.lat == null || event.lng == null) return;
      navigate(build3DPath(event));
    },
    [build3DPath, navigate]
  );

  const focusEvent = useCallback((event) => {
    const map = mapRef.current;
    if (!map || !event) return;
    setSelectedEventId(Number(event.id));
    map.flyTo({ center: [event.lng, event.lat], zoom: Math.max(12.8, map.getZoom()), duration: 320, essential: true });
  }, []);

  function handleRadiusCycle() {
    setSelectedRadiusKm((prev) => {
      const current = Number.isFinite(Number(prev)) ? Number(prev) : 0;
      const index = RADIUS_CYCLE_KM.indexOf(current);
      const next = RADIUS_CYCLE_KM[(index + 1) % RADIUS_CYCLE_KM.length];
      if (!coords && next > 0) {
        requestLocation();
        showToast('Attiva il GPS per applicare il raggio.', 'info');
        return current;
      }
      if (next > 0) shouldRecenterRef.current = true;
      return next;
    });
    setSelectedChip('0-350+');
  }

  function handleEventsChip() {
    setSelectedChip('Eventi');
    setListOpen(true);
  }

  function handleCustomChip() {
    setSelectedChip('Personalizzata');
    setDraftFilters(filters);
    setFiltersDrawerOpen(true);
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

  function handleListPointerDown() {
    listLongPressRef.current.longTriggered = false;
    listLongPressRef.current.timer = window.setTimeout(() => {
      listLongPressRef.current.longTriggered = true;
      setDraftFilters(filters);
      setFiltersDrawerOpen(true);
    }, 420);
  }

  function handleListPointerUp() {
    const activeTimer = listLongPressRef.current.timer;
    if (activeTimer) {
      clearTimeout(activeTimer);
      listLongPressRef.current.timer = null;
    }
  }

  useEffect(() => {
    return () => {
      if (listLongPressRef.current.timer) {
        clearTimeout(listLongPressRef.current.timer);
      }
    };
  }, []);

  function handleListTap() {
    if (listLongPressRef.current.longTriggered) return;
    setListOpen((prev) => !prev);
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

    mapStyleThemeRef.current = mapTheme;
    map.on('load', syncViewport);
    map.on('moveend', syncViewport);
    map.on('zoomend', syncViewport);

    mapRef.current = map;
    const onWindowResize = () => map.resize();
    window.addEventListener('resize', onWindowResize, { passive: true });
    requestAnimationFrame(() => map.resize());

    return () => {
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

    eventsInRadius.forEach((event) => {
      const element = document.createElement('button');
      element.type = 'button';
      const isSelected = Number(event.id) === Number(selectedEventId);
      const isSaved = Boolean(event.is_saved);
      element.className = `${styles.eventPin} ${isSaved ? styles.eventPinSaved : styles.eventPinDefault} ${isSelected ? styles.eventPinSelected : ''}`;
      element.title = `${event.sport_name || 'Evento'} - ${event.location_name || ''}`;
      element.setAttribute('aria-label', element.title);
      element.addEventListener('click', () => open3D(event));

      const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([event.lng, event.lat]).addTo(map);
      eventMarkersRef.current.push(marker);
    });

    syncViewport();

    return () => {
      eventMarkersRef.current.forEach((marker) => marker.remove());
      eventMarkersRef.current = [];
    };
  }, [eventsInRadius, open3D, selectedEventId, syncViewport]);

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
        showToast('Evento rimosso dall agenda', 'info');
      } else {
        await api.saveEvent(eventId);
        showToast('Evento salvato in agenda', 'success');
      }

      const effectiveFilters = entitlements.canUseAdvancedFilters
        ? filters
        : { ...filters, distance: 'all', level: 'all', timeOfDay: 'all' };
      const refreshed = await api.listEvents({ ...effectiveFilters, ...originParams });
      setEvents(refreshed);
    } catch (error) {
      showToast(error.message || 'Impossibile aggiornare agenda', 'error');
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
      <div className={styles.mapViewport}>
        <div ref={mapNodeRef} className={styles.mapCanvas} />
        <div className={styles.topReadabilityLayer} aria-hidden="true" />

        <div className={styles.topControls}>
          <MapSearchBar value={filters.q || ''} onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))} />
          <MapFilterChips
            selectedChip={selectedChip}
            selectedRadiusKm={selectedRadiusKm}
            activeEventsCount={activeEventsCount}
            customApplied={hasCustomFiltersApplied}
            onRadiusCycle={handleRadiusCycle}
            onEventsClick={handleEventsChip}
            onCustomClick={handleCustomChip}
          />
        </div>

        <MapFloatingControls
          listOpen={listOpen}
          onToggleList={{
            onClick: handleListTap,
            onPointerDown: handleListPointerDown,
            onPointerUp: handleListPointerUp
          }}
          onCreate={{ onClick: () => navigate('/create'), suggested: createSuggested }}
          onGps={{ onClick: onGpsAction, active: followUser }}
          onToggleTheme={() => setMapTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          mapTheme={mapTheme}
        />

        <MapFiltersDrawer
          open={filtersDrawerOpen}
          filters={draftFilters}
          setFilters={setDraftFilters}
          sports={sports}
          entitlements={entitlements}
          onClose={() => setFiltersDrawerOpen(false)}
          onApply={applyCustomFilters}
          onPaywall={() => setPaywallOpen(true)}
        />

        <div className={`${styles.bottomSheet} ${listOpen ? styles.bottomSheetOpen : styles.bottomSheetClosed}`}>
          <div className={styles.sheetHandle} aria-hidden="true" />
          <div className={styles.sheetHeaderRow}>
            <h2>Eventi visibili ({visibleEvents.length})</h2>
            <button
              type="button"
              className={styles.sheetToggle}
              onClick={() => {
                setDraftFilters(filters);
                setFiltersDrawerOpen((prev) => !prev);
              }}
            >
              <span>Filtri</span>
              {filtersDrawerOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          <div className={styles.sheetBody}>
            {loading ? (
              <LoadingSkeleton rows={4} />
            ) : visibleEvents.length === 0 ? (
              <EmptyState
                icon={MapPinOff}
                imageSrc="/images/default-sport.svg"
                imageAlt="Mappa vuota"
                title="Nessun evento trovato"
                description="Allarga la mappa, modifica i filtri oppure crea un nuovo evento nella tua area."
                primaryActionLabel="Crea evento"
                onPrimaryAction={() => navigate('/create')}
              />
            ) : (
              <ul className={styles.sheetList}>
                {visibleEvents.map((event) => (
                  <li key={event.id} className={styles.sheetItem}>
                    <button type="button" className={styles.sheetItemMain} onClick={() => focusEvent(event)}>
                      <strong>{event.sport_name}</strong>
                      <span>{event.location_name}</span>
                    </button>
                    <div className={styles.sheetItemActions}>
                      <button type="button" className={styles.inlineAction} onClick={() => open3D(event)}>
                        3D
                      </button>
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
                        Evento
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} feature="Filtri avanzati mappa" />

      <div className={styles.a11yStatus}>
        {hasLocation
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

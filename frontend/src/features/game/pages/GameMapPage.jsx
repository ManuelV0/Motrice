import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { ChevronDown, ChevronUp, Palette, X } from 'lucide-react';
import { api } from '../../../services/api';
import { usePageMeta } from '../../../hooks/usePageMeta';
import styles from '../../../styles/pages/gameMap.module.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const DEFAULT_CENTER = { lat: 42.6, lng: 12.5 };

function readToken(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeBounds(lat, lng, radiusKm) {
  const latDelta = radiusKm / 110.574;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngDelta = radiusKm / Math.max(111.32 * Math.abs(cosLat), 0.0001);
  const west = lng - lngDelta;
  const east = lng + lngDelta;
  const south = lat - latDelta;
  const north = lat + latDelta;
  return [
    [west, south],
    [east, north]
  ];
}

function buildStyle() {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap'
      }
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }]
  };
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
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ring]
    },
    properties: {}
  };
}

function applyRadiusOverlay(map, lat, lng, radiusKm) {
  const sourceId = 'focus-radius-src';
  const fillId = 'focus-radius-fill';
  const lineId = 'focus-radius-line';

  const geojson = {
    type: 'FeatureCollection',
    features: [buildRadiusPolygon(lat, lng, radiusKm)]
  };
  const primary = readToken('--primary', '#fb923c');
  const accent = readToken('--accent', '#fdba74');

  try {
    if (!map.isStyleLoaded()) return;

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: geojson });
    } else {
      map.getSource(sourceId).setData(geojson);
    }

    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': primary,
          'fill-opacity': 0.14
        }
      });
    }

    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': accent,
          'line-width': 2.5,
          'line-opacity': 0.98
        }
      });
    }
  } catch (error) {
    const message = String(error?.message || '');
    if (message.toLowerCase().includes('style is not done loading')) {
      map.once('style.load', () => {
        applyRadiusOverlay(map, lat, lng, radiusKm);
      });
    } else {
      throw error;
    }
  }
}

function parseCoord(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function getRenderProfile(radiusKm) {
  const compact = radiusKm <= 2;
  return {
    pixelRatioCap: compact ? 1.1 : 1.5,
    pitch: compact ? 52 : 56,
    padding: compact ? 20 : 24,
    maxZoom: compact ? 17.9 : 18.4
  };
}

function GameMapPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const [panelOpen, setPanelOpen] = useState(true);
  const [eventInfo, setEventInfo] = useState(null);
  const markerColor = useMemo(() => readToken('--primary', '#fb923c'), []);

  const eventId = searchParams.get('eventId');
  const focus = useMemo(
    () => ({
      lat: parseCoord(searchParams.get('lat'), DEFAULT_CENTER.lat),
      lng: parseCoord(searchParams.get('lng'), DEFAULT_CENTER.lng)
    }),
    [searchParams]
  );
  const radiusKm = useMemo(() => clamp(parseCoord(searchParams.get('radiusKm'), 2), 1, 3), [searchParams]);
  const focusBounds = useMemo(() => computeBounds(focus.lat, focus.lng, radiusKm), [focus.lat, focus.lng, radiusKm]);
  const radiusChoices = [1, 2, 3];

  function setRadius(nextRadius) {
    const normalized = clamp(Number(nextRadius), 1, 3);
    const params = new URLSearchParams(searchParams);
    params.set('radiusKm', String(normalized));
    setSearchParams(params, { replace: true });
  }

  usePageMeta({
    title: 'Focus 3D | Motrice',
    description: 'Vista immersiva su punto evento con focus posizione bloccato.'
  });

  useEffect(() => {
    let active = true;
    if (!eventId) {
      setEventInfo(null);
      return () => {
        active = false;
      };
    }

    api
      .getEvent(eventId)
      .then((event) => {
        if (!active) return;
        setEventInfo(event || null);
      })
      .catch(() => {
        if (active) setEventInfo(null);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  const focusLabel = useMemo(() => {
    const fromQuery = String(searchParams.get('focus') || '').trim();
    if (fromQuery) return fromQuery;
    const fromEvent = String(eventInfo?.location_name || '').trim();
    if (fromEvent) return fromEvent;
    return 'Posizione selezionata';
  }, [eventInfo, searchParams]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      style: buildStyle(),
      center: [focus.lng, focus.lat],
      zoom: 17,
      pitch: 58,
      bearing: 18,
      interactive: true,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      keyboard: false,
      boxZoom: false,
      refreshExpiredTiles: false,
      fadeDuration: 0,
      maxZoom: 18.8,
      minZoom: 12,
      attributionControl: false
    });

    mapRef.current = map;

    map.on('load', () => {
      const profile = getRenderProfile(radiusKm);
      if (typeof map.setPixelRatio === 'function') {
        map.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap));
      }
      map.setMaxZoom(profile.maxZoom);
      markerRef.current = new maplibregl.Marker({ color: markerColor, scale: 1.05 })
        .setLngLat([focus.lng, focus.lat])
        .addTo(map);
      applyRadiusOverlay(map, focus.lat, focus.lng, radiusKm);
      map.fitBounds(focusBounds, { padding: profile.padding, duration: 0, animate: false });
      map.setMaxBounds(focusBounds);
    });

    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [markerColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyFocus = () => {
      if (!map.isStyleLoaded()) return;
      const profile = getRenderProfile(radiusKm);
      if (typeof map.setPixelRatio === 'function') {
        map.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap));
      }
      map.setMaxZoom(profile.maxZoom);
      map.jumpTo({
        center: [focus.lng, focus.lat],
        zoom: 17,
        pitch: profile.pitch,
        bearing: 18
      });

      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: markerColor, scale: 1.05 })
          .setLngLat([focus.lng, focus.lat])
          .addTo(map);
      } else {
        markerRef.current.setLngLat([focus.lng, focus.lat]);
      }

      applyRadiusOverlay(map, focus.lat, focus.lng, radiusKm);
      map.fitBounds(focusBounds, { padding: profile.padding, duration: 0, animate: false });
      map.setMaxBounds(focusBounds);
    };

    if (map.isStyleLoaded()) applyFocus();
    else map.once('style.load', applyFocus);
  }, [focus.lat, focus.lng, focusBounds, markerColor, radiusKm]);

  return (
    <section className={styles.page}>
      <div className={`${styles.viewport} ${styles.viewportCartoon}`}>
        <div
          ref={mapNodeRef}
          className={`${styles.mapCanvas} ${styles.mapCanvasCartoon}`}
        />

        <div className={styles.tendina}>
          <button
            type="button"
            className={styles.tendinaTrigger}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((prev) => !prev)}
          >
            <span>Controlli mappa 3D</span>
            {panelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {panelOpen && (
            <div className={styles.tendinaBody}>
              <p className={styles.focusLabel}>{focusLabel}</p>
              <p className={styles.radiusLabel}>Area visibile: {radiusKm} km</p>
              <div className={styles.radiusSwitch} role="tablist" aria-label="Raggio visibile">
                {radiusChoices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className={radiusKm === choice ? styles.active : ''}
                    onClick={() => setRadius(choice)}
                  >
                    {choice} km
                  </button>
                ))}
              </div>

              <div className={styles.singleModeInfo}>
                <Palette size={14} /> Modalita topografica (max 3 km)
              </div>

              <button type="button" className={styles.close3d} onClick={() => navigate('/map')}>
                <X size={14} /> Chiudi mappa 3D
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default GameMapPage;

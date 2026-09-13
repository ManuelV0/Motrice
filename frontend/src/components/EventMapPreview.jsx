import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { isGymEvent } from '../utils/eventVenueAccess';
import { createEventPinSvg, getEventActivityType } from '../utils/eventMapMarkers';
import styles from '../styles/components/eventMapPreview.module.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_THEME_KEY = 'motrice.map.theme';
const MAP_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
};
const ROUTE_SOURCE = 'event-detail-route';
const ROUTE_SHADOW_LAYER = 'event-detail-route-shadow';
const ROUTE_GLOW_LAYER = 'event-detail-route-glow';
const ROUTE_LAYER = 'event-detail-route-line';
const LIVE_ROUTE_SOURCE = 'event-live-route';
const LIVE_ROUTE_GLOW_LAYER = 'event-live-route-glow';
const LIVE_ROUTE_LAYER = 'event-live-route-line';

function createRouteGeoJson(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: points }
  };
}

function getRouteBearing(from, to) {
  const fromLng = Number(from?.[0]);
  const fromLat = Number(from?.[1]);
  const toLng = Number(to?.[0]);
  const toLat = Number(to?.[1]);
  if (![fromLng, fromLat, toLng, toLat].every(Number.isFinite)) return 0;
  const toRadians = (value) => value * Math.PI / 180;
  const fromLatRad = toRadians(fromLat);
  const toLatRad = toRadians(toLat);
  const deltaLng = toRadians(toLng - fromLng);
  const y = Math.sin(deltaLng) * Math.cos(toLatRad);
  const x = Math.cos(fromLatRad) * Math.sin(toLatRad)
    - Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function getRouteDirections(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segments = [];
  let totalLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const averageLat = ((from[1] + to[1]) / 2) * Math.PI / 180;
    const deltaLng = (to[0] - from[0]) * Math.cos(averageLat);
    const deltaLat = to[1] - from[1];
    const length = Math.hypot(deltaLng, deltaLat);
    if (length <= 0) continue;
    segments.push({ from, to, length, startsAt: totalLength });
    totalLength += length;
  }

  if (!segments.length || totalLength <= 0) return [];
  const ratios = totalLength > 0.015 ? [0.22, 0.48, 0.74] : [0.32, 0.68];
  return ratios.map((ratio) => {
    const target = totalLength * ratio;
    const segment = segments.find((item) => target <= item.startsAt + item.length) || segments.at(-1);
    const progress = Math.min(1, Math.max(0, (target - segment.startsAt) / segment.length));
    return {
      coordinate: [
        segment.from[0] + ((segment.to[0] - segment.from[0]) * progress),
        segment.from[1] + ((segment.to[1] - segment.from[1]) * progress)
      ],
      bearing: getRouteBearing(segment.from, segment.to)
    };
  });
}

function getSavedMapTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(MAP_THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function validPoint(point) {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(Number(point[0]))
    && Number.isFinite(Number(point[1]));
}

function createMarkerElement(svgMarkup) {
  const marker = document.createElement('span');
  marker.className = styles.eventMarker;
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = svgMarkup;
  return marker;
}

function createRouteEndpointElement(type) {
  const marker = document.createElement('span');
  marker.className = `${styles.routeEndpoint} ${type === 'start' ? styles.routeStart : styles.routeFinish}`;
  marker.setAttribute('aria-hidden', 'true');
  const glyph = document.createElement('span');
  if (type === 'start') {
    glyph.className = styles.routeStartDot;
  } else {
    glyph.className = styles.routeFinishFlag;
    glyph.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 15.5V2.4m.5.8h8.2l-1.8 2.4 1.8 2.4H4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  marker.appendChild(glyph);
  return marker;
}

function createRouteDirectionElement(bearing) {
  const marker = document.createElement('span');
  marker.className = styles.routeDirection;
  marker.setAttribute('aria-hidden', 'true');
  const glyph = document.createElement('span');
  glyph.className = styles.routeDirectionGlyph;
  glyph.textContent = '➤';
  glyph.style.transform = `rotate(${bearing - 90}deg)`;
  marker.appendChild(glyph);
  return marker;
}

function createLivePositionElement() {
  const marker = document.createElement('span');
  marker.className = styles.livePosition;
  marker.setAttribute('aria-hidden', 'true');
  marker.appendChild(document.createElement('i'));
  return marker;
}

export default function EventMapPreview({
  event,
  routePoints = [],
  liveRoutePoints = [],
  liveMode = false,
  className = ''
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const liveMarkerRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const theme = useMemo(getSavedMapTheme, []);
  const usableRoute = routePoints
    .filter(validPoint)
    .map(([lat, lng]) => [Number(lng), Number(lat)]);
  const usableLiveRoute = liveRoutePoints
    .filter(validPoint)
    .map(([lat, lng]) => [Number(lng), Number(lat)]);
  const eventLat = Number(event?.lat);
  const eventLng = Number(event?.lng);
  const hasEventCoordinates = event?.lat != null
    && event?.lng != null
    && event?.lat !== ''
    && event?.lng !== ''
    && Number.isFinite(eventLat)
    && Number.isFinite(eventLng);
  const center = hasEventCoordinates
    ? [eventLng, eventLat]
    : usableRoute[0] || usableLiveRoute.at(-1) || null;
  const centerKey = center ? center.join(',') : '';
  const routeKey = usableRoute.map((point) => point.join(',')).join('|');
  const liveRouteKey = usableLiveRoute.map((point) => point.join(',')).join('|');
  const locationName = String(event?.location_name || event?.city || 'Punto dell evento').trim();
  const activityType = getEventActivityType(event);
  const isRoutePreview = usableRoute.length >= 2
    && (activityType === 'running' || activityType === 'trekking');
  const routeTypeLabel = activityType === 'trekking' ? 'TREKKING' : 'RUNNING';
  const markerSvg = useMemo(
    () => createEventPinSvg(activityType, {
      selected: true,
      saved: Boolean(event?.is_saved),
      gym: isGymEvent(event)
    }),
    [activityType, event?.is_saved, event?.venue_type]
  );

  useEffect(() => {
    if (!containerRef.current || !center) return undefined;

    let mapLoaded = false;
    setStatus('loading');
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES[theme],
      center,
      zoom: usableRoute.length >= 2 ? 13 : 15,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: false
    });
    mapRef.current = map;
    map.scrollZoom.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({
      showCompass: false,
      visualizePitch: false
    }), 'top-right');

    const markers = [];
    if (isRoutePreview) {
      markers.push(
        new maplibregl.Marker({
          element: createRouteEndpointElement('start'),
          anchor: 'center'
        }).setLngLat(usableRoute[0]).addTo(map),
        new maplibregl.Marker({
          element: createRouteEndpointElement('finish'),
          anchor: 'center'
        }).setLngLat(usableRoute.at(-1)).addTo(map)
      );
      getRouteDirections(usableRoute).forEach(({ coordinate, bearing }) => {
        markers.push(
          new maplibregl.Marker({
            element: createRouteDirectionElement(bearing),
            anchor: 'center'
          }).setLngLat(coordinate).addTo(map)
        );
      });
    } else {
      markers.push(
        new maplibregl.Marker({
          element: createMarkerElement(markerSvg),
          anchor: 'bottom'
        }).setLngLat(center).addTo(map)
      );
    }

    const loadingTimeout = window.setTimeout(() => {
      if (!mapLoaded) setStatus('error');
    }, 8000);

    const onLoad = () => {
      mapLoaded = true;
      window.clearTimeout(loadingTimeout);
      map.resize();

      if (usableRoute.length >= 2) {
        map.addSource(ROUTE_SOURCE, {
          type: 'geojson',
          data: createRouteGeoJson(usableRoute)
        });
        map.addLayer({
          id: ROUTE_SHADOW_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          paint: {
            'line-color': '#050705',
            'line-width': liveMode ? 7 : isRoutePreview ? 9 : 7,
            'line-opacity': 0.82
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });
        map.addLayer({
          id: ROUTE_GLOW_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          paint: {
            'line-color': '#b7ff24',
            'line-width': isRoutePreview ? 12 : 9,
            'line-opacity': liveMode ? 0 : isRoutePreview ? 0.24 : 0.14,
            'line-blur': isRoutePreview ? 4 : 3
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });
        map.addLayer({
          id: ROUTE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          paint: {
            'line-color': liveMode ? '#8b9188' : '#b7ff24',
            'line-width': liveMode ? 4.2 : isRoutePreview ? 5.8 : 3.8,
            'line-opacity': liveMode ? 0.72 : 0.98,
            ...(liveMode ? { 'line-dasharray': [1.8, 1.3] } : {})
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });

        const bounds = new maplibregl.LngLatBounds();
        usableRoute.forEach((point) => bounds.extend(point));
        if (hasEventCoordinates) bounds.extend([eventLng, eventLat]);
        map.fitBounds(bounds, {
          padding: isRoutePreview
            ? { top: 82, right: 58, bottom: 92, left: 58 }
            : { top: 64, right: 38, bottom: 86, left: 38 },
          maxZoom: isRoutePreview ? 14.5 : 15,
          duration: 0
        });
      } else {
        map.easeTo({
          center,
          zoom: 15,
          offset: [0, -8],
          duration: 0
        });
      }

      if (liveMode) {
        map.addSource(LIVE_ROUTE_SOURCE, {
          type: 'geojson',
          data: createRouteGeoJson(usableLiveRoute)
        });
        map.addLayer({
          id: LIVE_ROUTE_GLOW_LAYER,
          type: 'line',
          source: LIVE_ROUTE_SOURCE,
          paint: {
            'line-color': '#b7ff24',
            'line-width': 13,
            'line-opacity': 0.28,
            'line-blur': 4.5
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
        map.addLayer({
          id: LIVE_ROUTE_LAYER,
          type: 'line',
          source: LIVE_ROUTE_SOURCE,
          paint: {
            'line-color': '#c6ff00',
            'line-width': 5.8,
            'line-opacity': 1
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
      }

      window.requestAnimationFrame(() => {
        map.resize();
        setStatus('ready');
      });
    };

    map.once('load', onLoad);

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => map.resize())
      : null;
    resizeObserver?.observe(containerRef.current);

    return () => {
      window.clearTimeout(loadingTimeout);
      resizeObserver?.disconnect();
      markers.forEach((marker) => marker.remove());
      liveMarkerRef.current?.remove();
      liveMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [centerKey, isRoutePreview, liveMode, markerSvg, routeKey, theme]);

  useEffect(() => {
    if (!liveMode || status !== 'ready' || !mapRef.current) return;
    const map = mapRef.current;
    const source = map.getSource(LIVE_ROUTE_SOURCE);
    source?.setData(createRouteGeoJson(usableLiveRoute));

    const latestPoint = usableLiveRoute.at(-1);
    if (!latestPoint) {
      liveMarkerRef.current?.remove();
      liveMarkerRef.current = null;
      return;
    }

    if (!liveMarkerRef.current) {
      liveMarkerRef.current = new maplibregl.Marker({
        element: createLivePositionElement(),
        anchor: 'center'
      }).setLngLat(latestPoint).addTo(map);
    } else {
      liveMarkerRef.current.setLngLat(latestPoint);
    }

    if (usableRoute.length < 2) {
      map.easeTo({ center: latestPoint, zoom: Math.max(15, map.getZoom()), duration: 320 });
    }
  }, [liveMode, liveRouteKey, routeKey, status]);

  if (!center) return null;

  return (
    <div
      className={[styles.preview, className].filter(Boolean).join(' ')}
      data-theme={theme}
      data-status={status}
      data-variant={liveMode ? 'live' : isRoutePreview ? activityType : 'point'}
      role="region"
      aria-label={'Mappa interattiva dell evento ' + (event?.title || event?.sport_name || '')}
    >
      <div ref={containerRef} className={styles.mapCanvas} />
      <div className={styles.placeLabel}>
        <small>{liveMode ? 'ATTIVITÀ IN CORSO' : isRoutePreview ? `PERCORSO ${routeTypeLabel}` : usableRoute.length >= 2 ? 'PERCORSO EVENTO' : 'PUNTO DI RITROVO'}</small>
        <strong>{locationName}</strong>
      </div>
      {status === 'loading' ? (
        <div className={styles.loadingOverlay} aria-live="polite">
          <span />
          <small>Carico la mappa</small>
        </div>
      ) : null}
      {status === 'error' ? (
        <div className={styles.errorOverlay} role="status">
          <strong>Mappa momentaneamente non disponibile</strong>
          <span>Puoi comunque aprire il punto o avviare le indicazioni.</span>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as maplibregl from 'maplibre-gl';
import L from 'leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import { isGymEvent } from '../utils/eventVenueAccess';
import { createEventPinSvg, getEventActivityType } from '../utils/eventMapMarkers';
import { requestPedestrianRoute } from '../services/routeGeometry';
import {
  applyDerivedDarkMapStyle,
  applyLocalizedMapLabels,
  canUseAcceleratedMapRenderer,
  getHighDefinitionPixelRatio,
  getHighDefinitionRasterTiles,
  MAPLIBRE_STYLES
} from '../utils/mapRendering';
import styles from '../styles/components/eventMapPreview.module.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_THEME_KEY = 'motrice.map.theme.v2';
const ROUTE_SOURCE = 'event-detail-route';
const ROUTE_SHADOW_LAYER = 'event-detail-route-shadow';
const ROUTE_GLOW_LAYER = 'event-detail-route-glow';
const ROUTE_LAYER = 'event-detail-route-line';
const LIVE_ROUTE_SOURCE = 'event-live-route';
const LIVE_ROUTE_GLOW_LAYER = 'event-live-route-glow';
const LIVE_ROUTE_LAYER = 'event-live-route-line';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

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

function getSavedMapTheme() {
  if (typeof window === 'undefined') return 'satellite';
  try {
    const persisted = window.localStorage.getItem(MAP_THEME_KEY);
    return ['satellite', 'dark', 'light'].includes(persisted) ? persisted : 'satellite';
  } catch {
    return 'satellite';
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

function createRouteOverlayElement() {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.classList.add(styles.routeOverlay);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');

  const lines = ['shadow', 'glow', 'main'].map((variant) => {
    const line = document.createElementNS(SVG_NAMESPACE, 'polyline');
    line.classList.add(styles[`routeOverlay_${variant}`]);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(line);
    return line;
  });

  return { svg, lines };
}

function createRouteEndpointElement(type) {
  const marker = document.createElement('span');
  marker.className = `${styles.routeEndpoint} ${type === 'start' ? styles.routeStart : styles.routeFinish}`;
  marker.setAttribute('aria-hidden', 'true');
  const glyph = document.createElement('span');
  if (type === 'start') {
    glyph.className = styles.routeStartLabel;
    glyph.textContent = 'A';
  } else {
    glyph.className = styles.routeFinishFlag;
    glyph.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 15.5V2.4m.5.8h8.2l-1.8 2.4 1.8 2.4H4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
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

function createLeafletIcon(element, className, size, anchor) {
  return L.divIcon({
    className,
    html: element.outerHTML,
    iconSize: size,
    iconAnchor: anchor
  });
}

function LeafletEventMap({
  center,
  theme,
  displayRoute,
  usableLiveRoute,
  isRoutePreview,
  liveMode,
  markerSvg,
  isExpanded,
  onStatusChange
}) {
  const nodeRef = useRef(null);
  const centerKey = center.join(',');
  const routeKey = displayRoute.map((point) => point.join(',')).join('|');
  const liveRouteKey = usableLiveRoute.map((point) => point.join(',')).join('|');

  useEffect(() => {
    if (!nodeRef.current) return undefined;

    onStatusChange('loading');
    const map = L.map(nodeRef.current, {
      attributionControl: true,
      zoomControl: false,
      preferCanvas: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      scrollWheelZoom: false
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'topright' }).addTo(map);

    let tilesLoaded = false;
    const loadingTimeout = window.setTimeout(() => {
      if (!tilesLoaded) onStatusChange('error');
    }, 8000);
    const tileDefinition = getHighDefinitionRasterTiles(theme);
    const tiles = L.tileLayer(tileDefinition.url, tileDefinition.options)
      .on('load', () => {
        tilesLoaded = true;
        window.clearTimeout(loadingTimeout);
        onStatusChange('ready');
      })
      .addTo(map);
    const labelTiles = tileDefinition.overlayUrl
      ? L.tileLayer(tileDefinition.overlayUrl, tileDefinition.overlayOptions).addTo(map)
      : null;

    const routeLatLngs = displayRoute.map(([lng, lat]) => [lat, lng]);
    const liveLatLngs = usableLiveRoute.map(([lng, lat]) => [lat, lng]);
    const layers = [];
    const addLayer = (layer) => {
      layer.addTo(map);
      layers.push(layer);
      return layer;
    };

    if (routeLatLngs.length >= 2) {
      addLayer(L.polyline(routeLatLngs, {
        color: '#050705',
        weight: isRoutePreview ? 9 : 7,
        opacity: isRoutePreview ? 0.68 : 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      }));
      addLayer(L.polyline(routeLatLngs, {
        color: liveMode ? '#8b9188' : '#c6ff00',
        weight: liveMode ? 4.2 : isRoutePreview ? 5.2 : 3.8,
        opacity: liveMode ? 0.72 : 0.9,
        dashArray: liveMode ? '8 6' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      }));

      if (isRoutePreview) {
        addLayer(L.marker(routeLatLngs[0], {
          icon: createLeafletIcon(
            createRouteEndpointElement('start'),
            styles.leafletEndpointIcon,
            [32, 32],
            [16, 16]
          ),
          keyboard: false,
          interactive: false
        }));
        addLayer(L.marker(routeLatLngs.at(-1), {
          icon: createLeafletIcon(
            createRouteEndpointElement('finish'),
            styles.leafletEndpointIcon,
            [32, 32],
            [16, 16]
          ),
          keyboard: false,
          interactive: false
        }));
      }
    } else {
      addLayer(L.marker([center[1], center[0]], {
        icon: createLeafletIcon(
          createMarkerElement(markerSvg),
          styles.leafletEventIcon,
          [48, 56],
          [24, 56]
        ),
        keyboard: false,
        interactive: false
      }));
    }

    if (liveLatLngs.length >= 2) {
      addLayer(L.polyline(liveLatLngs, {
        color: '#c6ff00',
        weight: 5.8,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      }));
    }
    if (liveMode && liveLatLngs.length) {
      addLayer(L.marker(liveLatLngs.at(-1), {
        icon: createLeafletIcon(
          createLivePositionElement(),
          styles.leafletLiveIcon,
          [20, 20],
          [10, 10]
        ),
        keyboard: false,
        interactive: false
      }));
    }

    const visiblePoints = routeLatLngs.length >= 2 ? routeLatLngs : liveLatLngs;
    if (visiblePoints.length >= 2) {
      map.fitBounds(L.latLngBounds(visiblePoints), {
        paddingTopLeft: isExpanded ? [82, 118] : [58, 88],
        paddingBottomRight: isExpanded ? [82, 112] : [58, 92],
        maxZoom: isExpanded ? 15 : 14.5,
        animate: false
      });
    } else {
      map.setView([center[1], center[0]], 15, { animate: false });
    }

    let resizeFrame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
      })
      : null;
    resizeObserver?.observe(nodeRef.current);

    return () => {
      window.clearTimeout(loadingTimeout);
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      tiles.off();
      labelTiles?.off();
      layers.forEach((layer) => layer.remove());
      map.remove();
    };
  }, [centerKey, isExpanded, isRoutePreview, liveMode, liveRouteKey, markerSvg, onStatusChange, routeKey, theme]);

  return (
    <div
      ref={nodeRef}
      className={`${styles.mapCanvas} ${styles.leafletMapCanvas}`}
      aria-label="Mappa compatibile dell evento"
    />
  );
}

export default function EventMapPreview({
  event,
  routePoints = [],
  liveRoutePoints = [],
  liveMode = false,
  routeSummary = [],
  expandable = false,
  className = ''
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const liveMarkerRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [renderer, setRenderer] = useState(() => canUseAcceleratedMapRenderer() ? 'maplibre' : 'raster');
  const [isExpanded, setIsExpanded] = useState(false);
  const [routedRoute, setRoutedRoute] = useState([]);
  const [routingStatus, setRoutingStatus] = useState('idle');
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
  const manualRouteKey = usableRoute.map((point) => point.join(',')).join('|');
  const liveRouteKey = usableLiveRoute.map((point) => point.join(',')).join('|');
  const locationName = String(event?.location_name || event?.city || 'Punto dell evento').trim();
  const activityType = getEventActivityType(event);
  const isRoutePreview = usableRoute.length >= 2
    && (activityType === 'running' || activityType === 'trekking');
  const displayRoute = routedRoute.length >= 2 ? routedRoute : usableRoute;
  const routeKey = displayRoute.map((point) => point.join(',')).join('|');
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
    if (!isRoutePreview || liveMode) {
      setRoutedRoute([]);
      setRoutingStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    let disposed = false;
    setRoutedRoute([]);
    setRoutingStatus('loading');
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    requestPedestrianRoute(routePoints, { signal: controller.signal })
      .then((points) => {
        if (!Array.isArray(points) || controller.signal.aborted || disposed) return;
        setRoutedRoute(points.map(([lat, lng]) => [Number(lng), Number(lat)]));
        setRoutingStatus('ready');
      })
      .catch(() => {
        if (disposed) return;
        setRoutedRoute([]);
        setRoutingStatus('fallback');
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activityType, isRoutePreview, liveMode, manualRouteKey]);

  useEffect(() => {
    if (!isExpanded || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (eventKey) => {
      if (eventKey.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  useEffect(() => {
    if (renderer !== 'maplibre' || !containerRef.current || !center) return undefined;

    let mapLoaded = false;
    let mapErrorCount = 0;
    let routeOverlay = null;
    let updateRouteOverlay = null;
    setStatus('loading');
    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAPLIBRE_STYLES[theme],
        center,
        zoom: usableRoute.length >= 2 ? 13 : 15,
        pixelRatio: getHighDefinitionPixelRatio(),
        antialias: true,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        cooperativeGestures: false
      });
    } catch (error) {
      console.warn('Anteprima MapLibre non disponibile, attivo la mappa compatibile.', error);
      setRenderer('raster');
      return undefined;
    }
    mapRef.current = map;
    map.scrollZoom.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
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
        }).setLngLat(displayRoute[0]).addTo(map),
        new maplibregl.Marker({
          element: createRouteEndpointElement('finish'),
          anchor: 'center'
        }).setLngLat(displayRoute.at(-1)).addTo(map)
      );
    } else {
      markers.push(
        new maplibregl.Marker({
          element: createMarkerElement(markerSvg),
          anchor: 'bottom'
        }).setLngLat(center).addTo(map)
      );
    }

    const loadingTimeout = window.setTimeout(() => {
      if (!mapLoaded) setRenderer('raster');
    }, 4500);

    const onLoad = () => {
      mapLoaded = true;
      mapErrorCount = 0;
      window.clearTimeout(loadingTimeout);
      applyLocalizedMapLabels(map);
      if (theme === 'dark') applyDerivedDarkMapStyle(map);
      map.resize();

      if (usableRoute.length >= 2) {
        map.addSource(ROUTE_SOURCE, {
          type: 'geojson',
          data: createRouteGeoJson(displayRoute)
        });
        map.addLayer({
          id: ROUTE_SHADOW_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          paint: {
            'line-color': '#050705',
            'line-width': liveMode ? 7 : isRoutePreview ? 9 : 7,
            'line-opacity': isRoutePreview ? 0.68 : 0.9
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });

        if (isRoutePreview && !liveMode) {
          routeOverlay = createRouteOverlayElement();
          map.getCanvasContainer().appendChild(routeOverlay.svg);
          updateRouteOverlay = () => {
            const canvas = map.getCanvas();
            const width = Math.max(1, canvas.clientWidth);
            const height = Math.max(1, canvas.clientHeight);
            const points = displayRoute
              .map((point) => map.project(point))
              .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
              .join(' ');
            routeOverlay.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
            routeOverlay.lines.forEach((line) => line.setAttribute('points', points));
          };
          map.on('move', updateRouteOverlay);
          map.on('resize', updateRouteOverlay);
          updateRouteOverlay();
        }
        map.addLayer({
          id: ROUTE_GLOW_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          paint: {
            'line-color': '#b7ff24',
            'line-width': isRoutePreview ? 12 : 9,
            'line-opacity': liveMode ? 0 : isRoutePreview ? 0.18 : 0.14,
            'line-blur': isRoutePreview ? 3 : 3
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
            'line-color': liveMode ? '#8b9188' : '#c6ff00',
            'line-width': liveMode ? 4.2 : isRoutePreview ? 5.2 : 3.8,
            'line-opacity': liveMode ? 0.72 : isRoutePreview ? 0.9 : 0.98,
            ...(liveMode ? { 'line-dasharray': [1.8, 1.3] } : {})
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });

        const bounds = new maplibregl.LngLatBounds();
        displayRoute.forEach((point) => bounds.extend(point));
        if (hasEventCoordinates && !isRoutePreview) bounds.extend([eventLng, eventLat]);
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

    const onMapError = (event) => {
      const message = String(event?.error?.message || event?.error || '');
      mapErrorCount += 1;
      if (/webgl|context|worker|offscreencanvas/i.test(message)
          || mapErrorCount >= (mapLoaded ? 12 : 3)) {
        setRenderer('raster');
      }
    };
    const onContextLost = () => setRenderer('raster');
    map.on('error', onMapError);
    map.getCanvas().addEventListener('webglcontextlost', onContextLost);

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => map.resize())
      : null;
    resizeObserver?.observe(containerRef.current);

    return () => {
      window.clearTimeout(loadingTimeout);
      resizeObserver?.disconnect();
      if (updateRouteOverlay) {
        map.off('move', updateRouteOverlay);
        map.off('resize', updateRouteOverlay);
      }
      routeOverlay?.svg.remove();
      markers.forEach((marker) => marker.remove());
      liveMarkerRef.current?.remove();
      liveMarkerRef.current = null;
      map.off('error', onMapError);
      map.getCanvas().removeEventListener('webglcontextlost', onContextLost);
      map.remove();
      mapRef.current = null;
    };
  }, [centerKey, isExpanded, isRoutePreview, liveMode, markerSvg, renderer, routeKey, theme]);

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

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return undefined;
    const map = mapRef.current;
    const frame = window.requestAnimationFrame(() => {
      map.resize();
      if (displayRoute.length >= 2) {
        const bounds = new maplibregl.LngLatBounds();
        displayRoute.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, {
          padding: isExpanded
            ? { top: 118, right: 82, bottom: 112, left: 82 }
            : { top: 88, right: 58, bottom: 92, left: 58 },
          maxZoom: isExpanded ? 15.5 : 14.5,
          duration: 260
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isExpanded, routeKey, status]);

  if (!center) return null;

  const preview = (
    <div
      className={[styles.preview, isExpanded ? styles.previewExpanded : className].filter(Boolean).join(' ')}
      data-theme={theme}
      data-status={status}
      data-variant={liveMode ? 'live' : isRoutePreview ? activityType : 'point'}
      data-expandable={expandable && isRoutePreview ? 'true' : 'false'}
      data-expanded={isExpanded ? 'true' : 'false'}
      data-routing={routingStatus}
      data-renderer={renderer}
      role="region"
      aria-label={'Mappa interattiva dell evento ' + (event?.title || event?.sport_name || '')}
    >
      {renderer === 'raster' ? (
        <LeafletEventMap
          center={center}
          theme={theme}
          displayRoute={displayRoute}
          usableLiveRoute={usableLiveRoute}
          isRoutePreview={isRoutePreview}
          liveMode={liveMode}
          markerSvg={markerSvg}
          isExpanded={isExpanded}
          onStatusChange={setStatus}
        />
      ) : (
        <div ref={containerRef} className={styles.mapCanvas} />
      )}
      <div className={styles.placeLabel}>
        <small>{liveMode ? 'ATTIVITÀ IN CORSO' : isRoutePreview ? `PERCORSO ${routeTypeLabel}` : usableRoute.length >= 2 ? 'PERCORSO EVENTO' : 'PUNTO DI RITROVO'}</small>
        <strong>{locationName}</strong>
      </div>
      {routingStatus === 'loading' ? (
        <div className={styles.routingNotice} role="status" aria-live="polite">
          <span />
          Aggancio a strade e sentieri
        </div>
      ) : null}
      {isExpanded && isRoutePreview && Array.isArray(routeSummary) && routeSummary.length ? (
        <div className={styles.routeSummary} aria-label="Dati essenziali del percorso">
          {routeSummary.slice(0, 3).map((item) => (
            <span key={item.label}>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </span>
          ))}
        </div>
      ) : null}
      {expandable && isRoutePreview ? (
        <button
          type="button"
          className={styles.expandButton}
          onClick={() => setIsExpanded((current) => !current)}
          aria-label={isExpanded ? 'Riduci il percorso' : 'Espandi il percorso'}
          aria-pressed={isExpanded}
        >
          {isExpanded ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
          <span>{isExpanded ? 'Riduci' : 'Espandi'}</span>
        </button>
      ) : null}
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

  if (isExpanded && typeof document !== 'undefined') {
    return (
      <>
        <div className={[styles.preview, styles.previewPlaceholder, className].filter(Boolean).join(' ')} aria-hidden="true" />
        {createPortal(preview, document.body)}
      </>
    );
  }

  return preview;
}

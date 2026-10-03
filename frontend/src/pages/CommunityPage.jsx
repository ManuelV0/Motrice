import { ChevronLeft, Globe2, List, Lock, Plus, Search, Shield, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import L from 'leaflet';
import Button from '../components/Button';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import {
  applyLocalizedMapLabels,
  canUseAcceleratedMapRenderer,
  getHighDefinitionPixelRatio,
  getHighDefinitionRasterTiles,
  MAPLIBRE_STYLES
} from '../utils/mapRendering';
import styles from '../styles/pages/community.module.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const COMMUNITY_POINTS = [
  { id: 'roma', name: 'Community Roma Centro', city: 'Roma', lng: 12.4964, lat: 41.9028, accessType: 'semi-private', events: 14, members: 96 },
  { id: 'milano', name: 'Community Milano Nord', city: 'Milano', lng: 9.19, lat: 45.4642, accessType: 'public', events: 22, members: 132 },
  { id: 'napoli', name: 'Community Napoli Sport', city: 'Napoli', lng: 14.2681, lat: 40.8518, accessType: 'private', events: 8, members: 74 },
  { id: 'torino', name: 'Community Torino Ovest', city: 'Torino', lng: 7.6869, lat: 45.0703, accessType: 'semi-private', events: 11, members: 88 }
];

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function CommunityPage() {
  const navigate = useNavigate();
  const [metPeopleCount, setMetPeopleCount] = useState(0);
  const [accessType, setAccessType] = useState('semi-private');
  const [inviteCode, setInviteCode] = useState('');
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('access');
  const [selectedCommunityId, setSelectedCommunityId] = useState(() => COMMUNITY_POINTS[0].id);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapRenderer, setMapRenderer] = useState(() => (
    canUseAcceleratedMapRenderer() ? 'maplibre' : 'raster'
  ));
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef([]);

  usePageMeta({
    title: 'Community | Motrice',
    description: 'Community Motrice con regole di accesso e CTA coerenti.'
  });

  useEffect(() => {
    let active = true;
    api.listMetPeople()
      .then((items) => {
        if (!active) return;
        setMetPeopleCount(Array.isArray(items) ? items.length : 0);
      })
      .catch(() => {
        if (active) setMetPeopleCount(0);
      });

    return () => {
      active = false;
    };
  }, []);

  const isMember = metPeopleCount >= 3;

  const gateText = useMemo(() => {
    if (accessType === 'public') return 'Puoi richiedere accesso';
    if (accessType === 'private') return 'Solo su invito';
    return 'Richiedi accesso dopo 1 evento completato (check-in)';
  }, [accessType]);

  const visibleCommunities = useMemo(() => {
    const q = normalize(query);
    return COMMUNITY_POINTS
      .filter((item) => {
        if (activeTab === 'events') return item.events > 0;
        if (activeTab === 'members') return item.members > 0;
        return true;
      })
      .filter((item) => {
        if (!q) return true;
        return normalize(`${item.name} ${item.city}`).includes(q);
      });
  }, [activeTab, query]);

  const selectedCommunity = useMemo(
    () => visibleCommunities.find((item) => item.id === selectedCommunityId) || visibleCommunities[0] || null,
    [selectedCommunityId, visibleCommunities]
  );

  useEffect(() => {
    if (!visibleCommunities.length) return;
    if (!visibleCommunities.some((item) => item.id === selectedCommunityId)) {
      setSelectedCommunityId(visibleCommunities[0].id);
    }
  }, [selectedCommunityId, visibleCommunities]);

  useEffect(() => {
    if (!selectedCommunity) return;
    setAccessType(selectedCommunity.accessType);
  }, [selectedCommunity]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;

    let readyTimer = null;
    let map;
    if (mapRenderer === 'raster') {
      map = L.map(mapNodeRef.current, {
        attributionControl: true,
        zoomControl: false,
        preferCanvas: true,
        fadeAnimation: true,
        markerZoomAnimation: true
      }).setView([41.9028, 12.4964], 5.6);
      map.attributionControl.setPrefix(false);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const tileDefinition = getHighDefinitionRasterTiles('satellite');
      L.tileLayer(tileDefinition.url, tileDefinition.options)
        .once('load', () => setMapReady(true))
        .addTo(map);
      if (tileDefinition.overlayUrl) {
        L.tileLayer(tileDefinition.overlayUrl, tileDefinition.overlayOptions).addTo(map);
      }
      readyTimer = window.setTimeout(() => setMapReady(true), 4000);
    } else {
      try {
        map = new maplibregl.Map({
          container: mapNodeRef.current,
          style: MAPLIBRE_STYLES.satellite,
          center: [12.4964, 41.9028],
          zoom: 5.6,
          pitch: 0,
          bearing: 0,
          pixelRatio: getHighDefinitionPixelRatio(),
          antialias: true,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false
        });
      } catch {
        setMapRenderer('raster');
        return undefined;
      }
      let loaded = false;
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.on('load', () => {
        loaded = true;
        applyLocalizedMapLabels(map);
        setMapReady(true);
      });
      map.on('error', (event) => {
        const message = String(event?.error?.message || event?.error || '');
        if (/webgl|context|worker|offscreencanvas/i.test(message)) setMapRenderer('raster');
      });
      map.getCanvas().addEventListener('webglcontextlost', () => setMapRenderer('raster'), { once: true });
      readyTimer = window.setTimeout(() => {
        if (!loaded) setMapRenderer('raster');
      }, 4500);
    }
    mapRef.current = map;

    return () => {
      if (readyTimer) window.clearTimeout(readyTimer);
      setMapReady(false);
      markerRefs.current.forEach((entry) => entry.remove());
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapRenderer]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapNodeRef.current) return undefined;
    const map = mapRef.current;
    const node = mapNodeRef.current;
    let timer = null;

    const syncResize = () => {
      if (mapRenderer === 'raster') map.invalidateSize({ animate: false });
      else map.resize();
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (mapRenderer === 'raster') map.invalidateSize({ animate: false });
        else map.resize();
      }, 220);
    };

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(syncResize) : null;
    observer?.observe(node);

    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncResize);
    vv?.addEventListener('scroll', syncResize);
    window.addEventListener('orientationchange', syncResize);
    window.addEventListener('resize', syncResize, { passive: true });

    return () => {
      if (timer) window.clearTimeout(timer);
      observer?.disconnect();
      vv?.removeEventListener('resize', syncResize);
      vv?.removeEventListener('scroll', syncResize);
      window.removeEventListener('orientationchange', syncResize);
      window.removeEventListener('resize', syncResize);
    };
  }, [mapReady, mapRenderer]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    markerRefs.current.forEach((entry) => entry.remove());
    markerRefs.current = [];

    visibleCommunities.forEach((point) => {
      const markerClassName = [
        styles.mapMarker,
        point.accessType === 'public'
          ? styles.mapMarkerPublic
          : point.accessType === 'private'
            ? styles.mapMarkerPrivate
            : styles.mapMarkerSemi,
        point.id === selectedCommunity?.id ? styles.mapMarkerActive : ''
      ].join(' ');
      const selectPoint = () => {
        setSelectedCommunityId(point.id);
        setSheetOpen(true);
      };

      let markerInstance;
      if (mapRenderer === 'raster') {
        markerInstance = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: markerClassName,
            html: '',
            iconSize: [15, 15],
            iconAnchor: [7, 7]
          }),
          keyboard: true,
          title: `${point.name}, ${point.city}`
        })
          .on('click', selectPoint)
          .bindPopup(`${point.name} · ${point.city}`)
          .addTo(mapRef.current);
      } else {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = markerClassName;
        marker.setAttribute('aria-label', `${point.name}, ${point.city}`);
        marker.onclick = selectPoint;
        const popup = new maplibregl.Popup({ offset: 16 }).setText(`${point.name} · ${point.city}`);
        markerInstance = new maplibregl.Marker({ element: marker })
          .setLngLat([point.lng, point.lat])
          .setPopup(popup)
          .addTo(mapRef.current);
      }
      markerRefs.current.push(markerInstance);
    });
  }, [mapReady, mapRenderer, selectedCommunity?.id, visibleCommunities]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedCommunity) return;
    if (mapRenderer === 'raster') {
      mapRef.current.flyTo([selectedCommunity.lat, selectedCommunity.lng], mapRef.current.getZoom(), {
        animate: true,
        duration: 0.45
      });
    } else {
      mapRef.current.easeTo({
        center: [selectedCommunity.lng, selectedCommunity.lat],
        duration: 450,
        padding: { top: 88, right: 72, left: 72, bottom: sheetOpen ? 320 : 72 },
        essential: true
      });
    }
  }, [mapReady, mapRenderer, selectedCommunity, sheetOpen]);

  useEffect(() => {
    if (!query || !mapReady || !mapRef.current || !visibleCommunities.length) return;
    const first = visibleCommunities[0];
    if (mapRenderer === 'raster') {
      mapRef.current.flyTo([first.lat, first.lng], mapRef.current.getZoom(), {
        animate: true,
        duration: 0.52
      });
    } else {
      mapRef.current.easeTo({
        center: [first.lng, first.lat],
        duration: 520,
        padding: { top: 88, right: 72, left: 72, bottom: sheetOpen ? 320 : 72 },
        essential: true
      });
    }
  }, [mapReady, mapRenderer, query, sheetOpen, visibleCommunities]);

  function renderPrimaryAction() {
    if (isMember) {
      return <Button type="button">Apri community</Button>;
    }
    if (accessType === 'public') {
      return <Button type="button">Richiedi accesso</Button>;
    }
    if (accessType === 'private') {
      return (
        <div className={styles.inviteWrap}>
          <input
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="Codice invito"
            aria-label="Inserisci codice invito"
          />
          <Button type="button" variant="secondary" disabled={!String(inviteCode).trim()}>Invia</Button>
        </div>
      );
    }
    return (
      <Button type="button" disabled={metPeopleCount < 1}>
        {metPeopleCount < 1 ? 'Partecipa a un evento per sbloccare' : 'Richiedi accesso'}
      </Button>
    );
  }

  return (
    <section className={styles.page} aria-label="Community Motrice">
      <div className={styles.mapViewport}>
        <div
          ref={mapNodeRef}
          className={styles.mapCanvas}
          data-renderer={mapRenderer}
          aria-label="Mappa community interattiva"
        />
        {!mapReady ? <div className={styles.mapLoading}>Caricamento mappa community...</div> : null}
        <div className={styles.topReadabilityLayer} aria-hidden="true" />

        <div className={styles.topControls}>
          <header className={styles.header}>
            <button type="button" className={styles.backBtn} onClick={() => navigate('/chat')} aria-label="Torna alla chat hub">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <div>
              <h1><Users size={18} aria-hidden="true" /> Community Motrice</h1>
              <p className={styles.subtle}>Layout mappa community (senza 3D).</p>
            </div>
          </header>

          <label className={styles.searchBar}>
            <Search size={17} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 80))}
              placeholder="Cerca discussioni o membri"
              aria-label="Cerca discussioni o membri"
            />
          </label>

          <div className={styles.chipRail} role="tablist" aria-label="Filtri community">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'access'}
              className={activeTab === 'access' ? styles.chipActive : styles.chip}
              onClick={() => setActiveTab('access')}
            >
              Accesso
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'events'}
              className={activeTab === 'events' ? styles.chipActive : styles.chip}
              onClick={() => setActiveTab('events')}
            >
              Eventi
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'members'}
              className={activeTab === 'members' ? styles.chipActive : styles.chip}
              onClick={() => setActiveTab('members')}
            >
              Membri
            </button>
          </div>
        </div>

        <div className={styles.fabStack}>
          <button
            type="button"
            className={`${styles.fab} ${styles.fabNeutral} ${sheetOpen ? styles.fabPrimary : ''}`}
            onClick={() => setSheetOpen((prev) => !prev)}
            aria-label="Apri o chiudi pannello"
            aria-pressed={sheetOpen}
          >
            <List size={18} aria-hidden="true" />
          </button>
          <button type="button" className={`${styles.fab} ${styles.fabAccent}`} onClick={() => navigate('/create')} aria-label="Crea nuovo elemento">
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>

        <section className={`${styles.bottomSheet} ${sheetOpen ? styles.bottomSheetOpen : styles.bottomSheetClosed}`} aria-label="Pannello accesso community">
          <div className={styles.sheetHandle} aria-hidden="true" />
          <article className={styles.accessCard}>
            <p className={styles.accessBadge}>
              <Shield size={14} aria-hidden="true" /> {accessType === 'public' ? 'Pubblica' : accessType === 'private' ? 'Privata' : 'Semi-privata'}
            </p>
            <h2>{selectedCommunity ? `Richiedi accesso · ${selectedCommunity.city}` : 'Richiedi accesso'}</h2>
            <p className={styles.subtle}>{gateText}</p>
            <div className={styles.metaRow}>
              <span><Users size={14} aria-hidden="true" /> Persone incontrate: <strong>{metPeopleCount}</strong></span>
              <span>Eventi attivi: <strong>{selectedCommunity?.events || 0}</strong></span>
              <span>Membri: <strong>{selectedCommunity?.members || 0}</strong></span>
              <span>
                {accessType === 'public' ? <Globe2 size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                {accessType === 'public' ? ' Accesso aperto' : ' Accesso regolato'}
              </span>
            </div>
            <div className={styles.controls}>
              <label>
                Tipo accesso
                <select value={accessType} onChange={(event) => setAccessType(event.target.value)} aria-label="Tipo accesso community">
                  <option value="public">Pubblica</option>
                  <option value="semi-private">Semi-privata</option>
                  <option value="private">Privata</option>
                </select>
              </label>
            </div>
            <div className={styles.cta}>{renderPrimaryAction()}</div>
          </article>
        </section>
      </div>
    </section>
  );
}

export default CommunityPage;

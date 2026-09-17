import { Capacitor } from '@capacitor/core';
import { supabase, supabasePublishableKey, supabaseUrl } from './supabaseClient';
import { NativeEventLocation as NativeTracking } from './nativeEventLocation';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/safeStorage';
import { getOutdoorActivityKind } from '../utils/outdoorActivity';
import {
  normalizeTrackingError,
  validateActiveTrackingRecord
} from './eventLocationTrackingState';

const ACTIVE_TRACKING_KEY = 'motrice_active_event_tracking_v1';
const WEB_QUEUE_KEY = 'motrice_event_tracking_queue_v1';
const STATUS_EVENT = 'motrice:event-tracking-status';
const MAX_QUEUE_SIZE = 720;
const NATIVE_RESUME_COOLDOWN_MS = 5 * 60 * 1000;
let browserWatchId = null;
let syncPromise = null;
let appStateListenerPromise = null;
let apiPromise = null;
let nativeResumeBlockedUntil = 0;

function loadApi() {
  if (!apiPromise) apiPromise = import('./api').then((module) => module.api);
  return apiPromise;
}

async function adoptNativeSession(nativeStatus) {
  if (!nativeStatus?.accessToken || !nativeStatus?.refreshToken || !supabase) return;
  const { error } = await supabase.auth.setSession({
    access_token: nativeStatus.accessToken,
    refresh_token: nativeStatus.refreshToken
  });
  if (error) throw error;
}

function safeJsonRead(key, fallback) {
  try {
    const raw = safeStorageGet(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeActiveTracking(value) {
  if (!value) safeStorageRemove(ACTIVE_TRACKING_KEY);
  else safeStorageSet(ACTIVE_TRACKING_KEY, JSON.stringify(value));
  emitTrackingStatus(value);
}

function emitTrackingStatus(value) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: value || null }));
}

function createPing(position, source = 'foreground') {
  const timestamp = Number(position?.timestamp || Date.now());
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return {
    id: `${timestamp}-${randomPart}`,
    lat: Number(position.coords.latitude),
    lng: Number(position.coords.longitude),
    accuracy: Number.isFinite(Number(position.coords.accuracy)) ? Number(position.coords.accuracy) : null,
    speed: Number.isFinite(Number(position.coords.speed)) ? Number(position.coords.speed) : null,
    recordedAt: new Date(timestamp).toISOString(),
    source
  };
}

function readWebQueue() {
  const queue = safeJsonRead(WEB_QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

function queueWebPing(ping) {
  const queue = [...readWebQueue(), ping].slice(-MAX_QUEUE_SIZE);
  safeStorageSet(WEB_QUEUE_KEY, JSON.stringify(queue));
}

function updateActiveFromResult(result = {}, patch = {}) {
  const current = getActiveEventLocationTracking();
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    status: result.tracking_status || patch.status || current.status || 'active',
    lastPingAt: result.last_ping_at || patch.lastPingAt || current.lastPingAt || null,
    lastDistanceM: result.distance_m ?? patch.lastDistanceM ?? current.lastDistanceM ?? null,
    insideRadius: result.inside_radius ?? patch.insideRadius ?? current.insideRadius ?? null,
    validPingCount: Number(result.valid_ping_count ?? patch.validPingCount ?? current.validPingCount ?? 0),
    outsidePingCount: Number(result.outside_ping_count ?? patch.outsidePingCount ?? current.outsidePingCount ?? 0),
    pendingPingCount: Number(patch.pendingPingCount ?? current.pendingPingCount ?? 0),
    updatedAt: new Date().toISOString()
  };
  writeActiveTracking(next);
  return next;
}

async function submitPing(active, ping) {
  const api = await loadApi();
  return api.recordEventTrackingPing({
    eventId: active.eventId,
    pingId: ping.id,
    lat: ping.lat,
    lng: ping.lng,
    accuracyM: ping.accuracy,
    speedMps: ping.speed,
    recordedAt: ping.recordedAt,
    source: ping.source || 'foreground'
  });
}

function stopBrowserWatch() {
  if (browserWatchId == null || typeof navigator === 'undefined') return;
  navigator.geolocation?.clearWatch?.(browserWatchId);
  browserWatchId = null;
}

function startBrowserWatch(active) {
  if (browserWatchId != null || typeof navigator === 'undefined' || !navigator.geolocation) return;
  browserWatchId = navigator.geolocation.watchPosition(
    async (position) => {
      const current = getActiveEventLocationTracking();
      if (!current || String(current.eventId) !== String(active.eventId)) return;
      const ping = createPing(position, document.visibilityState === 'visible' ? 'foreground' : 'background');
      try {
        const result = await submitPing(current, ping);
        updateActiveFromResult(result);
      } catch {
        queueWebPing({ ...ping, eventId: current.eventId });
        updateActiveFromResult({}, { pendingPingCount: readWebQueue().length, status: 'interrupted' });
      }
    },
    (error) => {
      updateActiveFromResult({}, {
        status: error?.code === 1 ? 'permission_denied' : 'interrupted',
        lastError: error?.message || 'Posizione non disponibile'
      });
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );
}

export function getActiveEventLocationTracking() {
  const value = safeJsonRead(ACTIVE_TRACKING_KEY, null);
  const validation = validateActiveTrackingRecord(value);
  if (validation.valid) return validation.record;
  if (value) safeStorageRemove(ACTIVE_TRACKING_KEY);
  return null;
}

export async function startEventLocationTracking({
  event,
  role,
  verificationSource = 'gps',
  initialCoords = null
}) {
  if (!event?.id) throw new Error('Evento non valido');
  const mode = String(event.verification_mode || 'both').toLowerCase();
  const activityKind = getOutdoorActivityKind(event) || '';
  if (!['geo', 'gps', 'both'].includes(mode) && !activityKind) return null;

  const verifiedStartAtMs = Date.parse(
    event.session_started_at || event.user_rsvp?.checked_in_at || event.checked_in_at || ''
  );
  const fallbackEndAtMs = (Number.isFinite(verifiedStartAtMs) ? verifiedStartAtMs : Date.now())
    + Math.max(1, Number(event.duration_minutes || 120)) * 60 * 1000;
  const eventLat = Number(event.lat);
  const eventLng = Number(event.lng);
  const eventRadiusM = Math.max(50, Number(event.geofence_radius_m || 250));
  if (!Number.isFinite(eventLat) || eventLat < -90 || eventLat > 90
      || !Number.isFinite(eventLng) || eventLng < -180 || eventLng > 180
      || !Number.isFinite(eventRadiusM)) {
    throw new Error('Posizione evento non valida: aggiorna il punto di incontro');
  }

  const existing = getActiveEventLocationTracking();
  if (existing && String(existing.eventId) !== String(event.id)) {
    await stopEventLocationTracking({ status: 'interrupted', reason: 'nuovo_evento_attivo' });
  }

  const platform = Capacitor.getPlatform();
  const api = await loadApi();
  const remote = await api.startEventLocationTracking({
    eventId: event.id,
    verificationMethod: verificationSource === 'qr' ? 'qr_gps' : 'gps',
    devicePlatform: platform
  });
  const active = {
    eventId: String(event.id),
    eventTitle: event.title || event.sport_name || 'Evento Motrice',
    role: role === 'organizer' ? 'organizer' : 'participant',
    verificationSource,
    lat: eventLat,
    lng: eventLng,
    radiusM: eventRadiusM,
    expectedEndAt: remote?.expected_end_at || new Date(fallbackEndAtMs).toISOString(),
    startedAt: remote?.started_at || existing?.startedAt || new Date().toISOString(),
    status: 'active',
    lastPingAt: remote?.last_ping_at || existing?.lastPingAt || null,
    validPingCount: Number(remote?.valid_ping_count || existing?.validPingCount || 0),
    outsidePingCount: Number(remote?.outside_ping_count || existing?.outsidePingCount || 0),
    pendingPingCount: Number(existing?.pendingPingCount || 0),
    activityKind,
    platform
  };
  writeActiveTracking(active);

  try {
    if (Capacitor.isNativePlatform() && platform === 'android') {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session?.access_token || !session?.refresh_token) {
        throw new Error('Sessione non disponibile per il monitoraggio in background');
      }
      await NativeTracking.startTracking({
        eventId: active.eventId,
        eventTitle: active.eventTitle,
        latitude: active.lat,
        longitude: active.lng,
        radiusM: active.radiusM,
        expectedEndAtMs: Date.parse(active.expectedEndAt),
        serverUrl: supabaseUrl,
        anonKey: supabasePublishableKey,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        intervalMs: activityKind ? 5000 : 60000,
        activityKind
      });
    } else {
      startBrowserWatch(active);
    }
  } catch (error) {
    await api.stopEventLocationTracking({
      eventId: active.eventId,
      status: 'interrupted',
      reason: 'avvio_servizio_fallito'
    }).catch(() => undefined);
    writeActiveTracking(null);
    throw new Error(normalizeTrackingError(error));
  }

  if (initialCoords) {
    const ping = {
      id: `${Date.now()}-initial-${Math.random().toString(36).slice(2)}`,
      lat: Number(initialCoords.lat),
      lng: Number(initialCoords.lng),
      accuracy: Number.isFinite(Number(initialCoords.accuracy)) ? Number(initialCoords.accuracy) : null,
      speed: null,
      recordedAt: new Date().toISOString(),
      source: 'foreground'
    };
    try {
      const result = await submitPing(active, ping);
      updateActiveFromResult(result);
    } catch {
      queueWebPing({ ...ping, eventId: active.eventId });
    }
  }

  return getActiveEventLocationTracking();
}

export async function syncEventLocationTracking() {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const active = getActiveEventLocationTracking();
    if (!active) return null;

    const pending = [];
    let nativeStatus = null;
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      try {
        nativeStatus = await NativeTracking.getStatus();
        await adoptNativeSession(nativeStatus);
        const result = await NativeTracking.getPendingPings();
        for (const ping of result?.pings || []) pending.push(ping);
      } catch {
        // Il plugin potrebbe non essere presente nella preview web precedente.
      }
    }
    for (const ping of readWebQueue()) {
      if (String(ping.eventId || active.eventId) === String(active.eventId)) pending.push(ping);
    }

    const acknowledgedIds = [];
    let lastResult = null;
    for (const ping of pending.slice(0, 120)) {
      try {
        lastResult = await submitPing(active, { ...ping, source: ping.source || 'offline' });
        acknowledgedIds.push(String(ping.id));
      } catch {
        break;
      }
    }

    if (acknowledgedIds.length) {
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        await NativeTracking.ackPings({ ids: acknowledgedIds }).catch(() => undefined);
      }
      const acknowledged = new Set(acknowledgedIds);
      const remainingWeb = readWebQueue().filter((ping) => !acknowledged.has(String(ping.id)));
      safeStorageSet(WEB_QUEUE_KEY, JSON.stringify(remainingWeb));
    }

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      nativeStatus = await NativeTracking.getStatus().catch(() => null);
      await adoptNativeSession(nativeStatus).catch(() => undefined);
    }
    return updateActiveFromResult(lastResult || {}, {
      status: nativeStatus?.lastError
        ? 'interrupted'
        : nativeStatus?.active === false && Date.now() < Date.parse(active.expectedEndAt)
        ? 'interrupted'
        : (lastResult?.tracking_status || active.status),
      lastPingAt: nativeStatus?.lastPingAt || lastResult?.last_ping_at || active.lastPingAt,
      pendingPingCount: Number(nativeStatus?.pendingPingCount ?? Math.max(0, pending.length - acknowledgedIds.length)),
      lastError: nativeStatus?.lastError || null
    });
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

export async function resumeEventLocationTracking() {
  const active = getActiveEventLocationTracking();
  if (!active) {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      const orphanStatus = await NativeTracking.getStatus().catch(() => null);
      if (orphanStatus?.active) {
        await NativeTracking.stopTracking({ clearCredentials: false }).catch(() => undefined);
      }
    }
    return null;
  }
  if (Date.now() >= Date.parse(active.expectedEndAt || 0)) {
    await stopEventLocationTracking({ status: 'completed', reason: 'fine_evento' });
    return null;
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const status = await NativeTracking.getStatus().catch(() => null);
    await adoptNativeSession(status).catch(() => undefined);
    if (!status?.active) {
      if (Date.now() < nativeResumeBlockedUntil) {
        return updateActiveFromResult({}, {
          status: 'interrupted',
          lastError: active.lastError || 'Monitoraggio GPS in pausa: riapri l evento per riprovare.'
        });
      }
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (session?.access_token && session?.refresh_token) {
        try {
          await NativeTracking.startTracking({
            eventId: active.eventId,
            eventTitle: active.eventTitle,
            latitude: active.lat,
            longitude: active.lng,
            radiusM: active.radiusM,
            expectedEndAtMs: Date.parse(active.expectedEndAt),
            serverUrl: supabaseUrl,
            anonKey: supabasePublishableKey,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            intervalMs: active.activityKind ? 5000 : 60000,
            activityKind: active.activityKind || ''
          });
          nativeResumeBlockedUntil = 0;
        } catch (error) {
          nativeResumeBlockedUntil = Date.now() + NATIVE_RESUME_COOLDOWN_MS;
          return updateActiveFromResult({}, {
            status: 'interrupted',
            lastError: normalizeTrackingError(error)
          });
        }
      }
    }
  } else {
    startBrowserWatch(active);
  }
  return syncEventLocationTracking();
}

export async function stopEventLocationTracking({ status = 'interrupted', reason = null } = {}) {
  const active = getActiveEventLocationTracking();
  nativeResumeBlockedUntil = 0;
  stopBrowserWatch();
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const nativeStatus = await NativeTracking.getStatus().catch(() => null);
    await adoptNativeSession(nativeStatus).catch(() => undefined);
    await NativeTracking.stopTracking({ clearCredentials: reason === 'logout' }).catch(() => undefined);
  }
  if (!active) return null;
  await syncEventLocationTracking().catch(() => undefined);
  const api = await loadApi();
  const result = await api.stopEventLocationTracking({ eventId: active.eventId, status, reason }).catch(() => null);
  writeActiveTracking(null);
  return result;
}

export async function getEventActivityMetrics(eventId) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
  const status = await NativeTracking.getStatus().catch(() => null);
  if (!status || String(status.eventId || '') !== String(eventId || '')) return null;
  const finiteOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const accuracyM = finiteOrNull(status.activityAccuracyM);
  return {
    distanceM: Math.max(0, finiteOrNull(status.activityDistanceM) || 0),
    elevationGainM: Math.max(0, finiteOrNull(status.activityElevationGainM) || 0),
    currentSpeedMps: Math.max(0, finiteOrNull(status.activitySpeedMps) || 0),
    accuracyM: accuracyM != null && accuracyM >= 0 ? accuracyM : null,
    lat: finiteOrNull(status.activityLat),
    lng: finiteOrNull(status.activityLng),
    altitude: finiteOrNull(status.activityAltitude),
    capturedAt: finiteOrNull(status.activityRecordedAt),
    paused: Boolean(status.activityPaused)
  };
}

export async function setEventActivityPaused(paused) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
  return NativeTracking.setActivityPaused({ paused: Boolean(paused) }).catch(() => null);
}

export function installEventLocationTrackingLifecycle() {
  if (appStateListenerPromise || typeof window === 'undefined') return () => {};
  const onOnline = () => resumeEventLocationTracking().catch(() => undefined);
  const onVisibility = () => {
    if (document.visibilityState === 'visible') onOnline();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);
  appStateListenerPromise = import('@capacitor/app')
    .then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) onOnline();
    }))
    .catch(() => null);
  onOnline();
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibility);
    appStateListenerPromise?.then((listener) => listener?.remove?.()).catch(() => undefined);
    appStateListenerPromise = null;
  };
}

export { STATUS_EVENT as EVENT_LOCATION_TRACKING_STATUS_EVENT };

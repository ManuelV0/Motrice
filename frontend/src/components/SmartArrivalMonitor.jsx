import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { getAppSettings } from '../services/appSettings';
import {
  evaluateSmartArrival,
  getSmartArrivalEligibility,
  getSmartArrivalState,
  markSmartArrivalDetected,
  SMART_ARRIVAL_STATE_EVENT
} from '../services/smartArrival';
import { useUserLocation } from '../hooks/useUserLocation';
import { useToast } from '../context/ToastContext';
import { NativeEventLocation } from '../services/nativeEventLocation';

const EVENT_REFRESH_MS = 5 * 60 * 1000;

function SmartArrivalMonitor({ enabled }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(() => getAppSettings());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [stateVersion, setStateVersion] = useState(0);
  const hitRef = useRef({ eventId: '', count: 0 });
  const notificationRef = useRef(new Set());
  const {
    coords,
    permission,
    requestLocation,
    startLocationWatch,
    stopLocationWatch
  } = useUserLocation();

  useEffect(() => {
    const publishPermission = (nextPermission) => {
      window.dispatchEvent(new CustomEvent('motrice:smart-arrival-permission', {
        detail: { permission: nextPermission }
      }));
    };
    publishPermission(permission);
    const authorize = async () => {
      const location = await requestLocation({
        requireFresh: true,
        maxAgeMs: 30000,
        maxAccuracyM: 100
      });
      publishPermission(location ? 'granted' : permission);
    };
    window.addEventListener('motrice:smart-arrival-authorize', authorize);
    return () => window.removeEventListener('motrice:smart-arrival-authorize', authorize);
  }, [permission, requestLocation]);

  useEffect(() => {
    const onSettings = (event) => setSettings(event?.detail || getAppSettings());
    const onArrivalState = (event) => {
      const eventId = String(event?.detail?.eventId || '');
      if (eventId && !getSmartArrivalState(eventId).detectedAt) {
        notificationRef.current.delete(eventId);
        if (hitRef.current.eventId === eventId) hitRef.current = { eventId, count: 0 };
      }
      setStateVersion((version) => version + 1);
    };
    window.addEventListener('motrice:app-settings-changed', onSettings);
    window.addEventListener(SMART_ARRIVAL_STATE_EVENT, onArrivalState);
    return () => {
      window.removeEventListener('motrice:app-settings-changed', onSettings);
      window.removeEventListener(SMART_ARRIVAL_STATE_EVENT, onArrivalState);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return undefined;
    }

    let active = true;
    const refresh = () => api.listEvents({
      dateRange: 'all',
      includePast: false,
      includeCancelled: false,
      sortBy: 'soonest'
    })
      .then((items) => {
        if (active) setEvents(Array.isArray(items) ? items : []);
      })
      .catch(() => undefined);

    refresh();
    const timer = window.setInterval(refresh, EVENT_REFRESH_MS);
    const onRefresh = () => refresh();
    window.addEventListener('motrice:pull-refreshed', onRefresh);
    window.addEventListener('motrice:smart-arrival-refresh', onRefresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('motrice:pull-refreshed', onRefresh);
      window.removeEventListener('motrice:smart-arrival-refresh', onRefresh);
    };
  }, [enabled]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const candidate = useMemo(() => {
    if (!enabled || !settings.smartArrivalEnabled) return null;
    return events
      .filter((event) => {
        const eligibility = getSmartArrivalEligibility(event, nowMs);
        if (!eligibility.eligible) return false;
        const arrival = getSmartArrivalState(event.id);
        return !arrival.detectedAt && (!arrival.snoozedUntil || arrival.snoozedUntil <= nowMs);
      })
      .sort((left, right) => Date.parse(left.event_datetime || '') - Date.parse(right.event_datetime || ''))[0] || null;
  }, [enabled, events, nowMs, settings.smartArrivalEnabled, stateVersion]);

  const candidateId = String(candidate?.id || '');
  useEffect(() => {
    if (!candidateId || permission !== 'granted') {
      void stopLocationWatch();
      return undefined;
    }

    startLocationWatch({
      maxAgeMs: 30000,
      maxAccuracyM: 100,
      minimumUpdateInterval: 5000
    }).catch(() => undefined);

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      const eligibility = getSmartArrivalEligibility(candidate, Date.now());
      NativeEventLocation.getArrivalStatus()
        .catch(() => null)
        .then((status) => {
          if (status?.arrivalDetected) return null;
          if (status?.active
              && status?.trackingMode === 'arrival'
              && String(status?.eventId || '') === candidateId) return status;
          return NativeEventLocation.startArrivalMonitoring({
            eventId: candidateId,
            eventTitle: candidate.title || candidate.sport_name || 'Evento Motrice',
            latitude: Number(candidate.lat),
            longitude: Number(candidate.lng),
            radiusM: Math.max(50, Number(candidate.geofence_radius_m || 250)),
            expectedEndAtMs: Number(eligibility.timing.checkInClosesAtMs),
            intervalMs: 15000
          });
        })
        .catch(() => undefined);
    }

    return () => {
      void stopLocationWatch();
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        NativeEventLocation.stopArrivalMonitoring({ clearDetection: false }).catch(() => undefined);
      }
    };
  }, [candidateId, permission, startLocationWatch, stopLocationWatch]);

  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return undefined;
    let disposed = false;
    let listener = null;
    let timer = null;
    let consuming = false;

    const consumeNativeArrival = async () => {
      if (consuming) return;
      consuming = true;
      try {
        const status = await NativeEventLocation.getArrivalStatus().catch(() => null);
        if (disposed || !status?.arrivalDetected || !status?.eventId) return;
        const eventId = String(status.eventId);
        markSmartArrivalDetected(eventId, Number(status.arrivalDetectedAtMs || Date.now()));
        await NativeEventLocation.stopArrivalMonitoring({ clearDetection: true }).catch(() => undefined);
        navigate(`/agenda?verifyEvent=${encodeURIComponent(eventId)}&arrival=1`);
      } finally {
        consuming = false;
      }
    };

    consumeNativeArrival();
    timer = window.setInterval(consumeNativeArrival, 10000);
    import('@capacitor/app')
      .then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) consumeNativeArrival();
      }))
      .then((handle) => {
        if (disposed) handle?.remove?.();
        else listener = handle;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      listener?.remove?.();
    };
  }, [enabled, navigate]);

  useEffect(() => {
    if (!candidate || !coords || coords.source !== 'live') return;
    const result = evaluateSmartArrival({ event: candidate, location: coords, nowMs: Date.now() });
    if (!result.detected) {
      hitRef.current = { eventId: candidateId, count: 0 };
      return;
    }

    const previous = hitRef.current.eventId === candidateId ? hitRef.current.count : 0;
    const nextCount = previous + 1;
    hitRef.current = { eventId: candidateId, count: nextCount };
    if (nextCount < 2 || notificationRef.current.has(candidateId)) return;

    notificationRef.current.add(candidateId);
    markSmartArrivalDetected(candidateId);
    import('../services/notificationCenter')
      .then(({ showSmartArrivalNotification }) => showSmartArrivalNotification(candidate))
      .catch(() => undefined);
    try {
      navigator?.vibrate?.([55, 45, 55]);
    } catch {
      // Il feedback aptico e facoltativo.
    }
    showToast('Sei nell’area dell’evento · conferma la presenza', 'success');
  }, [candidate, candidateId, coords, showToast]);

  return null;
}

export default SmartArrivalMonitor;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { NativeEventLocation } from '../services/nativeEventLocation';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';
import {
  getLocationAttempts,
  hasAnyLocationPermission,
  hasPreciseLocationPermission,
  normalizeLocationSample,
  normalizeLocationError,
  resolveLocationPermission,
  validateLocationSample
} from '../utils/locationAcquisition';

const STORAGE_KEY = 'motrice_user_location_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const INITIAL_CACHE_PREVIEW_MS = 30000;

function readCachedLocation() {
  try {
    const raw = safeStorageGet(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;
    if (!parsed.updatedAt || Date.now() - Number(parsed.updatedAt) > CACHE_TTL_MS) return null;
    return {
      lat: parsed.lat,
      lng: parsed.lng,
      accuracy: Number.isFinite(Number(parsed.accuracy)) ? Number(parsed.accuracy) : null,
      capturedAt: Number.isFinite(Number(parsed.capturedAt)) ? Number(parsed.capturedAt) : Number(parsed.updatedAt),
      updatedAt: parsed.updatedAt
    };
  } catch {
    return null;
  }
}

function writeCachedLocation(coords) {
  try {
    safeStorageSet(
      STORAGE_KEY,
      JSON.stringify({
        lat: Number(coords.lat),
        lng: Number(coords.lng),
        accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : null,
        capturedAt: Number.isFinite(Number(coords.capturedAt)) ? Number(coords.capturedAt) : Date.now(),
        updatedAt: Date.now()
      })
    );
  } catch {
    // no-op
  }
}

function useUserLocation() {
  const isNative = Capacitor.isNativePlatform();
  const initialCachedRef = useRef(undefined);
  if (initialCachedRef.current === undefined) initialCachedRef.current = readCachedLocation();
  const [coords, setCoords] = useState(() => {
    const cached = initialCachedRef.current;
    if (!cached || Date.now() - Number(cached.capturedAt || 0) > INITIAL_CACHE_PREVIEW_MS) return null;
    return {
      lat: cached.lat,
      lng: cached.lng,
      accuracy: cached.accuracy,
      capturedAt: cached.capturedAt,
      source: 'cache'
    };
  });
  const [permission, setPermission] = useState('prompt');
  const [permissionReady, setPermissionReady] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [watching, setWatching] = useState(false);
  const watchSessionRef = useRef(null);

  const commitPosition = useCallback((position, validation = {}) => {
    const nextCoords = validateLocationSample(normalizeLocationSample(position), validation);
    const liveCoords = { ...nextCoords, source: 'live' };
    setCoords(liveCoords);
    writeCachedLocation(liveCoords);
    return liveCoords;
  }, []);

  const refreshPermission = useCallback(async () => {
    if (isNative) {
      try {
        const status = await NativeEventLocation.checkLocationPermissions();
        const nativePermission = resolveLocationPermission(status);
        setPermission(nativePermission);
        if (!hasAnyLocationPermission(status)) {
          setCoords(null);
        } else {
          setError('');
          setErrorCode('');
        }
        return nativePermission;
      } catch (permissionError) {
        const normalized = normalizeLocationError(permissionError);
        setPermission(normalized.permission);
        setError(normalized.message);
        setErrorCode(normalized.code);
        return normalized.permission;
      } finally {
        setPermissionReady(true);
      }
    }

    if (!navigator?.permissions?.query) {
      setPermissionReady(true);
      return 'prompt';
    }

    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      const browserPermission = status.state || 'prompt';
      setPermission(browserPermission);
      return browserPermission;
    } catch {
      return 'prompt';
    } finally {
      setPermissionReady(true);
    }
  }, [isNative]);

  useEffect(() => {
    if (isNative) {
      refreshPermission().catch(() => undefined);
      return undefined;
    }

    if (!navigator?.permissions?.query) return;
    let active = true;
    let statusRef = null;

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!active) return;
        statusRef = status;
        setPermission(status.state || 'prompt');
        setPermissionReady(true);
        status.onchange = () => {
          if (!active) return;
          setPermission(status.state || 'prompt');
          setPermissionReady(true);
        };
      })
      .catch(() => {
        if (active) setPermissionReady(true);
      });

    return () => {
      active = false;
      if (statusRef) statusRef.onchange = null;
    };
  }, [isNative, refreshPermission]);

  const requestLocation = useCallback(async ({
    requireFresh = false,
    maxAgeMs = 30000,
    maxAccuracyM = null
  } = {}) => {
    if (!isNative && !navigator?.geolocation) {
      setPermission('unavailable');
      setError('Geolocalizzazione non supportata su questo browser.');
      return null;
    }

    setRequesting(true);
    setError('');
    setErrorCode('');

    try {
      let precisePermission = !isNative;

      if (isNative) {
        let currentPermission = await NativeEventLocation.checkLocationPermissions();

        if (!hasAnyLocationPermission(currentPermission)) {
          currentPermission = await NativeEventLocation.requestLocationPermissions();
          if (!hasAnyLocationPermission(currentPermission)) {
            const deniedError = new Error('Permesso posizione negato');
            deniedError.code = 'OS-PLUG-GLOC-0003';
            throw deniedError;
          }
        }

        precisePermission = hasPreciseLocationPermission(currentPermission);
        setPermission(resolveLocationPermission(currentPermission));
        setPermissionReady(true);
        if (requireFresh && !precisePermission) {
          const preciseError = new Error('Posizione precisa necessaria');
          preciseError.code = 'MOTRICE_PRECISE_LOCATION_REQUIRED';
          throw preciseError;
        }
      }

      const attempts = getLocationAttempts({
        requireFresh,
        precise: precisePermission,
        native: isNative
      });
      let lastError = null;

      for (const options of attempts) {
        try {
          const providerOptions = isNative && Number.isFinite(Number(maxAccuracyM))
            ? { ...options, desiredAccuracyM: Number(maxAccuracyM) }
            : options;
          const position = isNative
            ? await NativeEventLocation.getCurrentPosition(providerOptions)
            : await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, providerOptions);
            });
          const nextCoords = commitPosition(position, { requireFresh, maxAgeMs, maxAccuracyM });
          setPermission(precisePermission ? 'granted' : 'approximate');
          return nextCoords;
        } catch (attemptError) {
          lastError = attemptError;
        }
      }
      throw lastError || new Error('Posizione non disponibile');
    } catch (geoError) {
      const normalized = normalizeLocationError(geoError);
      setPermission(normalized.permission);
      setPermissionReady(true);
      setError(normalized.message);
      setErrorCode(normalized.code);
      return null;
    } finally {
      setRequesting(false);
    }
  }, [commitPosition, isNative]);

  const clearWatchSession = useCallback(async (session) => {
    if (!session) return;
    session.stopped = true;
    if (session.native) {
      if (session.id != null) {
        await NativeEventLocation.clearWatch({ id: session.id }).catch(() => undefined);
      }
      return;
    }
    if (session.id != null && typeof navigator !== 'undefined') {
      navigator.geolocation?.clearWatch?.(session.id);
    }
  }, []);

  const stopLocationWatch = useCallback(async () => {
    const session = watchSessionRef.current;
    watchSessionRef.current = null;
    setWatching(false);
    await clearWatchSession(session);
  }, [clearWatchSession]);

  const startLocationWatch = useCallback(async ({
    maxAgeMs = 15000,
    maxAccuracyM = 150,
    minimumUpdateInterval = 3000
  } = {}) => {
    await stopLocationWatch();
    const initialCoords = await requestLocation({
      requireFresh: true,
      maxAgeMs,
      maxAccuracyM
    });
    if (!initialCoords) return null;

    const session = { native: isNative, id: null, stopped: false };
    watchSessionRef.current = session;
    setWatching(true);

    const onPosition = (position, watchError = null) => {
      if (session.stopped) return;
      if (watchError || !position) {
        const normalized = normalizeLocationError(watchError);
        setPermission(normalized.permission);
        setError(normalized.message);
        setErrorCode(normalized.code);
        return;
      }
      try {
        commitPosition(position, {
          requireFresh: true,
          maxAgeMs: Math.max(maxAgeMs, 60000),
          maxAccuracyM
        });
        setPermission('granted');
        setError('');
        setErrorCode('');
      } catch (sampleError) {
        const normalized = normalizeLocationError(sampleError);
        setError(normalized.message);
        setErrorCode(normalized.code);
      }
    };

    try {
      if (isNative) {
        const watchId = await NativeEventLocation.watchPosition({
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 25000,
          minimumUpdateInterval
        }, onPosition);
        session.id = watchId;
        if (session.stopped) await clearWatchSession(session);
      } else {
        session.id = navigator.geolocation.watchPosition(
          (position) => onPosition(position),
          (watchError) => onPosition(null, watchError),
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 25000
          }
        );
      }
      return initialCoords;
    } catch (watchError) {
      const normalized = normalizeLocationError(watchError);
      if (watchSessionRef.current === session) watchSessionRef.current = null;
      session.stopped = true;
      setWatching(false);
      setPermission(normalized.permission);
      setError(normalized.message);
      setErrorCode(normalized.code);
      return null;
    }
  }, [clearWatchSession, commitPosition, isNative, requestLocation, stopLocationWatch]);

  useEffect(() => () => {
    const session = watchSessionRef.current;
    watchSessionRef.current = null;
    void clearWatchSession(session);
  }, [clearWatchSession]);

  const originParams = useMemo(() => {
    if (!coords) return {};
    return { originLat: coords.lat, originLng: coords.lng };
  }, [coords]);

  return {
    coords,
    hasLocation: Boolean(coords),
    permission,
    permissionReady,
    error,
    errorCode,
    requesting,
    watching,
    requestLocation,
    refreshPermission,
    startLocationWatch,
    stopLocationWatch,
    originParams
  };
}

export { useUserLocation };

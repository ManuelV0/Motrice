import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Capacitor } from '@capacitor/core';
import { NativeEventLocation } from '../services/nativeEventLocation';
import { captureMonitoringException } from '../services/errorMonitoring';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/safeStorage';
import {
  getLocationAttempts,
  hasAnyLocationPermission,
  hasPreciseLocationPermission,
  mergeLocationWatchOptions,
  normalizeLocationSample,
  normalizeLocationError,
  resolveLocationPermission,
  validateLocationSample
} from '../utils/locationAcquisition';

const STORAGE_KEY = 'motrice_user_location_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const INITIAL_CACHE_PREVIEW_MS = 30000;
const LocationContext = createContext(null);

function shouldReportLocationError(error, normalized) {
  const code = String(normalized?.code || error?.code || '').toUpperCase();
  return Boolean(code)
    && ![
      '1',
      '3',
      'PERMISSION_DENIED',
      'OS-PLUG-GLOC-0003',
      'MOTRICE_LOCATION_PERMISSION_REQUIRED',
      'MOTRICE_PRECISE_LOCATION_REQUIRED',
      'MOTRICE_LOCATION_CANCELLED',
      'MOTRICE_LOCATION_DISABLED',
      'MOTRICE_LOCATION_TIMEOUT',
      'MOTRICE_STALE_LOCATION',
      'MOTRICE_LOCATION_INACCURATE'
    ].includes(code);
}

function reportLocationError(error, normalized, operation, isNative) {
  if (!shouldReportLocationError(error, normalized)) return;
  captureMonitoringException(error instanceof Error ? error : new Error(normalized?.message || 'Errore GPS'), {
    tags: {
      location_operation: operation,
      location_error_code: normalized?.code || 'UNKNOWN',
      location_provider: isNative ? 'native' : 'browser'
    },
    contexts: {
      location_status: {
        permission: normalized?.permission || 'error'
      }
    }
  });
}

function hasValidLocationCoordinates(lat, lng) {
  const normalizedLat = Number(lat);
  const normalizedLng = Number(lng);
  return Number.isFinite(normalizedLat)
    && Number.isFinite(normalizedLng)
    && normalizedLat >= -90
    && normalizedLat <= 90
    && normalizedLng >= -180
    && normalizedLng <= 180;
}

function readCachedLocation() {
  try {
    const raw = safeStorageGet(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !hasValidLocationCoordinates(parsed.lat, parsed.lng)) {
      safeStorageRemove(STORAGE_KEY);
      return null;
    }
    if (!parsed.updatedAt || Date.now() - Number(parsed.updatedAt) > CACHE_TTL_MS) {
      safeStorageRemove(STORAGE_KEY);
      return null;
    }
    return {
      lat: Number(parsed.lat),
      lng: Number(parsed.lng),
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
    if (!hasValidLocationCoordinates(coords?.lat, coords?.lng)) return;
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

function useLocationController() {
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
  const [lastKnownCoords, setLastKnownCoords] = useState(() => {
    const cached = initialCachedRef.current;
    if (!cached) return null;
    return {
      lat: cached.lat,
      lng: cached.lng,
      accuracy: cached.accuracy,
      capturedAt: cached.capturedAt,
      updatedAt: cached.updatedAt,
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
  const watchOwnersRef = useRef(new Map());
  const watchStartPromiseRef = useRef(null);
  const mountedRef = useRef(true);
  const locationRequestSequenceRef = useRef(0);
  const locationCancellationVersionRef = useRef(0);
  const activeLocationRequestsRef = useRef(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      locationCancellationVersionRef.current += 1;
      activeLocationRequestsRef.current.clear();
    };
  }, []);

  const cancelLocationRequest = useCallback(() => {
    locationCancellationVersionRef.current += 1;
    activeLocationRequestsRef.current.clear();
    if (mountedRef.current) setRequesting(false);
    if (isNative) {
      NativeEventLocation.cancelCurrentPositionRequests().catch(() => undefined);
    }
  }, [isNative]);

  const commitPosition = useCallback((position, validation = {}) => {
    const nextCoords = validateLocationSample(normalizeLocationSample(position), validation);
    const liveCoords = { ...nextCoords, source: 'live' };
    setCoords(liveCoords);
    setLastKnownCoords(liveCoords);
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
        reportLocationError(permissionError, normalized, 'permission_check', isNative);
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
    maxAccuracyM = null,
    throwOnError = false
  } = {}) => {
    const requestId = locationRequestSequenceRef.current + 1;
    locationRequestSequenceRef.current = requestId;
    const cancellationVersion = locationCancellationVersionRef.current;
    activeLocationRequestsRef.current.add(requestId);
    const isCurrentRequest = () => (
      mountedRef.current
      && locationCancellationVersionRef.current === cancellationVersion
      && activeLocationRequestsRef.current.has(requestId)
    );
    const canUpdateSharedStatus = () => (
      isCurrentRequest() && locationRequestSequenceRef.current === requestId
    );

    if (!isNative && !navigator?.geolocation) {
      const unsupportedError = new Error('Geolocalizzazione non supportata su questo browser.');
      unsupportedError.code = 'MOTRICE_POSITION_UNAVAILABLE';
      if (canUpdateSharedStatus()) {
        setPermission('unavailable');
        setError(unsupportedError.message);
        setErrorCode(unsupportedError.code);
      }
      activeLocationRequestsRef.current.delete(requestId);
      if (throwOnError) throw unsupportedError;
      return null;
    }

    setRequesting(true);
    if (canUpdateSharedStatus()) {
      setError('');
      setErrorCode('');
    }

    try {
      let precisePermission = !isNative;

      if (isNative) {
        let currentPermission = await NativeEventLocation.checkLocationPermissions();
        if (!isCurrentRequest()) return null;

        if (!hasAnyLocationPermission(currentPermission)) {
          currentPermission = await NativeEventLocation.requestLocationPermissions();
          if (!isCurrentRequest()) return null;
          if (!hasAnyLocationPermission(currentPermission)) {
            const deniedError = new Error('Permesso posizione negato');
            deniedError.code = 'OS-PLUG-GLOC-0003';
            throw deniedError;
          }
        }

        precisePermission = hasPreciseLocationPermission(currentPermission);
        if (canUpdateSharedStatus()) {
          setPermission(resolveLocationPermission(currentPermission));
          setPermissionReady(true);
        }
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
          if (!isCurrentRequest()) return null;
          const nextCoords = commitPosition(position, { requireFresh, maxAgeMs, maxAccuracyM });
          if (canUpdateSharedStatus()) setPermission(precisePermission ? 'granted' : 'approximate');
          return nextCoords;
        } catch (attemptError) {
          if (!isCurrentRequest()) return null;
          lastError = attemptError;
        }
      }
      throw lastError || new Error('Posizione non disponibile');
    } catch (geoError) {
      if (!isCurrentRequest()) return null;
      const normalized = normalizeLocationError(geoError);
      reportLocationError(geoError, normalized, 'current_position', isNative);
      if (canUpdateSharedStatus()) {
        setPermission(normalized.permission);
        setPermissionReady(true);
        setError(normalized.message);
        setErrorCode(normalized.code);
      }
      if (throwOnError) {
        const exposedError = new Error(normalized.message);
        exposedError.code = normalized.code;
        throw exposedError;
      }
      return null;
    } finally {
      activeLocationRequestsRef.current.delete(requestId);
      if (mountedRef.current && activeLocationRequestsRef.current.size === 0) setRequesting(false);
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

  const stopUnderlyingLocationWatch = useCallback(async () => {
    const session = watchSessionRef.current;
    watchSessionRef.current = null;
    setWatching(false);
    await clearWatchSession(session);
  }, [clearWatchSession]);

  const getEffectiveWatchOptions = useCallback(() => {
    return mergeLocationWatchOptions([...watchOwnersRef.current.values()]);
  }, []);

  const startUnderlyingLocationWatch = useCallback(async ({
    maxAgeMs = 15000,
    maxAccuracyM = 150,
    minimumUpdateInterval = 3000,
    throwOnError = false
  } = {}) => {
    const initialCoords = await requestLocation({
      requireFresh: true,
      maxAgeMs,
      maxAccuracyM,
      throwOnError
    });
    if (!initialCoords) return null;
    if (watchOwnersRef.current.size === 0) return initialCoords;

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
          maxAgeMs: Math.max(maxAgeMs, 60000)
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
      reportLocationError(watchError, normalized, 'position_watch', isNative);
      if (watchSessionRef.current === session) watchSessionRef.current = null;
      session.stopped = true;
      setWatching(false);
      setPermission(normalized.permission);
      setError(normalized.message);
      setErrorCode(normalized.code);
      if (throwOnError) {
        const exposedError = new Error(normalized.message);
        exposedError.code = normalized.code;
        throw exposedError;
      }
      return null;
    }
  }, [clearWatchSession, commitPosition, isNative, requestLocation]);

  const startLocationWatch = useCallback(async (ownerId, options = {}) => {
    watchOwnersRef.current.set(ownerId, options);

    if (watchSessionRef.current && !watchSessionRef.current.stopped) {
      return coords;
    }
    if (watchStartPromiseRef.current) return watchStartPromiseRef.current;

    const startPromise = startUnderlyingLocationWatch(getEffectiveWatchOptions())
      .finally(() => {
        if (watchStartPromiseRef.current === startPromise) watchStartPromiseRef.current = null;
      });
    watchStartPromiseRef.current = startPromise;
    return startPromise;
  }, [coords, getEffectiveWatchOptions, startUnderlyingLocationWatch]);

  const stopLocationWatch = useCallback(async (ownerId, { force = false } = {}) => {
    if (force) watchOwnersRef.current.clear();
    else watchOwnersRef.current.delete(ownerId);
    if (watchOwnersRef.current.size > 0) return;
    if (watchStartPromiseRef.current) cancelLocationRequest();
    await stopUnderlyingLocationWatch();
  }, [cancelLocationRequest, stopUnderlyingLocationWatch]);

  useEffect(() => () => {
    watchOwnersRef.current.clear();
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
    lastKnownCoords,
    hasLocation: Boolean(coords),
    permission,
    permissionReady,
    error,
    errorCode,
    requesting,
    watching,
    requestLocation,
    cancelLocationRequest,
    refreshPermission,
    startLocationWatch,
    stopLocationWatch,
    originParams
  };
}

function LocationProvider({ children }) {
  const value = useLocationController();
  return createElement(LocationContext.Provider, { value }, children);
}

function useUserLocation() {
  const controller = useContext(LocationContext);
  if (!controller) {
    throw new Error('useUserLocation deve essere usato dentro LocationProvider');
  }

  const ownerRef = useRef(null);
  if (!ownerRef.current) ownerRef.current = Symbol('location-consumer');

  const startLocationWatch = useCallback(
    (options) => controller.startLocationWatch(ownerRef.current, options),
    [controller.startLocationWatch]
  );
  const stopLocationWatch = useCallback(
    () => controller.stopLocationWatch(ownerRef.current),
    [controller.stopLocationWatch]
  );

  useEffect(() => () => {
    void controller.stopLocationWatch(ownerRef.current);
  }, [controller.stopLocationWatch]);

  return useMemo(() => ({
    ...controller,
    startLocationWatch,
    stopLocationWatch
  }), [controller, startLocationWatch, stopLocationWatch]);
}

export { LocationProvider, useUserLocation };

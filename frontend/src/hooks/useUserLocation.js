import { useCallback, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';
import {
  getLocationAttempts,
  hasAnyLocationPermission,
  hasPreciseLocationPermission,
  normalizeLocationError,
  resolveLocationPermission
} from '../utils/locationAcquisition';

const STORAGE_KEY = 'motrice_user_location_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

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
  const cached = readCachedLocation();
  const [coords, setCoords] = useState(cached ? {
    lat: cached.lat,
    lng: cached.lng,
    accuracy: cached.accuracy,
    capturedAt: cached.capturedAt
  } : null);
  const [permission, setPermission] = useState(cached ? 'granted' : 'prompt');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (isNative) {
      let active = true;
      Geolocation.checkPermissions()
        .then((status) => {
          if (!active) return;
          const nativePermission = resolveLocationPermission(status);
          setPermission(nativePermission);
          if (!hasAnyLocationPermission(status)) {
            setCoords(null);
          } else {
            setError('');
            setErrorCode('');
          }
        })
        .catch((permissionError) => {
          if (!active) return;
          const normalized = normalizeLocationError(permissionError);
          setPermission(normalized.permission);
          setError(normalized.message);
          setErrorCode(normalized.code);
        });
      return () => {
        active = false;
      };
    }

    if (!navigator?.permissions?.query) return;
    let active = true;
    let statusRef = null;

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!active) return;
        statusRef = status;
        setPermission((prev) => (prev === 'granted' ? prev : status.state || 'prompt'));
        status.onchange = () => {
          if (!active) return;
          setPermission(status.state || 'prompt');
        };
      })
      .catch(() => {
        // no-op
      });

    return () => {
      active = false;
      if (statusRef) statusRef.onchange = null;
    };
  }, [isNative]);

  const requestLocation = useCallback(async ({ requireFresh = false, maxAgeMs = 30000 } = {}) => {
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
        let currentPermission = await Geolocation.checkPermissions();

        if (!hasAnyLocationPermission(currentPermission)) {
          currentPermission = await Geolocation.requestPermissions({
            permissions: ['location']
          });
          if (!hasAnyLocationPermission(currentPermission)) {
            const deniedError = new Error('Permesso posizione negato');
            deniedError.code = 'OS-PLUG-GLOC-0003';
            throw deniedError;
          }
        }

        precisePermission = hasPreciseLocationPermission(currentPermission);
        setPermission(resolveLocationPermission(currentPermission));
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
          const position = isNative
            ? await Geolocation.getCurrentPosition(options)
            : await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, options);
            });
          const capturedAt = Number.isFinite(Number(position.timestamp))
            ? Number(position.timestamp)
            : Date.now();
          if (requireFresh && Math.max(0, Date.now() - capturedAt) > maxAgeMs) {
            const staleError = new Error('Posizione GPS non aggiornata');
            staleError.code = 'MOTRICE_STALE_LOCATION';
            throw staleError;
          }

          const nextCoords = {
            lat: Number(position.coords.latitude),
            lng: Number(position.coords.longitude),
            accuracy: Number.isFinite(Number(position.coords.accuracy))
              ? Number(position.coords.accuracy)
              : null,
            capturedAt
          };

          if (!Number.isFinite(nextCoords.lat) || !Number.isFinite(nextCoords.lng)) {
            const invalidError = new Error('Il telefono ha restituito coordinate non valide');
            invalidError.code = 'OS-PLUG-GLOC-0002';
            throw invalidError;
          }

          setCoords(nextCoords);
          setPermission(precisePermission ? 'granted' : 'approximate');
          writeCachedLocation(nextCoords);
          return nextCoords;
        } catch (attemptError) {
          lastError = attemptError;
        }
      }
      throw lastError || new Error('Posizione non disponibile');
    } catch (geoError) {
      const normalized = normalizeLocationError(geoError);
      setPermission(normalized.permission);
      setError(normalized.message);
      setErrorCode(normalized.code);
      return null;
    } finally {
      setRequesting(false);
    }
  }, [isNative]);

  const originParams = useMemo(() => {
    if (!coords) return {};
    return { originLat: coords.lat, originLng: coords.lng };
  }, [coords]);

  return {
    coords,
    hasLocation: Boolean(coords),
    permission,
    error,
    errorCode,
    requesting,
    requestLocation,
    originParams
  };
}

export { useUserLocation };

import { useCallback, useEffect, useMemo, useState } from 'react';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';

const STORAGE_KEY = 'motrice_user_location_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

function readCachedLocation() {
  try {
    const raw = safeStorageGet(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null;
    if (!parsed.updatedAt || Date.now() - Number(parsed.updatedAt) > CACHE_TTL_MS) return null;
    return { lat: parsed.lat, lng: parsed.lng, updatedAt: parsed.updatedAt };
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
        updatedAt: Date.now()
      })
    );
  } catch {
    // no-op
  }
}

function normalizeError(error) {
  if (!error) return { permission: 'error', message: 'Posizione non disponibile.' };
  if (error.code === 1) {
    return { permission: 'denied', message: 'Permesso posizione negato. Abilitalo nelle impostazioni del browser.' };
  }
  if (error.code === 2) {
    return { permission: 'unavailable', message: 'Posizione non disponibile sul dispositivo.' };
  }
  if (error.code === 3) {
    return { permission: 'timeout', message: 'Timeout geolocalizzazione. Riprova.' };
  }
  return { permission: 'error', message: 'Errore durante il recupero della posizione.' };
}

function useUserLocation() {
  const cached = readCachedLocation();
  const [coords, setCoords] = useState(cached ? { lat: cached.lat, lng: cached.lng } : null);
  const [permission, setPermission] = useState(cached ? 'granted' : 'prompt');
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
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
  }, []);

  const requestLocation = useCallback(async () => {
    if (!navigator?.geolocation) {
      setPermission('unavailable');
      setError('Geolocalizzazione non supportata su questo browser.');
      return null;
    }

    setRequesting(true);
    setError('');

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 1000 * 60 * 5
        });
      });

      const nextCoords = {
        lat: Number(position.coords.latitude),
        lng: Number(position.coords.longitude)
      };

      setCoords(nextCoords);
      setPermission('granted');
      writeCachedLocation(nextCoords);
      return nextCoords;
    } catch (geoError) {
      const normalized = normalizeError(geoError);
      setPermission(normalized.permission);
      setError(normalized.message);
      return null;
    } finally {
      setRequesting(false);
    }
  }, []);

  const originParams = useMemo(() => {
    if (!coords) return {};
    return { originLat: coords.lat, originLng: coords.lng };
  }, [coords]);

  return {
    coords,
    hasLocation: Boolean(coords),
    permission,
    error,
    requesting,
    requestLocation,
    originParams
  };
}

export { useUserLocation };

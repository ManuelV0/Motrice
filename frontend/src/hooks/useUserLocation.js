import { useCallback, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
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
  const code = String(error.code || '');
  if (error.code === 1 || code === 'OS-PLUG-GLOC-0003') {
    return { permission: 'denied', message: 'Permesso posizione negato. Abilitalo nelle impostazioni dell app.' };
  }
  if (code === 'OS-PLUG-GLOC-0007' || code === 'OS-PLUG-GLOC-0009' || code === 'OS-PLUG-GLOC-0017') {
    return { permission: 'unavailable', message: 'Attiva la posizione del telefono e riprova.' };
  }
  if (
    error.code === 2 ||
    code === 'OS-PLUG-GLOC-0002' ||
    code === 'OS-PLUG-GLOC-0014' ||
    code === 'OS-PLUG-GLOC-0015' ||
    code === 'OS-PLUG-GLOC-0016'
  ) {
    return { permission: 'unavailable', message: 'Posizione non disponibile sul dispositivo.' };
  }
  if (error.code === 3 || code === 'OS-PLUG-GLOC-0010') {
    return { permission: 'timeout', message: 'Timeout geolocalizzazione. Riprova.' };
  }
  if (code === 'OS-PLUG-GLOC-0018') {
    return { permission: 'error', message: 'Permesso posizione non configurato nell app.' };
  }
  return { permission: 'error', message: 'Errore durante il recupero della posizione.' };
}

function useUserLocation() {
  const isNative = Capacitor.isNativePlatform();
  const cached = readCachedLocation();
  const [coords, setCoords] = useState(cached ? { lat: cached.lat, lng: cached.lng } : null);
  const [permission, setPermission] = useState(cached ? 'granted' : 'prompt');
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (isNative) {
      let active = true;
      Geolocation.checkPermissions()
        .then((status) => {
          if (!active) return;
          setPermission((prev) => (prev === 'granted' ? prev : status.coarseLocation || status.location || 'prompt'));
        })
        .catch(() => {
          // Il servizio potrebbe essere spento: il messaggio verra mostrato al tap.
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

  const requestLocation = useCallback(async () => {
    if (!isNative && !navigator?.geolocation) {
      setPermission('unavailable');
      setError('Geolocalizzazione non supportata su questo browser.');
      return null;
    }

    setRequesting(true);
    setError('');

    try {
      let position;

      if (isNative) {
        const currentPermission = await Geolocation.checkPermissions();
        const currentState = currentPermission.coarseLocation || currentPermission.location;

        if (currentState !== 'granted') {
          const requestedPermission = await Geolocation.requestPermissions({
            permissions: ['coarseLocation']
          });
          const requestedState = requestedPermission.coarseLocation || requestedPermission.location;
          if (requestedState !== 'granted') {
            const deniedError = new Error('Permesso posizione negato');
            deniedError.code = 'OS-PLUG-GLOC-0003';
            throw deniedError;
          }
        }

        position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 1000 * 60 * 5,
          enableLocationFallback: true
        });
      } else {
        position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 1000 * 60 * 5
          });
        });
      }

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
    requesting,
    requestLocation,
    originParams
  };
}

export { useUserLocation };

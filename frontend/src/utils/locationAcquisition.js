function readErrorField(error, field) {
  return error?.[field] ?? error?.cause?.[field] ?? error?.error?.[field] ?? null;
}

export function resolveLocationPermission(status = {}) {
  if (status.location === 'granted') return 'granted';
  if (status.coarseLocation === 'granted') return 'approximate';
  if (status.location === 'denied' || status.coarseLocation === 'denied') return 'denied';
  if (status.location === 'prompt-with-rationale' || status.coarseLocation === 'prompt-with-rationale') {
    return 'prompt-with-rationale';
  }
  return status.location || status.coarseLocation || 'prompt';
}

export function hasAnyLocationPermission(status = {}) {
  return status.location === 'granted' || status.coarseLocation === 'granted';
}

export function hasPreciseLocationPermission(status = {}) {
  return status.location === 'granted';
}

export function normalizeLocationError(error) {
  if (!error) {
    return {
      permission: 'error',
      code: 'UNKNOWN',
      message: 'Posizione non disponibile. Riprova tra qualche secondo.'
    };
  }

  const rawCode = readErrorField(error, 'code');
  const code = String(rawCode ?? '').trim().toUpperCase();
  const originalMessage = String(readErrorField(error, 'message') || error || '').trim();
  const normalizedMessage = originalMessage.toLowerCase();

  if (
    rawCode === 1 ||
    code === '1' ||
    code === 'OS-PLUG-GLOC-0003' ||
    code === 'MOTRICE_LOCATION_PERMISSION_REQUIRED' ||
    normalizedMessage.includes('permission') && normalizedMessage.includes('denied')
  ) {
    return {
      permission: 'denied',
      code: code || 'PERMISSION_DENIED',
      message: 'Permesso posizione negato. Abilita la posizione precisa nelle impostazioni di Motrice.'
    };
  }

  if (code === 'MOTRICE_PRECISE_LOCATION_REQUIRED') {
    return {
      permission: 'approximate',
      code,
      message: 'Per il check-in serve la posizione precisa. Attivala nelle autorizzazioni di Motrice.'
    };
  }

  if (
    code === 'OS-PLUG-GLOC-0007' ||
    code === 'OS-PLUG-GLOC-0009' ||
    code === 'OS-PLUG-GLOC-0017' ||
    code === 'MOTRICE_LOCATION_DISABLED' ||
    normalizedMessage.includes('location services are not enabled') ||
    normalizedMessage.includes('location turned off')
  ) {
    return {
      permission: 'unavailable',
      code: code || 'LOCATION_DISABLED',
      message: 'Attiva la posizione del telefono e riprova.'
    };
  }

  if (
    rawCode === 3 ||
    code === '3' ||
    code === 'OS-PLUG-GLOC-0010' ||
    code === 'MOTRICE_LOCATION_TIMEOUT' ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('obtain location in time')
  ) {
    return {
      permission: 'timeout',
      code: code || 'LOCATION_TIMEOUT',
      message: 'Il GPS sta impiegando troppo tempo. Spostati vicino a una finestra o all’aperto e riprova.'
    };
  }

  if (code === 'MOTRICE_STALE_LOCATION') {
    return {
      permission: 'granted',
      code,
      message: 'La posizione ricevuta non è aggiornata. Attendi il nuovo segnale GPS e riprova.'
    };
  }

  if (code === 'MOTRICE_LOCATION_INACCURATE') {
    return {
      permission: 'granted',
      code,
      message: 'La posizione ricevuta è troppo approssimativa. Attendi qualche secondo all’aperto e riprova.'
    };
  }

  if (
    rawCode === 2 ||
    code === '2' ||
    code === 'MOTRICE_POSITION_UNAVAILABLE' ||
    ['OS-PLUG-GLOC-0002', 'OS-PLUG-GLOC-0014', 'OS-PLUG-GLOC-0015', 'OS-PLUG-GLOC-0016'].includes(code)
  ) {
    return {
      permission: 'unavailable',
      code: code || 'POSITION_UNAVAILABLE',
      message: code === 'OS-PLUG-GLOC-0014'
        ? 'Android richiede di confermare le impostazioni di localizzazione. Riprova e accetta la richiesta.'
        : 'Il telefono non ha restituito una posizione valida. Verifica la precisione Google e riprova.'
    };
  }

  return {
    permission: 'error',
    code: code || 'UNKNOWN',
    message: originalMessage && !/^\[object object\]$/i.test(originalMessage)
      ? `GPS non disponibile: ${originalMessage}`
      : 'Errore GPS non riconosciuto. Chiudi e riapri Motrice, poi riprova.'
  };
}

export function normalizeLocationSample(position, now = Date.now()) {
  const capturedAt = Number.isFinite(Number(position?.timestamp))
    ? Number(position.timestamp)
    : now;
  const sample = {
    lat: Number(position?.coords?.latitude),
    lng: Number(position?.coords?.longitude),
    accuracy: Number.isFinite(Number(position?.coords?.accuracy))
      ? Number(position.coords.accuracy)
      : null,
    capturedAt
  };

  if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) {
    const invalidError = new Error('Il dispositivo ha restituito coordinate non valide');
    invalidError.code = 'MOTRICE_POSITION_UNAVAILABLE';
    throw invalidError;
  }
  return sample;
}

export function validateLocationSample(
  sample,
  { requireFresh = false, maxAgeMs = 30000, maxAccuracyM = null, now = Date.now() } = {}
) {
  if (requireFresh && Math.max(0, now - Number(sample?.capturedAt || 0)) > maxAgeMs) {
    const staleError = new Error('Posizione GPS non aggiornata');
    staleError.code = 'MOTRICE_STALE_LOCATION';
    throw staleError;
  }

  const accuracyLimit = Number(maxAccuracyM);
  if (
    Number.isFinite(accuracyLimit)
    && accuracyLimit > 0
    && (!Number.isFinite(Number(sample?.accuracy)) || Number(sample.accuracy) > accuracyLimit)
  ) {
    const inaccurateError = new Error('Posizione GPS troppo approssimativa');
    inaccurateError.code = 'MOTRICE_LOCATION_INACCURATE';
    inaccurateError.accuracy = sample?.accuracy ?? null;
    throw inaccurateError;
  }

  return sample;
}

export function getLocationAttempts({ requireFresh = false, precise = false, native = false } = {}) {
  if (requireFresh) {
    return [
      {
        enableHighAccuracy: true,
        timeout: 25000,
        maximumAge: 5000,
        ...(native ? { nativeProvider: 'motrice' } : {})
      },
      {
        enableHighAccuracy: true,
        timeout: 40000,
        maximumAge: 0,
        ...(native ? { nativeProvider: 'motrice' } : {})
      }
    ];
  }

  return [
    {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 60000,
      ...(native ? { nativeProvider: 'motrice' } : {})
    },
    {
      enableHighAccuracy: Boolean(precise),
      timeout: 30000,
      maximumAge: 15000,
      ...(native ? { nativeProvider: 'motrice' } : {})
    }
  ];
}

export function normalizeTrackingError(error, fallback = 'Monitoraggio GPS temporaneamente non disponibile') {
  const raw = String(error?.message || error || '').trim();
  if (!raw) return fallback;
  if (/foreground|background|not allowed|securityexception|start failed/i.test(raw)) {
    return 'Monitoraggio GPS non disponibile su questo dispositivo. Motrice resta utilizzabile.';
  }
  return raw.slice(0, 180);
}

export function validateActiveTrackingRecord(value) {
  if (!value || typeof value !== 'object') return { valid: false, reason: 'missing', record: null };

  const eventId = String(value.eventId || '').trim();
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  const radiusM = Number(value.radiusM || 250);
  const expectedEndAtMs = Date.parse(value.expectedEndAt || '');

  if (!eventId) return { valid: false, reason: 'event', record: null };
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { valid: false, reason: 'latitude', record: null };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { valid: false, reason: 'longitude', record: null };
  }
  if (!Number.isFinite(radiusM) || radiusM < 25 || radiusM > 5000) {
    return { valid: false, reason: 'radius', record: null };
  }
  if (!Number.isFinite(expectedEndAtMs) || expectedEndAtMs <= 0) {
    return { valid: false, reason: 'end', record: null };
  }

  return {
    valid: true,
    reason: null,
    record: {
      ...value,
      eventId,
      lat,
      lng,
      radiusM,
      expectedEndAt: new Date(expectedEndAtMs).toISOString()
    }
  };
}

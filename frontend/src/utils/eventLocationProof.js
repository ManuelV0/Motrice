const EARTH_RADIUS_M = 6371000;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validLatitude(value) {
  return value != null && value >= -90 && value <= 90;
}

function validLongitude(value) {
  return value != null && value >= -180 && value <= 180;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceBetweenCoordinatesM(latA, lngA, latB, lngB) {
  const firstLat = finiteNumber(latA);
  const firstLng = finiteNumber(lngA);
  const secondLat = finiteNumber(latB);
  const secondLng = finiteNumber(lngB);
  if (
    !validLatitude(firstLat) ||
    !validLongitude(firstLng) ||
    !validLatitude(secondLat) ||
    !validLongitude(secondLng)
  ) {
    return null;
  }

  const latDelta = toRadians(secondLat - firstLat);
  const lngDelta = toRadians(secondLng - firstLng);
  const firstLatRad = toRadians(firstLat);
  const secondLatRad = toRadians(secondLat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(firstLatRad) * Math.cos(secondLatRad) * Math.sin(lngDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function validateEventLocationProof({
  location,
  eventLat,
  eventLng,
  radiusM = 250,
  nowMs = Date.now(),
  maxAgeMs = 30000
} = {}) {
  const lat = finiteNumber(location?.lat);
  const lng = finiteNumber(location?.lng);
  const accuracyM = finiteNumber(location?.accuracy);
  const capturedAt = finiteNumber(location?.capturedAt ?? location?.timestamp);
  const normalizedRadiusM = Math.max(50, finiteNumber(radiusM) ?? 250);

  if (!validLatitude(lat) || !validLongitude(lng)) {
    return {
      valid: false,
      code: 'invalid_location',
      message: 'Coordinate GPS non valide. Attiva la posizione precisa e riprova.'
    };
  }

  const distanceM = distanceBetweenCoordinatesM(lat, lng, eventLat, eventLng);
  if (!Number.isFinite(distanceM)) {
    return {
      valid: false,
      code: 'invalid_event_location',
      message: 'Il punto dell’evento non è configurato correttamente.'
    };
  }

  if (!Number.isFinite(capturedAt) || Math.max(0, Number(nowMs) - capturedAt) > maxAgeMs) {
    return {
      valid: false,
      code: 'stale_location',
      distanceM,
      message: 'La posizione rilevata non è aggiornata. Attendi il nuovo segnale GPS e riprova.'
    };
  }

  const maximumAccuracyM = Math.min(100, Math.max(35, normalizedRadiusM / 2));
  if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > maximumAccuracyM) {
    return {
      valid: false,
      code: 'inaccurate_location',
      distanceM,
      accuracyM,
      maximumAccuracyM,
      message: 'Segnale GPS poco preciso. Spostati all’aperto, attendi qualche secondo e riprova.'
    };
  }

  const verifiedDistanceM = distanceM + accuracyM;
  if (verifiedDistanceM > normalizedRadiusM) {
    return {
      valid: false,
      code: 'outside_event_area',
      distanceM,
      accuracyM,
      radiusM: normalizedRadiusM,
      message: `Sei fuori dall’area dell’evento (${Math.round(distanceM)} m, raggio ${Math.round(normalizedRadiusM)} m).`
    };
  }

  return {
    valid: true,
    code: 'inside_event_area',
    distanceM,
    accuracyM,
    radiusM: normalizedRadiusM,
    verifiedDistanceM
  };
}

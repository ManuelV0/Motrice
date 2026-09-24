const CLOSE_GPS_ACCURACY_M = 40;
const MEDIUM_GPS_ACCURACY_M = 100;
const EARTH_RADIUS_M = 6371000;

export function getUserFocusZoom(accuracy) {
  const meters = Number(accuracy);
  if (!Number.isFinite(meters) || meters <= 0) return 16;
  if (meters <= CLOSE_GPS_ACCURACY_M) return 17;
  if (meters <= MEDIUM_GPS_ACCURACY_M) return 16;
  return 15;
}

export function normalizeOptionalMapZoom(value) {
  if (value === null || value === undefined || value === '') return null;
  const zoom = Number(value);
  return Number.isFinite(zoom) ? zoom : null;
}

export function shouldUpdateFollowCenter(currentPosition, nextPosition, minimumDistanceM = 8) {
  const normalizeCoordinate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  };
  const currentLat = normalizeCoordinate(currentPosition?.lat);
  const currentLng = normalizeCoordinate(currentPosition?.lng);
  const nextLat = normalizeCoordinate(nextPosition?.lat);
  const nextLng = normalizeCoordinate(nextPosition?.lng);
  if (nextLat === null || nextLng === null) return false;
  if (currentLat === null || currentLng === null) return true;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(nextLat - currentLat);
  const deltaLng = toRadians(nextLng - currentLng);
  const currentLatRad = toRadians(currentLat);
  const nextLatRad = toRadians(nextLat);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(currentLatRad) * Math.cos(nextLatRad) * Math.sin(deltaLng / 2) ** 2;
  const distanceM = 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const thresholdM = Math.max(0, Number(minimumDistanceM) || 0);

  return distanceM >= thresholdM;
}

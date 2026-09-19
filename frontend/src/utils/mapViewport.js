const CLOSE_GPS_ACCURACY_M = 40;
const MEDIUM_GPS_ACCURACY_M = 100;

export function getUserFocusZoom(accuracy) {
  const meters = Number(accuracy);
  if (!Number.isFinite(meters) || meters <= 0) return 16;
  if (meters <= CLOSE_GPS_ACCURACY_M) return 17;
  if (meters <= MEDIUM_GPS_ACCURACY_M) return 16;
  return 15;
}

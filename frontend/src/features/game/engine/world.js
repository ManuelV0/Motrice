const DEG_TO_WORLD = 42000;

export function buildWorldEvents(events, origin) {
  const originLat = Number(origin?.lat) || 42.6;
  const originLng = Number(origin?.lng) || 12.5;

  return events
    .filter((event) => Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng)))
    .map((event) => {
      const lat = Number(event.lat);
      const lng = Number(event.lng);
      return {
        id: Number(event.id),
        title: String(event.title || event.sport_name || 'Evento'),
        subtitle: String(event.location_name || ''),
        sport: String(event.sport_name || 'Sport'),
        x: (lng - originLng) * DEG_TO_WORLD,
        y: (originLat - lat) * DEG_TO_WORLD,
        lat,
        lng
      };
    });
}

export function findNearestEvent(player, worldEvents) {
  if (!player || !worldEvents.length) return null;

  let nearest = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const event of worldEvents) {
    const dx = event.x - player.x;
    const dy = event.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = { ...event, distance };
    }
  }

  return nearest;
}

export function formatWorldDistance(distance) {
  if (!Number.isFinite(distance)) return '--';
  const meters = Math.round(Math.max(0, distance));
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

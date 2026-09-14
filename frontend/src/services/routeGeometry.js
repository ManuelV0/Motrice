const DEFAULT_ROUTING_URL = 'https://valhalla1.openstreetmap.de/route';
// A small number of shaping points keeps public pedestrian routing responsive
// while still preserving the route drawn by the organizer.
const MAX_ROUTING_WAYPOINTS = 8;
const routeCache = new Map();

function isValidPoint(point) {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(Number(point[0]))
    && Number.isFinite(Number(point[1]));
}

function compactWaypoints(points) {
  const valid = points
    .filter(isValidPoint)
    .map(([lat, lng]) => [Number(lat), Number(lng)])
    .filter((point, index, collection) => {
      const previous = collection[index - 1];
      return !previous || point[0] !== previous[0] || point[1] !== previous[1];
    });
  if (valid.length <= MAX_ROUTING_WAYPOINTS) return valid;

  const result = [];
  for (let index = 0; index < MAX_ROUTING_WAYPOINTS; index += 1) {
    const sourceIndex = Math.round((index / (MAX_ROUTING_WAYPOINTS - 1)) * (valid.length - 1));
    const point = valid[sourceIndex];
    if (!result.length || point[0] !== result.at(-1)[0] || point[1] !== result.at(-1)[1]) {
      result.push(point);
    }
  }
  return result;
}

export function decodeValhallaPolyline(encoded, precision = 6) {
  const value = String(encoded || '');
  const coordinates = [];
  const factor = 10 ** precision;
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < value.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      if (index >= value.length) return [];
      byte = value.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      if (index >= value.length) return [];
      byte = value.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([latitude / factor, longitude / factor]);
  }

  return coordinates;
}

function mergeLegShapes(legs) {
  const merged = [];
  legs.forEach((leg) => {
    decodeValhallaPolyline(leg?.shape, 6).forEach((point) => {
      const previous = merged.at(-1);
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) merged.push(point);
    });
  });
  return merged;
}

export async function requestPedestrianRoute(points, { signal } = {}) {
  const waypoints = compactWaypoints(Array.isArray(points) ? points : []);
  if (waypoints.length < 2) return null;

  const cacheKey = waypoints.map((point) => point.map((value) => value.toFixed(6)).join(',')).join('|');
  if (routeCache.has(cacheKey)) return routeCache.get(cacheKey);

  const endpoint = import.meta.env?.VITE_PEDESTRIAN_ROUTING_URL || DEFAULT_ROUTING_URL;
  const payload = {
    locations: waypoints.map(([lat, lng]) => ({ lat, lon: lng, type: 'break' })),
    costing: 'pedestrian',
    directions_type: 'none',
    units: 'kilometers'
  };
  const url = new URL(endpoint);
  url.searchParams.set('json', JSON.stringify(payload));

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal
  });
  if (!response.ok) throw new Error(`Routing non disponibile (${response.status})`);

  const result = await response.json();
  const route = mergeLegShapes(Array.isArray(result?.trip?.legs) ? result.trip.legs : []);
  if (route.length < 2) throw new Error('Il servizio non ha restituito un percorso valido');

  routeCache.set(cacheKey, route);
  return route;
}

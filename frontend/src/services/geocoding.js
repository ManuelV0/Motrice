const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const geocodeCache = new Map();

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCacheKey(value) {
  return normalizeText(value).toLocaleLowerCase('it-IT');
}

function parseGeocodingResult(item, fallbackLabel) {
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    label: normalizeText(item?.display_name) || fallbackLabel
  };
}

function parseReverseGeocodingResult(item, fallbackCoordinates) {
  const lat = Number(item?.lat ?? fallbackCoordinates?.lat);
  const lng = Number(item?.lon ?? fallbackCoordinates?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const address = item?.address && typeof item.address === 'object' ? item.address : {};
  const city = normalizeText(
    address.city || address.town || address.village || address.municipality || address.county || address.state
  );
  const road = normalizeText(
    address.road || address.pedestrian || address.path || address.footway || address.cycleway || address.square
  );
  const houseNumber = normalizeText(address.house_number);
  const namedPlace = normalizeText(
    address.amenity || address.leisure || address.building || address.shop || address.tourism || item?.name
  );
  const locationName = road
    ? [road, houseNumber].filter(Boolean).join(' ')
    : namedPlace || normalizeText(item?.display_name).split(',')[0];

  return {
    lat,
    lng,
    city,
    locationName,
    label: normalizeText(item?.display_name) || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  };
}

export async function geocodeAddress(query, options = {}) {
  const text = normalizeText(query);
  if (!text) throw new Error('Inserisci un luogo da cercare');

  const countryCode = normalizeText(options.countryCode || 'it').toLowerCase();
  const cacheKey = `${countryCode}:${normalizeCacheKey(text)}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    q: text
  });
  if (countryCode) params.set('countrycodes', countryCode);

  const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
    signal: options.signal,
    headers: { Accept: 'application/json', 'Accept-Language': 'it' }
  });
  if (!response.ok) throw new Error('Servizio geocoding non disponibile');

  const items = await response.json();
  const result = parseGeocodingResult(Array.isArray(items) ? items[0] : null, text);
  if (!result) throw new Error(`Luogo non trovato: ${text}`);
  geocodeCache.set(cacheKey, result);
  return result;
}

export async function geocodeEventLocation(event, options = {}) {
  const locationName = normalizeText(event?.location_name ?? event?.locationName);
  const city = normalizeText(event?.city);
  const queries = [
    [locationName, city, 'Italia'].filter(Boolean).join(', '),
    [locationName, city].filter(Boolean).join(', '),
    [city, 'Italia'].filter(Boolean).join(', ')
  ].filter((query, index, list) => query && list.indexOf(query) === index);

  if (!queries.length) throw new Error('Luogo e città non disponibili');

  let lastError = null;
  for (const query of queries) {
    try {
      return await geocodeAddress(query, options);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error;
    }
  }

  throw lastError || new Error('Coordinate non trovate');
}

export async function reverseGeocodeCoordinates(latValue, lngValue, options = {}) {
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('Coordinate non valide');
  }

  const cacheKey = `reverse:${lat.toFixed(5)}:${lng.toFixed(5)}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '18',
    addressdetails: '1'
  });
  const response = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
    signal: options.signal,
    headers: { Accept: 'application/json', 'Accept-Language': 'it' }
  });
  if (!response.ok) throw new Error('Servizio indirizzi non disponibile');

  const payload = await response.json();
  const result = parseReverseGeocodingResult(payload, { lat, lng });
  if (!result) throw new Error('Indirizzo non disponibile per questo punto');
  geocodeCache.set(cacheKey, result);
  return result;
}

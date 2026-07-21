const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
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

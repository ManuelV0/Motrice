const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const ARCGIS_SEARCH_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';
const geocodeCache = new Map();

const MOTRICE_SPORT_VENUES = [
  {
    venueKey: 'phisiko-restyle-gym-ascoli-piceno',
    locationName: 'Phisiko Restyle Gym',
    aliases: ['phisiko', 'physiko', 'phisiko restyle gym', 'physiko restyle gym'],
    city: 'Ascoli Piceno',
    lat: 42.8393119,
    lng: 13.6226052,
    label: "Phisiko Restyle Gym, Strada Provinciale 31 dell'Aspo 62, 63100 Ascoli Piceno",
    category: 'leisure',
    type: 'fitness_centre',
    isSportFacility: true,
    source: 'motrice'
  },
  {
    venueKey: 'tonic-ascoli-piceno',
    locationName: 'Tonic Ascoli Piceno',
    aliases: ['tonic', 'tonic ascoli', 'tonic ascoli piceno', 'tonic club'],
    city: 'Ascoli Piceno',
    lat: 42.8568,
    lng: 13.5858,
    label: 'Tonic Ascoli Piceno, Via Piemonte 4, 63100 Ascoli Piceno',
    category: 'leisure',
    type: 'fitness_centre',
    isSportFacility: true,
    source: 'motrice'
  },
  {
    venueKey: 'ludus-srl-dilettantistica-ascoli-piceno',
    locationName: 'Ludus Srl Dilettantistica',
    aliases: ['ludus', 'ludus ascoli', 'ludus ascoli piceno', 'ludus srl dilettantistica'],
    city: 'Ascoli Piceno',
    lat: 42.8470488,
    lng: 13.6134643,
    label: 'Ludus Srl Dilettantistica, Viale del Commercio 16, 63100 Ascoli Piceno',
    category: 'leisure',
    type: 'fitness_centre',
    isSportFacility: true,
    source: 'motrice'
  }
];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCacheKey(value) {
  return normalizeText(value).toLocaleLowerCase('it-IT');
}

function normalizePlaceSearchQuery(value) {
  const parts = normalizeText(value).split(',');
  const firstPart = normalizeCacheKey(parts[0]);
  if (firstPart === 'palestre') parts[0] = 'palestra';
  if (firstPart === 'centri sportivi') parts[0] = 'centro sportivo';
  return parts.map((part) => part.trim()).filter(Boolean).join(', ');
}

function distanceKmBetween(left, right) {
  const lat1 = Number(left?.lat);
  const lng1 = Number(left?.lng);
  const lat2 = Number(right?.lat);
  const lng2 = Number(right?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCuratedSportVenues(query, center, radiusKm = 30) {
  const normalizedQuery = normalizeCacheKey(query);
  const firstPart = normalizeCacheKey(normalizeText(query).split(',')[0]);
  const isGenericSearch = new Set(['palestra', 'palestre', 'centro sportivo', 'centri sportivi']).has(firstPart);
  const mentionsAscoli = normalizedQuery.includes('ascoli');

  return MOTRICE_SPORT_VENUES.filter((venue) => {
    const matchesName = venue.aliases.some((alias) => normalizedQuery.includes(normalizeCacheKey(alias)));
    if (matchesName) return true;
    if (!isGenericSearch) return false;
    if (mentionsAscoli) return true;
    return distanceKmBetween(venue, center) <= Math.max(5, Number(radiusKm) || 30);
  }).map(({ aliases, ...venue }) => venue);
}

function rankSearchResults(results, query, center) {
  const rawName = normalizeText(query).split(',')[0];
  const genericTerms = new Set(['palestra', 'palestre', 'centro sportivo', 'centri sportivi']);
  const requestedName = genericTerms.has(normalizeCacheKey(rawName)) ? '' : normalizeCacheKey(rawName);

  return results
    .map((result, index) => {
      const resultName = normalizeCacheKey(result.locationName);
      let score = result.isSportFacility ? 30 : 0;
      if (result.source === 'motrice') score += 20;
      const distanceKm = distanceKmBetween(result, center);
      if (distanceKm <= 5) score += 80;
      else if (distanceKm <= 15) score += 60;
      else if (distanceKm <= 30) score += 40;
      else if (distanceKm <= 75) score += 20;
      if (requestedName && resultName === requestedName) score += 120;
      else if (requestedName && resultName.startsWith(requestedName)) score += 90;
      else if (requestedName && resultName.includes(requestedName)) score += 70;
      else if (requestedName) {
        const tokens = requestedName.split(/\s+/).filter((token) => token.length > 2);
        if (tokens.length && tokens.every((token) => resultName.includes(token))) score += 45;
      }
      return { result, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ result }) => result);
}

function parseGeocodingResult(item, fallbackLabel) {
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const address = item?.address && typeof item.address === 'object' ? item.address : {};
  const label = normalizeText(item?.display_name) || fallbackLabel;
  const locationName = normalizeText(
    item?.name
      || item?.namedetails?.name
      || address.amenity
      || address.leisure
      || address.building
      || label.split(',')[0]
  );
  const city = normalizeText(
    address.city || address.town || address.village || address.municipality || address.county || address.state
  );
  const category = normalizeText(item?.category || item?.class).toLowerCase();
  const type = normalizeText(item?.type || item?.addresstype).toLowerCase();
  const sportFacilityTypes = new Set([
    'fitness_centre',
    'sports_centre',
    'sports_hall',
    'stadium',
    'pitch',
    'track',
    'swimming_pool'
  ]);

  return {
    lat,
    lng,
    label,
    locationName,
    city,
    category,
    type,
    isSportFacility: category === 'leisure' || sportFacilityTypes.has(type)
  };
}

function parseArcGisResult(candidate) {
  const lat = Number(candidate?.location?.y);
  const lng = Number(candidate?.location?.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const attributes = candidate?.attributes && typeof candidate.attributes === 'object' ? candidate.attributes : {};
  const type = normalizeText(attributes.Type).toLowerCase();
  const administrativeTypes = new Set(['city', 'county', 'region', 'state', 'country', 'territory']);
  if (administrativeTypes.has(type)) return null;

  const locationName = normalizeText(attributes.PlaceName || candidate?.address);
  if (!locationName) return null;
  const sportTypePattern = /(fitness|sport|gym|recreation|swim|stadium|athletic)/i;
  return {
    lat,
    lng,
    label: normalizeText(attributes.Place_addr || candidate?.address) || locationName,
    locationName,
    city: normalizeText(attributes.City),
    category: type,
    type: type.replace(/\s+/g, '_'),
    isSportFacility: sportTypePattern.test(type),
    source: 'arcgis',
    providerScore: Number(candidate?.score) || 0
  };
}

function uniqueSearchResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    if (!result) return false;
    const nameKey = `${normalizeCacheKey(result.locationName)}:${normalizeCacheKey(result.city)}`;
    const coordinateKey = `${Number(result.lat).toFixed(5)}:${Number(result.lng).toFixed(5)}`;
    if (seen.has(nameKey) || seen.has(coordinateKey)) return false;
    seen.add(nameKey);
    seen.add(coordinateKey);
    return true;
  });
}

function getSearchViewbox(center, radiusKm = 25) {
  const lat = Number(center?.lat);
  const lng = Number(center?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';

  const safeRadiusKm = Math.min(100, Math.max(5, Number(radiusKm) || 25));
  const latDelta = safeRadiusKm / 111;
  const longitudeScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lngDelta = safeRadiusKm / (111 * longitudeScale);
  const west = Math.max(-180, lng - lngDelta);
  const east = Math.min(180, lng + lngDelta);
  const north = Math.min(90, lat + latDelta);
  const south = Math.max(-90, lat - latDelta);
  return `${west},${north},${east},${south}`;
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

export async function searchLocations(query, options = {}) {
  const text = normalizeText(query);
  if (!text) throw new Error('Inserisci un luogo da cercare');
  const searchText = normalizePlaceSearchQuery(text);

  const countryCode = normalizeText(options.countryCode || 'it').toLowerCase();
  const limit = Math.min(8, Math.max(1, Number(options.limit) || 6));
  const remoteLimit = Math.min(20, Math.max(12, limit));
  const centerLat = Number(options.center?.lat);
  const centerLng = Number(options.center?.lng);
  const centerKey = Number.isFinite(centerLat) && Number.isFinite(centerLng)
    ? `${centerLat.toFixed(2)}:${centerLng.toFixed(2)}`
    : 'global';
  const cacheKey = `search:${countryCode}:${centerKey}:${limit}:${normalizeCacheKey(searchText)}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const nominatimParams = new URLSearchParams({
    format: 'jsonv2',
    limit: String(remoteLimit),
    addressdetails: '1',
    namedetails: '1',
    q: searchText
  });
  if (countryCode) nominatimParams.set('countrycodes', countryCode);

  const viewbox = getSearchViewbox(options.center, options.radiusKm);
  if (viewbox) {
    nominatimParams.set('viewbox', viewbox);
    // Prioritizza l'area vicina senza nascondere risultati validi appena fuori zona.
    nominatimParams.set('bounded', '0');
  }

  const arcGisParams = new URLSearchParams({
    f: 'json',
    SingleLine: searchText,
    outFields: 'PlaceName,Place_addr,City,Type',
    maxLocations: String(remoteLimit),
    forStorage: 'false',
    outSR: '4326'
  });
  if (countryCode) arcGisParams.set('sourceCountry', countryCode === 'it' ? 'ITA' : countryCode.toUpperCase());
  if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
    arcGisParams.set('location', `${centerLng},${centerLat}`);
  }

  const [nominatimResponse, arcGisResponse] = await Promise.allSettled([
    fetch(`${NOMINATIM_SEARCH_URL}?${nominatimParams.toString()}`, {
      signal: options.signal,
      headers: { Accept: 'application/json', 'Accept-Language': 'it' }
    }).then(async (response) => {
      if (!response.ok) throw new Error('Nominatim non disponibile');
      const payload = await response.json();
      return (Array.isArray(payload) ? payload : [])
        .map((item) => parseGeocodingResult(item, searchText))
        .filter(Boolean);
    }),
    fetch(`${ARCGIS_SEARCH_URL}?${arcGisParams.toString()}`, {
      signal: options.signal,
      headers: { Accept: 'application/json', 'Accept-Language': 'it' }
    }).then(async (response) => {
      if (!response.ok) throw new Error('Ricerca commerciale non disponibile');
      const payload = await response.json();
      return (Array.isArray(payload?.candidates) ? payload.candidates : [])
        .filter((candidate) => Number(candidate?.score) >= 80)
        .map(parseArcGisResult)
        .filter(Boolean);
    })
  ]);

  if (options.signal?.aborted) {
    const abortError = new Error('Ricerca annullata');
    abortError.name = 'AbortError';
    throw abortError;
  }

  const curatedResults = getCuratedSportVenues(searchText, options.center, options.radiusKm);
  const nominatimResults = nominatimResponse.status === 'fulfilled' ? nominatimResponse.value : [];
  const commercialResults = arcGisResponse.status === 'fulfilled' ? arcGisResponse.value : [];
  if (!curatedResults.length && !nominatimResults.length && !commercialResults.length
    && nominatimResponse.status === 'rejected' && arcGisResponse.status === 'rejected') {
    throw new Error('Servizio ricerca luoghi non disponibile');
  }

  const mergedResults = uniqueSearchResults([
    ...curatedResults,
    ...nominatimResults,
    ...commercialResults
  ]);
  const rankedResults = rankSearchResults(mergedResults, searchText, options.center).slice(0, limit);
  geocodeCache.set(cacheKey, rankedResults);
  return rankedResults;
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

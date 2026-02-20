const HttpError = require('./httpError');

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const GOALS = ['fitness', 'performance', 'social', 'weight_loss'];
const EVENT_STATUSES = ['scheduled', 'cancelled', 'completed'];
const ATTENDANCE_STATUSES = ['completed', 'no_show'];

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function assertRequired(fields, payload) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
  if (missing.length) {
    throw new HttpError(400, `Missing required fields: ${missing.join(', ')}`);
  }
}

function assertEnum(value, validValues, fieldName) {
  if (!validValues.includes(value)) {
    throw new HttpError(400, `Invalid ${fieldName}. Allowed: ${validValues.join(', ')}`);
  }
}

function assertInteger(value, fieldName, min = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new HttpError(400, `${fieldName} must be an integer >= ${min}`);
  }
  return parsed;
}

function assertCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') {
    return { lat: null, lng: null };
  }

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (Number.isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
    throw new HttpError(400, 'lat must be between -90 and 90');
  }

  if (Number.isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
    throw new HttpError(400, 'lng must be between -180 and 180');
  }

  return { lat: parsedLat, lng: parsedLng };
}

function assertDateString(value, fieldName) {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${fieldName} must be a valid ISO datetime string`);
  }
}

function assertAvailability(value) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'availability must be an array of time slots');
  }

  value.forEach((slot, index) => {
    if (!slot || typeof slot !== 'object') {
      throw new HttpError(400, `availability[${index}] must be an object`);
    }
    if (!slot.day || !slot.start || !slot.end) {
      throw new HttpError(400, `availability[${index}] requires day, start, end`);
    }
  });
}

function assertUserSports(value) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'sports_practiced must be an array');
  }

  value.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new HttpError(400, `sports_practiced[${index}] must be an object`);
    }
    if (!Number.isInteger(item.sport_id)) {
      throw new HttpError(400, `sports_practiced[${index}].sport_id must be an integer`);
    }
    assertEnum(item.level, LEVELS, `sports_practiced[${index}].level`);
  });
}

module.exports = {
  LEVELS,
  GOALS,
  EVENT_STATUSES,
  ATTENDANCE_STATUSES,
  isEmail,
  assertRequired,
  assertEnum,
  assertInteger,
  assertCoordinates,
  assertDateString,
  assertAvailability,
  assertUserSports
};

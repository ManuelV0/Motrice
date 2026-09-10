import { distanceBetweenCoordinatesM } from './eventLocationProof.js';

const RUNNING_PATTERN = /\b(running|corsa|jogging|trail running|maratona)\b/i;
const TREKKING_PATTERN = /\b(trekking|hiking|escursion|camminata|walking|sentiero)\b/i;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getOutdoorActivityKind(event) {
  const source = [
    event?.sport_slug,
    event?.sport?.slug,
    event?.sport_name,
    event?.title
  ].filter(Boolean).join(' ');
  if (RUNNING_PATTERN.test(source)) return 'running';
  if (TREKKING_PATTERN.test(source)) return 'trekking';
  return null;
}

export function isOutdoorTrackedEvent(event) {
  return Boolean(getOutdoorActivityKind(event));
}

export function normalizeOutdoorPosition(position) {
  const source = position?.coords || position || {};
  const lat = finiteNumber(source.latitude ?? source.lat);
  const lng = finiteNumber(source.longitude ?? source.lng);
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    accuracy: finiteNumber(source.accuracy),
    altitude: finiteNumber(source.altitude),
    altitudeAccuracy: finiteNumber(source.altitudeAccuracy),
    speed: finiteNumber(source.speed),
    heading: finiteNumber(source.heading),
    capturedAt: finiteNumber(position?.timestamp ?? source.capturedAt ?? source.timestamp) ?? Date.now()
  };
}

export function appendOutdoorPosition(session, rawPosition, kind = 'running') {
  const sample = normalizeOutdoorPosition(rawPosition);
  if (!sample) return { ...session, gpsState: 'invalid' };

  const accuracy = sample.accuracy ?? 999;
  if (accuracy > 80) {
    return { ...session, gpsState: 'weak', lastAccuracyM: accuracy };
  }

  const previous = session?.lastSample || null;
  if (!previous) {
    return {
      ...session,
      lastSample: sample,
      lastAccuracyM: accuracy,
      currentSpeedMps: Math.max(0, sample.speed || 0),
      gpsState: accuracy <= 25 ? 'good' : 'fair',
      samples: [...(session?.samples || []), { ...sample, distanceM: Number(session?.distanceM || 0) }].slice(-240)
    };
  }

  const deltaSeconds = (sample.capturedAt - Number(previous.capturedAt || 0)) / 1000;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return session;

  const segmentM = distanceBetweenCoordinatesM(previous.lat, previous.lng, sample.lat, sample.lng);
  if (!Number.isFinite(segmentM)) return { ...session, gpsState: 'invalid' };

  const maximumSpeedMps = kind === 'trekking' ? 4.5 : 10;
  const uncertaintyM = Math.min(45, Math.max(8, (accuracy + Number(previous.accuracy || accuracy)) * 0.5));
  if (segmentM > maximumSpeedMps * deltaSeconds + uncertaintyM) {
    return { ...session, gpsState: 'unstable', lastAccuracyM: accuracy };
  }

  const movementThresholdM = Math.min(8, Math.max(2.2, (accuracy + Number(previous.accuracy || accuracy)) * 0.08));
  const acceptedMovementM = segmentM >= movementThresholdM ? segmentM : 0;
  const previousDistanceM = Math.max(0, Number(session?.distanceM || 0));
  const distanceM = previousDistanceM + acceptedMovementM;
  const measuredSpeed = sample.speed != null && sample.speed >= 0 && sample.speed <= maximumSpeedMps
    ? sample.speed
    : acceptedMovementM / deltaSeconds;
  const previousSpeed = Math.max(0, Number(session?.currentSpeedMps || 0));
  const currentSpeedMps = Math.max(0, previousSpeed * 0.62 + measuredSpeed * 0.38);

  let elevationGainM = Math.max(0, Number(session?.elevationGainM || 0));
  const hasReliableAltitude =
    sample.altitude != null &&
    previous.altitude != null &&
    (sample.altitudeAccuracy == null || sample.altitudeAccuracy <= 30) &&
    (previous.altitudeAccuracy == null || previous.altitudeAccuracy <= 30);
  if (acceptedMovementM > 0 && hasReliableAltitude) {
    const elevationDelta = sample.altitude - previous.altitude;
    if (elevationDelta >= 2.5 && elevationDelta <= 35) elevationGainM += elevationDelta;
  }

  return {
    ...session,
    lastSample: sample,
    lastAccuracyM: accuracy,
    distanceM,
    elevationGainM,
    currentSpeedMps,
    gpsState: accuracy <= 25 ? 'good' : 'fair',
    samples: [
      ...(session?.samples || []),
      { ...sample, speed: currentSpeedMps, distanceM }
    ].slice(-240)
  };
}

export function getOutdoorElapsedMs(session, nowMs = Date.now()) {
  const startedAtMs = Date.parse(session?.startedAt || '');
  if (!Number.isFinite(startedAtMs)) return 0;
  const completedAtMs = Date.parse(session?.completedAt || '');
  const pausedAtMs = Date.parse(session?.pausedAt || '');
  const endpoint = Number.isFinite(completedAtMs)
    ? completedAtMs
    : Number.isFinite(pausedAtMs) ? pausedAtMs : Number(nowMs);
  return Math.max(0, endpoint - startedAtMs - Math.max(0, Number(session?.pausedTotalMs || 0)));
}

export function estimateOutdoorSteps(distanceM, kind = 'running') {
  const strideM = kind === 'trekking' ? 0.68 : 0.78;
  return Math.max(0, Math.round((Number(distanceM) || 0) / strideM));
}

export function getOutdoorPaceSecondsPerKm(distanceM, elapsedMs) {
  const distanceKm = Math.max(0, Number(distanceM || 0)) / 1000;
  if (distanceKm < 0.01 || Number(elapsedMs) <= 0) return null;
  return Math.max(1, (Number(elapsedMs) / 1000) / distanceKm);
}

export function getCurrentPaceSecondsPerKm(speedMps) {
  const speed = Number(speedMps);
  if (!Number.isFinite(speed) || speed < 0.35) return null;
  return Math.max(1, 1000 / speed);
}

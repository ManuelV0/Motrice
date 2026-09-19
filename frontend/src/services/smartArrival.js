import { safeStorageGet, safeStorageSet } from '../utils/safeStorage.js';
import { getEventTiming } from '../utils/eventLifecycle.js';
import { validateEventLocationProof } from '../utils/eventLocationProof.js';
import { resolveParticipantOutcome } from '../utils/eventParticipationState.js';

const STORAGE_KEY = 'motrice.smart-arrival.v1';
const STATE_EVENT = 'motrice:smart-arrival-changed';
const LOCATION_MAX_AGE_MS = 60 * 1000;
const DEFAULT_SNOOZE_MS = 5 * 60 * 1000;

function readStore() {
  try {
    const parsed = JSON.parse(safeStorageGet(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store, eventId) {
  safeStorageSet(STORAGE_KEY, JSON.stringify(store));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STATE_EVENT, {
      detail: { eventId: String(eventId || '') }
    }));
  }
}

function eventKey(eventId) {
  return String(eventId || '').trim();
}

export function getSmartArrivalState(eventId) {
  const key = eventKey(eventId);
  if (!key) return { detectedAt: null, notifiedAt: null, snoozedUntil: null };
  const value = readStore()[key] || {};
  return {
    detectedAt: Number.isFinite(Number(value.detectedAt)) ? Number(value.detectedAt) : null,
    notifiedAt: Number.isFinite(Number(value.notifiedAt)) ? Number(value.notifiedAt) : null,
    snoozedUntil: Number.isFinite(Number(value.snoozedUntil)) ? Number(value.snoozedUntil) : null
  };
}

export function markSmartArrivalDetected(eventId, detectedAt = Date.now()) {
  const key = eventKey(eventId);
  if (!key) return getSmartArrivalState('');
  const store = readStore();
  store[key] = {
    ...(store[key] || {}),
    detectedAt: Number(detectedAt),
    notifiedAt: Number(detectedAt),
    snoozedUntil: null
  };
  writeStore(store, key);
  return getSmartArrivalState(key);
}

export function snoozeSmartArrival(eventId, nowMs = Date.now(), durationMs = DEFAULT_SNOOZE_MS) {
  const key = eventKey(eventId);
  if (!key) return getSmartArrivalState('');
  const store = readStore();
  store[key] = {
    ...(store[key] || {}),
    detectedAt: null,
    snoozedUntil: Number(nowMs) + Math.max(60 * 1000, Number(durationMs) || DEFAULT_SNOOZE_MS)
  };
  writeStore(store, key);
  return getSmartArrivalState(key);
}

export function clearSmartArrivalState(eventId) {
  const key = eventKey(eventId);
  if (!key) return;
  const store = readStore();
  delete store[key];
  writeStore(store, key);
}

export function isEventPresenceVerified(event) {
  const outcome = resolveParticipantOutcome(event);
  return ['checked_in', 'completed'].includes(outcome.id)
    || Boolean(event?.session_started_at || event?.checked_in_at);
}

export function getSmartArrivalEligibility(event, nowMs = Date.now()) {
  const timing = getEventTiming(event, nowMs);
  const relevant = Boolean(
    event?.created_by === 'me'
      || event?.is_going
      || event?.user_rsvp
  );

  if (!event?.id || event?.is_personal || !relevant || String(event?.status || '').toLowerCase() === 'cancelled') {
    return { eligible: false, phase: 'unavailable', timing };
  }
  if (isEventPresenceVerified(event)) {
    return { eligible: false, phase: 'verified', timing };
  }
  if (!Number.isFinite(Number(event?.lat)) || !Number.isFinite(Number(event?.lng))) {
    return { eligible: false, phase: 'missing_location', timing };
  }
  if (!Number.isFinite(timing.checkInOpensAtMs) || !Number.isFinite(timing.checkInClosesAtMs)) {
    return { eligible: false, phase: 'unavailable', timing };
  }
  if (Number(nowMs) < timing.checkInOpensAtMs) {
    return { eligible: false, phase: 'scheduled', timing };
  }
  if (Number(nowMs) > timing.checkInClosesAtMs) {
    return { eligible: false, phase: 'expired', timing };
  }
  return { eligible: true, phase: 'monitoring', timing };
}

export function evaluateSmartArrival({ event, location, nowMs = Date.now() } = {}) {
  const eligibility = getSmartArrivalEligibility(event, nowMs);
  if (!eligibility.eligible) return { detected: false, ...eligibility };

  const proof = validateEventLocationProof({
    location,
    eventLat: event?.lat,
    eventLng: event?.lng,
    radiusM: event?.geofence_radius_m,
    nowMs,
    maxAgeMs: LOCATION_MAX_AGE_MS
  });

  return {
    detected: proof.valid,
    phase: proof.valid ? 'arrived' : 'monitoring',
    eligibility,
    proof
  };
}

export { STATE_EVENT as SMART_ARRIVAL_STATE_EVENT };

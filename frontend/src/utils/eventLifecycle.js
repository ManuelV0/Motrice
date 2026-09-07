export const CHECK_IN_LEAD_MINUTES = 30;
export const DEFAULT_CHECK_IN_GRACE_MINUTES = 15;
export const MAX_CHECK_IN_GRACE_MINUTES = 30;

export const EVENT_LIFECYCLE_STATES = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CONFIRMED: 'confirmed',
  CHECKIN_OPEN: 'checkin_open',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived'
});

const KNOWN_LIFECYCLE_STATES = new Set(Object.values(EVENT_LIFECYCLE_STATES));
const ACTIVE_LIFECYCLE_STATES = new Set([
  EVENT_LIFECYCLE_STATES.PUBLISHED,
  EVENT_LIFECYCLE_STATES.CONFIRMED,
  EVENT_LIFECYCLE_STATES.CHECKIN_OPEN,
  EVENT_LIFECYCLE_STATES.ACTIVE
]);

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestamp(value, fallback = null) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function persistedLifecycleState(event = {}) {
  const value = String(event.lifecycle_state || '').trim().toLowerCase();
  return KNOWN_LIFECYCLE_STATES.has(value) ? value : null;
}

export function getEffectiveEventLifecycleState(event = {}, referenceTime = Date.now()) {
  const nowMs = referenceTime instanceof Date
    ? referenceTime.getTime()
    : finiteNumber(referenceTime, Date.now());
  const legacyStatus = String(event.status || 'scheduled').toLowerCase();
  const persistedState = persistedLifecycleState(event);
  const startsAtMs = timestamp(event.event_datetime || event.starts_at);
  const durationMinutes = Math.max(1, finiteNumber(event.duration_minutes, 120));
  const fallbackEndsAtMs = Number.isFinite(startsAtMs)
    ? startsAtMs + durationMinutes * 60 * 1000
    : null;
  const endsAtMs = timestamp(event.ends_at, fallbackEndsAtMs);
  const fallbackCheckInOpensAtMs = Number.isFinite(startsAtMs)
    ? startsAtMs - CHECK_IN_LEAD_MINUTES * 60 * 1000
    : null;
  const checkInOpensAtMs = timestamp(event.checkin_opens_at, fallbackCheckInOpensAtMs);

  if (persistedState === EVENT_LIFECYCLE_STATES.ARCHIVED) {
    return EVENT_LIFECYCLE_STATES.ARCHIVED;
  }
  if (legacyStatus === 'cancelled' || persistedState === EVENT_LIFECYCLE_STATES.CANCELLED) {
    return EVENT_LIFECYCLE_STATES.CANCELLED;
  }
  if (persistedState === EVENT_LIFECYCLE_STATES.DRAFT) {
    return EVENT_LIFECYCLE_STATES.DRAFT;
  }
  if (
    legacyStatus === 'completed' ||
    persistedState === EVENT_LIFECYCLE_STATES.COMPLETED ||
    (Number.isFinite(endsAtMs) && nowMs >= endsAtMs)
  ) {
    return EVENT_LIFECYCLE_STATES.COMPLETED;
  }
  if (
    persistedState === EVENT_LIFECYCLE_STATES.ACTIVE ||
    (Number.isFinite(startsAtMs) && nowMs >= startsAtMs)
  ) {
    return EVENT_LIFECYCLE_STATES.ACTIVE;
  }
  if (
    persistedState === EVENT_LIFECYCLE_STATES.CHECKIN_OPEN ||
    (Number.isFinite(checkInOpensAtMs) && nowMs >= checkInOpensAtMs)
  ) {
    return EVENT_LIFECYCLE_STATES.CHECKIN_OPEN;
  }
  if (persistedState === EVENT_LIFECYCLE_STATES.CONFIRMED) {
    return EVENT_LIFECYCLE_STATES.CONFIRMED;
  }
  return EVENT_LIFECYCLE_STATES.PUBLISHED;
}

export function getMaximumCheckInGraceMinutes(event = {}) {
  return event?.is_personal ? 0 : MAX_CHECK_IN_GRACE_MINUTES;
}

export function normalizeCheckInGraceMinutes(event = {}) {
  if (event?.is_personal) return 0;
  const requested = Math.max(
    DEFAULT_CHECK_IN_GRACE_MINUTES,
    Math.min(
      MAX_CHECK_IN_GRACE_MINUTES,
      finiteNumber(event.checkin_grace_minutes, DEFAULT_CHECK_IN_GRACE_MINUTES)
    )
  );
  return Math.trunc(requested);
}

export function getEventTiming(event = {}, referenceTime = Date.now()) {
  const startsAtMs = timestamp(event.event_datetime || event.starts_at);
  const nowMs = referenceTime instanceof Date
    ? referenceTime.getTime()
    : finiteNumber(referenceTime, Date.now());
  const lifecycleState = getEffectiveEventLifecycleState(event, nowMs);

  if (!Number.isFinite(startsAtMs)) {
    return {
      phase:
        lifecycleState === EVENT_LIFECYCLE_STATES.ARCHIVED
          ? 'archived'
          : lifecycleState === EVENT_LIFECYCLE_STATES.CANCELLED
            ? 'cancelled'
            : lifecycleState === EVENT_LIFECYCLE_STATES.COMPLETED
              ? 'completed'
              : lifecycleState === EVENT_LIFECYCLE_STATES.DRAFT
                ? 'draft'
                : 'unknown',
      lifecycleState,
      startsAtMs: null,
      checkInOpensAtMs: null,
      checkInClosesAtMs: null,
      extensionDeadlineMs: null,
      endsAtMs: null,
      latestJoinAtMs: null,
      checkInGraceMinutes: normalizeCheckInGraceMinutes(event),
      isCheckInOpen: false,
      canExtendCheckIn: false,
      hasEnded: [EVENT_LIFECYCLE_STATES.COMPLETED, EVENT_LIFECYCLE_STATES.ARCHIVED].includes(lifecycleState),
      canJoin: false,
      isMapVisible: false
    };
  }

  const durationMinutes = Math.max(1, finiteNumber(event.duration_minutes, 120));
  const checkInGraceMinutes = normalizeCheckInGraceMinutes(event);
  const checkInOpensAtMs = timestamp(
    event.checkin_opens_at,
    startsAtMs - CHECK_IN_LEAD_MINUTES * 60 * 1000
  );
  const checkInClosesAtMs = timestamp(
    event.checkin_closes_at,
    startsAtMs + checkInGraceMinutes * 60 * 1000
  );
  const endsAtMs = timestamp(
    event.ends_at,
    startsAtMs + durationMinutes * 60 * 1000
  );
  const minimumPresenceMinutes = Math.max(
    0,
    finiteNumber(event.minimum_presence_minutes, 45)
  );
  const latestJoinAtMs = endsAtMs - minimumPresenceMinutes * 60 * 1000;
  const hasEnded = [EVENT_LIFECYCLE_STATES.COMPLETED, EVENT_LIFECYCLE_STATES.ARCHIVED].includes(lifecycleState);
  const extensionDeadlineMs = startsAtMs + MAX_CHECK_IN_GRACE_MINUTES * 60 * 1000;

  let phase = 'scheduled';
  if (lifecycleState === EVENT_LIFECYCLE_STATES.ARCHIVED) phase = 'archived';
  else if (lifecycleState === EVENT_LIFECYCLE_STATES.CANCELLED) phase = 'cancelled';
  else if (hasEnded) phase = 'completed';
  else if (lifecycleState === EVENT_LIFECYCLE_STATES.DRAFT) phase = 'draft';
  else if (nowMs < checkInOpensAtMs) phase = 'scheduled';
  else if (nowMs < startsAtMs) phase = 'checkin_open';
  else if (nowMs <= checkInClosesAtMs) phase = 'live_checkin';
  else phase = 'in_progress';

  const isActiveLifecycle = ACTIVE_LIFECYCLE_STATES.has(lifecycleState);

  return {
    phase,
    lifecycleState,
    startsAtMs,
    checkInOpensAtMs,
    checkInClosesAtMs,
    extensionDeadlineMs,
    endsAtMs,
    latestJoinAtMs,
    checkInGraceMinutes,
    isCheckInOpen: isActiveLifecycle && nowMs >= checkInOpensAtMs && nowMs <= checkInClosesAtMs,
    canExtendCheckIn: isActiveLifecycle && nowMs >= checkInOpensAtMs && nowMs <= extensionDeadlineMs && !hasEnded,
    hasEnded,
    canJoin: isActiveLifecycle && nowMs < latestJoinAtMs,
    isMapVisible: isActiveLifecycle && nowMs < endsAtMs
  };
}

export function getEventPhaseLabel(timing) {
  switch (timing?.phase) {
    case 'checkin_open':
      return 'Check-in aperto';
    case 'live_checkin':
      return 'In corso · check-in aperto';
    case 'in_progress':
      return 'In corso · check-in chiuso';
    case 'completed':
      return 'Completato';
    case 'archived':
      return 'Archiviato';
    case 'cancelled':
      return 'Annullato';
    case 'draft':
      return 'Bozza';
    case 'scheduled':
      return 'Programmato';
    default:
      return 'Orario non disponibile';
  }
}

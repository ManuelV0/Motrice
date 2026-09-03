export const CHECK_IN_LEAD_MINUTES = 30;
export const DEFAULT_CHECK_IN_GRACE_MINUTES = 15;
export const MAX_CHECK_IN_GRACE_MINUTES = 30;

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getMaximumCheckInGraceMinutes(event = {}) {
  const durationMinutes = Math.max(0, finiteNumber(event.duration_minutes, 120));
  const minimumPresenceMinutes = Math.max(0, finiteNumber(event.minimum_presence_minutes, 45));
  return Math.trunc(Math.max(
    0,
    Math.min(MAX_CHECK_IN_GRACE_MINUTES, durationMinutes - minimumPresenceMinutes)
  ));
}

export function normalizeCheckInGraceMinutes(event = {}) {
  const requested = Math.max(
    0,
    Math.min(
      MAX_CHECK_IN_GRACE_MINUTES,
      finiteNumber(event.checkin_grace_minutes, DEFAULT_CHECK_IN_GRACE_MINUTES)
    )
  );
  return Math.trunc(Math.min(requested, getMaximumCheckInGraceMinutes(event)));
}

export function getEventTiming(event = {}, referenceTime = Date.now()) {
  const startsAtMs = Date.parse(event.event_datetime || event.starts_at || '');
  const nowMs = referenceTime instanceof Date
    ? referenceTime.getTime()
    : finiteNumber(referenceTime, Date.now());
  const status = String(event.status || 'scheduled').toLowerCase();

  if (!Number.isFinite(startsAtMs)) {
    return {
      phase: status === 'cancelled' ? 'cancelled' : status === 'completed' ? 'completed' : 'unknown',
      startsAtMs: null,
      checkInOpensAtMs: null,
      checkInClosesAtMs: null,
      extensionDeadlineMs: null,
      endsAtMs: null,
      checkInGraceMinutes: normalizeCheckInGraceMinutes(event),
      isCheckInOpen: false,
      canExtendCheckIn: false,
      hasEnded: status === 'completed',
      isMapVisible: false
    };
  }

  const durationMinutes = Math.max(1, finiteNumber(event.duration_minutes, 120));
  const checkInGraceMinutes = normalizeCheckInGraceMinutes(event);
  const checkInOpensAtMs = startsAtMs - CHECK_IN_LEAD_MINUTES * 60 * 1000;
  const checkInClosesAtMs = startsAtMs + checkInGraceMinutes * 60 * 1000;
  const endsAtMs = startsAtMs + durationMinutes * 60 * 1000;
  const hasEnded = status === 'completed' || nowMs >= endsAtMs;
  const extensionDeadlineMs = startsAtMs + MAX_CHECK_IN_GRACE_MINUTES * 60 * 1000;

  let phase = 'scheduled';
  if (status === 'cancelled') phase = 'cancelled';
  else if (hasEnded) phase = 'completed';
  else if (nowMs < checkInOpensAtMs) phase = 'scheduled';
  else if (nowMs < startsAtMs) phase = 'checkin_open';
  else if (nowMs <= checkInClosesAtMs) phase = 'live_checkin';
  else phase = 'in_progress';

  return {
    phase,
    startsAtMs,
    checkInOpensAtMs,
    checkInClosesAtMs,
    extensionDeadlineMs,
    endsAtMs,
    checkInGraceMinutes,
    isCheckInOpen: status === 'scheduled' && nowMs >= checkInOpensAtMs && nowMs <= checkInClosesAtMs,
    canExtendCheckIn: status === 'scheduled' && nowMs >= checkInOpensAtMs && nowMs <= extensionDeadlineMs && !hasEnded,
    hasEnded,
    isMapVisible: status === 'scheduled' && nowMs < endsAtMs
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
    case 'cancelled':
      return 'Annullato';
    case 'scheduled':
      return 'Programmato';
    default:
      return 'Orario non disponibile';
  }
}

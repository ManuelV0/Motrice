export const EVENT_DURATION_EDIT_CUTOFF_MINUTES = 120;
export const EVENT_LATE_TOLERANCE_OPTIONS = Object.freeze([15, 20, 30]);

function toTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function closestTolerance(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested)) return EVENT_LATE_TOLERANCE_OPTIONS[0];
  return EVENT_LATE_TOLERANCE_OPTIONS.reduce(
    (closest, option) => (
      Math.abs(option - requested) < Math.abs(closest - requested) ? option : closest
    ),
    EVENT_LATE_TOLERANCE_OPTIONS[0]
  );
}

export function getEventManagementPolicy(event = {}, referenceTime = Date.now()) {
  const nowMs = referenceTime instanceof Date ? referenceTime.getTime() : Number(referenceTime);
  const startsAtMs = toTimestamp(event.event_datetime || event.starts_at);
  const status = String(event.status || 'scheduled').toLowerCase();
  const lifecycleState = String(event.lifecycle_state || '').toLowerCase();
  const currentTolerance = closestTolerance(event.checkin_grace_minutes);
  const isPersonal = Boolean(event.is_personal);
  const isActive = status === 'scheduled' && !['cancelled', 'completed', 'archived'].includes(lifecycleState);
  const hasValidTiming = Number.isFinite(nowMs) && Number.isFinite(startsAtMs);
  const hasStarted = hasValidTiming && nowMs >= startsAtMs;
  const durationCutoffMs = hasValidTiming
    ? startsAtMs - EVENT_DURATION_EDIT_CUTOFF_MINUTES * 60 * 1000
    : null;
  const toleranceDeadlineMs = hasValidTiming ? startsAtMs + 30 * 60 * 1000 : null;

  const canEditDescription = Boolean(isActive && hasValidTiming && nowMs < startsAtMs);
  const canEditDuration = Boolean(isActive && hasValidTiming && nowMs <= durationCutoffMs);
  const canEditToleranceBeforeStart = Boolean(!isPersonal && isActive && hasValidTiming && nowMs < startsAtMs);
  const canIncreaseToleranceAfterStart = Boolean(
    !isPersonal &&
    isActive &&
    hasValidTiming &&
    hasStarted &&
    nowMs <= toleranceDeadlineMs &&
    currentTolerance < EVENT_LATE_TOLERANCE_OPTIONS.at(-1)
  );
  const canEditTolerance = canEditToleranceBeforeStart || canIncreaseToleranceAfterStart;
  const toleranceOptions = canIncreaseToleranceAfterStart
    ? EVENT_LATE_TOLERANCE_OPTIONS.filter((option) => option > currentTolerance)
    : EVENT_LATE_TOLERANCE_OPTIONS;

  return {
    startsAtMs,
    durationCutoffMs,
    toleranceDeadlineMs,
    currentTolerance,
    hasStarted,
    canEditDescription,
    canEditDuration,
    canEditTolerance,
    canIncreaseToleranceAfterStart,
    toleranceOptions,
    canEditAnything: canEditDescription || canEditDuration || canEditTolerance
  };
}


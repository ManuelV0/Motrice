export const EVENT_DURATION_EDIT_CUTOFF_MINUTES = 120;
export const EVENT_DURATION_EXTENSION_STEP_MINUTES = 15;
export const EVENT_DURATION_MAX_EXTENSION_MINUTES = 30;
export const EVENT_CAPACITY_MAX_EXTENSION = 3;
export const EVENT_LATE_TOLERANCE_OPTIONS = Object.freeze([15, 20, 30]);

export function getDurationExtensionOptions(currentDuration) {
  const duration = Math.max(15, Math.round(Number(currentDuration) || 0));
  return [
    duration,
    duration + EVENT_DURATION_EXTENSION_STEP_MINUTES,
    duration + EVENT_DURATION_MAX_EXTENSION_MINUTES
  ].filter((value) => value <= 360);
}

export function getCapacityExtensionOptions(currentCapacity) {
  const capacity = Math.max(2, Math.round(Number(currentCapacity) || 0));
  return Array.from(
    { length: EVENT_CAPACITY_MAX_EXTENSION + 1 },
    (_, index) => capacity + index
  );
}

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
  const eventEndsAtMs = hasValidTiming
    ? startsAtMs + Math.max(15, Number(event.duration_minutes || 120)) * 60 * 1000
    : null;

  const canEditDescription = Boolean(isActive && hasValidTiming && nowMs < startsAtMs);
  const canEditDuration = Boolean(
    isActive &&
    hasValidTiming &&
    nowMs <= durationCutoffMs &&
    Number(event.duration_minutes || 120) < 360
  );
  const canEditParticipantSettings = Boolean(isActive && hasValidTiming && nowMs <= durationCutoffMs);
  const canEditWorkoutPlan = false;
  const canEditMedia = false;
  const canSendOrganizerAlert = Boolean(isActive && hasValidTiming && nowMs < eventEndsAtMs);
  const canEditToleranceBeforeStart = Boolean(
    !isPersonal &&
    isActive &&
    hasValidTiming &&
    nowMs < startsAtMs &&
    currentTolerance < EVENT_LATE_TOLERANCE_OPTIONS.at(-1)
  );
  const canIncreaseToleranceAfterStart = Boolean(
    !isPersonal &&
    isActive &&
    hasValidTiming &&
    hasStarted &&
    nowMs <= toleranceDeadlineMs &&
    currentTolerance < EVENT_LATE_TOLERANCE_OPTIONS.at(-1)
  );
  const canEditTolerance = canEditToleranceBeforeStart || canIncreaseToleranceAfterStart;
  const toleranceOptions = EVENT_LATE_TOLERANCE_OPTIONS.filter((option) => option >= currentTolerance);

  return {
    startsAtMs,
    durationCutoffMs,
    toleranceDeadlineMs,
    eventEndsAtMs,
    currentTolerance,
    hasStarted,
    canEditDescription,
    canEditDuration,
    canEditParticipantSettings,
    canEditWorkoutPlan,
    canEditMedia,
    canSendOrganizerAlert,
    canEditTolerance,
    canIncreaseToleranceAfterStart,
    toleranceOptions,
    canEditAnything:
      canEditDescription ||
      canEditDuration ||
      canEditParticipantSettings ||
      canEditWorkoutPlan ||
      canEditMedia ||
      canSendOrganizerAlert ||
      canEditTolerance
  };
}

export const GROUP_EVENT_SYSTEM_RULES = Object.freeze({
  verificationMode: 'both',
  geofenceRadiusM: 250,
  completionXp: 50,
  reviewBonusXp: 25
});

export const PERSONAL_EVENT_SYSTEM_RULES = Object.freeze({
  verificationMode: 'geo',
  geofenceRadiusM: 250,
  completionXp: 5,
  reviewBonusXp: 0
});

export const GROUP_CHECK_IN_GRACE_MINUTES = Object.freeze([15, 20, 30]);

function normalizedDuration(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 120;
  return Math.min(360, Math.max(15, Math.round(parsed)));
}

export function getAutomaticMinimumPresenceMinutes(durationMinutes, { isPersonal = false } = {}) {
  const duration = normalizedDuration(durationMinutes);
  if (isPersonal) return Math.min(15, duration);
  return Math.min(duration, Math.max(15, Math.round(duration * (2 / 3))));
}

export function getSystemEventRules({
  durationMinutes,
  isPersonal = false,
  checkInGraceMinutes = 15
} = {}) {
  const duration = normalizedDuration(durationMinutes);
  const minimumPresenceMinutes = getAutomaticMinimumPresenceMinutes(duration, { isPersonal });
  const selectedRules = isPersonal ? PERSONAL_EVENT_SYSTEM_RULES : GROUP_EVENT_SYSTEM_RULES;
  const requestedGraceMinutes = Number.isFinite(Number(checkInGraceMinutes))
    ? Math.round(Number(checkInGraceMinutes))
    : 15;
  const normalizedGraceMinutes = GROUP_CHECK_IN_GRACE_MINUTES.reduce(
    (closest, option) => (
      Math.abs(option - requestedGraceMinutes) < Math.abs(closest - requestedGraceMinutes)
        ? option
        : closest
    ),
    GROUP_CHECK_IN_GRACE_MINUTES[0]
  );

  return {
    minimumPresenceMinutes,
    verificationMode: selectedRules.verificationMode,
    geofenceRadiusM: selectedRules.geofenceRadiusM,
    checkInGraceMinutes: isPersonal
      ? 0
      : normalizedGraceMinutes,
    completionXp: selectedRules.completionXp,
    reviewBonusXp: selectedRules.reviewBonusXp
  };
}

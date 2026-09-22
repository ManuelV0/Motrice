export const WORKOUT_COMPLETION_RATIO = 2 / 3;
export const MINIMUM_SET_INTERVAL_SECONDS = 20;

export function normalizeWorkoutDurationMinutes(value, fallback = 60) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.max(1, Math.round(Number(fallback) || 60));
  return Math.max(1, Math.min(360, Math.round(parsed)));
}

export function getMinimumWorkoutSeconds(durationMinutes) {
  const plannedSeconds = normalizeWorkoutDurationMinutes(durationMinutes) * 60;
  return Math.ceil(plannedSeconds * WORKOUT_COMPLETION_RATIO);
}

export function getWorkoutCompletionGate({ startedAt, durationMinutes, now = Date.now() }) {
  const plannedSeconds = normalizeWorkoutDurationMinutes(durationMinutes) * 60;
  const requiredSeconds = getMinimumWorkoutSeconds(durationMinutes);
  const startedAtMs = Date.parse(startedAt || '');
  const nowMs = Number(now);
  const elapsedSeconds = Number.isFinite(startedAtMs) && Number.isFinite(nowMs)
    ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
    : 0;
  const remainingSeconds = Math.max(0, requiredSeconds - elapsedSeconds);
  return {
    plannedSeconds,
    requiredSeconds,
    elapsedSeconds,
    remainingSeconds,
    reached: remainingSeconds === 0,
    timePercent: plannedSeconds ? Math.min(100, Math.floor((elapsedSeconds / plannedSeconds) * 100)) : 0
  };
}

export function getSetCadenceRemaining(lastSetCompletedAt, now = Date.now()) {
  const completedAtMs = Date.parse(lastSetCompletedAt || '');
  const nowMs = Number(now);
  if (!Number.isFinite(completedAtMs) || !Number.isFinite(nowMs)) return 0;
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - completedAtMs) / 1000));
  return Math.max(0, MINIMUM_SET_INTERVAL_SECONDS - elapsedSeconds);
}

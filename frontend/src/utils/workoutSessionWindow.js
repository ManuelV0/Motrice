export const WORKOUT_SESSION_WINDOW_SECONDS = 3 * 60 * 60;
export const WORKOUT_SESSION_WINDOW_MS = WORKOUT_SESSION_WINDOW_SECONDS * 1000;

function timestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

export function getWorkoutSessionWindow(startedAt, now = Date.now()) {
  const startedAtMs = timestamp(startedAt);
  const nowMs = timestamp(now);
  if (startedAtMs === null || nowMs === null) {
    return {
      valid: false,
      expired: false,
      startedAtMs,
      expiresAtMs: null,
      remainingSeconds: 0
    };
  }

  const expiresAtMs = startedAtMs + WORKOUT_SESSION_WINDOW_MS;
  const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
  return {
    valid: true,
    expired: nowMs >= expiresAtMs,
    startedAtMs,
    expiresAtMs,
    remainingSeconds
  };
}

export function isWorkoutSessionExpired(startedAt, now = Date.now()) {
  const window = getWorkoutSessionWindow(startedAt, now);
  return window.valid && window.expired;
}

import { getAuthSession } from '../../../services/authSession';
import { safeStorageGet, safeStorageSet } from '../../../utils/safeStorage';

const STORAGE_PREFIX = 'motrice_event_workout_session_v1';

function sessionKey(eventId) {
  const auth = getAuthSession();
  const identity = auth.authUserId || auth.userId || auth.email || 'guest';
  return `${STORAGE_PREFIX}:${identity}:${String(eventId)}`;
}

export function loadWorkoutSession(eventId) {
  try {
    const raw = safeStorageGet(sessionKey(eventId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveWorkoutSession(eventId, session) {
  safeStorageSet(sessionKey(eventId), JSON.stringify(session));
  return session;
}

export function normalizeWorkoutExercises(exercises = []) {
  return (Array.isArray(exercises) ? exercises : []).map((exercise, index) => ({
    id: String(exercise.instanceId || exercise.id || `exercise-${index + 1}`),
    name: String(exercise.name || exercise.shortName || `Esercizio ${index + 1}`),
    sets: Math.max(1, Number(exercise.sets) || 1),
    reps: String(exercise.reps || '10'),
    weight: Math.max(0, Number(exercise.weight) || 0),
    rir: Math.max(0, Number(exercise.rir) || 0),
    recovery: Math.max(0, Number(exercise.recovery) || 0),
    equipment: String(exercise.equipment || '').trim()
  }));
}

export function createWorkoutSession(eventId, exercises, remote = {}) {
  const previous = loadWorkoutSession(eventId);
  const normalized = normalizeWorkoutExercises(exercises);
  const validExerciseIds = new Set(normalized.map((exercise) => exercise.id));
  const completedSets = Object.fromEntries(
    Object.entries(previous?.completedSets || {})
      .filter(([exerciseId]) => validExerciseIds.has(exerciseId))
      .map(([exerciseId, value]) => [exerciseId, Math.max(0, Number(value) || 0)])
  );

  return saveWorkoutSession(eventId, {
    eventId: String(eventId),
    startedAt: previous?.startedAt || remote?.started_at || new Date().toISOString(),
    completedAt: previous?.completedAt || remote?.completed_at || null,
    completedSets,
    currentExerciseId: previous?.currentExerciseId || normalized[0]?.id || null,
    sixtyPercentAwarded: Boolean(previous?.sixtyPercentAwarded || remote?.mot_sixty_awarded),
    completionAwarded: Boolean(previous?.completionAwarded || remote?.xp_completion_awarded),
    reviewSubmitted: Boolean(previous?.reviewSubmitted || remote?.review_submitted)
  });
}

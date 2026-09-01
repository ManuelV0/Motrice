import { getAuthSession } from '../../../services/authSession';
import { safeStorageGet, safeStorageSet } from '../../../utils/safeStorage';

const STORAGE_PREFIX = 'motrice_event_workout_session_v1';
const HISTORY_PREFIX = 'motrice_workout_exercise_history_v1';

function storageIdentity() {
  const auth = getAuthSession();
  return auth.authUserId || auth.userId || auth.email || 'guest';
}

function sessionKey(eventId) {
  return `${STORAGE_PREFIX}:${storageIdentity()}:${String(eventId)}`;
}

function historyKey() {
  return `${HISTORY_PREFIX}:${storageIdentity()}`;
}

function normalizeLoad(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 2) / 2) : 0;
}

function normalizeReps(value) {
  const match = String(value ?? '').match(/\d+(?:[.,]\d+)?/);
  return match ? Math.max(0, Number(match[0].replace(',', '.')) || 0) : 0;
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

export function loadWorkoutExerciseHistory() {
  try {
    const raw = safeStorageGet(historyKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordWorkoutSet({ eventId, exercise, setNumber, weightKg, reps }) {
  const exerciseName = String(exercise?.name || 'Esercizio').trim();
  const exerciseKey = exerciseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || String(exercise?.id || 'exercise');
  const entryKey = `${String(eventId)}:${String(exercise?.id || exerciseKey)}:${Math.max(1, Number(setNumber) || 1)}`;
  const nextEntry = {
    id: entryKey,
    eventId: String(eventId),
    exerciseId: String(exercise?.id || exerciseKey),
    exerciseKey,
    exerciseName,
    setNumber: Math.max(1, Number(setNumber) || 1),
    weightKg: normalizeLoad(weightKg),
    reps: normalizeReps(reps),
    completedAt: new Date().toISOString()
  };
  const previous = loadWorkoutExerciseHistory();
  const next = [
    ...previous.filter((entry) => String(entry?.id || '') !== entryKey),
    nextEntry
  ]
    .sort((left, right) => Date.parse(left?.completedAt || 0) - Date.parse(right?.completedAt || 0))
    .slice(-1500);
  safeStorageSet(historyKey(), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('motrice-workout-history-changed'));
  return nextEntry;
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
  const exerciseLoads = Object.fromEntries(normalized.map((exercise) => [
    exercise.id,
    normalizeLoad(previous?.exerciseLoads?.[exercise.id] ?? exercise.weight)
  ]));
  const completedSetLoads = Object.fromEntries(normalized.map((exercise) => {
    const savedLoads = Array.isArray(previous?.completedSetLoads?.[exercise.id])
      ? previous.completedSetLoads[exercise.id]
      : [];
    return [exercise.id, savedLoads.slice(0, exercise.sets).map(normalizeLoad)];
  }));

  return saveWorkoutSession(eventId, {
    eventId: String(eventId),
    startedAt: previous?.startedAt || remote?.started_at || new Date().toISOString(),
    completedAt: previous?.completedAt || remote?.completed_at || null,
    completedSets,
    exerciseLoads,
    completedSetLoads,
    currentExerciseId: previous?.currentExerciseId || normalized[0]?.id || null,
    sixtyPercentAwarded: Boolean(previous?.sixtyPercentAwarded || remote?.mot_sixty_awarded),
    completionAwarded: Boolean(previous?.completionAwarded || remote?.xp_completion_awarded),
    reviewSubmitted: Boolean(previous?.reviewSubmitted || remote?.review_submitted)
  });
}

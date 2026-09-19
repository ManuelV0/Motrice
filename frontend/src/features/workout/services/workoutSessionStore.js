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

export function mergeWorkoutExerciseHistory(remoteHistory = []) {
  const previous = loadWorkoutExerciseHistory();
  const merged = new Map(previous.map((entry) => [String(entry?.id || ''), entry]));
  (Array.isArray(remoteHistory) ? remoteHistory : []).forEach((entry) => {
    const eventId = String(entry?.eventId || entry?.event_id || '');
    const exerciseId = String(entry?.exerciseId || entry?.exercise_id || entry?.exerciseKey || entry?.exercise_key || 'exercise');
    const setNumber = Math.max(1, Number(entry?.setNumber || entry?.set_number) || 1);
    if (!eventId) return;
    const id = String(entry?.id || `${eventId}:${exerciseId}:${setNumber}`);
    merged.set(id, {
      id,
      eventId,
      exerciseId,
      exerciseKey: String(entry?.exerciseKey || entry?.exercise_key || exerciseId),
      exerciseName: String(entry?.exerciseName || entry?.exercise_name || 'Esercizio'),
      setNumber,
      weightKg: normalizeLoad(entry?.weightKg ?? entry?.weight_kg),
      reps: normalizeReps(entry?.reps),
      rir: Math.max(0, Math.min(10, Number(entry?.rir) || 0)),
      equipment: String(entry?.equipment || '').trim(),
      completedAt: entry?.completedAt || entry?.completed_at || new Date().toISOString()
    });
  });
  const next = [...merged.values()]
    .filter((entry) => entry?.id)
    .sort((left, right) => Date.parse(left?.completedAt || 0) - Date.parse(right?.completedAt || 0))
    .slice(-1500);
  safeStorageSet(historyKey(), JSON.stringify(next));
  return next;
}

export function recordWorkoutSet({ eventId, exercise, setNumber, weightKg, reps, rir }) {
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
    rir: Math.max(0, Math.min(10, Number(rir) || 0)),
    equipment: String(exercise?.equipment || '').trim(),
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

export function removeWorkoutSet({ eventId, exerciseId, setNumber }) {
  const targetEventId = String(eventId);
  const targetExerciseId = String(exerciseId);
  const targetSetNumber = Math.max(1, Number(setNumber) || 1);
  const previous = loadWorkoutExerciseHistory();
  const next = previous.filter((entry) => !(
    String(entry?.eventId || '') === targetEventId &&
    String(entry?.exerciseId || '') === targetExerciseId &&
    Number(entry?.setNumber || 0) === targetSetNumber
  ));
  safeStorageSet(historyKey(), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('motrice-workout-history-changed'));
  return next;
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
  const exerciseOverrides = Object.fromEntries(normalized.map((exercise) => {
    const saved = previous?.exerciseOverrides?.[exercise.id] || {};
    const completed = Math.max(0, Number(completedSets[exercise.id]) || 0);
    return [exercise.id, {
      sets: Math.max(1, completed, Math.round(Number(saved.sets) || exercise.sets)),
      reps: String(saved.reps || exercise.reps).trim() || exercise.reps,
      rir: Math.max(0, Math.min(10, Math.round(Number(saved.rir ?? exercise.rir) || 0))),
      recovery: Math.max(0, Math.min(900, Math.round(Number(saved.recovery ?? exercise.recovery) || 0)))
    }];
  }));
  const completedSetLoads = Object.fromEntries(normalized.map((exercise) => {
    const savedLoads = Array.isArray(previous?.completedSetLoads?.[exercise.id])
      ? previous.completedSetLoads[exercise.id]
      : [];
    const effectiveSets = exerciseOverrides[exercise.id]?.sets || exercise.sets;
    return [exercise.id, savedLoads.slice(0, effectiveSets).map(normalizeLoad)];
  }));

  return saveWorkoutSession(eventId, {
    eventId: String(eventId),
    startedAt: previous?.startedAt || remote?.started_at || new Date().toISOString(),
    completedAt: previous?.completedAt || remote?.completed_at || null,
    completedSets,
    exerciseLoads,
    completedSetLoads,
    exerciseOverrides,
    currentExerciseId: previous?.currentExerciseId || normalized[0]?.id || null,
    sixtyPercentAwarded: Boolean(previous?.sixtyPercentAwarded || remote?.mot_sixty_awarded),
    completionAwarded: Boolean(previous?.completionAwarded || remote?.xp_completion_awarded),
    selfRating: Math.max(0, Math.min(5, Math.round(Number(previous?.selfRating) || 0))),
    reviewSubmitted: Boolean(previous?.reviewSubmitted || remote?.review_submitted),
    planUpdateAppliedAt: previous?.planUpdateAppliedAt || null,
    planUpdatePlanId: previous?.planUpdatePlanId || null
  });
}

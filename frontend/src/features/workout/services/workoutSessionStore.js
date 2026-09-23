import { getAuthSession } from '../../../services/authSession';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../../../utils/safeStorage';
import { isWorkoutSessionExpired } from '../../../utils/workoutSessionWindow';

const STORAGE_PREFIX = 'motrice_event_workout_session_v1';
const HISTORY_PREFIX = 'motrice_workout_exercise_history_v1';
const ACTIVE_PREFIX = 'motrice_active_workout_v1';
export const ACTIVE_WORKOUT_SESSION_EVENT = 'motrice-active-workout-session-changed';

const EMPTY_REST_TIMER = {
  exerciseId: '',
  duration: 0,
  remaining: 0,
  running: false,
  finished: false,
  endAt: null
};

function storageIdentity() {
  const auth = getAuthSession();
  return auth.authUserId || auth.userId || auth.email || 'guest';
}

function sessionKey(eventId) {
  return `${STORAGE_PREFIX}:${storageIdentity()}:${String(eventId)}`;
}

function activeSessionKey() {
  return `${ACTIVE_PREFIX}:${storageIdentity()}`;
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

function emitActiveWorkoutChanged(eventId = '') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACTIVE_WORKOUT_SESSION_EVENT, {
    detail: { eventId: String(eventId || '') }
  }));
}

function clearActivePointer(eventId = '') {
  try {
    const raw = safeStorageGet(activeSessionKey());
    const current = raw ? JSON.parse(raw) : null;
    if (eventId && String(current?.eventId || '') !== String(eventId)) return false;
  } catch {
    // Un puntatore non leggibile viene comunque eliminato.
  }
  safeStorageRemove(activeSessionKey());
  emitActiveWorkoutChanged(eventId);
  return true;
}

export function clearActiveWorkoutSession(eventId = '') {
  return clearActivePointer(eventId);
}

export function getActiveWorkoutSession(now = Date.now()) {
  try {
    const raw = safeStorageGet(activeSessionKey());
    const pointer = raw ? JSON.parse(raw) : null;
    const eventId = String(pointer?.eventId || '');
    if (!eventId) return null;
    const session = loadWorkoutSession(eventId);
    const startedAt = session?.startedAt || pointer?.startedAt || '';
    if (!session?.startedAt || session?.completedAt || isWorkoutSessionExpired(startedAt, now)) {
      clearActivePointer(eventId);
      return null;
    }
    return {
      ...pointer,
      eventId,
      startedAt: session.startedAt,
      session
    };
  } catch {
    clearActivePointer();
    return null;
  }
}

export function saveWorkoutSession(eventId, session) {
  safeStorageSet(sessionKey(eventId), JSON.stringify(session));
  const normalizedEventId = String(eventId);
  if (session?.startedAt && !session?.completedAt && !isWorkoutSessionExpired(session.startedAt)) {
    safeStorageSet(activeSessionKey(), JSON.stringify({
      eventId: normalizedEventId,
      startedAt: session.startedAt,
      eventTitle: String(session.eventTitle || ''),
      workoutTitle: String(session.workoutTitle || ''),
      updatedAt: new Date().toISOString()
    }));
    emitActiveWorkoutChanged(normalizedEventId);
  } else if (session?.completedAt || isWorkoutSessionExpired(session?.startedAt)) {
    clearActivePointer(normalizedEventId);
  }
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

function restoreRestTimer(value) {
  const exerciseId = String(value?.exerciseId || '');
  if (!exerciseId) return { ...EMPTY_REST_TIMER };
  const duration = Math.max(0, Math.round(Number(value?.duration) || 0));
  const endAt = Number.isFinite(Number(value?.endAt)) ? Number(value.endAt) : null;
  const running = Boolean(value?.running && endAt);
  const remaining = running
    ? Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
    : Math.max(0, Math.round(Number(value?.remaining) || 0));
  if (remaining <= 0) return { ...EMPTY_REST_TIMER };
  return {
    exerciseId,
    duration: Math.max(duration, remaining),
    remaining,
    running,
    finished: false,
    endAt: running ? endAt : null
  };
}

export function createWorkoutSession(eventId, exercises, remote = {}, metadata = {}) {
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
  const completedSetTimes = Object.fromEntries(normalized.map((exercise) => {
    const savedTimes = Array.isArray(previous?.completedSetTimes?.[exercise.id])
      ? previous.completedSetTimes[exercise.id]
      : [];
    const effectiveSets = exerciseOverrides[exercise.id]?.sets || exercise.sets;
    return [exercise.id, savedTimes.slice(0, effectiveSets).map((value) => {
      const parsed = Date.parse(value || '');
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
    })];
  }));

  return saveWorkoutSession(eventId, {
    eventId: String(eventId),
    eventTitle: String(metadata.eventTitle || previous?.eventTitle || ''),
    workoutTitle: String(metadata.workoutTitle || previous?.workoutTitle || ''),
    exerciseNames: Object.fromEntries(normalized.map((exercise) => [exercise.id, exercise.name])),
    startedAt: remote?.started_at || previous?.startedAt || new Date().toISOString(),
    completedAt: remote?.completed_at || previous?.completedAt || null,
    completedSets,
    exerciseLoads,
    completedSetLoads,
    completedSetTimes,
    exerciseOverrides,
    currentExerciseId: previous?.currentExerciseId || normalized[0]?.id || null,
    lastSetCompletedAt: previous?.lastSetCompletedAt || null,
    sixtyPercentAwarded: Boolean(previous?.sixtyPercentAwarded || remote?.mot_sixty_awarded),
    completionAwarded: Boolean(previous?.completionAwarded || remote?.xp_completion_awarded),
    selfRating: Math.max(0, Math.min(5, Math.round(Number(previous?.selfRating) || 0))),
    reviewSubmitted: Boolean(previous?.reviewSubmitted || remote?.review_submitted),
    planUpdateAppliedAt: previous?.planUpdateAppliedAt || null,
    planUpdatePlanId: previous?.planUpdatePlanId || null,
    restTimer: restoreRestTimer(previous?.restTimer)
  });
}

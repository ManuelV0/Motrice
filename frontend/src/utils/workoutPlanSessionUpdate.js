const UPDATE_FIELDS = [
  { id: 'sets', label: 'Serie' },
  { id: 'reps', label: 'Ripetizioni' },
  { id: 'weight', label: 'Carico' },
  { id: 'rir', label: 'RIR' },
  { id: 'recovery', label: 'Recupero' }
];

function safeNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function exerciseIdentity(exercise) {
  return String(exercise?.instanceId || exercise?.id || '').trim();
}

function normalizeField(field, value, fallback) {
  if (field === 'reps') return String(value ?? fallback ?? '').trim();
  if (field === 'sets') return Math.max(1, Math.min(20, Math.round(safeNumber(value, fallback)) || 1));
  if (field === 'weight') return Math.max(0, Math.min(1000, safeNumber(value, fallback)));
  if (field === 'rir') return Math.max(0, Math.min(10, Math.round(safeNumber(value, fallback))));
  if (field === 'recovery') return Math.max(0, Math.min(900, Math.round(safeNumber(value, fallback))));
  return value;
}

function sameValue(field, left, right) {
  if (field === 'reps') return String(left) === String(right);
  return Math.abs(Number(left) - Number(right)) < 0.001;
}

function findPlanExerciseIndex(planExercises, liveExercise, usedIndexes) {
  const liveIdentity = exerciseIdentity(liveExercise);
  if (liveIdentity) {
    const exactIndex = planExercises.findIndex((exercise, index) => (
      !usedIndexes.has(index) && exerciseIdentity(exercise) === liveIdentity
    ));
    if (exactIndex >= 0) return exactIndex;
  }

  const liveName = normalizedName(liveExercise?.name);
  if (!liveName) return -1;
  return planExercises.findIndex((exercise, index) => (
    !usedIndexes.has(index) && normalizedName(exercise?.name) === liveName
  ));
}

export function buildWorkoutPlanUpdatePreview({ plan, liveExercises, exerciseLoads } = {}) {
  const planExercises = Array.isArray(plan?.exercises) ? plan.exercises : [];
  const currentExercises = Array.isArray(liveExercises) ? liveExercises : [];
  const loads = exerciseLoads && typeof exerciseLoads === 'object' ? exerciseLoads : {};
  const usedIndexes = new Set();

  return currentExercises.reduce((preview, liveExercise) => {
    const planExerciseIndex = findPlanExerciseIndex(planExercises, liveExercise, usedIndexes);
    if (planExerciseIndex < 0) return preview;
    usedIndexes.add(planExerciseIndex);

    const planExercise = planExercises[planExerciseIndex];
    const values = {
      sets: normalizeField('sets', liveExercise.sets, planExercise.sets),
      reps: normalizeField('reps', liveExercise.reps, planExercise.reps),
      weight: normalizeField(
        'weight',
        Object.prototype.hasOwnProperty.call(loads, liveExercise.id)
          ? loads[liveExercise.id]
          : liveExercise.weight,
        planExercise.weight
      ),
      rir: normalizeField('rir', liveExercise.rir, planExercise.rir),
      recovery: normalizeField('recovery', liveExercise.recovery, planExercise.recovery)
    };
    const changes = UPDATE_FIELDS.reduce((items, field) => {
      const before = normalizeField(field.id, planExercise[field.id], values[field.id]);
      const after = values[field.id];
      if (!sameValue(field.id, before, after)) {
        items.push({ field: field.id, label: field.label, before, after });
      }
      return items;
    }, []);

    if (changes.length) {
      preview.push({
        planExerciseIndex,
        exerciseId: exerciseIdentity(planExercise) || exerciseIdentity(liveExercise),
        name: String(planExercise?.name || liveExercise?.name || 'Esercizio'),
        values,
        changes
      });
    }
    return preview;
  }, []);
}

export function findOwnedLinkedWorkoutPlan(plans, linkedRemoteId) {
  const targetRemoteId = String(linkedRemoteId || '').trim();
  if (!targetRemoteId) return null;
  return (Array.isArray(plans) ? plans : []).find(
    (plan) => String(plan?.remoteId || '').trim() === targetRemoteId
  ) || null;
}

export function applyWorkoutPlanSessionUpdate(plan, preview, updatedAt = new Date().toISOString()) {
  const changesByIndex = new Map(
    (Array.isArray(preview) ? preview : [])
      .filter((item) => Number.isInteger(item?.planExerciseIndex) && item.planExerciseIndex >= 0)
      .map((item) => [item.planExerciseIndex, item.values])
  );

  return {
    ...plan,
    exercises: (Array.isArray(plan?.exercises) ? plan.exercises : []).map((exercise, index) => {
      const values = changesByIndex.get(index);
      return values ? { ...exercise, ...values } : exercise;
    }),
    updatedAt
  };
}

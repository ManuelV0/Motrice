import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT_FILTERS,
  PERSONAL_EXERCISE_LIBRARY,
  getExerciseSearchText,
  getLatestExercisePrescription
} from '../features/coach/data/personalWorkoutCatalog.js';

test('personal workout catalog offers a broad but manageable exercise library', () => {
  assert.ok(PERSONAL_EXERCISE_LIBRARY.length >= 80);
  assert.ok(PERSONAL_EXERCISE_LIBRARY.length <= 100);
});

test('personal workout catalog has unique ids and valid categories', () => {
  const validCategories = new Set(EXERCISE_CATEGORIES.map((category) => category.id));
  const ids = PERSONAL_EXERCISE_LIBRARY.map((exercise) => exercise.id);

  assert.equal(new Set(ids).size, ids.length);
  PERSONAL_EXERCISE_LIBRARY.forEach((exercise) => {
    assert.ok(validCategories.has(exercise.category), `${exercise.id} has an unknown category`);
    assert.ok(EXERCISE_EQUIPMENT_FILTERS.includes(exercise.equipment), `${exercise.id} has unknown equipment`);
    assert.ok(Number.isInteger(exercise.sets) && exercise.sets > 0, `${exercise.id} has invalid sets`);
    assert.ok(String(exercise.reps).trim(), `${exercise.id} has invalid reps`);
    assert.ok(Number.isFinite(exercise.weight) && exercise.weight >= 0, `${exercise.id} has invalid weight`);
    assert.ok(Number.isFinite(exercise.recovery) && exercise.recovery >= 0, `${exercise.id} has invalid recovery`);
  });
});

test('exercise search text contains Italian and common alternative names', () => {
  const pushUp = PERSONAL_EXERCISE_LIBRARY.find((exercise) => exercise.id === 'push-up');
  const calfRaise = PERSONAL_EXERCISE_LIBRARY.find((exercise) => exercise.id === 'standing-calf-raise');

  assert.match(getExerciseSearchText(pushUp).toLowerCase(), /flessioni/);
  assert.match(getExerciseSearchText(calfRaise).toLowerCase(), /polpacci/);
});

test('latest workout values are proposed for the matching catalog exercise', () => {
  const benchPress = PERSONAL_EXERCISE_LIBRARY.find((exercise) => exercise.id === 'bench-press');
  const suggestion = getLatestExercisePrescription(benchPress, [
    { exerciseName: 'Panca piana con bilanciere', weightKg: 72.5, reps: 8, rir: 2, completedAt: '2026-09-10T10:00:00Z' },
    { exerciseKey: 'panca-piana-con-bilanciere', weightKg: 75, reps: 7, rir: 1, completedAt: '2026-09-18T10:00:00Z' }
  ]);

  assert.deepEqual(suggestion, {
    weight: 75,
    reps: '7',
    rir: 1,
    completedAt: '2026-09-18T10:00:00Z'
  });
});

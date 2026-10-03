import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWorkoutPlanSessionUpdate,
  buildWorkoutPlanUpdatePreview,
  findOwnedLinkedWorkoutPlan
} from './workoutPlanSessionUpdate.js';

const plan = {
  id: 'plan-push',
  title: 'Push day',
  exercises: [
    { instanceId: 'bench-1', name: 'Panca piana', sets: 3, reps: '10', weight: 70, rir: 2, recovery: 90 },
    { instanceId: 'fly-1', name: 'Croci ai cavi', sets: 3, reps: '12', weight: 15, rir: 2, recovery: 60 }
  ]
};

test('confronta i valori live con la scheda collegata usando instanceId', () => {
  const preview = buildWorkoutPlanUpdatePreview({
    plan,
    liveExercises: [
      { id: 'bench-1', name: 'Panca piana', sets: 4, reps: '8', weight: 70, rir: 1, recovery: 120 },
      { id: 'fly-1', name: 'Croci ai cavi', sets: 3, reps: '12', weight: 15, rir: 2, recovery: 60 }
    ],
    exerciseLoads: { 'bench-1': 72.5, 'fly-1': 15 }
  });

  assert.equal(preview.length, 1);
  assert.equal(preview[0].name, 'Panca piana');
  assert.deepEqual(preview[0].changes.map((change) => change.field), [
    'sets', 'reps', 'weight', 'rir', 'recovery'
  ]);
});

test('applica soltanto gli esercizi modificati e conserva gli altri dati', () => {
  const preview = buildWorkoutPlanUpdatePreview({
    plan,
    liveExercises: [
      { id: 'bench-1', name: 'Panca piana', sets: 3, reps: '8-10', weight: 70, rir: 1, recovery: 120 }
    ],
    exerciseLoads: { 'bench-1': 75 }
  });
  const updated = applyWorkoutPlanSessionUpdate(plan, preview, '2026-09-19T12:00:00.000Z');

  assert.deepEqual(updated.exercises[0], {
    ...plan.exercises[0],
    sets: 3,
    reps: '8-10',
    weight: 75,
    rir: 1,
    recovery: 120
  });
  assert.deepEqual(updated.exercises[1], plan.exercises[1]);
  assert.equal(updated.updatedAt, '2026-09-19T12:00:00.000Z');
});

test('non propone aggiornamenti quando i valori coincidono', () => {
  const preview = buildWorkoutPlanUpdatePreview({
    plan,
    liveExercises: [
      { id: 'bench-1', name: 'Panca piana', sets: 3, reps: '10', weight: 70, rir: 2, recovery: 90 },
      { id: 'fly-1', name: 'Croci ai cavi', sets: 3, reps: '12', weight: 15, rir: 2, recovery: 60 }
    ],
    exerciseLoads: { 'bench-1': 70, 'fly-1': 15 }
  });

  assert.deepEqual(preview, []);
});

test('usa il nome come fallback senza aggiornare due esercizi omonimi', () => {
  const oldPlan = {
    ...plan,
    exercises: [
      { name: 'Squat', sets: 3, reps: '8', weight: 100, rir: 2, recovery: 120 },
      { name: 'Squat', sets: 2, reps: '12', weight: 60, rir: 3, recovery: 90 }
    ]
  };
  const preview = buildWorkoutPlanUpdatePreview({
    plan: oldPlan,
    liveExercises: [
      { id: 'live-a', name: 'Squat', sets: 3, reps: '8', weight: 100, rir: 2, recovery: 120 },
      { id: 'live-b', name: 'Squat', sets: 2, reps: '10', weight: 60, rir: 3, recovery: 90 }
    ],
    exerciseLoads: { 'live-a': 100, 'live-b': 60 }
  });

  assert.equal(preview.length, 1);
  assert.equal(preview[0].planExerciseIndex, 1);
  assert.equal(preview[0].changes[0].after, '10');
});

test('riconosce la scheda proprietaria solo tramite il suo id cloud esatto', () => {
  const plans = [
    { id: 'client-a', remoteId: 'remote-a', title: 'A' },
    { id: 'remote-b', remoteId: 'remote-b', title: 'B' }
  ];

  assert.equal(findOwnedLinkedWorkoutPlan(plans, 'remote-a')?.title, 'A');
  assert.equal(findOwnedLinkedWorkoutPlan(plans, 'client-a'), null);
  assert.equal(findOwnedLinkedWorkoutPlan(plans, ''), null);
});

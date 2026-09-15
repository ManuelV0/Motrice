import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterExerciseHistory,
  sortExerciseSummaries,
  summarizeExerciseHistory,
  summarizeProgressDashboard
} from './exerciseProgress.js';

const now = new Date('2026-09-15T12:00:00.000Z');

function set(eventId, exerciseName, weightKg, reps, completedAt, setNumber = 1) {
  return {
    id: `${eventId}:${exerciseName}:${setNumber}`,
    eventId,
    exerciseKey: exerciseName.toLowerCase().replaceAll(' ', '-'),
    exerciseName,
    weightKg,
    reps,
    setNumber,
    completedAt
  };
}

test('filters history using the selected period', () => {
  const history = [
    set('recent', 'Squat', 80, 8, '2026-09-10T10:00:00.000Z'),
    set('old', 'Squat', 70, 8, '2026-07-01T10:00:00.000Z')
  ];
  assert.equal(filterExerciseHistory(history, '4w', now).length, 1);
  assert.equal(filterExerciseHistory(history, 'all', now).length, 2);
});

test('compares complete workout sessions rather than individual sets', () => {
  const history = [
    set('one', 'Leg press', 100, 8, '2026-09-01T10:00:00.000Z', 1),
    set('one', 'Leg press', 120, 8, '2026-09-01T10:01:00.000Z', 2),
    set('two', 'Leg press', 125, 8, '2026-09-10T10:00:00.000Z', 1),
    set('two', 'Leg press', 115, 8, '2026-09-10T10:01:00.000Z', 2)
  ];
  const summary = summarizeExerciseHistory(history, '4w', now)[0];
  assert.equal(summary.sessionCount, 2);
  assert.equal(summary.trendStatus, 'up');
  assert.equal(summary.isRecord, true);
  assert.equal(summary.maxWeight, 125);
});

test('labels the first bodyweight workout as new and uses reps as metric', () => {
  const summary = summarizeExerciseHistory([
    set('one', 'Trazioni', 0, 10, '2026-09-10T10:00:00.000Z')
  ], '4w', now)[0];
  assert.equal(summary.bodyweight, true);
  assert.equal(summary.bestReps, 10);
  assert.equal(summary.trendStatus, 'new');
});

test('dashboard counts unique sessions and weighted volume', () => {
  const dashboard = summarizeProgressDashboard([
    set('one', 'Squat', 100, 5, '2026-09-10T10:00:00.000Z', 1),
    set('one', 'Squat', 100, 5, '2026-09-10T10:01:00.000Z', 2),
    set('two', 'Trazioni', 0, 8, '2026-09-12T10:00:00.000Z')
  ], '4w', now);
  assert.equal(dashboard.sessionCount, 2);
  assert.equal(dashboard.totalSets, 3);
  assert.equal(dashboard.totalVolume, 1000);
});

test('sorts records first without losing recent fallback', () => {
  const input = [
    { name: 'A', isRecord: false, trendPercent: 0, lastCompletedAt: '2026-09-15T10:00:00Z' },
    { name: 'B', isRecord: true, trendPercent: 4, lastCompletedAt: '2026-09-14T10:00:00Z' }
  ];
  assert.equal(sortExerciseSummaries(input, 'records')[0].name, 'B');
});

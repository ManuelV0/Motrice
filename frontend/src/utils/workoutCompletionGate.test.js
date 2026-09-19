import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMinimumWorkoutSeconds,
  getSetCadenceRemaining,
  getWorkoutCompletionGate
} from './workoutCompletionGate.js';

test('a sixty minute workout requires forty verified minutes', () => {
  assert.equal(getMinimumWorkoutSeconds(60), 40 * 60);
});

test('completion remains locked before two thirds of the session', () => {
  const startedAt = '2026-09-19T10:00:00.000Z';
  const gate = getWorkoutCompletionGate({
    startedAt,
    durationMinutes: 60,
    now: Date.parse('2026-09-19T10:28:00.000Z')
  });
  assert.equal(gate.reached, false);
  assert.equal(gate.remainingSeconds, 12 * 60);
  assert.equal(gate.timePercent, 46);
});

test('completion unlocks at the minimum verified duration', () => {
  const startedAt = '2026-09-19T10:00:00.000Z';
  const gate = getWorkoutCompletionGate({
    startedAt,
    durationMinutes: 60,
    now: Date.parse('2026-09-19T10:40:00.000Z')
  });
  assert.equal(gate.reached, true);
  assert.equal(gate.remainingSeconds, 0);
});

test('consecutive set confirmations keep a twenty second safety interval', () => {
  const lastSetCompletedAt = '2026-09-19T10:00:00.000Z';
  assert.equal(getSetCadenceRemaining(lastSetCompletedAt, Date.parse('2026-09-19T10:00:08.000Z')), 12);
  assert.equal(getSetCadenceRemaining(lastSetCompletedAt, Date.parse('2026-09-19T10:00:20.000Z')), 0);
});

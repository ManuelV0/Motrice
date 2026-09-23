import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWorkoutSessionWindow,
  isWorkoutSessionExpired,
  WORKOUT_SESSION_WINDOW_SECONDS
} from './workoutSessionWindow.js';

const STARTED_AT = '2026-09-23T10:00:00.000Z';

test('mantiene la scheda attiva nelle tre ore successive al vero avvio', () => {
  const result = getWorkoutSessionWindow(STARTED_AT, '2026-09-23T12:59:59.000Z');
  assert.equal(result.expired, false);
  assert.equal(result.remainingSeconds, 1);
  assert.equal(WORKOUT_SESSION_WINDOW_SECONDS, 10800);
});

test('disattiva la scheda esattamente tre ore dopo l avvio', () => {
  assert.equal(isWorkoutSessionExpired(STARTED_AT, '2026-09-23T13:00:00.000Z'), true);
});

test('non considera scaduta una sessione priva di un orario valido', () => {
  const result = getWorkoutSessionWindow('', '2026-09-23T13:00:00.000Z');
  assert.equal(result.valid, false);
  assert.equal(result.expired, false);
});

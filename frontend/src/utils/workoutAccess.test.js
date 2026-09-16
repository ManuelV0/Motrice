import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessWorkoutWithoutLocation } from './workoutAccess.js';

test('abilita l accesso senza posizione soltanto per l account autorizzato', () => {
  assert.equal(canAccessWorkoutWithoutLocation({ email: 'aletarqui@libero.it' }), true);
  assert.equal(canAccessWorkoutWithoutLocation('  ALETARQUI@LIBERO.IT '), true);
  assert.equal(canAccessWorkoutWithoutLocation({ email: 'tester@example.com' }), false);
  assert.equal(canAccessWorkoutWithoutLocation(null), false);
});

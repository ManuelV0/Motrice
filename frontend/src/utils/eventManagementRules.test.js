import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventManagementPolicy } from './eventManagementRules.js';

const start = Date.parse('2026-09-09T18:00:00.000Z');
const baseEvent = {
  event_datetime: new Date(start).toISOString(),
  status: 'scheduled',
  checkin_grace_minutes: 15,
  is_personal: false
};

test('prima di T-2h consente tutte le tre modifiche', () => {
  const policy = getEventManagementPolicy(baseEvent, start - 3 * 60 * 60 * 1000);
  assert.equal(policy.canEditDescription, true);
  assert.equal(policy.canEditDuration, true);
  assert.equal(policy.canEditTolerance, true);
});

test('nelle ultime due ore blocca la durata ma non descrizione e tolleranza', () => {
  const policy = getEventManagementPolicy(baseEvent, start - 30 * 60 * 1000);
  assert.equal(policy.canEditDescription, true);
  assert.equal(policy.canEditDuration, false);
  assert.equal(policy.canEditTolerance, true);
});

test('dopo l inizio consente soltanto di aumentare la tolleranza entro 30 minuti', () => {
  const policy = getEventManagementPolicy(baseEvent, start + 10 * 60 * 1000);
  assert.equal(policy.canEditDescription, false);
  assert.equal(policy.canEditDuration, false);
  assert.equal(policy.canIncreaseToleranceAfterStart, true);
  assert.deepEqual(policy.toleranceOptions, [20, 30]);
});

test('dopo la finestra massima blocca ogni modifica', () => {
  const policy = getEventManagementPolicy(baseEvent, start + 31 * 60 * 1000);
  assert.equal(policy.canEditAnything, false);
});

test('gli eventi personali non espongono la tolleranza', () => {
  const policy = getEventManagementPolicy({ ...baseEvent, is_personal: true }, start - 3 * 60 * 60 * 1000);
  assert.equal(policy.canEditTolerance, false);
});

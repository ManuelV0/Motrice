import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCapacityExtensionOptions,
  getDurationExtensionOptions,
  getEventManagementPolicy
} from './eventManagementRules.js';

const start = Date.parse('2026-09-09T18:00:00.000Z');
const baseEvent = {
  event_datetime: new Date(start).toISOString(),
  status: 'scheduled',
  checkin_grace_minutes: 15,
  is_personal: false
};

test('prima di T-2h consente gli adattamenti ma protegge immagine e scheda', () => {
  const policy = getEventManagementPolicy(baseEvent, start - 3 * 60 * 60 * 1000);
  assert.equal(policy.canEditDescription, true);
  assert.equal(policy.canEditDuration, true);
  assert.equal(policy.canEditParticipantSettings, true);
  assert.equal(policy.canEditWorkoutPlan, false);
  assert.equal(policy.canEditMedia, false);
  assert.equal(policy.canSendOrganizerAlert, true);
  assert.equal(policy.canEditTolerance, true);
});

test('nelle ultime due ore blocca la durata ma non descrizione e tolleranza', () => {
  const policy = getEventManagementPolicy(baseEvent, start - 30 * 60 * 1000);
  assert.equal(policy.canEditDescription, true);
  assert.equal(policy.canEditDuration, false);
  assert.equal(policy.canEditParticipantSettings, false);
  assert.equal(policy.canEditWorkoutPlan, false);
  assert.equal(policy.canEditTolerance, true);
});

test('dopo l inizio consente soltanto di aumentare la tolleranza entro 30 minuti', () => {
  const policy = getEventManagementPolicy(baseEvent, start + 10 * 60 * 1000);
  assert.equal(policy.canEditDescription, false);
  assert.equal(policy.canEditDuration, false);
  assert.equal(policy.canSendOrganizerAlert, true);
  assert.equal(policy.canIncreaseToleranceAfterStart, true);
  assert.deepEqual(policy.toleranceOptions, [15, 20, 30]);
});

test('propone soltanto piccoli aumenti della durata', () => {
  assert.deepEqual(getDurationExtensionOptions(60), [60, 75, 90]);
  assert.deepEqual(getDurationExtensionOptions(345), [345, 360]);
});

test('propone al massimo tre posti aggiuntivi', () => {
  assert.deepEqual(getCapacityExtensionOptions(3), [3, 4, 5, 6]);
});

test('una tolleranza già impostata non può essere ridotta', () => {
  const policy = getEventManagementPolicy(
    { ...baseEvent, checkin_grace_minutes: 20 },
    start - 3 * 60 * 60 * 1000
  );
  assert.deepEqual(policy.toleranceOptions, [20, 30]);
});

test('dopo la finestra check-in resta disponibile soltanto la comunicazione urgente', () => {
  const policy = getEventManagementPolicy(baseEvent, start + 31 * 60 * 1000);
  assert.equal(policy.canEditAnything, true);
  assert.equal(policy.canSendOrganizerAlert, true);
});

test('dopo la fine blocca anche le comunicazioni urgenti', () => {
  const policy = getEventManagementPolicy(
    { ...baseEvent, duration_minutes: 60 },
    start + 61 * 60 * 1000
  );
  assert.equal(policy.canSendOrganizerAlert, false);
  assert.equal(policy.canEditAnything, false);
});

test('gli eventi personali non espongono la tolleranza', () => {
  const policy = getEventManagementPolicy({ ...baseEvent, is_personal: true }, start - 3 * 60 * 60 * 1000);
  assert.equal(policy.canEditTolerance, false);
});

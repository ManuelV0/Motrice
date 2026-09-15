import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVENT_DEPOSIT_CENTS,
  getParticipationEligibility,
  getWithdrawalEligibility,
  splitNoShowDeposit
} from './moneyPolicy.js';

test('un no-show da 10 euro destina 3 euro a Motrice e 7 agli utenti presenti', () => {
  const result = splitNoShowDeposit(EVENT_DEPOSIT_CENTS, ['organizer', 'participant']);
  assert.equal(result.platformCents, 300);
  assert.equal(result.distributableCents, 700);
  assert.deepEqual(result.allocations, [
    { userId: 'organizer', amountCents: 350 },
    { userId: 'participant', amountCents: 350 }
  ]);
});

test('i centesimi residui sono assegnati in modo deterministico senza perderne uno', () => {
  const result = splitNoShowDeposit(EVENT_DEPOSIT_CENTS, ['c', 'a', 'b']);
  assert.deepEqual(result.allocations, [
    { userId: 'a', amountCents: 234 },
    { userId: 'b', amountCents: 233 },
    { userId: 'c', amountCents: 233 }
  ]);
  assert.equal(
    result.platformCents + result.allocations.reduce((sum, row) => sum + row.amountCents, 0),
    EVENT_DEPOSIT_CENTS
  );
});

test('la ripartizione conserva sempre tutti i centesimi per gruppi da 1 a 50 presenti', () => {
  for (let count = 1; count <= 50; count += 1) {
    const attendees = Array.from({ length: count }, (_, index) => `user-${index + 1}`);
    const result = splitNoShowDeposit(EVENT_DEPOSIT_CENTS, attendees);
    const allocated = result.allocations.reduce((sum, row) => sum + row.amountCents, 0);
    assert.equal(result.platformCents + allocated, EVENT_DEPOSIT_CENTS);
    assert.ok(result.allocations.every((row) => Number.isInteger(row.amountCents)));
  }
});

test('senza presenti idonei il deposito resta interamente alla piattaforma', () => {
  const result = splitNoShowDeposit(EVENT_DEPOSIT_CENTS, []);
  assert.equal(result.platformCents, EVENT_DEPOSIT_CENTS);
  assert.equal(result.distributableCents, 0);
  assert.deepEqual(result.allocations, []);
});

test('le due prove gratuite precedono il requisito della riserva', () => {
  assert.equal(getParticipationEligibility({ trial_events_remaining: 2 }).fundingSource, 'trial');
  assert.equal(getParticipationEligibility({ trial_events_remaining: 0, available_cents: 1000 }).fundingSource, 'balance');
  assert.equal(getParticipationEligibility({ trial_events_remaining: 0, available_cents: 750 }).canParticipate, false);
});

test('il prelievo standard lascia sempre 10 euro di riserva', () => {
  const eligibility = getWithdrawalEligibility({ available_cents: 1000, withdrawable_cents: 1000 });
  assert.equal(eligibility.canWithdrawStandard, true);
  assert.equal(eligibility.standardMaximumCents, 1000);
  assert.equal(eligibility.reserveAfterStandardCents, 1000);
});

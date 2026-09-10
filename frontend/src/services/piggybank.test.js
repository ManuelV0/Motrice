import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

globalThis.window = { localStorage: new MemoryStorage() };

const { piggybank } = await import('./piggybank.js');

test('virtual wallet starts with two trial events and 30 EUR of beta credit', () => {
  window.localStorage.clear();
  const wallet = piggybank.getWallet();
  assert.equal(wallet.available_cents, 3000);
  assert.equal(wallet.trial_events_remaining, 2);
  assert.equal(wallet.provider_mode, 'virtual_beta');
  assert.equal(wallet.deposits_enabled, false);
  assert.equal(wallet.withdrawals_enabled, false);
  assert.equal(wallet.history[0].entry_type, 'virtual_opening_credit');
});

test('only an administrator can increase virtual credit and the operation is idempotent', () => {
  window.localStorage.clear();
  assert.throws(
    () => piggybank.adminIncreaseVirtualCredit({ accountId: 1, amountCents: 1000 }),
    /amministratore/
  );

  window.localStorage.setItem('motrice_auth_session_v1', JSON.stringify({ userId: 1, role: 'admin' }));
  piggybank.adminIncreaseVirtualCredit({
    accountId: 1,
    amountCents: 1000,
    requestId: 'request-12345678'
  });
  const retry = piggybank.adminIncreaseVirtualCredit({
    accountId: 1,
    amountCents: 1000,
    requestId: 'request-12345678'
  });
  assert.equal(retry.available_cents, 4000);
  assert.equal(retry.history.filter((entry) => entry.entry_type === 'admin_virtual_credit_added').length, 1);
});

test('event holds consume trials first, then lock and restore virtual credit', () => {
  window.localStorage.clear();

  piggybank.freezeStake({ eventId: 'trial-1', eventTitle: 'Running', amountCents: 1000 });
  piggybank.freezeStake({ eventId: 'trial-2', eventTitle: 'Calcio', amountCents: 1000 });
  let wallet = piggybank.getWallet();
  assert.equal(wallet.trial_events_remaining, 0);
  assert.equal(wallet.available_cents, 3000);

  piggybank.freezeStake({ eventId: 'paid-1', eventTitle: 'Palestra', amountCents: 1000 });
  wallet = piggybank.getWallet();
  assert.equal(wallet.available_cents, 2000);
  assert.equal(wallet.locked_cents, 1000);

  piggybank.releaseStake({ eventId: 'paid-1' });
  wallet = piggybank.getWallet();
  assert.equal(wallet.available_cents, 3000);
  assert.equal(wallet.locked_cents, 0);
});

test('the same event cannot consume two trial entries', () => {
  window.localStorage.clear();
  piggybank.freezeStake({ eventId: 'trial-once', eventTitle: 'Running', amountCents: 1000 });

  assert.throws(
    () => piggybank.freezeStake({ eventId: 'trial-once', eventTitle: 'Running', amountCents: 1000 }),
    /gia una quota congelata/
  );
  assert.equal(piggybank.getWallet().trial_events_remaining, 1);
});

test('an organizer can lock an approved participant stake without changing their own wallet', () => {
  window.localStorage.clear();
  window.localStorage.setItem('motrice_auth_session_v1', JSON.stringify({ userId: 1 }));

  piggybank.freezeStake({
    eventId: 'approval-1',
    eventTitle: 'Palestra su richiesta',
    amountCents: 1000,
    accountId: 2
  });

  assert.equal(piggybank.getWallet().trial_events_remaining, 2);
  window.localStorage.setItem('motrice_auth_session_v1', JSON.stringify({ userId: 2 }));
  const participantWallet = piggybank.getWallet();
  assert.equal(participantWallet.trial_events_remaining, 1);
  assert.equal(participantWallet.entries[0].event_id, 'approval-1');
});

test('an organizer can restore a participant stake in the participant wallet', () => {
  window.localStorage.clear();
  window.localStorage.setItem('motrice_auth_session_v1', JSON.stringify({ userId: 1 }));
  piggybank.freezeStake({
    eventId: 'cancel-by-organizer-1',
    eventTitle: 'Padel annullato',
    amountCents: 1000,
    accountId: 2
  });

  piggybank.cancelStake({ eventId: 'cancel-by-organizer-1', accountId: 2 });

  assert.equal(piggybank.getWallet().trial_events_remaining, 2);
  window.localStorage.setItem('motrice_auth_session_v1', JSON.stringify({ userId: 2 }));
  const participantWallet = piggybank.getWallet();
  assert.equal(participantWallet.trial_events_remaining, 2);
  assert.equal(participantWallet.entries[0].status, 'cancelled');
});

test('cancel restores a trial while a no-show consumes the held value', () => {
  window.localStorage.clear();
  piggybank.freezeStake({ eventId: 'trial-cancel', eventTitle: 'Tennis', amountCents: 1000 });
  piggybank.cancelStake({ eventId: 'trial-cancel' });
  assert.equal(piggybank.getWallet().trial_events_remaining, 2);

  piggybank.freezeStake({ eventId: 'trial-a', eventTitle: 'Running', amountCents: 1000 });
  piggybank.freezeStake({ eventId: 'trial-b', eventTitle: 'Running', amountCents: 1000 });
  piggybank.freezeStake({ eventId: 'no-show', eventTitle: 'Running', amountCents: 1000 });
  piggybank.forfeitStake({ eventId: 'no-show' });
  const wallet = piggybank.getWallet();
  assert.equal(wallet.available_cents, 2000);
  assert.equal(wallet.locked_cents, 0);
  assert.equal(wallet.total_cents, 2000);
});

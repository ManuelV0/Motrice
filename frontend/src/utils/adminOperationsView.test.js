import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdminAlerts,
  filterAdminEvents,
  filterAdminUsers,
  isSameLocalDay
} from './adminOperationsView.js';

test('riconosce eventi nello stesso giorno locale', () => {
  assert.equal(isSameLocalDay('2026-09-10T06:30:00+02:00', '2026-09-10T22:00:00+02:00'), true);
  assert.equal(isSameLocalDay('2026-09-10T22:00:00+02:00', '2026-09-11T06:30:00+02:00'), false);
});

test('filtra gli utenti che richiedono attenzione', () => {
  const users = [
    { id: 1, display_name: 'Anna', verification_status: 'verified', account_status: 'active' },
    { id: 2, display_name: 'Bruno', verification_status: 'pending', account_status: 'active' },
    { id: 3, display_name: 'Carla', verification_status: 'verified', account_status: 'restricted' }
  ];
  assert.deepEqual(filterAdminUsers(users, { status: 'attention' }).map((user) => user.id), [2, 3]);
});

test('ricerca utenti per email senza distinzione maiuscole', () => {
  const users = [{ id: 1, display_name: 'Anna', email: 'ANNA@example.it' }];
  assert.equal(filterAdminUsers(users, { query: 'anna@EXAMPLE' }).length, 1);
});

test('filtra gli eventi di oggi e per stato', () => {
  const now = new Date('2026-09-10T12:00:00+02:00');
  const events = [
    { id: 1, starts_at: '2026-09-10T18:00:00+02:00', lifecycle_state: 'published', sport_name: 'Running', city: 'Ascoli Piceno' },
    { id: 2, starts_at: '2026-09-10T08:00:00+02:00', lifecycle_state: 'attention', sport_name: 'Palestra', city: 'Ascoli Piceno' },
    { id: 3, starts_at: '2026-09-11T08:00:00+02:00', lifecycle_state: 'published', sport_name: 'Running', city: 'Roma' }
  ];
  assert.deepEqual(filterAdminEvents(events, { date: 'today', status: 'attention' }, now).map((event) => event.id), [2]);
});

test('ordina le anomalie costruite per gravità implicita', () => {
  const alerts = buildAdminAlerts({
    metrics: { events_attention: 2 },
    verification: { pending: 3 },
    wallet: { active_holds: 1, active_holds_cents: 1000 }
  });
  assert.deepEqual(alerts.map((alert) => alert.severity), ['critical', 'attention', 'info']);
});


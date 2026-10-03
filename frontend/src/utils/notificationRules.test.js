import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEventReminderPlan,
  getNotificationCategory,
  getNotificationPath,
  isNotificationEnabled,
  stableNotificationId
} from './notificationRules.js';

test('classifica le notifiche essenziali, chat e wallet', () => {
  assert.equal(getNotificationCategory('event_join_requested'), 'event_security');
  assert.equal(getNotificationCategory('attendance_no_show'), 'event_security');
  assert.equal(getNotificationCategory('participant_left'), 'event_security');
  assert.equal(getNotificationCategory('event_group_message'), 'chat_social');
  assert.equal(getNotificationCategory('coach_chat_message'), 'chat_social');
  assert.equal(getNotificationCategory('wallet_deposit_returned'), 'wallet_account');
});

test('le notifiche di sicurezza restano abilitate', () => {
  assert.equal(isNotificationEnabled('event_cancelled', { event_security: false }), true);
  assert.equal(isNotificationEnabled('coach_chat_message', { chat_social: false }), false);
});

test('costruisce i deep link corretti', () => {
  assert.equal(getNotificationPath({ event_id: 'abc' }), '/events/abc');
  assert.equal(getNotificationPath({ event_id: 'abc', type: 'event_group_message' }), '/chat/event_abc');
  assert.equal(getNotificationPath({ type: 'wallet_deposit_returned' }), '/wallet/credit');
  assert.equal(getNotificationPath({ type: 'profile_verified' }), '/verify-profile');
  assert.equal(getNotificationPath({ payload: { action_path: '/agenda' } }), '/agenda');
});

test('genera promemoria solo per eventi dell utente', () => {
  const now = Date.parse('2026-09-10T08:00:00Z');
  const start = new Date(now + 26 * 60 * 60 * 1000).toISOString();
  const reminders = buildEventReminderPlan([
    { id: 'mine', title: 'Running', event_datetime: start, created_by: 'me', checkin_grace_minutes: 20 },
    { id: 'other', title: 'Calcio', event_datetime: start }
  ], now);
  assert.deepEqual(reminders.map((item) => item.type), [
    'event_reminder_24h',
    'event_reminder_2h',
    'event_checkin_reminder',
    'event_checkin_closing'
  ]);
  assert.equal(new Set(reminders.map((item) => item.id)).size, reminders.length);
  assert.equal(stableNotificationId('mine:24h'), stableNotificationId('mine:24h'));
});

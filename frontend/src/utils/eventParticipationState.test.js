import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasConfirmedEventParticipation,
  resolveEventParticipationState,
  resolveParticipantOutcome
} from './eventParticipationState.js';

test('a canonical no-show overrides stale check-in and cashback fields', () => {
  const participant = {
    lifecycle_state: 'no_show',
    status: 'completed',
    attendance_status: 'attended',
    checked_in_at: '2026-09-05T16:00:00.000Z',
    cashback_progress_percent: 100
  };

  assert.equal(resolveParticipantOutcome(participant).id, 'no_show');
  assert.equal(hasConfirmedEventParticipation({ my_participant: participant }), false);

  const state = resolveEventParticipationState({
    event: { my_participant: participant, starts_at: '2026-09-05T16:00:00.000Z' },
    timing: { hasEnded: true }
  });

  assert.equal(state.id, 'no_show');
  assert.equal(state.canAccessChat, false);
  assert.equal(state.canCancel, false);
});

test('a check-in remains active until the server marks the participation completed', () => {
  const participant = {
    lifecycle_state: 'checked_in',
    status: 'going',
    checked_in_at: '2026-09-06T08:00:00.000Z'
  };

  assert.equal(resolveParticipantOutcome(participant).id, 'checked_in');

  const state = resolveEventParticipationState({
    event: { my_participant: participant },
    timing: { hasEnded: false }
  });

  assert.equal(state.id, 'checked_in');
  assert.equal(state.shouldPoll, true);
});

test('completed and cancellation outcomes are exposed consistently', () => {
  assert.equal(resolveParticipantOutcome({ lifecycle_state: 'completed' }).id, 'completed');
  assert.equal(resolveParticipantOutcome({ attendance: 'cancelled_late' }).id, 'cancelled_late');

  const completed = resolveEventParticipationState({
    event: { my_participant: { lifecycle_state: 'completed' } },
    timing: { hasEnded: true }
  });

  assert.equal(completed.id, 'completed');
  assert.equal(completed.canAccessChat, true);
  assert.equal(completed.canCancel, false);
});

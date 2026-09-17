import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getEventPrimaryActionPath,
  hasConfirmedEventParticipation,
  resolveEventPrimaryAction,
  resolveEventParticipationState,
  resolveParticipantOutcome,
  resolveParticipantPresenceStatus
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

test('a completed event is not mistaken for a completed viewer participation', () => {
  const event = {
    id: 'closed-event',
    status: 'completed',
    event_datetime: '2026-09-06T08:00:00.000Z',
    participants_count: 3,
    user_rsvp: null
  };

  assert.equal(resolveParticipantOutcome(event).id, 'none');
});

test('the viewer money hold repairs a stale post-event participant row', () => {
  const staleEvent = {
    status: 'completed',
    event_datetime: '2026-09-06T08:00:00.000Z',
    participants_count: 4,
    user_rsvp: { lifecycle_state: 'confirmed', status: 'going' }
  };

  assert.equal(resolveParticipantOutcome({
    ...staleEvent,
    money_hold: { status: 'forfeited' }
  }).id, 'no_show');

  assert.equal(resolveParticipantOutcome({
    ...staleEvent,
    money_hold: { status: 'pending_return' }
  }).id, 'completed');

  assert.equal(resolveParticipantOutcome({
    ...staleEvent,
    money_hold: { status: 'released' }
  }).id, 'completed');
});

test('participant presence copy distinguishes approval from the check-in timeline', () => {
  const participant = { lifecycle_state: 'confirmed', status: 'going' };
  const checkInOpensAtMs = Date.parse('2026-09-13T15:00:00.000Z');

  assert.deepEqual(resolveParticipantPresenceStatus({
    participant,
    timing: { phase: 'scheduled', isCheckInOpen: false, checkInOpensAtMs }
  }), {
    id: 'registered',
    label: 'Iscritto',
    checkInOpensAtMs
  });

  assert.equal(resolveParticipantPresenceStatus({
    participant,
    timing: { phase: 'checkin_open', isCheckInOpen: true }
  }).label, 'In attesa di check-in');

  assert.equal(resolveParticipantPresenceStatus({
    participant: { status: 'pending' },
    timing: { phase: 'scheduled', isCheckInOpen: false }
  }).label, 'Richiesta in attesa');

  assert.equal(resolveParticipantPresenceStatus({
    participant: { status: 'going', checked_in_at: '2026-09-13T15:05:00.000Z' },
    timing: { phase: 'live_checkin', isCheckInOpen: true }
  }).label, 'Presente');
});

test('the primary action follows the participant through join, check-in and session', () => {
  const startsAt = Date.parse('2026-09-11T10:00:00.000Z');
  const baseEvent = {
    id: 'event-1',
    event_datetime: new Date(startsAt).toISOString(),
    duration_minutes: 60,
    checkin_grace_minutes: 15,
    join_policy: 'open'
  };

  assert.equal(resolveEventPrimaryAction({
    event: baseEvent,
    referenceTime: startsAt - 60 * 60 * 1000
  }).id, 'join');

  const confirmedEvent = {
    ...baseEvent,
    is_going: true,
    user_rsvp: { lifecycle_state: 'confirmed', status: 'going' }
  };
  const checkInAction = resolveEventPrimaryAction({
    event: confirmedEvent,
    referenceTime: startsAt - 15 * 60 * 1000
  });
  assert.equal(checkInAction.id, 'participant_checkin');
  assert.equal(checkInAction.label, 'Verifica presenza');

  const checkedInAction = resolveEventPrimaryAction({
    event: {
      ...confirmedEvent,
      user_rsvp: {
        lifecycle_state: 'checked_in',
        status: 'going',
        checked_in_at: new Date(startsAt - 10 * 60 * 1000).toISOString()
      }
    },
    referenceTime: startsAt - 5 * 60 * 1000
  });
  assert.equal(checkedInAction.id, 'open_event');
  assert.equal(checkedInAction.disabled, false);

  const liveAction = resolveEventPrimaryAction({
    event: {
      ...confirmedEvent,
      sport_name: 'Running',
      user_rsvp: {
        lifecycle_state: 'checked_in',
        status: 'going',
        checked_in_at: new Date(startsAt - 10 * 60 * 1000).toISOString()
      }
    },
    referenceTime: startsAt + 5 * 60 * 1000
  });
  assert.equal(liveAction.id, 'open_outdoor');
  assert.equal(getEventPrimaryActionPath(baseEvent, liveAction), '/events/event-1/activity');
});

test('the organizer sees management, check-in, live session and feedback in order', () => {
  const startsAt = Date.parse('2026-09-11T10:00:00.000Z');
  const event = {
    id: 'event-2',
    created_by: 'me',
    event_datetime: new Date(startsAt).toISOString(),
    duration_minutes: 60,
    checkin_grace_minutes: 15,
    join_policy: 'approval'
  };

  assert.equal(resolveEventPrimaryAction({
    event,
    referenceTime: startsAt - 2 * 60 * 60 * 1000
  }).id, 'manage_requests');

  assert.equal(resolveEventPrimaryAction({
    event,
    referenceTime: startsAt - 10 * 60 * 1000
  }).id, 'organizer_checkin');

  assert.equal(resolveEventPrimaryAction({
    event: { ...event, participants_checked_in_count: 1 },
    referenceTime: startsAt + 20 * 60 * 1000
  }).id, 'open_event');

  assert.equal(resolveEventPrimaryAction({
    event,
    referenceTime: startsAt + 61 * 60 * 1000
  }).id, 'feedback');

  assert.equal(resolveEventPrimaryAction({
    event,
    referenceTime: startsAt + 26 * 60 * 60 * 1000
  }).id, 'summary');
});

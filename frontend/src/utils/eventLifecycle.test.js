import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVENT_FINANCIAL_REVIEW_HOURS,
  EVENT_LIFECYCLE_STATES,
  POST_EVENT_ACTIONS_HOURS,
  getEffectiveEventLifecycleState,
  getEventPhaseLabel,
  getEventTiming
} from './eventLifecycle.js';

const baseEvent = {
  status: 'scheduled',
  lifecycle_state: 'published',
  starts_at: '2026-09-05T18:00:00.000Z',
  duration_minutes: 60,
  minimum_presence_minutes: 30,
  checkin_grace_minutes: 15,
  checkin_opens_at: '2026-09-05T17:30:00.000Z',
  checkin_closes_at: '2026-09-05T18:15:00.000Z',
  ends_at: '2026-09-05T19:00:00.000Z'
};

test('keeps a future published event visible and joinable', () => {
  const timing = getEventTiming(baseEvent, new Date('2026-09-05T17:00:00.000Z'));

  assert.equal(timing.lifecycleState, EVENT_LIFECYCLE_STATES.PUBLISHED);
  assert.equal(timing.phase, 'scheduled');
  assert.equal(timing.isMapVisible, true);
  assert.equal(timing.isCheckInOpen, false);
  assert.equal(timing.canJoin, true);
});

test('opens check-in exactly thirty minutes before start', () => {
  const timing = getEventTiming(baseEvent, new Date('2026-09-05T17:30:00.000Z'));

  assert.equal(timing.lifecycleState, EVENT_LIFECYCLE_STATES.CHECKIN_OPEN);
  assert.equal(timing.phase, 'checkin_open');
  assert.equal(timing.isCheckInOpen, true);
  assert.equal(getEventPhaseLabel(timing), 'Check-in aperto');
});

test('keeps the event active after late check-in closes', () => {
  const timing = getEventTiming(baseEvent, new Date('2026-09-05T18:20:00.000Z'));

  assert.equal(timing.lifecycleState, EVENT_LIFECYCLE_STATES.ACTIVE);
  assert.equal(timing.phase, 'in_progress');
  assert.equal(timing.isCheckInOpen, false);
  assert.equal(timing.isMapVisible, true);
  assert.equal(timing.canJoin, true);
});

test('closes and removes an event from the map at its effective end', () => {
  const timing = getEventTiming(baseEvent, new Date('2026-09-05T19:00:00.000Z'));

  assert.equal(timing.lifecycleState, EVENT_LIFECYCLE_STATES.COMPLETED);
  assert.equal(timing.phase, 'completed');
  assert.equal(timing.hasEnded, true);
  assert.equal(timing.isMapVisible, false);
  assert.equal(timing.canJoin, false);
  assert.equal(timing.isPostEventWindow, true);
  assert.equal(timing.isFinancialReviewOpen, true);
  assert.equal(timing.isPostEventReadOnly, false);
});

test('archives the event visually after twenty-four hours while keeping financial review open', () => {
  const timing = getEventTiming(
    { ...baseEvent, status: 'completed', completed_at: baseEvent.ends_at },
    new Date('2026-09-06T20:00:00.000Z')
  );

  assert.equal(POST_EVENT_ACTIONS_HOURS, 24);
  assert.equal(EVENT_FINANCIAL_REVIEW_HOURS, 48);
  assert.equal(timing.lifecycleState, EVENT_LIFECYCLE_STATES.ARCHIVED);
  assert.equal(timing.phase, 'archived');
  assert.equal(timing.isPostEventWindow, false);
  assert.equal(timing.isFinancialReviewOpen, true);
  assert.equal(timing.isPostEventReadOnly, false);
});

test('makes a concluded event read-only after the forty-eight-hour financial window', () => {
  const timing = getEventTiming(
    { ...baseEvent, status: 'completed', completed_at: baseEvent.ends_at },
    new Date('2026-09-07T20:00:00.000Z')
  );

  assert.equal(timing.lifecycleState, EVENT_LIFECYCLE_STATES.ARCHIVED);
  assert.equal(timing.isFinancialReviewOpen, false);
  assert.equal(timing.isPostEventReadOnly, true);
});

test('uses the authoritative settlement release time for the financial review deadline', () => {
  const timing = getEventTiming(
    {
      ...baseEvent,
      status: 'completed',
      completed_at: baseEvent.ends_at,
      money_settlement: {
        status: 'pending',
        release_at: '2026-09-06T19:00:00.000Z'
      }
    },
    new Date('2026-09-06T18:59:00.000Z')
  );

  assert.equal(timing.isFinancialReviewOpen, true);
  assert.equal(timing.financialReviewEndsAtMs, Date.parse('2026-09-06T19:00:00.000Z'));
});

test('server terminal states take precedence over local time', () => {
  const cancelled = getEventTiming(
    { ...baseEvent, status: 'cancelled', lifecycle_state: 'cancelled' },
    new Date('2026-09-05T17:00:00.000Z')
  );
  const archived = getEventTiming(
    { ...baseEvent, status: 'completed', lifecycle_state: 'archived' },
    new Date('2026-09-05T17:00:00.000Z')
  );

  assert.equal(cancelled.lifecycleState, EVENT_LIFECYCLE_STATES.CANCELLED);
  assert.equal(cancelled.isMapVisible, false);
  assert.equal(archived.lifecycleState, EVENT_LIFECYCLE_STATES.ARCHIVED);
  assert.equal(getEventPhaseLabel(archived), 'Archiviato');
});

test('persisted server deadlines override legacy client calculations', () => {
  const event = {
    ...baseEvent,
    checkin_grace_minutes: 30,
    checkin_closes_at: '2026-09-05T18:05:00.000Z'
  };
  const timing = getEventTiming(event, new Date('2026-09-05T18:06:00.000Z'));

  assert.equal(timing.phase, 'in_progress');
  assert.equal(timing.isCheckInOpen, false);
});

test('recognizes a persisted confirmed state before the check-in window', () => {
  const state = getEffectiveEventLifecycleState(
    { ...baseEvent, lifecycle_state: 'confirmed' },
    new Date('2026-09-05T17:00:00.000Z')
  );

  assert.equal(state, EVENT_LIFECYCLE_STATES.CONFIRMED);
});

test('keeps an unpublished draft closed even after its planned end', () => {
  const timing = getEventTiming(
    { ...baseEvent, lifecycle_state: 'draft' },
    new Date('2026-09-05T20:00:00.000Z')
  );

  assert.equal(timing.lifecycleState, EVENT_LIFECYCLE_STATES.DRAFT);
  assert.equal(timing.phase, 'draft');
  assert.equal(timing.hasEnded, false);
  assert.equal(timing.isMapVisible, false);
  assert.equal(timing.canJoin, false);
});

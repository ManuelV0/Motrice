import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isHistoricalAgendaEvent,
  isUpcomingAgendaEvent
} from './agendaTimeline.js';

const now = Date.parse('2026-09-23T12:00:00.000Z');

test('a future cancelled event is not treated as completed or upcoming', () => {
  const event = {
    status: 'cancelled',
    event_datetime: '2026-11-07T15:00:00.000Z',
    duration_minutes: 60
  };

  assert.equal(isHistoricalAgendaEvent(event, now), false);
  assert.equal(isUpcomingAgendaEvent(event, now), false);
});

test('a past cancelled event remains available in history', () => {
  const event = {
    status: 'cancelled',
    event_datetime: '2026-09-20T15:00:00.000Z',
    duration_minutes: 60
  };

  assert.equal(isHistoricalAgendaEvent(event, now), true);
  assert.equal(isUpcomingAgendaEvent(event, now), false);
});

test('scheduled events are split between upcoming and history by their session timeline', () => {
  const futureEvent = {
    status: 'scheduled',
    event_datetime: '2026-09-24T15:00:00.000Z',
    duration_minutes: 60
  };
  const pastEvent = {
    status: 'scheduled',
    event_datetime: '2026-09-22T15:00:00.000Z',
    duration_minutes: 60
  };

  assert.equal(isUpcomingAgendaEvent(futureEvent, now), true);
  assert.equal(isHistoricalAgendaEvent(futureEvent, now), false);
  assert.equal(isUpcomingAgendaEvent(pastEvent, now), false);
  assert.equal(isHistoricalAgendaEvent(pastEvent, now), true);
});

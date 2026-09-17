import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventSessionTimeline } from './sessionTimeline.js';

const timing = {
  startsAtMs: Date.parse('2026-09-17T14:14:00.000Z'),
  endsAtMs: Date.parse('2026-09-17T15:14:00.000Z')
};

test('non consuma la durata prima del check-in', () => {
  const timeline = getEventSessionTimeline(
    { duration_minutes: 60 },
    timing,
    Date.parse('2026-09-17T14:30:00.000Z')
  );
  assert.equal(timeline.progress, 0);
  assert.equal(timeline.label, 'In attesa del check-in');
  assert.equal(timeline.hasStarted, false);
});

test('usa il check-in del partecipante come minuto zero', () => {
  const event = {
    duration_minutes: 60,
    user_rsvp: { checked_in_at: '2026-09-17T14:30:00.000Z' }
  };
  const start = getEventSessionTimeline(event, timing, Date.parse('2026-09-17T14:30:00.000Z'));
  const quarter = getEventSessionTimeline(event, timing, Date.parse('2026-09-17T14:45:00.000Z'));

  assert.equal(start.progress, 0);
  assert.equal(start.label, '0 di 60 min');
  assert.equal(quarter.progress, 25);
  assert.equal(quarter.label, '15 di 60 min');
  assert.equal(quarter.endsAtMs, Date.parse('2026-09-17T15:30:00.000Z'));
});

test('un check-in anticipato avvia la sessione senza attendere l orario pubblicato', () => {
  const timeline = getEventSessionTimeline(
    {
      duration_minutes: 60,
      user_rsvp: { checked_in_at: '2026-09-17T14:04:00.000Z' }
    },
    timing,
    Date.parse('2026-09-17T14:09:00.000Z')
  );
  assert.equal(timeline.hasStarted, true);
  assert.equal(timeline.progress, 8);
  assert.equal(timeline.label, '5 di 60 min');
});

test('usa il primo check-in del gruppo per la vista organizzatore', () => {
  const timeline = getEventSessionTimeline(
    { duration_minutes: 60, session_started_at: '2026-09-17T14:35:00.000Z' },
    timing,
    Date.parse('2026-09-17T15:05:00.000Z')
  );
  assert.equal(timeline.progress, 50);
  assert.equal(timeline.label, '30 di 60 min');
});

test('gli eventi personali conservano l orario programmato', () => {
  const timeline = getEventSessionTimeline(
    { duration_minutes: 60, is_personal: true },
    timing,
    Date.parse('2026-09-17T14:29:00.000Z')
  );
  assert.equal(timeline.progress, 25);
  assert.equal(timeline.startsAtMs, timing.startsAtMs);
});

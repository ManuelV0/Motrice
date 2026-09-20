import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getFuturePersonalSeriesEvents,
  isRecurringPersonalEvent,
  normalizeCancellationScope
} from './personalEventCancellation.js';

const NOW = Date.parse('2026-09-19T10:00:00+02:00');

function occurrence(id, startsAt, overrides = {}) {
  return {
    id,
    is_personal: true,
    personal_series_id: 'series-1',
    created_by: 'owner-1',
    event_datetime: startsAt,
    status: 'scheduled',
    ...overrides
  };
}

test('offers series cancellation only for a recurring personal event', () => {
  const recurring = occurrence('next', '2026-09-20T18:00:00+02:00');
  assert.equal(isRecurringPersonalEvent(recurring), true);
  assert.equal(normalizeCancellationScope('series', recurring), 'series');
  assert.equal(normalizeCancellationScope('series', { ...recurring, personal_series_id: null }), 'single');
});

test('series cancellation keeps history and targets only future scheduled occurrences', () => {
  const current = occurrence('next', '2026-09-20T18:00:00+02:00');
  const targets = getFuturePersonalSeriesEvents([
    occurrence('past', '2026-09-18T18:00:00+02:00', { status: 'completed' }),
    current,
    occurrence('later', '2026-09-27T18:00:00+02:00'),
    occurrence('cancelled', '2026-10-04T18:00:00+02:00', { status: 'cancelled' }),
    occurrence('other-series', '2026-09-21T18:00:00+02:00', { personal_series_id: 'series-2' }),
    occurrence('other-owner', '2026-09-22T18:00:00+02:00', { created_by: 'owner-2' })
  ], current, NOW);

  assert.deepEqual(targets.map((event) => event.id), ['next', 'later']);
});

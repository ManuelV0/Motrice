import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRecurringMapEvents } from './mapEventGroups.js';

function event(id, datetime, overrides = {}) {
  return {
    id,
    event_datetime: datetime,
    location_name: 'Phisiko Restyle Gym',
    city: 'Ascoli Piceno',
    lat: 42.85,
    lng: 13.57,
    ...overrides
  };
}

test('groups recurring occurrences into the next map event', () => {
  const rows = groupRecurringMapEvents([
    event('later', '2026-09-26T15:00:00+02:00', { personal_series_id: 'series-1' }),
    event('next', '2026-09-19T15:00:00+02:00', { personal_series_id: 'series-1' }),
    event('single', '2026-09-20T10:00:00+02:00')
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'next');
  assert.equal(rows[0].is_recurring_group, true);
  assert.equal(rows[0].recurring_occurrence_count, 2);
  assert.deepEqual(rows[0].recurring_occurrence_ids, ['next', 'later']);
  assert.equal(rows[1].id, 'single');
});

test('keeps the same series separate when occurrences use different venues', () => {
  const rows = groupRecurringMapEvents([
    event('gym', '2026-09-19T15:00:00+02:00', { personal_series_id: 'series-1' }),
    event('park', '2026-09-20T15:00:00+02:00', {
      personal_series_id: 'series-1',
      location_name: 'Parco cittadino',
      lat: 42.86,
      lng: 13.58
    })
  ]);

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.recurring_occurrence_count === 1));
});

test('does not alter standalone map events', () => {
  const original = event('single', '2026-09-19T09:00:00+02:00');
  const [result] = groupRecurringMapEvents([original]);

  assert.equal(result, original);
  assert.equal(result.is_recurring_group, undefined);
});


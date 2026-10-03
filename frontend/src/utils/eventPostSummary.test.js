import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveEventPostSummary,
  resolvePersonalVerificationProgress
} from './eventPostSummary.js';

test('money settlement is authoritative for a completed group event', () => {
  const summary = resolveEventPostSummary({
    participants_count: 8,
    participants_present_count: 7,
    participant_stats: { present: 7, total: 8 },
    money_settlement: { attendee_count: 5, no_show_count: 2 }
  });

  assert.deepEqual(summary, {
    presentCount: 5,
    noShowCount: 2,
    totalCount: 7,
    outcome: {
      id: 'none',
      lifecycleState: '',
      status: '',
      attendance: null,
      isPresent: false
    },
    source: 'settlement'
  });
});

test('zero settlement values stay meaningful and do not fall back to capacity', () => {
  const summary = resolveEventPostSummary({
    max_participants: 10,
    participants_count: 4,
    money_settlement: { attendee_count: 0, no_show_count: 0 }
  });

  assert.equal(summary.presentCount, 0);
  assert.equal(summary.noShowCount, 0);
  assert.equal(summary.totalCount, 0);
  assert.equal(summary.source, 'settlement');
});

test('participant aggregates are used while no settlement is available', () => {
  const summary = resolveEventPostSummary({
    participant_stats: { present: 3, total: 5 }
  });

  assert.equal(summary.presentCount, 3);
  assert.equal(summary.noShowCount, 2);
  assert.equal(summary.totalCount, 5);
  assert.equal(summary.source, 'participants');
});

test('a lone legacy completed participant produces a coherent summary', () => {
  const summary = resolveEventPostSummary({
    user_rsvp: { lifecycle_state: 'completed', status: 'completed' }
  });

  assert.equal(summary.presentCount, 1);
  assert.equal(summary.noShowCount, 0);
  assert.equal(summary.totalCount, 1);
});

test('personal verification progress never uses the event capacity', () => {
  assert.deepEqual(
    resolvePersonalVerificationProgress({
      max_participants: 12,
      participants_checked_in_count: 8,
      user_rsvp: { lifecycle_state: 'checked_in', status: 'going' }
    }),
    {
      current: 1,
      total: 1,
      percent: 100,
      outcome: {
        id: 'checked_in',
        lifecycleState: 'checked_in',
        status: 'going',
        attendance: null,
        isPresent: false
      }
    }
  );
});

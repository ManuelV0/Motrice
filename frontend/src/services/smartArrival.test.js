import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSmartArrival,
  getSmartArrivalEligibility,
  isEventPresenceVerified
} from './smartArrival.js';

const START_AT = Date.parse('2026-09-19T16:00:00.000Z');

function makeEvent(patch = {}) {
  return {
    id: 'event-smart-arrival',
    created_by: 'me',
    event_datetime: new Date(START_AT).toISOString(),
    duration_minutes: 60,
    checkin_grace_minutes: 15,
    geofence_radius_m: 250,
    lat: 42.854,
    lng: 13.575,
    status: 'scheduled',
    ...patch
  };
}

test('smart arrival only monitors during the valid check-in window', () => {
  const event = makeEvent();
  assert.equal(getSmartArrivalEligibility(event, START_AT - 31 * 60 * 1000).phase, 'scheduled');
  assert.equal(getSmartArrivalEligibility(event, START_AT - 20 * 60 * 1000).eligible, true);
  assert.equal(getSmartArrivalEligibility(event, START_AT + 16 * 60 * 1000).phase, 'expired');
});

test('smart arrival detects a fresh and accurate sample inside the event area', () => {
  const nowMs = START_AT - 10 * 60 * 1000;
  const result = evaluateSmartArrival({
    event: makeEvent(),
    nowMs,
    location: {
      lat: 42.8541,
      lng: 13.5751,
      accuracy: 12,
      capturedAt: nowMs
    }
  });
  assert.equal(result.detected, true);
  assert.equal(result.phase, 'arrived');
});

test('smart arrival never turns an outside sample into a check-in', () => {
  const nowMs = START_AT - 10 * 60 * 1000;
  const result = evaluateSmartArrival({
    event: makeEvent(),
    nowMs,
    location: {
      lat: 42.864,
      lng: 13.575,
      accuracy: 10,
      capturedAt: nowMs
    }
  });
  assert.equal(result.detected, false);
  assert.equal(result.proof.code, 'outside_event_area');
});

test('verified presence disables smart arrival', () => {
  const event = makeEvent({ checked_in_at: new Date(START_AT - 5 * 60 * 1000).toISOString() });
  assert.equal(isEventPresenceVerified(event), true);
  assert.equal(getSmartArrivalEligibility(event, START_AT).phase, 'verified');
});

test('personal recurring arrival follows its flexible daily window', () => {
  const event = makeEvent({
    is_personal: true,
    personal_arrival_enabled: true,
    personal_available_from: new Date(START_AT).toISOString(),
    personal_available_until: new Date(START_AT + 6 * 60 * 60 * 1000).toISOString()
  });
  assert.equal(getSmartArrivalEligibility(event, START_AT - 1).phase, 'scheduled');
  assert.equal(getSmartArrivalEligibility(event, START_AT + 3 * 60 * 60 * 1000).eligible, true);
  assert.equal(getSmartArrivalEligibility(event, START_AT + 6 * 60 * 60 * 1000 + 1).phase, 'expired');
});

test('personal reminders without automatic arrival remain excluded', () => {
  const event = makeEvent({ is_personal: true, personal_arrival_enabled: false });
  assert.equal(getSmartArrivalEligibility(event, START_AT).phase, 'unavailable');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getSystemEventRules } from './eventCreationRules.js';

test('derives group-event rules from duration and keeps rewards platform-controlled', () => {
  assert.deepEqual(
    getSystemEventRules({ durationMinutes: 120, checkInGraceMinutes: 15 }),
    {
      minimumPresenceMinutes: 80,
      verificationMode: 'both',
      geofenceRadiusM: 250,
      checkInGraceMinutes: 15,
      completionXp: 50,
      reviewBonusXp: 25
    }
  );
});

test('allows the organizer to choose up to thirty minutes of late tolerance', () => {
  assert.equal(
    getSystemEventRules({ durationMinutes: 60, checkInGraceMinutes: 30 }).checkInGraceMinutes,
    30
  );
});

test('defaults group events to fifteen minutes and normalizes unsupported values', () => {
  assert.equal(getSystemEventRules({ durationMinutes: 60 }).checkInGraceMinutes, 15);
  assert.equal(
    getSystemEventRules({ durationMinutes: 60, checkInGraceMinutes: 10 }).checkInGraceMinutes,
    15
  );
});

test('keeps personal reminders on their dedicated automatic rules', () => {
  assert.deepEqual(
    getSystemEventRules({ durationMinutes: 90, isPersonal: true, checkInGraceMinutes: 30 }),
    {
      minimumPresenceMinutes: 15,
      verificationMode: 'geo',
      geofenceRadiusM: 250,
      checkInGraceMinutes: 0,
      completionXp: 5,
      reviewBonusXp: 0
    }
  );
});

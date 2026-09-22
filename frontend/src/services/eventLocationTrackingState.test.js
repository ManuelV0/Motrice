import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTrackingError,
  validateActiveTrackingRecord
} from './eventLocationTrackingState.js';

const validRecord = {
  eventId: 'event-1',
  lat: 42.85,
  lng: 13.58,
  radiusM: 250,
  expectedEndAt: '2030-01-01T12:00:00.000Z'
};

test('normalizes a valid persisted tracking record', () => {
  const result = validateActiveTrackingRecord({ ...validRecord, lat: '42.85' });
  assert.equal(result.valid, true);
  assert.equal(result.record.lat, 42.85);
  assert.equal(result.record.expectedEndAt, validRecord.expectedEndAt);
});

test('rejects stale or corrupted tracking configuration before native startup', () => {
  assert.equal(validateActiveTrackingRecord({ ...validRecord, lat: 120 }).valid, false);
  assert.equal(validateActiveTrackingRecord({ ...validRecord, lng: Number.NaN }).valid, false);
  assert.equal(validateActiveTrackingRecord({ ...validRecord, expectedEndAt: 'invalid' }).valid, false);
  assert.equal(validateActiveTrackingRecord({ ...validRecord, eventId: '' }).valid, false);
});

test('turns native foreground service failures into a user-safe message', () => {
  assert.match(
    normalizeTrackingError(new Error('ForegroundServiceStartNotAllowedException')),
    /Motrice resta utilizzabile/
  );
  assert.equal(normalizeTrackingError(null), 'Monitoraggio GPS temporaneamente non disponibile');
});

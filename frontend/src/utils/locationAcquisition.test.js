import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocationAttempts,
  hasAnyLocationPermission,
  isLocationSampleUsableForMap,
  mergeLocationWatchOptions,
  normalizeLocationSample,
  normalizeLocationError,
  resolveLocationPermission,
  validateLocationSample
} from './locationAcquisition.js';

test('riconosce il permesso approssimativo senza confonderlo con un diniego', () => {
  const status = { location: 'denied', coarseLocation: 'granted' };
  assert.equal(resolveLocationPermission(status), 'approximate');
  assert.equal(hasAnyLocationPermission(status), true);
});

test('traduce gli errori Android conservando una causa utile', () => {
  assert.equal(normalizeLocationError({ code: 'OS-PLUG-GLOC-0010' }).permission, 'timeout');
  assert.match(normalizeLocationError({ code: 'CUSTOM', message: 'Provider failed' }).message, /Provider failed/);
});

test('usa il provider Motrice sicuro con un solo tentativo limitato', () => {
  const attempts = getLocationAttempts({ requireFresh: true, precise: true, native: true });
  assert.equal(attempts.length, 1);
  assert.equal(attempts.every((attempt) => attempt.nativeProvider === 'motrice'), true);
  assert.equal(attempts.some((attempt) => 'enableLocationFallback' in attempt), false);
  assert.equal(attempts[0].timeout, 25000);
  assert.equal(attempts[0].maximumAge, 5000);
  assert.equal(attempts[0].sampleWindowMs, 4500);
  assert.equal(attempts[0].minimumSamples, 2);
});

test('traduce gli errori del provider Motrice', () => {
  assert.equal(normalizeLocationError({ code: 'MOTRICE_LOCATION_PERMISSION_REQUIRED' }).permission, 'denied');
  assert.equal(normalizeLocationError({ code: 'MOTRICE_LOCATION_DISABLED' }).permission, 'unavailable');
  assert.equal(normalizeLocationError({ code: 'MOTRICE_LOCATION_TIMEOUT' }).permission, 'timeout');
  assert.equal(normalizeLocationError({ code: 'MOTRICE_POSITION_UNAVAILABLE' }).permission, 'unavailable');
  assert.equal(normalizeLocationError({ code: 'MOTRICE_LOCATION_CANCELLED' }).permission, 'cancelled');
  assert.match(normalizeLocationError({ code: 'MOTRICE_LOCATION_INACCURATE' }).message, /approssimativa/);
});

test('normalizza un campione GPS e conserva precisione e istante', () => {
  const sample = normalizeLocationSample({
    timestamp: 1234,
    coords: { latitude: 42.85, longitude: 13.58, accuracy: 18 }
  }, 9999);
  assert.deepEqual(sample, {
    lat: 42.85,
    lng: 13.58,
    accuracy: 18,
    capturedAt: 1234
  });
});

test('rifiuta coordinate finite ma fuori dai limiti geografici', () => {
  assert.throws(
    () => normalizeLocationSample({ coords: { latitude: 120, longitude: 13.58, accuracy: 10 } }),
    (error) => error.code === 'MOTRICE_POSITION_UNAVAILABLE'
  );
  assert.throws(
    () => normalizeLocationSample({ coords: { latitude: 42.85, longitude: -220, accuracy: 10 } }),
    (error) => error.code === 'MOTRICE_POSITION_UNAVAILABLE'
  );
});

test('rifiuta una posizione vecchia o troppo approssimativa', () => {
  assert.throws(
    () => validateLocationSample(
      { lat: 42.85, lng: 13.58, accuracy: 20, capturedAt: 1000 },
      { requireFresh: true, maxAgeMs: 5000, now: 7001 }
    ),
    (error) => error.code === 'MOTRICE_STALE_LOCATION'
  );
  assert.throws(
    () => validateLocationSample(
      { lat: 42.85, lng: 13.58, accuracy: 450, capturedAt: 7000 },
      { maxAccuracyM: 150, now: 7001 }
    ),
    (error) => error.code === 'MOTRICE_LOCATION_INACCURATE'
  );
});

test('la mappa può usare temporaneamente l ultima posizione valida senza renderla prova di check-in', () => {
  const sample = { lat: 42.85, lng: 13.58, accuracy: 35, capturedAt: 1000 };
  assert.equal(isLocationSampleUsableForMap(sample, { maxAgeMs: 600000, now: 600999 }), true);
  assert.equal(isLocationSampleUsableForMap(sample, { maxAgeMs: 600000, now: 601001 }), false);
  assert.equal(
    isLocationSampleUsableForMap({ ...sample, lat: Number.NaN }, { maxAgeMs: 600000, now: 2000 }),
    false
  );
});

test('unifica più richieste di inseguimento usando i requisiti più prudenti', () => {
  assert.deepEqual(
    mergeLocationWatchOptions([
      { maxAgeMs: 30000, maxAccuracyM: 150, minimumUpdateInterval: 5000 },
      { maxAgeMs: 15000, maxAccuracyM: 80, minimumUpdateInterval: 3000, throwOnError: true }
    ]),
    {
      maxAgeMs: 15000,
      maxAccuracyM: 80,
      minimumUpdateInterval: 3000,
      throwOnError: true
    }
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocationAttempts,
  hasAnyLocationPermission,
  normalizeLocationError,
  resolveLocationPermission
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

test('usa il provider Motrice sicuro e mantiene un secondo tentativo', () => {
  const attempts = getLocationAttempts({ requireFresh: true, precise: true, native: true });
  assert.equal(attempts.length, 2);
  assert.equal(attempts.every((attempt) => attempt.nativeProvider === 'motrice'), true);
  assert.equal(attempts.some((attempt) => 'enableLocationFallback' in attempt), false);
  assert.equal(attempts[1].timeout, 40000);
});

test('traduce gli errori del provider Motrice', () => {
  assert.equal(normalizeLocationError({ code: 'MOTRICE_LOCATION_PERMISSION_REQUIRED' }).permission, 'denied');
  assert.equal(normalizeLocationError({ code: 'MOTRICE_LOCATION_DISABLED' }).permission, 'unavailable');
  assert.equal(normalizeLocationError({ code: 'MOTRICE_LOCATION_TIMEOUT' }).permission, 'timeout');
  assert.equal(normalizeLocationError({ code: 'MOTRICE_POSITION_UNAVAILABLE' }).permission, 'unavailable');
});

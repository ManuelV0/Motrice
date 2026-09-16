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

test('mantiene il fallback Android e usa un secondo tentativo', () => {
  const attempts = getLocationAttempts({ requireFresh: true, precise: true, native: true });
  assert.equal(attempts.length, 2);
  assert.equal(attempts.every((attempt) => attempt.enableLocationFallback === true), true);
  assert.equal(attempts[1].timeout, 40000);
});

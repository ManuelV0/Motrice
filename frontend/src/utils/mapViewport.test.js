import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUserFocusZoom,
  normalizeOptionalMapZoom,
  shouldUpdateFollowCenter
} from './mapViewport.js';

test('adatta lo zoom della posizione alla precisione GPS', () => {
  assert.equal(getUserFocusZoom(12), 17);
  assert.equal(getUserFocusZoom(40), 17);
  assert.equal(getUserFocusZoom(41), 16);
  assert.equal(getUserFocusZoom(100), 16);
  assert.equal(getUserFocusZoom(101), 15);
  assert.equal(getUserFocusZoom(null), 16);
});

test('non trasforma l assenza di uno zoom in una vista dell intero atlante', () => {
  assert.equal(normalizeOptionalMapZoom(null), null);
  assert.equal(normalizeOptionalMapZoom(undefined), null);
  assert.equal(normalizeOptionalMapZoom(''), null);
  assert.equal(normalizeOptionalMapZoom(16), 16);
  assert.equal(normalizeOptionalMapZoom('17'), 17);
  assert.equal(normalizeOptionalMapZoom('non-valido'), null);
});

test('ignora il normale tremolio GPS durante il seguimento della mappa', () => {
  const current = { lat: 42.853, lng: 13.575 };

  assert.equal(shouldUpdateFollowCenter(current, current), false);
  assert.equal(shouldUpdateFollowCenter(current, { lat: 42.85303, lng: 13.575 }), false);
  assert.equal(shouldUpdateFollowCenter(current, { lat: 42.8532, lng: 13.575 }), true);
  assert.equal(shouldUpdateFollowCenter(null, current), true);
  assert.equal(shouldUpdateFollowCenter(current, { lat: null, lng: null }), false);
});

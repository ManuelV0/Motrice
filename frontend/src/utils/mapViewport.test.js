import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserFocusZoom } from './mapViewport.js';

test('adatta lo zoom della posizione alla precisione GPS', () => {
  assert.equal(getUserFocusZoom(12), 17);
  assert.equal(getUserFocusZoom(40), 17);
  assert.equal(getUserFocusZoom(41), 16);
  assert.equal(getUserFocusZoom(100), 16);
  assert.equal(getUserFocusZoom(101), 15);
  assert.equal(getUserFocusZoom(null), 16);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCameraPermission } from './profileCameraPermission.js';

test('normalizza gli stati Android della fotocamera senza concedere permessi impliciti', () => {
  assert.equal(normalizeCameraPermission('granted'), 'granted');
  assert.equal(normalizeCameraPermission('prompt'), 'prompt');
  assert.equal(normalizeCameraPermission('prompt-with-rationale'), 'prompt');
  assert.equal(normalizeCameraPermission('denied'), 'denied');
  assert.equal(normalizeCameraPermission(undefined), 'unavailable');
  assert.equal(normalizeCameraPermission('limited'), 'unavailable');
});

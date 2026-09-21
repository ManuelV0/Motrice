import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkNativeProfileCameraPermission,
  normalizeCameraPermission,
  requestNativeProfileCameraPermission
} from './profileCameraPermission.js';

test('normalizza gli stati Android della fotocamera senza concedere permessi impliciti', () => {
  assert.equal(normalizeCameraPermission('granted'), 'granted');
  assert.equal(normalizeCameraPermission('prompt'), 'prompt');
  assert.equal(normalizeCameraPermission('prompt-with-rationale'), 'prompt');
  assert.equal(normalizeCameraPermission('denied'), 'denied');
  assert.equal(normalizeCameraPermission(undefined), 'unavailable');
  assert.equal(normalizeCameraPermission('limited'), 'unavailable');
});

test('usa i callback espliciti del plugin Motrice per i permessi fotocamera', async () => {
  const calls = [];
  const plugin = {
    async checkCameraPermission() {
      calls.push('checkCameraPermission');
      return { camera: 'prompt-with-rationale' };
    },
    async requestCameraPermission() {
      calls.push('requestCameraPermission');
      return { camera: 'granted' };
    },
    async checkPermissions() {
      throw new Error('Il bridge generico non deve essere utilizzato');
    },
    async requestPermissions() {
      throw new Error('Il bridge generico non deve essere utilizzato');
    }
  };

  assert.equal(await checkNativeProfileCameraPermission(plugin), 'prompt');
  assert.equal(await requestNativeProfileCameraPermission(plugin), 'granted');
  assert.deepEqual(calls, ['checkCameraPermission', 'requestCameraPermission']);
});

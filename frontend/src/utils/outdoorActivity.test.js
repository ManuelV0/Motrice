import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendOutdoorPosition,
  estimateOutdoorSteps,
  getOutdoorActivityKind,
  getOutdoorPaceSecondsPerKm
} from './outdoorActivity.js';

test('riconosce soltanto corsa e trekking come sessioni outdoor tracciate', () => {
  assert.equal(getOutdoorActivityKind({ sport_name: 'Running' }), 'running');
  assert.equal(getOutdoorActivityKind({ title: 'Trekking sul sentiero' }), 'trekking');
  assert.equal(getOutdoorActivityKind({ sport_name: 'Palestra' }), null);
});

test('accumula una distanza plausibile e ignora il rumore minimo del GPS', () => {
  const base = appendOutdoorPosition({ distanceM: 0, elevationGainM: 0, samples: [] }, {
    coords: { latitude: 42.85, longitude: 13.57, accuracy: 8, speed: 2.8, altitude: 100, altitudeAccuracy: 8 },
    timestamp: 1000
  });
  const noisy = appendOutdoorPosition(base, {
    coords: { latitude: 42.850005, longitude: 13.570005, accuracy: 8, speed: 0, altitude: 100, altitudeAccuracy: 8 },
    timestamp: 3000
  });
  assert.equal(noisy.distanceM, 0);

  const moved = appendOutdoorPosition(noisy, {
    coords: { latitude: 42.8501, longitude: 13.57, accuracy: 7, speed: 2.7, altitude: 103, altitudeAccuracy: 8 },
    timestamp: 8000
  });
  assert.ok(moved.distanceM > 8);
  assert.ok(moved.elevationGainM >= 3);
});

test('rifiuta salti GPS incompatibili con corsa o trekking', () => {
  const base = appendOutdoorPosition({ distanceM: 0, samples: [] }, {
    coords: { latitude: 42.85, longitude: 13.57, accuracy: 5 },
    timestamp: 1000
  });
  const jumped = appendOutdoorPosition(base, {
    coords: { latitude: 42.86, longitude: 13.57, accuracy: 5 },
    timestamp: 2000
  }, 'running');
  assert.equal(jumped.distanceM, 0);
  assert.equal(jumped.gpsState, 'unstable');
});

test('calcola passo medio e numero di passi stimati', () => {
  assert.equal(getOutdoorPaceSecondsPerKm(5000, 25 * 60 * 1000), 300);
  assert.equal(estimateOutdoorSteps(780, 'running'), 1000);
});

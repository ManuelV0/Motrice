import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings, normalizeMapTheme } from './appSettings.js';

test('normalizeMapTheme accepts only supported map styles', () => {
  assert.equal(normalizeMapTheme('dark'), 'dark');
  assert.equal(normalizeMapTheme('light'), 'light');
  assert.equal(normalizeMapTheme('satellite'), 'satellite');
  assert.equal(normalizeMapTheme('unknown'), DEFAULT_APP_SETTINGS.mapTheme);
});

test('normalizeAppSettings keeps safe beta defaults', () => {
  assert.deepEqual(normalizeAppSettings({}), DEFAULT_APP_SETTINGS);
  assert.deepEqual(normalizeAppSettings({
    mapTheme: 'light',
    workoutCountdownSound: false,
    workoutVibration: false,
    keepWorkoutScreenAwake: false
  }), {
    mapTheme: 'light',
    workoutCountdownSound: false,
    workoutVibration: false,
    keepWorkoutScreenAwake: false
  });
});


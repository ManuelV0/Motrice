import { safeStorageGet, safeStorageSet } from '../utils/safeStorage.js';

export const APP_SETTINGS_STORAGE_KEY = 'motrice.app-settings.v1';
export const MAP_THEME_STORAGE_KEY = 'motrice.map.theme.v2';
export const WORKOUT_SOUND_STORAGE_KEY = 'motrice.workoutCountdownSound';

export const DEFAULT_APP_SETTINGS = Object.freeze({
  mapTheme: 'satellite',
  smartArrivalEnabled: true,
  workoutCountdownSound: true,
  workoutVibration: true,
  keepWorkoutScreenAwake: true
});

export function normalizeMapTheme(value) {
  return ['satellite', 'dark', 'light'].includes(value) ? value : DEFAULT_APP_SETTINGS.mapTheme;
}

export function normalizeAppSettings(value = {}) {
  return {
    mapTheme: normalizeMapTheme(value?.mapTheme),
    smartArrivalEnabled: value?.smartArrivalEnabled !== false,
    workoutCountdownSound: value?.workoutCountdownSound !== false,
    workoutVibration: value?.workoutVibration !== false,
    keepWorkoutScreenAwake: value?.keepWorkoutScreenAwake !== false
  };
}

export function getAppSettings() {
  let persisted = {};
  try {
    persisted = JSON.parse(safeStorageGet(APP_SETTINGS_STORAGE_KEY) || '{}');
  } catch {
    persisted = {};
  }

  const legacyMapTheme = safeStorageGet(MAP_THEME_STORAGE_KEY);
  const legacyWorkoutSound = safeStorageGet(WORKOUT_SOUND_STORAGE_KEY);

  return normalizeAppSettings({
    ...persisted,
    mapTheme: legacyMapTheme || persisted.mapTheme,
    workoutCountdownSound: legacyWorkoutSound == null
      ? persisted.workoutCountdownSound
      : legacyWorkoutSound !== 'off'
  });
}

export function updateAppSettings(patch = {}) {
  const next = normalizeAppSettings({ ...getAppSettings(), ...patch });
  safeStorageSet(APP_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  safeStorageSet(MAP_THEME_STORAGE_KEY, next.mapTheme);
  safeStorageSet(WORKOUT_SOUND_STORAGE_KEY, next.workoutCountdownSound ? 'on' : 'off');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('motrice:app-settings-changed', { detail: next }));
  }
  return next;
}

import { safeStorageGet, safeStorageSet } from '../../utils/safeStorage';

export const AI_SETTINGS_KEY = 'motrice_ai_settings_v1';

export const AI_PROVIDER_MODE = {
  AUTO: 'auto',
  LOCAL: 'local',
  REMOTE: 'remote'
};

export const DEFAULT_AI_SETTINGS = {
  enableLocalAI: true,
  providerMode: AI_PROVIDER_MODE.AUTO,
  modelId: 'motrice-mini-v1',
  modelPath: 'builtin://motrice-mini-v1'
};

export function getAiSettings() {
  const raw = safeStorageGet(AI_SETTINGS_KEY);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_SETTINGS };
  const providerMode = Object.values(AI_PROVIDER_MODE).includes(raw.providerMode)
    ? raw.providerMode
    : AI_PROVIDER_MODE.AUTO;
  const isNativeCapacitor = Boolean(globalThis?.Capacitor?.isNativePlatform?.());
  return {
    enableLocalAI: isNativeCapacitor ? true : Boolean(raw.enableLocalAI),
    providerMode: isNativeCapacitor ? AI_PROVIDER_MODE.LOCAL : providerMode,
    modelId: String(raw.modelId || DEFAULT_AI_SETTINGS.modelId).trim() || DEFAULT_AI_SETTINGS.modelId,
    modelPath: String(raw.modelPath || DEFAULT_AI_SETTINGS.modelPath).trim() || DEFAULT_AI_SETTINGS.modelPath
  };
}

export function updateAiSettings(patch) {
  const next = {
    ...getAiSettings(),
    ...(patch && typeof patch === 'object' ? patch : {})
  };
  safeStorageSet(AI_SETTINGS_KEY, next);
  return next;
}

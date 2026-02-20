import { AI_PROVIDER_MODE, getAiSettings } from './settings';
import { buildClassifyPrompt, buildPromptForPurpose, buildSummarizePrompt } from './prompts';
import { localProvider } from './localProvider';
import { remoteProvider } from './remoteProvider';
import { buildAiContext } from './contextBuilder';

const DEFAULT_TIMEOUT_MS = 12000;

function withTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI timeout')), timeoutMs);
    })
  ]);
}

async function getLocalAvailability() {
  try {
    return await localProvider.isAvailable();
  } catch (error) {
    return {
      available: false,
      reason: error?.message || 'Local provider error'
    };
  }
}

async function runWithSelectedProvider(task) {
  const settings = getAiSettings();
  const isNativeCapacitor = Boolean(globalThis?.Capacitor?.isNativePlatform?.());
  const localAvailability = settings.enableLocalAI ? await getLocalAvailability() : { available: false, reason: 'Feature disattivata' };

  const runLocal = () => withTimeout(task(localProvider, settings), DEFAULT_TIMEOUT_MS);
  const runRemote = () => withTimeout(task(remoteProvider, settings), DEFAULT_TIMEOUT_MS);

  if (isNativeCapacitor) {
    if (!localAvailability.available) {
      throw new Error(localAvailability.reason || 'AI locale non disponibile su questo dispositivo');
    }
    return runLocal();
  }

  if (settings.providerMode === AI_PROVIDER_MODE.LOCAL) {
    if (!settings.enableLocalAI || !localAvailability.available) {
      return runRemote();
    }
    return runLocal();
  }

  if (settings.providerMode === AI_PROVIDER_MODE.REMOTE) {
    return runRemote();
  }

  if (settings.enableLocalAI && localAvailability.available) {
    try {
      return await runLocal();
    } catch {
      return runRemote();
    }
  }

  return runRemote();
}

export const ai = {
  async getAvailability() {
    return getLocalAvailability();
  },

  async generateText({
    prompt,
    purpose = 'generic',
    maxTokens = 120,
    temperature = 0.3,
    context,
    contextPayload
  } = {}) {
    const contextText = String(context || '').trim() || (await buildAiContext({ purpose, payload: contextPayload }));
    const basePrompt = buildPromptForPurpose({ prompt, purpose });
    const finalPrompt = [contextText ? `Contesto affidabile:\n${contextText}` : '', basePrompt].filter(Boolean).join('\n\n');
    if (!finalPrompt) throw new Error('Prompt mancante');

    return runWithSelectedProvider((provider, settings) =>
      provider.generateText({
        prompt: provider.name === 'local' ? basePrompt : finalPrompt,
        purpose,
        maxTokens,
        temperature,
        modelId: settings.modelId,
        modelPath: settings.modelPath
      })
    );
  },

  async summarize({ text, maxTokens = 90 } = {}) {
    const finalPrompt = buildSummarizePrompt(text);
    return runWithSelectedProvider((provider, settings) => {
      if (provider.summarize) {
        return provider.summarize({
          text,
          maxTokens,
          modelId: settings.modelId,
          modelPath: settings.modelPath
        });
      }

      return provider.generateText({
        prompt: finalPrompt,
        purpose: 'summarize',
        maxTokens,
        temperature: 0.2,
        modelId: settings.modelId,
        modelPath: settings.modelPath
      });
    });
  },

  async classify({ text, labels = [] } = {}) {
    const prompt = buildClassifyPrompt({ text, labels });
    const result = await runWithSelectedProvider((provider, settings) =>
      provider.generateText({
        prompt,
        purpose: 'classify',
        maxTokens: 20,
        temperature: 0,
        modelId: settings.modelId,
        modelPath: settings.modelPath
      })
    );

    const cleanText = String(result.text || '').toLowerCase();
    const winner = labels.find((label) => cleanText.includes(String(label || '').toLowerCase()));

    return {
      ...result,
      label: winner || null
    };
  }
};

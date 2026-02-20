const PLUGIN_NAME = 'MotriceLocalAI';

function getPlugin() {
  const plugins = globalThis?.Capacitor?.Plugins;
  if (!plugins) return null;
  return plugins[PLUGIN_NAME] || null;
}

function isNative() {
  return Boolean(globalThis?.Capacitor?.isNativePlatform?.());
}

export const localProvider = {
  name: 'local',

  async isAvailable() {
    const plugin = getPlugin();
    if (!plugin || typeof plugin.isAvailable !== 'function') {
      if (!isNative()) {
        return {
          available: false,
          reason: 'Runtime web: il provider locale funziona solo nell app Capacitor Android/iOS'
        };
      }
      return {
        available: false,
        reason: 'Plugin nativo non caricato: esegui cap:sync e ricompila l app mobile'
      };
    }

    try {
      const result = await plugin.isAvailable();
      return {
        available: Boolean(result?.available),
        reason: result?.reason ? String(result.reason) : ''
      };
    } catch (error) {
      return {
        available: false,
        reason: error?.message || 'Plugin locale non disponibile'
      };
    }
  },

  async generateText({ prompt, maxTokens, temperature, modelId, modelPath }) {
    const plugin = getPlugin();
    if (!plugin || typeof plugin.generateText !== 'function') {
      throw new Error(
        !isNative()
          ? 'Provider locale disponibile solo su app mobile Capacitor'
          : 'Plugin locale non caricato: esegui cap:sync e riapri l app'
      );
    }

    const result = await plugin.generateText({
      prompt: String(prompt || ''),
      maxTokens: Number(maxTokens || 120),
      temperature: Number(temperature ?? 0.3),
      modelId: String(modelId || ''),
      modelPath: String(modelPath || '')
    });

    return {
      text: String(result?.text || '').trim(),
      provider: 'local'
    };
  },

  async summarize({ text, maxTokens, modelId, modelPath }) {
    const plugin = getPlugin();
    if (!plugin || typeof plugin.summarize !== 'function') {
      throw new Error(
        !isNative()
          ? 'Provider locale disponibile solo su app mobile Capacitor'
          : 'Plugin locale non caricato: esegui cap:sync e riapri l app'
      );
    }

    const result = await plugin.summarize({
      text: String(text || ''),
      maxTokens: Number(maxTokens || 90),
      modelId: String(modelId || ''),
      modelPath: String(modelPath || '')
    });

    return {
      text: String(result?.text || '').trim(),
      provider: 'local'
    };
  }
};

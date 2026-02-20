import { request } from '../backendClient';

function fallbackText(prompt) {
  const clean = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Allenamento pronto: definisci obiettivo, ritmo e punto di ritrovo in modo chiaro.';
  return `Suggerimento rapido: ${clean.slice(0, 120)}.`;
}

export const remoteProvider = {
  name: 'remote',

  async generateText({ prompt, purpose, maxTokens, temperature, modelId }) {
    const finalPrompt = String(prompt || '').trim();
    try {
      const payload = await request('/api/ai', {
        method: 'POST',
        body: {
          action: 'generateText',
          prompt: finalPrompt,
          purpose,
          maxTokens,
          temperature,
          modelId
        }
      });
      return {
        text: String(payload?.text || '').trim(),
        provider: 'remote'
      };
    } catch {
      return {
        text: fallbackText(finalPrompt),
        provider: 'remote-mock'
      };
    }
  },

  async summarize({ text, maxTokens, modelId }) {
    try {
      const payload = await request('/api/ai', {
        method: 'POST',
        body: {
          action: 'summarize',
          text,
          maxTokens,
          modelId
        }
      });
      return {
        text: String(payload?.text || '').trim(),
        provider: 'remote'
      };
    } catch {
      const compact = String(text || '').replace(/\s+/g, ' ').trim();
      return {
        text: compact.length > 120 ? `${compact.slice(0, 117)}...` : compact,
        provider: 'remote-mock'
      };
    }
  }
};

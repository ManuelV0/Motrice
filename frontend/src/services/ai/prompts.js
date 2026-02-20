export function buildPromptForPurpose({ purpose, prompt }) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) return '';

  if (purpose === 'event_description') {
    return [
      'Scrivi una descrizione evento sportivo in italiano, 1 frase chiara, tono motivante, max 22 parole.',
      `Dettagli: ${cleanPrompt}`
    ].join('\n');
  }

  if (purpose === 'chat_suggestion') {
    return [
      'Scrivi un messaggio breve per chat di gruppo evento in italiano, positivo e operativo, max 16 parole.',
      `Contesto: ${cleanPrompt}`
    ].join('\n');
  }

  return cleanPrompt;
}

export function buildSummarizePrompt(text) {
  return `Riassumi in massimo 2 frasi: ${String(text || '').trim()}`;
}

export function buildClassifyPrompt({ text, labels }) {
  const labelList = Array.isArray(labels) ? labels.filter(Boolean).join(', ') : '';
  return `Classifica il testo in una di queste etichette: ${labelList}. Testo: ${String(text || '').trim()}`;
}

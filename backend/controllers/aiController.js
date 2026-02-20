function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function generateDeterministicText({ prompt, purpose }) {
  const cleanPrompt = cleanText(prompt);
  if (!cleanPrompt) return 'Sessione pronta: descrizione non disponibile.';

  if (purpose === 'event_description') {
    return `Allenamento ${cleanPrompt.slice(0, 72)}: ritmo progressivo e obiettivo condiviso.`;
  }

  if (purpose === 'chat_suggestion') {
    return `Perfetto team, ritrovo confermato: ${cleanPrompt.slice(0, 58)}.`;
  }

  if (purpose === 'summarize') {
    return cleanPrompt.length > 130 ? `${cleanPrompt.slice(0, 127)}...` : cleanPrompt;
  }

  if (purpose === 'classify') {
    const afterHint = cleanPrompt.split('etichette:')[1] || '';
    const labelsPart = afterHint.split('. Testo:')[0] || '';
    const firstLabel = labelsPart.split(',')[0] || 'generico';
    return firstLabel.trim() || 'generico';
  }

  return `Suggerimento Motrice: ${cleanPrompt.slice(0, 120)}.`;
}

function aiController(req, res) {
  const action = String(req.body?.action || 'generateText').trim();

  if (action === 'summarize') {
    const text = generateDeterministicText({
      prompt: req.body?.text,
      purpose: 'summarize'
    });
    return res.json({ text, provider: 'remote-stub' });
  }

  const purpose = String(req.body?.purpose || '').trim() || (action === 'classify' ? 'classify' : 'generic');
  const prompt = req.body?.prompt || req.body?.text || '';
  const text = generateDeterministicText({ prompt, purpose });
  return res.json({ text, provider: 'remote-stub' });
}

function aiToolsContextController(req, res) {
  res.json({
    product: 'Motrice',
    version: 'ai-tools-v1',
    capabilities: ['event_description', 'chat_suggestion', 'summarize', 'classify'],
    notes: [
      'Sport locale con eventi reali',
      'Check-in QR per conferma presenza',
      'Convenzioni locali con voucher'
    ]
  });
}

module.exports = {
  aiController,
  aiToolsContextController
};

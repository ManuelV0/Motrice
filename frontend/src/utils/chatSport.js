const SPORT_GLYPHS = [
  { terms: ['calcetto', 'calcio', 'football'], glyph: '⚽' },
  { terms: ['palestra', 'gym', 'fitness', 'forza', 'workout'], glyph: '🏋️' },
  { terms: ['running', 'corsa', 'jogging'], glyph: '🏃' },
  { terms: ['trekking', 'escursione', 'hiking'], glyph: '🥾' },
  { terms: ['padel', 'tennis'], glyph: '🎾' },
  { terms: ['bici', 'bike', 'ciclismo', 'mtb'], glyph: '🚴' },
  { terms: ['basket', 'pallacanestro'], glyph: '🏀' },
  { terms: ['yoga', 'meditazione'], glyph: '🧘' },
  { terms: ['nuoto', 'swimming'], glyph: '🏊' }
];

export function getChatSportGlyph(thread) {
  const value = `${thread?.meta?.sportSlug || ''} ${thread?.meta?.sportName || ''} ${thread?.title || ''}`.toLowerCase();
  return SPORT_GLYPHS.find((item) => item.terms.some((term) => value.includes(term)))?.glyph || '⚡';
}

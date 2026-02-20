import { api } from '../api';
import { MOTRICE_PRODUCT_FACTS, PURPOSE_HINTS } from './knowledgeBase';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactArray(values, maxItems = 5) {
  return (Array.isArray(values) ? values : [])
    .map((item) => clean(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function compactContextText(text, maxLen = 1600) {
  const compact = clean(text);
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, Math.max(0, maxLen - 3))}...`;
}

function serializeSections(sections) {
  return sections
    .map((section) => {
      const title = clean(section.title);
      const rows = compactArray(section.rows, 8);
      if (!title || !rows.length) return '';
      return [`${title}:`, ...rows.map((row) => `- ${row}`)].join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

async function getCommonUserSection() {
  try {
    const profile = await api.getLocalProfile();
    return {
      title: 'Utente',
      rows: [
        `Nome: ${profile?.display_name || profile?.name || 'Utente Motrice'}`,
        `Citta: ${profile?.city || 'n/d'}`,
        `Obiettivo: ${profile?.goal || 'n/d'}`
      ]
    };
  } catch {
    return {
      title: 'Utente',
      rows: ['Profilo non disponibile, usa un tono neutro e inclusivo.']
    };
  }
}

export async function buildAiContext({ purpose = 'generic', payload = {} } = {}) {
  const hints = PURPOSE_HINTS[purpose] || PURPOSE_HINTS.generic;
  const sections = [
    {
      title: 'Regole prodotto Motrice',
      rows: MOTRICE_PRODUCT_FACTS
    },
    {
      title: 'Vincoli output',
      rows: hints
    },
    await getCommonUserSection()
  ];

  if (purpose === 'event_description') {
    sections.push({
      title: 'Dettagli sessione',
      rows: [
        `Titolo: ${payload.title || 'Sessione sportiva'}`,
        `Sport: ${payload.sportName || 'n/d'}`,
        `Livello: ${payload.level || 'n/d'}`,
        `Citta: ${payload.city || 'n/d'}`,
        `Location: ${payload.locationName || 'n/d'}`
      ]
    });
  }

  if (purpose === 'chat_suggestion') {
    sections.push({
      title: 'Contesto evento',
      rows: [
        `Evento: ${payload.eventTitle || payload.sportName || 'Sessione di gruppo'}`,
        `Sport: ${payload.sportName || 'n/d'}`,
        `Location: ${payload.locationName || 'n/d'}`,
        `Data ora: ${payload.eventDateTime || 'n/d'}`,
        `Partecipanti presenti: ${Number(payload.checkedInCount || 0)}`
      ]
    });

    const names = compactArray(payload.checkedInNames, 6);
    if (names.length) {
      sections.push({
        title: 'Persone presenti',
        rows: names
      });
    }
  }

  return compactContextText(serializeSections(sections));
}

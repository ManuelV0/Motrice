function sanitize(value) {
  return String(value || '').trim();
}

function normalizeSelfName(value) {
  const name = sanitize(value);
  if (name.toLowerCase() === 'tu') return 'Me';
  return name;
}

export function buildChatWelcome(profile = {}) {
  const name = normalizeSelfName(profile.display_name) || 'utente';
  const bio = sanitize(profile.bio);
  if (bio) {
    return `Benvenuto ${name}. Ecco cosa sappiamo di te: ${bio}`;
  }
  return `Benvenuto ${name}. La bio e il tuo biglietto da visita: aggiungila in Account per presentarti al gruppo.`;
}

export function buildGroupOrganizerWelcome({
  organizerName,
  organizerBio,
  participationFeeStatus,
  participationFeeCents
} = {}) {
  const name = normalizeSelfName(organizerName) || 'Organizzatore';
  const bio = sanitize(organizerBio);
  const bioText = bio || 'Bio non ancora disponibile.';
  const feeStatus = sanitize(participationFeeStatus);
  const feeCents = Number(participationFeeCents || 0);
  const feeAmountText = feeCents > 0 ? `${(feeCents / 100).toFixed(0)} EUR` : '5 o 10 EUR';
  const quotaLine = feeStatus === 'waived_premium'
    ? '✅ Quota partecipazione: esente con Premium attivo.'
    : `📍 Quota partecipazione (${feeAmountText}) congelata: usa "Sblocca quota (posizione)" in Agenda. Se sei al punto raduno torna disponibile, altrimenti resta congelata fino alla prossima partecipazione.`;
  return [
    '👋 Benvenuti in Motrice!',
    `🏁 Organizzatore del gruppo: ${name}`,
    `🧾 Bio organizzatore: ${bioText}`,
    quotaLine,
    '💬 Usate questa chat per ritrovo, aggiornamenti e supporto.',
    '🔥 Buon allenamento da Motrice!'
  ].join('\n');
}

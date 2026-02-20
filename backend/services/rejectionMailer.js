const reasons = [
  {
    code: 'certification_unverified',
    label: 'Certificazione non verificabile',
    text: 'La certificazione caricata non e risultata verificabile o leggibile in modo completo.'
  },
  {
    code: 'profile_incomplete',
    label: 'Profilo incompleto',
    text: 'La candidatura non contiene informazioni sufficienti su bio professionale e proposta formativa.'
  },
  {
    code: 'insufficient_experience',
    label: 'Esperienza non allineata',
    text: 'Al momento il livello di esperienza indicato non e allineato ai requisiti minimi del programma coach.'
  },
  {
    code: 'contact_not_valid',
    label: 'Contatto pubblico non valido',
    text: 'L\'email di contatto pubblico fornita non e valida o non risulta raggiungibile.'
  },
  {
    code: 'policy_mismatch',
    label: 'Non conformita linee guida',
    text: 'La candidatura non rispetta una o piu linee guida del programma di collaborazione Motrice.'
  }
];

function getRejectionReasons() {
  return reasons.map((reason) => ({ ...reason }));
}

function resolveReasonText(reasonCode, customReason = '') {
  const normalizedCustom = String(customReason || '').trim();
  if (normalizedCustom) return normalizedCustom;

  const found = reasons.find((reason) => reason.code === reasonCode);
  return found ? found.text : '';
}

function buildRejectionEmail({ candidateName, toEmail, reasonText }) {
  const safeName = candidateName || 'Coach';
  const subject = 'Esito candidatura Coach Motrice';
  const body = [
    `Ciao ${safeName},`,
    '',
    'grazie per aver inviato la tua candidatura per collaborare con Motrice come Coach.',
    'Dopo la revisione del materiale ricevuto, al momento non possiamo approvare la candidatura.',
    '',
    `Motivo: ${reasonText}`,
    '',
    'Puoi aggiornare la candidatura e inviarla nuovamente quando desideri.',
    'Restiamo a disposizione per eventuali chiarimenti.',
    '',
    'Team Motrice'
  ].join('\n');

  return {
    to: toEmail,
    subject,
    body
  };
}

async function sendRejectionEmail(emailPayload) {
  // Placeholder provider: integrare provider reale (es. SMTP/Resend/Supabase Edge) nello step successivo.
  console.log('MAIL_REJECTION_PREVIEW', {
    to: emailPayload.to,
    subject: emailPayload.subject,
    body: emailPayload.body
  });

  return {
    delivered: true,
    provider: 'dev-console',
    preview: emailPayload
  };
}

module.exports = {
  getRejectionReasons,
  resolveReasonText,
  buildRejectionEmail,
  sendRejectionEmail
};

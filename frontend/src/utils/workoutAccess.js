const LOCATION_OPTIONAL_WORKOUT_EMAILS = new Set([
  'aletarqui@libero.it'
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Account di test autorizzati ad aprire una sessione senza produrre una prova
 * GPS/QR. L'eccezione non sostituisce l'iscrizione all'evento e non assegna
 * automaticamente presenza, MOT, XP o rimborsi.
 */
export function canAccessWorkoutWithoutLocation(sessionOrEmail) {
  const email = typeof sessionOrEmail === 'string'
    ? sessionOrEmail
    : sessionOrEmail?.email;
  return LOCATION_OPTIONAL_WORKOUT_EMAILS.has(normalizeEmail(email));
}

export const VENUE_TYPE_STANDARD = 'standard';
export const VENUE_TYPE_GYM = 'gym';

export const GYM_ACCESS_MEMBERS_ONLY = 'members_only';
export const GYM_ACCESS_CONTACT_VENUE = 'contact_venue';

export const GYM_ACCESS_OPTIONS = [
  {
    value: GYM_ACCESS_MEMBERS_ONLY,
    label: 'Solo abbonati',
    description: 'È necessario avere già un abbonamento attivo con la struttura.'
  },
  {
    value: GYM_ACCESS_CONTACT_VENUE,
    label: 'Ingresso da concordare',
    description: 'L’utente contatta la struttura prima dell’evento per verificare disponibilità e costo.'
  }
];

export function normalizeVenueType(value) {
  return value === VENUE_TYPE_GYM ? VENUE_TYPE_GYM : VENUE_TYPE_STANDARD;
}

export function normalizeGymAccessPolicy(venueType, value) {
  if (normalizeVenueType(venueType) !== VENUE_TYPE_GYM) return null;
  return value === GYM_ACCESS_CONTACT_VENUE
    ? GYM_ACCESS_CONTACT_VENUE
    : GYM_ACCESS_MEMBERS_ONLY;
}

export function isGymEvent(event) {
  return normalizeVenueType(event?.venue_type) === VENUE_TYPE_GYM;
}

export function getGymAccessPresentation(event) {
  if (!isGymEvent(event)) return null;

  if (normalizeGymAccessPolicy(event.venue_type, event.gym_access_policy) === GYM_ACCESS_CONTACT_VENUE) {
    return {
      label: 'Ingresso da concordare',
      shortLabel: 'Accesso da concordare',
      description: 'Contatta la struttura prima dell’evento per verificare disponibilità ed eventuale costo.'
    };
  }

  return {
    label: 'Abbonamento richiesto',
    shortLabel: 'Solo abbonati',
    description: 'Per partecipare devi avere un abbonamento attivo con questa struttura.'
  };
}

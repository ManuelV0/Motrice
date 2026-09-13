export const VENUE_TYPE_STANDARD = 'standard';
export const VENUE_TYPE_GYM = 'gym';

export const GYM_ACCESS_MEMBERS_ONLY = 'members_only';
export const GYM_ACCESS_MEMBERS_OR_TRIAL = 'members_or_trial';
export const GYM_ACCESS_CONTACT_VENUE = 'contact_venue';

export const GYM_VIEWER_ACCESS_MEMBER = 'member';
export const GYM_VIEWER_ACCESS_TRIAL = 'trial_available';
export const GYM_VIEWER_ACCESS_MEMBER_REQUIRED = 'member_required';
export const GYM_VIEWER_ACCESS_TRIAL_USED = 'trial_used';
export const GYM_VIEWER_ACCESS_CONTACT = 'contact_venue';

export const GYM_ACCESS_OPTIONS = [
  {
    value: GYM_ACCESS_MEMBERS_ONLY,
    label: 'Solo abbonati',
    description: 'È necessario avere già un abbonamento attivo con la struttura.'
  },
  {
    value: GYM_ACCESS_MEMBERS_OR_TRIAL,
    label: 'Abbonati o prima prova',
    description: 'Gli abbonati entrano direttamente; gli altri possono usare una prova gratuita verificata.'
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
  if (value === GYM_ACCESS_MEMBERS_OR_TRIAL) return GYM_ACCESS_MEMBERS_OR_TRIAL;
  if (value === GYM_ACCESS_CONTACT_VENUE) return GYM_ACCESS_CONTACT_VENUE;
  return GYM_ACCESS_MEMBERS_ONLY;
}

export function normalizeGymVenueKey(value, fallback = '') {
  const safeValue = String(value || fallback || '')
    .trim()
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return safeValue || null;
}

export function isGymEvent(event) {
  return normalizeVenueType(event?.venue_type) === VENUE_TYPE_GYM;
}

export function getGymAccessPresentation(event, viewerAccess = null) {
  if (!isGymEvent(event)) return null;

  const viewerStatus = String(viewerAccess?.status || '').trim();
  if (viewerStatus === GYM_VIEWER_ACCESS_MEMBER) {
    return {
      status: viewerStatus,
      label: 'Abbonamento verificato',
      shortLabel: 'Accesso incluso',
      description: 'Il tuo abbonamento con questa struttura è attivo. Non sono previsti costi di ingresso.',
      canParticipate: true,
      tone: 'success'
    };
  }
  if (viewerStatus === GYM_VIEWER_ACCESS_TRIAL) {
    return {
      status: viewerStatus,
      label: 'Prima prova gratuita',
      shortLabel: 'Prova gratuita',
      description: 'Puoi prenotare una prova gratuita. Verrà considerata utilizzata soltanto dopo il check-in in palestra.',
      canParticipate: true,
      tone: 'success'
    };
  }
  if (viewerStatus === GYM_VIEWER_ACCESS_TRIAL_USED) {
    return {
      status: viewerStatus,
      label: 'Prova già utilizzata',
      shortLabel: 'Accesso da verificare',
      description: 'Hai già utilizzato la prova gratuita in questa struttura. Verifica un abbonamento o contatta la palestra.',
      canParticipate: false,
      tone: 'warning'
    };
  }
  if (viewerStatus === GYM_VIEWER_ACCESS_MEMBER_REQUIRED) {
    return {
      status: viewerStatus,
      label: 'Abbonamento richiesto',
      shortLabel: 'Solo abbonati',
      description: 'Per partecipare serve un abbonamento attivo e verificato con questa struttura.',
      canParticipate: false,
      tone: 'warning'
    };
  }
  if (viewerStatus === GYM_VIEWER_ACCESS_CONTACT) {
    return {
      status: viewerStatus,
      label: 'Ingresso da concordare',
      shortLabel: 'Accesso da concordare',
      description: 'Contatta la struttura prima dell’evento per confermare disponibilità ed eventuale costo.',
      canParticipate: true,
      tone: 'neutral'
    };
  }

  const policy = normalizeGymAccessPolicy(event.venue_type, event.gym_access_policy);
  if (policy === GYM_ACCESS_MEMBERS_OR_TRIAL) {
    return {
      status: GYM_ACCESS_MEMBERS_OR_TRIAL,
      label: 'Abbonati o prima prova',
      shortLabel: 'Prova disponibile',
      description: 'Gli abbonati verificati entrano direttamente; gli altri possono richiedere una prima prova gratuita.',
      canParticipate: true,
      tone: 'success'
    };
  }

  if (policy === GYM_ACCESS_CONTACT_VENUE) {
    return {
      status: GYM_VIEWER_ACCESS_CONTACT,
      label: 'Ingresso da concordare',
      shortLabel: 'Accesso da concordare',
      description: 'Contatta la struttura prima dell’evento per verificare disponibilità ed eventuale costo.',
      canParticipate: true,
      tone: 'neutral'
    };
  }

  return {
    status: GYM_VIEWER_ACCESS_MEMBER_REQUIRED,
    label: 'Abbonamento richiesto',
    shortLabel: 'Solo abbonati',
    description: 'Per partecipare devi avere un abbonamento attivo con questa struttura.',
    canParticipate: false,
    tone: 'warning'
  };
}

export function resolveGymViewerAccess(event, membership = null, trialUsed = false) {
  if (!isGymEvent(event)) return null;
  const membershipStatus = String(membership?.status || '').toLowerCase();
  const membershipEndsAt = Date.parse(membership?.ends_at || membership?.endsAt || '');
  const membershipActive = membershipStatus === 'active' &&
    (!Number.isFinite(membershipEndsAt) || membershipEndsAt > Date.now());
  if (membershipActive) {
    return { status: GYM_VIEWER_ACCESS_MEMBER, can_participate: true, entry_price_cents: 0 };
  }

  const policy = normalizeGymAccessPolicy(event.venue_type, event.gym_access_policy);
  if (policy === GYM_ACCESS_MEMBERS_OR_TRIAL) {
    return trialUsed
      ? { status: GYM_VIEWER_ACCESS_TRIAL_USED, can_participate: false, entry_price_cents: 0 }
      : { status: GYM_VIEWER_ACCESS_TRIAL, can_participate: true, entry_price_cents: 0 };
  }
  if (policy === GYM_ACCESS_CONTACT_VENUE) {
    return { status: GYM_VIEWER_ACCESS_CONTACT, can_participate: true, entry_price_cents: null };
  }
  return { status: GYM_VIEWER_ACCESS_MEMBER_REQUIRED, can_participate: false, entry_price_cents: 0 };
}

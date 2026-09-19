export const VENUE_TYPE_STANDARD = 'standard';
export const VENUE_TYPE_GYM = 'gym';

export const GYM_ACCESS_PARTICIPANT_CHOICE = 'participant_choice';
export const GYM_ACCESS_MEMBERS_ONLY = 'members_only';
export const GYM_ACCESS_MEMBERS_OR_TRIAL = 'members_or_trial';
export const GYM_ACCESS_CONTACT_VENUE = 'contact_venue';

export const GYM_VIEWER_ACCESS_MEMBER = 'member';
export const GYM_VIEWER_ACCESS_MEMBER_DECLARED = 'member_declared';
export const GYM_VIEWER_ACCESS_TRIAL = 'trial_available';
export const GYM_VIEWER_ACCESS_MEMBER_REQUIRED = 'member_required';
export const GYM_VIEWER_ACCESS_TRIAL_USED = 'trial_used';
export const GYM_VIEWER_ACCESS_CONTACT = 'contact_venue';
export const GYM_VIEWER_ACCESS_DAY_PASS = 'day_pass';
export const GYM_VIEWER_ACCESS_SELECTION_REQUIRED = 'selection_required';

export const GYM_ENTRY_MEMBER = 'member';
export const GYM_ENTRY_TRIAL = 'trial';
export const GYM_ENTRY_DAY_PASS = 'day_pass';

export const GYM_ENTRY_OPTIONS = [
  {
    value: GYM_ENTRY_MEMBER,
    label: 'Sono già abbonato',
    description: 'L’ingresso è incluso nel tuo abbonamento alla palestra.'
  },
  {
    value: GYM_ENTRY_TRIAL,
    label: 'Prima entrata gratuita',
    description: 'Usa la prova della struttura, se non l’hai già utilizzata.'
  },
  {
    value: GYM_ENTRY_DAY_PASS,
    label: 'Ingresso giornaliero',
    description: 'Pagherai l’ingresso direttamente secondo le condizioni della palestra.'
  }
];

export function normalizeVenueType(value) {
  return value === VENUE_TYPE_GYM ? VENUE_TYPE_GYM : VENUE_TYPE_STANDARD;
}

export function normalizeGymAccessPolicy(venueType, value) {
  if (normalizeVenueType(venueType) !== VENUE_TYPE_GYM) return null;
  // Valore ponte per i client Android già distribuiti: il nuovo flusso non
  // mostra né usa questa policy e salva la scelta personale separatamente.
  return GYM_ACCESS_CONTACT_VENUE;
}

export function normalizeGymEntryChoice(value) {
  if (value === GYM_ENTRY_MEMBER) return GYM_ENTRY_MEMBER;
  if (value === GYM_ENTRY_TRIAL) return GYM_ENTRY_TRIAL;
  if (value === GYM_ENTRY_DAY_PASS) return GYM_ENTRY_DAY_PASS;
  return null;
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
  if (viewerStatus === GYM_VIEWER_ACCESS_MEMBER_DECLARED) {
    return {
      status: viewerStatus,
      label: 'Abbonamento dichiarato',
      shortLabel: 'Già abbonato',
      description: 'Hai indicato di essere già abbonato. La struttura potrà verificare l’accesso all’arrivo.',
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
      shortLabel: 'Scegli un altro accesso',
      description: 'La prova gratuita risulta già utilizzata. Puoi indicare un abbonamento oppure scegliere l’ingresso giornaliero.',
      canParticipate: true,
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
  if (viewerStatus === GYM_VIEWER_ACCESS_DAY_PASS) {
    return {
      status: viewerStatus,
      label: 'Ingresso giornaliero',
      shortLabel: 'Ingresso a pagamento',
      description: 'Il costo della palestra è separato dalla caparra Motrice e viene gestito secondo le condizioni della struttura.',
      canParticipate: true,
      tone: 'neutral'
    };
  }
  if (viewerStatus === GYM_VIEWER_ACCESS_SELECTION_REQUIRED) {
    return {
      status: viewerStatus,
      label: 'Scegli il tuo tipo di ingresso',
      shortLabel: 'Accesso palestra',
      description: 'Quando partecipi indica se sei abbonato, usi la prima entrata gratuita oppure acquisti un ingresso giornaliero.',
      canParticipate: true,
      tone: 'neutral'
    };
  }

  return {
    status: GYM_VIEWER_ACCESS_SELECTION_REQUIRED,
    label: 'Accesso gestito dal partecipante',
    shortLabel: 'Accesso palestra',
    description: 'Ogni partecipante sceglie il proprio tipo di ingresso al momento della richiesta.',
    canParticipate: true,
    tone: 'neutral'
  };
}

export function resolveGymViewerAccess(event, membership = null, trialUsed = false, selectedChoice = null) {
  if (!isGymEvent(event)) return null;
  const membershipStatus = String(membership?.status || '').toLowerCase();
  const membershipEndsAt = Date.parse(membership?.ends_at || membership?.endsAt || '');
  const membershipActive = membershipStatus === 'active' &&
    (!Number.isFinite(membershipEndsAt) || membershipEndsAt > Date.now());
  const choice = normalizeGymEntryChoice(selectedChoice) || (membershipActive ? GYM_ENTRY_MEMBER : null);

  if (!choice) {
    return {
      status: GYM_VIEWER_ACCESS_SELECTION_REQUIRED,
      selected_choice: null,
      can_participate: true,
      membership_verified: membershipActive,
      trial_used: Boolean(trialUsed),
      entry_price_cents: null
    };
  }
  if (choice === GYM_ENTRY_MEMBER) {
    return {
      status: membershipActive ? GYM_VIEWER_ACCESS_MEMBER : GYM_VIEWER_ACCESS_MEMBER_DECLARED,
      selected_choice: choice,
      can_participate: true,
      membership_verified: membershipActive,
      trial_used: Boolean(trialUsed),
      entry_price_cents: 0
    };
  }
  if (choice === GYM_ENTRY_TRIAL) {
    return trialUsed
      ? { status: GYM_VIEWER_ACCESS_TRIAL_USED, selected_choice: choice, can_participate: false, membership_verified: membershipActive, trial_used: true, entry_price_cents: 0 }
      : { status: GYM_VIEWER_ACCESS_TRIAL, selected_choice: choice, can_participate: true, membership_verified: membershipActive, trial_used: false, entry_price_cents: 0 };
  }
  return {
    status: GYM_VIEWER_ACCESS_DAY_PASS,
    selected_choice: GYM_ENTRY_DAY_PASS,
    can_participate: true,
    membership_verified: membershipActive,
    trial_used: Boolean(trialUsed),
    entry_price_cents: null
  };
}

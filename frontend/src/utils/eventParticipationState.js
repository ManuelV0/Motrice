import { getEventTiming } from './eventLifecycle.js';
import { isOutdoorTrackedEvent } from './outdoorActivity.js';
import { getEventSessionTimeline } from './sessionTimeline.js';

const CONFIRMED_PARTICIPATION_STATUSES = new Set(['going', 'completed']);

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

export function resolveParticipantOutcome(source) {
  const nestedParticipant = source?.user_rsvp || source?.my_participant || null;
  const looksLikeEvent = Boolean(
    source && (
      'event_datetime' in source ||
      'starts_at' in source ||
      'participants_count' in source ||
      'organizer' in source
    )
  );
  const participant = nestedParticipant || (looksLikeEvent ? {} : source) || {};
  const hasParticipantRecord = Boolean(
    nestedParticipant ||
    participant.user_id ||
    participant.status ||
    participant.lifecycle_state ||
    source?.participant_status ||
    source?.participant_lifecycle_state
  );
  const moneyHoldStatus = normalized(source?.money_hold?.status || participant.money_hold_status);
  const settlementAttendees = Number(source?.money_settlement?.attendee_count);
  const settlementNoShows = Number(source?.money_settlement?.no_show_count);
  const hasSingletonSettlement = hasParticipantRecord &&
    Number.isFinite(settlementAttendees) &&
    Number.isFinite(settlementNoShows) &&
    settlementAttendees + settlementNoShows === 1;
  const lifecycleState = normalized(
    participant.lifecycle_state || source?.participant_lifecycle_state
  );
  const status = normalized(participant.status || source?.participant_status);
  const attendance = normalized(participant.attendance);

  // The money hold and a single-person settlement are produced by the same
  // verified-presence rule that moves real balances. They repair stale legacy
  // participant rows without guessing which member attended a group event.
  if (moneyHoldStatus === 'forfeited' || (hasSingletonSettlement && settlementNoShows === 1)) {
    return { id: 'no_show', lifecycleState, status, attendance: 'no_show', isPresent: false };
  }
  if (
    ['pending_return', 'released'].includes(moneyHoldStatus) ||
    (hasSingletonSettlement && settlementAttendees === 1)
  ) {
    return { id: 'completed', lifecycleState, status, attendance: 'attended', isPresent: true };
  }

  // Terminal server states always win over check-in timestamps and legacy
  // cashback values. A check-in alone is not a completed presence.
  if (lifecycleState === 'no_show' || status === 'no_show' || attendance === 'no_show') {
    return { id: 'no_show', lifecycleState, status, attendance: 'no_show', isPresent: false };
  }
  if (
    lifecycleState === 'cancelled' ||
    status === 'cancelled' ||
    attendance === 'cancelled' ||
    attendance === 'cancelled_late'
  ) {
    return {
      id: attendance === 'cancelled_late' ? 'cancelled_late' : 'cancelled',
      lifecycleState,
      status,
      attendance: attendance || 'cancelled',
      isPresent: false
    };
  }
  if (lifecycleState === 'rejected' || status === 'rejected' || status === 'declined') {
    return { id: 'rejected', lifecycleState, status, attendance: null, isPresent: false };
  }
  if (lifecycleState === 'completed' || status === 'completed' || attendance === 'attended') {
    return { id: 'completed', lifecycleState, status, attendance: 'attended', isPresent: true };
  }
  if (
    lifecycleState === 'active' ||
    lifecycleState === 'checked_in' ||
    participant.checked_in_at ||
    Number(participant.cashback_percent || 0) >= 60
  ) {
    return { id: 'checked_in', lifecycleState, status, attendance: null, isPresent: false };
  }
  if (lifecycleState === 'confirmed' || CONFIRMED_PARTICIPATION_STATUSES.has(status)) {
    return { id: 'confirmed', lifecycleState, status, attendance: null, isPresent: false };
  }
  if (lifecycleState === 'requested' || status === 'pending') {
    return { id: 'requested', lifecycleState, status, attendance: null, isPresent: false };
  }
  return { id: 'none', lifecycleState, status, attendance: attendance || null, isPresent: false };
}

export function resolveParticipantPresenceStatus({ participant, timing = {}, eventHasPassed = false }) {
  const outcome = resolveParticipantOutcome(participant);
  const isPresent = ['checked_in', 'completed'].includes(outcome.id);
  const isCancelled = ['cancelled', 'cancelled_late', 'rejected'].includes(outcome.id);

  if (isPresent) return { id: 'present', label: 'Presente' };
  if (outcome.id === 'no_show' || (eventHasPassed && !isCancelled)) {
    return { id: 'absent', label: 'Assente' };
  }
  if (outcome.id === 'requested') {
    return { id: 'request_pending', label: 'Richiesta in attesa' };
  }
  if (timing.phase === 'scheduled') {
    return {
      id: 'registered',
      label: 'Iscritto',
      checkInOpensAtMs: timing.checkInOpensAtMs ?? null
    };
  }
  if (timing.isCheckInOpen || ['checkin_open', 'live_checkin'].includes(timing.phase)) {
    return { id: 'waiting_checkin', label: 'In attesa di check-in' };
  }
  if (timing.phase === 'in_progress') {
    return { id: 'missing_checkin', label: 'Check-in non registrato' };
  }
  return { id: 'registered', label: 'Iscritto', checkInOpensAtMs: timing.checkInOpensAtMs ?? null };
}

export function hasConfirmedEventParticipation(event) {
  const outcome = resolveParticipantOutcome(event);
  return ['confirmed', 'checked_in', 'completed'].includes(outcome.id) || (
    Boolean(event?.is_going) && !['cancelled', 'cancelled_late', 'no_show', 'rejected'].includes(outcome.id)
  );
}

export function resolveEventParticipationState({ event, isOrganizer = false, isFull = false }) {
  const joinRequestStatus = normalized(event?.join_request_status);
  const cashbackPercent = Number(event?.user_rsvp?.cashback_percent || 0);
  const confirmed = hasConfirmedEventParticipation(event);
  const approvalRequired = normalized(event?.join_policy) === 'approval';
  const eventStartMs = Date.parse(event?.event_datetime || '');
  const eventDurationMinutes = Math.max(30, Number(event?.duration_minutes || 120));
  const isLiveWindow = Number.isFinite(eventStartMs) &&
    Date.now() >= eventStartMs - 30 * 60 * 1000 &&
    Date.now() <= eventStartMs + (eventDurationMinutes + 60) * 60 * 1000;

  if (isOrganizer) {
    return {
      id: 'organizer',
      tone: 'organizer',
      title: 'Gestione organizer attiva',
      description: approvalRequired
        ? 'Approva le richieste qui; registra i check-in dalla sezione I miei eventi.'
        : 'Controlla gli iscritti qui; registra i check-in dalla sezione I miei eventi.',
      badge: 'Organizer',
      stepIndex: 0,
      action: 'progress',
      actionLabel: 'Gestisci richieste e check-in',
      canAccessChat: true,
      canCancel: false
    };
  }

  const participantOutcome = resolveParticipantOutcome(event);

  if (participantOutcome.id === 'no_show') {
    return {
      id: 'no_show',
      tone: 'danger',
      title: 'Evento chiuso · No-show',
      description: 'La presenza non è stata verificata: non sono state assegnate ricompense.',
      badge: 'Assente',
      stepIndex: 1,
      action: 'none',
      canAccessChat: false,
      canCancel: false
    };
  }

  if (participantOutcome.id === 'completed') {
    return {
      id: 'completed',
      tone: 'success',
      title: 'Partecipazione completata',
      description: 'Presenza completata: deposito e ricompense sono stati aggiornati.',
      badge: 'Completata',
      stepIndex: 4,
      action: 'progress',
      actionLabel: 'Vedi risultato',
      canAccessChat: true,
      canCancel: false
    };
  }

  if (participantOutcome.id === 'cancelled' || participantOutcome.id === 'cancelled_late') {
    return {
      id: participantOutcome.id,
      tone: 'danger',
      title: participantOutcome.id === 'cancelled_late' ? 'Partecipazione annullata in ritardo' : 'Partecipazione annullata',
      description: 'La partecipazione non è più attiva.',
      badge: 'Annullata',
      stepIndex: 0,
      action: 'none',
      canAccessChat: false,
      canCancel: false
    };
  }

  if (
    confirmed &&
    (
      participantOutcome.id === 'checked_in'
    )
  ) {
    return {
      id: 'checked_in',
      tone: 'success',
      title: 'Check-in verificato',
      description: 'Presenza registrata. Rimani nell’area fino al tempo minimo richiesto.',
      badge: `${Math.max(60, cashbackPercent)}%`,
      stepIndex: 3,
      action: 'progress',
      actionLabel: 'Segui avanzamento',
      canAccessChat: true,
      canCancel: false,
      shouldPoll: true
    };
  }

  if (confirmed) {
    return {
      id: 'confirmed',
      tone: 'success',
      title: 'Partecipazione confermata',
      description: 'Il posto è riservato. Il QR personale è disponibile in I miei eventi.',
      badge: 'Confermata',
      stepIndex: 2,
      action: 'cancel',
      actionLabel: 'Annulla partecipazione',
      canAccessChat: true,
      canCancel: true,
      shouldPoll: isLiveWindow
    };
  }

  if (joinRequestStatus === 'pending' || event?.is_join_pending) {
    return {
      id: 'pending',
      tone: 'waiting',
      title: 'Richiesta in valutazione',
      description: 'L’organizzatore deve approvarla. La schermata si aggiorna automaticamente.',
      badge: 'In attesa',
      stepIndex: 1,
      action: 'none',
      actionLabel: 'In attesa di approvazione',
      canAccessChat: false,
      canCancel: false,
      shouldPoll: true
    };
  }

  if (joinRequestStatus === 'declined') {
    return {
      id: 'declined',
      tone: 'danger',
      title: 'Richiesta non approvata',
      description: 'Puoi inviarne una nuova finché l’evento accetta partecipanti.',
      badge: 'Rifiutata',
      stepIndex: 0,
      action: 'join',
      actionLabel: 'Invia una nuova richiesta',
      canAccessChat: false,
      canCancel: false
    };
  }

  if (normalized(event?.status) === 'cancelled') {
    return {
      id: 'cancelled',
      tone: 'danger',
      title: 'Evento annullato',
      description: 'L’organizzatore ha annullato questo evento.',
      badge: 'Annullato',
      stepIndex: 0,
      action: 'none',
      canAccessChat: false,
      canCancel: false
    };
  }

  if (event?.has_passed || normalized(event?.status) === 'completed') {
    return {
      id: 'closed',
      tone: 'neutral',
      title: 'Iscrizioni chiuse',
      description: 'L’evento è terminato e non accetta nuove partecipazioni.',
      badge: 'Chiuso',
      stepIndex: 0,
      action: 'none',
      canAccessChat: false,
      canCancel: false
    };
  }

  if (isFull) {
    return {
      id: 'full',
      tone: 'neutral',
      title: 'Evento al completo',
      description: 'Tutti i posti disponibili sono già stati assegnati.',
      badge: 'Completo',
      stepIndex: 0,
      action: 'none',
      canAccessChat: false,
      canCancel: false
    };
  }

  return {
    id: 'joinable',
    tone: 'ready',
    title: approvalRequired ? 'Richiedi il tuo posto' : 'Posto disponibile',
    description: approvalRequired
      ? 'Invia una richiesta: il deposito viene riservato e si libera se non viene accettata.'
      : 'Conferma ora: il deposito verrà bloccato e il QR sarà generato subito.',
    badge: approvalRequired ? 'Su richiesta' : 'Accesso diretto',
    stepIndex: 0,
    action: 'join',
    actionLabel: approvalRequired ? 'Richiedi di partecipare' : 'Partecipa',
    canAccessChat: false,
    canCancel: false
  };
}

function hasCompletedFeedback(event, isOrganizer) {
  if (isOrganizer) {
    return Boolean(
      event?.organizer_feedback_completed ||
      event?.organizer_review_submitted ||
      event?.feedback_completed
    );
  }
  return Boolean(
    event?.user_rsvp?.review_submitted ||
    event?.user_rsvp?.reviewed ||
    event?.review_submitted
  );
}

function sessionAction(event, { waiting = false } = {}) {
  if (waiting) {
    return {
      id: 'waiting_start',
      label: 'Attendi l\u2019inizio',
      target: 'wait',
      disabled: true,
      tone: 'neutral'
    };
  }
  if (isOutdoorTrackedEvent(event)) {
    return {
      id: 'open_outdoor',
      label: 'Apri attivit\u00e0',
      target: 'outdoor',
      disabled: false,
      tone: 'primary'
    };
  }
  if (event?.workout_plan) {
    return {
      id: 'open_workout',
      label: 'Apri allenamento',
      target: 'workout',
      disabled: false,
      tone: 'primary'
    };
  }
  return {
    id: 'open_event',
    label: 'Apri evento',
    target: 'event',
    disabled: false,
    tone: 'primary'
  };
}

/**
 * Single source of truth for the next useful event action.
 *
 * UI surfaces may render the result differently, but must not independently
 * infer a competing action from dates, role or RSVP fields.
 */
export function resolveEventPrimaryAction({
  event,
  isOrganizer = event?.created_by === 'me',
  isFull = false,
  referenceTime = Date.now()
}) {
  const timing = getEventTiming(event || {}, referenceTime);
  const sessionTimeline = getEventSessionTimeline(event, timing, referenceTime);
  const outcome = resolveParticipantOutcome(event);
  const approvalRequired = normalized(event?.join_policy) === 'approval';
  const cancelled = timing.phase === 'cancelled' || normalized(event?.status) === 'cancelled';
  const completed = sessionTimeline.hasEnded || normalized(event?.status) === 'completed';
  const feedbackEligible = Boolean(
    timing.isPostEventWindow && (isOrganizer || outcome.id === 'completed')
  );

  if (cancelled) {
    return {
      id: 'cancelled_summary',
      label: isOrganizer ? 'Riepilogo annullamento' : 'Vedi rimborso',
      target: 'event',
      disabled: false,
      tone: 'neutral'
    };
  }

  if (completed || ['completed', 'no_show'].includes(outcome.id)) {
    if (feedbackEligible && !hasCompletedFeedback(event, isOrganizer)) {
      return {
        id: 'feedback',
        label: 'Valuta partecipanti',
        target: 'feedback',
        disabled: false,
        tone: 'primary'
      };
    }
    return {
      id: 'summary',
      label: 'Vedi riepilogo',
      target: 'event',
      disabled: false,
      tone: 'neutral'
    };
  }

  if (event?.is_personal) {
    if (timing.phase === 'active' || timing.phase === 'in_progress' || timing.phase === 'live_checkin') {
      return sessionAction(event);
    }
    return {
      id: 'personal_details',
      label: 'Vedi allenamento',
      target: 'event',
      disabled: false,
      tone: 'neutral'
    };
  }

  if (isOrganizer) {
    if (sessionTimeline.hasStarted && !sessionTimeline.hasEnded) {
      return sessionAction(event);
    }
    if (timing.isCheckInOpen || timing.phase === 'checkin_open' || timing.phase === 'live_checkin') {
      return {
        id: 'organizer_checkin',
        label: 'Verifica partecipanti',
        target: 'verify',
        disabled: false,
        tone: 'primary'
      };
    }

    if (timing.phase === 'in_progress' || timing.lifecycleState === 'active') {
      const checkedInCount = Math.max(0, Number(event?.participants_checked_in_count || 0));
      if (checkedInCount === 0 && timing.canExtendCheckIn) {
        return {
          id: 'organizer_extend_checkin',
          label: 'Gestisci check-in',
          target: 'verify',
          disabled: false,
          tone: 'primary'
        };
      }
      return sessionAction(event);
    }

    return {
      id: approvalRequired ? 'manage_requests' : 'manage_event',
      label: approvalRequired ? 'Gestisci richieste' : 'Gestisci evento',
      target: 'manage',
      disabled: false,
      tone: 'primary'
    };
  }

  if (outcome.id === 'checked_in') {
    return sessionAction(event, { waiting: !sessionTimeline.hasStarted });
  }

  if (outcome.id === 'confirmed' || hasConfirmedEventParticipation(event)) {
    if (timing.isCheckInOpen || ['checkin_open', 'live_checkin'].includes(timing.phase)) {
      return {
        id: 'participant_checkin',
        label: 'Verifica presenza',
        target: 'verify',
        disabled: false,
        tone: 'primary'
      };
    }
    return {
      id: 'confirmed_details',
      label: 'Vedi dettagli',
      target: 'event',
      disabled: false,
      tone: 'neutral'
    };
  }

  if (['requested', 'pending'].includes(outcome.id) || event?.is_join_pending || normalized(event?.join_request_status) === 'pending') {
    return {
      id: 'request_pending',
      label: 'Richiesta inviata',
      target: 'wait',
      disabled: true,
      tone: 'neutral'
    };
  }

  if (outcome.id === 'cancelled' || outcome.id === 'cancelled_late') {
    return {
      id: 'participation_cancelled',
      label: 'Vedi evento',
      target: 'event',
      disabled: false,
      tone: 'neutral'
    };
  }

  if (isFull) {
    return {
      id: 'full',
      label: 'Evento al completo',
      target: 'wait',
      disabled: true,
      tone: 'neutral'
    };
  }

  return {
    id: approvalRequired ? 'request_join' : 'join',
    label: approvalRequired ? 'Richiedi di partecipare' : 'Partecipa',
    target: 'join',
    disabled: false,
    tone: 'primary'
  };
}

export function getEventPrimaryActionPath(event, action) {
  const eventId = encodeURIComponent(String(event?.id || ''));
  if (!eventId) return '';
  switch (action?.target) {
    case 'verify':
      return `/agenda?verifyEvent=${eventId}`;
    case 'workout':
      return `/events/${eventId}/workout`;
    case 'outdoor':
      return `/events/${eventId}/activity`;
    case 'join':
      return `/events/${eventId}?action=join`;
    case 'manage':
      return `/events/${eventId}#organizer-controls`;
    case 'feedback':
      return `/events/${eventId}#post-event-feedback`;
    case 'event':
    default:
      return `/events/${eventId}`;
  }
}

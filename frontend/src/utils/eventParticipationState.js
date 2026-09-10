import { getEventTiming } from './eventLifecycle.js';
import { isOutdoorTrackedEvent } from './outdoorActivity.js';

const CONFIRMED_PARTICIPATION_STATUSES = new Set(['going', 'completed']);

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

export function resolveParticipantOutcome(source) {
  const participant = source?.user_rsvp || source?.my_participant || source || {};
  const lifecycleState = normalized(
    participant.lifecycle_state || source?.participant_lifecycle_state
  );
  const status = normalized(participant.status || source?.participant_status);
  const attendance = normalized(participant.attendance);

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
      ? 'Invia una richiesta: il deposito verrà bloccato solo dopo l’approvazione.'
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
  const outcome = resolveParticipantOutcome(event);
  const approvalRequired = normalized(event?.join_policy) === 'approval';
  const cancelled = timing.phase === 'cancelled' || normalized(event?.status) === 'cancelled';
  const completed = timing.hasEnded || timing.phase === 'completed' || normalized(event?.status) === 'completed';
  const feedbackEligible = Boolean(isOrganizer || outcome.id === 'completed');

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
    const beforeStart = Number.isFinite(timing.startsAtMs) && Number(referenceTime) < timing.startsAtMs;
    return sessionAction(event, { waiting: beforeStart });
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

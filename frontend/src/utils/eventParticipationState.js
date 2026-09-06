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

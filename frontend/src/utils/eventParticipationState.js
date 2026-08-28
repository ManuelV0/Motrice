const CONFIRMED_PARTICIPATION_STATUSES = new Set(['going', 'completed']);

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

export function hasConfirmedEventParticipation(event) {
  const participantStatus = normalized(event?.user_rsvp?.status || event?.participant_status);
  return CONFIRMED_PARTICIPATION_STATUSES.has(participantStatus) || (
    Boolean(event?.is_going) && participantStatus !== 'cancelled' && participantStatus !== 'no_show'
  );
}

export function resolveEventParticipationState({ event, isOrganizer = false, isFull = false }) {
  const participantStatus = normalized(event?.user_rsvp?.status || event?.participant_status);
  const joinRequestStatus = normalized(event?.join_request_status);
  const attendance = normalized(event?.user_rsvp?.attendance);
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
        ? 'Approva le richieste e registra i check-in dalla dashboard qui sotto.'
        : 'Controlla gli iscritti e registra i check-in dalla dashboard qui sotto.',
      badge: 'Organizer',
      stepIndex: 0,
      action: 'progress',
      actionLabel: 'Gestisci richieste e check-in',
      canAccessChat: true,
      canCancel: false
    };
  }

  if (participantStatus === 'completed' || attendance === 'attended' || cashbackPercent >= 100) {
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

  if (participantStatus === 'no_show' || attendance === 'no_show') {
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

  if (confirmed && (event?.user_rsvp?.checked_in_at || cashbackPercent >= 60)) {
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
      description: 'Il posto è riservato e il QR personale è disponibile qui sotto.',
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

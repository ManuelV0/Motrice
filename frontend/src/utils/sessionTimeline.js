function timestamp(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEventTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function getEventSessionStartAt(event) {
  if (event?.is_personal) return null;
  return timestamp(
    event?.session_started_at
      || event?.user_rsvp?.checked_in_at
      || event?.checked_in_at
  );
}

export function getEventSessionTimeline(event, timing, referenceTime = Date.now()) {
  const nowMs = referenceTime instanceof Date ? referenceTime.getTime() : Number(referenceTime);
  const plannedStartAtMs = Number(timing?.startsAtMs);
  const plannedEndAtMs = Number(timing?.endsAtMs);
  const checkedInAtMs = getEventSessionStartAt(event);
  const scheduledDurationMs = Number.isFinite(plannedStartAtMs)
    && Number.isFinite(plannedEndAtMs)
    && plannedEndAtMs > plannedStartAtMs
    ? plannedEndAtMs - plannedStartAtMs
    : Math.max(1, Number(event?.duration_minutes || 0)) * 60 * 1000;

  if (!Number.isFinite(plannedStartAtMs) || !Number.isFinite(scheduledDurationMs) || scheduledDurationMs <= 0) {
    return {
      progress: 0,
      label: 'Orario evento',
      hasStarted: false,
      hasEnded: false,
      startsAtMs: null,
      endsAtMs: null
    };
  }

  const requiresCheckIn = !event?.is_personal;
  const actualStartAtMs = requiresCheckIn ? checkedInAtMs : plannedStartAtMs;

  if (!Number.isFinite(actualStartAtMs)) {
    const plannedHasEnded = Number.isFinite(plannedEndAtMs) && nowMs >= plannedEndAtMs;
    return {
      progress: plannedHasEnded ? 100 : 0,
      label: plannedHasEnded
        ? 'Sessione conclusa'
        : nowMs < plannedStartAtMs
          ? `Inizia alle ${formatEventTime(plannedStartAtMs)}`
          : 'In attesa del check-in',
      hasStarted: false,
      hasEnded: plannedHasEnded,
      startsAtMs: null,
      endsAtMs: plannedEndAtMs
    };
  }

  const actualEndAtMs = actualStartAtMs + scheduledDurationMs;
  if (nowMs < actualStartAtMs) {
    return {
      progress: 0,
      label: `Inizia alle ${formatEventTime(actualStartAtMs)}`,
      hasStarted: false,
      hasEnded: false,
      startsAtMs: actualStartAtMs,
      endsAtMs: actualEndAtMs
    };
  }
  if (nowMs >= actualEndAtMs) {
    return {
      progress: 100,
      label: 'Sessione conclusa',
      hasStarted: true,
      hasEnded: true,
      startsAtMs: actualStartAtMs,
      endsAtMs: actualEndAtMs
    };
  }

  const durationMinutes = Math.max(1, Math.round(scheduledDurationMs / 60000));
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - actualStartAtMs) / 60000));
  return {
    progress: Math.max(0, Math.min(99, Math.round(((nowMs - actualStartAtMs) / scheduledDurationMs) * 100))),
    label: `${elapsedMinutes} di ${durationMinutes} min`,
    hasStarted: true,
    hasEnded: false,
    startsAtMs: actualStartAtMs,
    endsAtMs: actualEndAtMs
  };
}

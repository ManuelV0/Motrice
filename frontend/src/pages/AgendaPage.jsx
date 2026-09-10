import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dumbbell,
  LockKeyhole,
  LocateFixed,
  MapPin,
  Play,
  QrCode,
  Route,
  Settings2,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import AgendaEventVerificationPanel from '../components/agenda/AgendaEventVerificationPanel';
import EventCard from '../components/EventCard';
import styles from '../styles/pages/agenda.module.css';
import { getEventTiming } from '../utils/eventLifecycle';
import {
  getEventPrimaryActionPath,
  resolveEventPrimaryAction,
  resolveParticipantOutcome
} from '../utils/eventParticipationState';
import { isOutdoorTrackedEvent } from '../utils/outdoorActivity';

const CALENDAR_WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function fromDateKey(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getCalendarCells(year, month) {
  const firstDay = new Date(year, month, 1);
  const leadingEmptyCells = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: leadingEmptyCells }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1)
  ];
  const trailingEmptyCells = (7 - (cells.length % 7)) % 7;
  return [...cells, ...Array.from({ length: trailingEmptyCells }, () => null)];
}

function formatCalendarMonth(year, month) {
  const label = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function formatSelectedRange(range) {
  if (!range) return '';
  const start = fromDateKey(range.start);
  const end = fromDateKey(range.end);
  if (!start || !end) return '';

  if (range.start === range.end) {
    const label = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(start);
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  }

  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    const monthYear = new Intl.DateTimeFormat('it-IT', { month: 'short', year: 'numeric' }).format(end);
    return `${start.getDate()}–${end.getDate()} ${monthYear}`;
  }

  const startLabel = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(start);
  const endLabel = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(end);
  return `${startLabel}–${endLabel}`;
}

function formatEventTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function getAttendanceState(event) {
  const outcome = resolveParticipantOutcome(event);

  if (event?.created_by === 'me') {
    return { key: 'host', label: 'Svolto · Organizer', tone: 'neutral' };
  }
  if (outcome.id === 'completed') {
    return { key: 'present', label: 'Presente', tone: 'success' };
  }
  if (outcome.id === 'no_show') {
    return { key: 'no-show', label: 'No-Show', tone: 'danger' };
  }
  if (outcome.id === 'cancelled_late') {
    return { key: 'late-cancel', label: 'Cancellazione tardiva', tone: 'danger' };
  }
  return { key: 'unverified', label: 'Non verificata', tone: 'neutral' };
}

function getClosedEventStats(event) {
  const attendance = getAttendanceState(event);
  const isVerifiedPresence = attendance.key === 'present';
  const isHost = attendance.key === 'host';
  const explicitXp = Number(event?.earned_xp ?? event?.xp_earned ?? event?.user_rsvp?.earned_xp);
  const earnedXp = Number.isFinite(explicitXp)
    ? Math.max(0, explicitXp)
    : isVerifiedPresence
      ? Math.max(0, Number(event?.completion_xp || 0) + (event?.user_rsvp?.review_bonus_awarded ? Number(event?.review_bonus_xp || 0) : 0))
      : 0;
  const explicitMinutes = Number(event?.trained_minutes ?? event?.minutes_trained);
  const trainedMinutes = Number.isFinite(explicitMinutes)
    ? Math.max(0, explicitMinutes)
    : isVerifiedPresence || isHost
      ? Math.max(0, Number(event?.duration_minutes || 0))
      : 0;
  const presentCount = Math.max(0, Number(
    event?.participants_present_count
    ?? event?.participant_stats?.present
    ?? (isVerifiedPresence ? 1 : 0)
  ));
  const totalCount = Math.max(
    presentCount,
    Number(event?.participants_total_count ?? event?.participant_stats?.total ?? event?.participants_count ?? 0)
  );

  let reliability = 'Nessun impatto';
  if (attendance.key === 'present') reliability = '+ Presenza verificata';
  if (attendance.key === 'no-show') reliability = '− No-show registrato';
  if (attendance.key === 'late-cancel') reliability = '− Cancellazione tardiva';
  if (attendance.key === 'host') reliability = 'Evento completato';
  if (attendance.key === 'unverified') reliability = 'In attesa di esito';

  return { attendance, earnedXp, trainedMinutes, presentCount, totalCount, reliability };
}

function getVerificationCta(event, { isOrganizer = false } = {}) {
  const mode = String(event?.verification_mode || 'both').toLowerCase();

  if (mode === 'qr') {
    return {
      action: isOrganizer ? 'Scansiona QR Code' : 'Mostra QR Code',
      icon: 'qr',
      status: isOrganizer
        ? 'Scansiona il QR del partecipante per verificare il check-in'
        : 'Mostra il tuo QR all’organizzatore per verificare la presenza'
    };
  }

  if (mode === 'geo' || mode === 'gps') {
    return {
      action: 'Verifica posizione',
      icon: 'location',
      status: isOrganizer
        ? 'Verifica la posizione nell’area dell’evento'
        : 'Entra nell’area evento e verifica la posizione'
    };
  }

  return {
    action: 'Verifica presenza',
    icon: 'both',
    status: isOrganizer
      ? 'Completa QR Code e posizione per verificare la presenza'
      : 'Completa QR Code o posizione per verificare la presenza'
  };
}

function getSessionTimeline(timing, referenceTime = Date.now()) {
  const nowMs = referenceTime instanceof Date ? referenceTime.getTime() : Number(referenceTime);
  const startsAtMs = Number(timing?.startsAtMs);
  const endsAtMs = Number(timing?.endsAtMs);

  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs) {
    return { progress: 0, label: 'Orario evento' };
  }
  if (nowMs < startsAtMs) {
    return { progress: 0, label: `Inizia alle ${formatEventTime(startsAtMs)}` };
  }
  if (nowMs >= endsAtMs) {
    return { progress: 100, label: 'Sessione conclusa' };
  }

  const durationMinutes = Math.max(1, Math.round((endsAtMs - startsAtMs) / 60000));
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - startsAtMs) / 60000));
  return {
    progress: Math.max(1, Math.min(99, Math.round(((nowMs - startsAtMs) / (endsAtMs - startsAtMs)) * 100))),
    label: `${elapsedMinutes} di ${durationMinutes} min`
  };
}

function getPrimaryActionIcon(action) {
  if (action?.target === 'verify') return ShieldCheck;
  if (action?.target === 'workout' || action?.target === 'outdoor') return Play;
  if (action?.target === 'manage') return Settings2;
  if (action?.id === 'summary' || action?.id === 'feedback') return CheckCircle2;
  return ArrowRight;
}

function getTodaySessionState(event, referenceTime = Date.now()) {
  const isOrganizer = event?.created_by === 'me' && !event?.is_personal;
  const timing = getEventTiming(event, referenceTime);
  const timeline = getSessionTimeline(timing, referenceTime);
  const hasWorkout = Boolean(event?.workout_plan);
  const hasOutdoorTracking = isOutdoorTrackedEvent(event);
  const participantOutcome = resolveParticipantOutcome(event);
  const isCompleted = participantOutcome.id === 'completed';
  const isVerified =
    Boolean(event?.is_personal) ||
    participantOutcome.id === 'checked_in' ||
    isCompleted;

  if (participantOutcome.id === 'no_show') {
    return {
      key: 'closed',
      eyebrow: 'EVENTO CHIUSO',
      status: 'Presenza non verificata · nessuna ricompensa assegnata',
      action: 'Vedi riepilogo',
      actionTarget: 'event',
      progress: timeline.progress,
      progressLabel: timeline.label,
      canOpenVerification: false
    };
  }

  if (participantOutcome.id === 'cancelled' || participantOutcome.id === 'cancelled_late') {
    return {
      key: 'closed',
      eyebrow: 'PARTECIPAZIONE ANNULLATA',
      status: 'La partecipazione non è più attiva',
      action: 'Vedi evento',
      actionTarget: 'event',
      progress: timeline.progress,
      progressLabel: timeline.label,
      canOpenVerification: false
    };
  }

  if (isCompleted) {
    return {
      key: 'completed',
      eyebrow: 'SESSIONE COMPLETATA',
      status: 'Partecipazione completata · ricompense assegnate',
      action: 'Vedi riepilogo',
      actionTarget: 'event',
      progress: 100,
      progressLabel: 'Sessione conclusa'
    };
  }

  if (timing.hasEnded) {
    return {
      key: isOrganizer ? 'completed' : 'closed',
      eyebrow: 'SESSIONE CONCLUSA',
      status: isOrganizer
        ? 'Evento terminato · consulta partecipanti e riepilogo'
        : 'Evento terminato · esito presenza in aggiornamento',
      action: 'Vedi riepilogo',
      actionTarget: 'event',
      progress: 100,
      progressLabel: 'Sessione conclusa',
      canOpenVerification: false
    };
  }

  if (!event?.is_personal && !isCompleted && !isVerified && timing.phase === 'scheduled') {
    return {
      key: 'scheduled',
      eyebrow: isOrganizer ? 'SESSIONE DI OGGI · ORGANIZER' : 'SESSIONE DI OGGI',
      status: `Check-in disponibile dalle ${formatEventTime(timing.checkInOpensAtMs)}`,
      action: 'Vedi evento',
      actionTarget: 'event',
      progress: timeline.progress,
      progressLabel: timeline.label,
      canOpenVerification: false
    };
  }

  if (!event?.is_personal && !isCompleted && !isVerified && timing.phase === 'in_progress') {
    const canExtend = isOrganizer && timing.canExtendCheckIn;
    return {
      key: canExtend ? 'organizer' : 'closed',
      eyebrow: isOrganizer ? 'EVENTO IN CORSO · ORGANIZER' : 'ALLENAMENTO IN CORSO',
      status: canExtend
        ? 'Check-in chiuso · puoi prolungare la tolleranza'
        : 'La finestra per registrare la presenza è chiusa',
      action: canExtend ? 'Gestisci check-in' : 'Vedi evento',
      actionTarget: canExtend ? 'verify' : 'event',
      progress: timeline.progress,
      progressLabel: timeline.label,
      canOpenVerification: canExtend
    };
  }

  if (isOrganizer) {
    const checkedIn = Math.max(0, Number(event?.participants_checked_in_count || 0));
    const registered = Math.max(checkedIn, Number(event?.participants_count || 0));
    const verificationCta = getVerificationCta(event, { isOrganizer: true });
    const canVerify = timing.isCheckInOpen || timing.canExtendCheckIn;
    return {
      key: checkedIn > 0 ? (hasWorkout || hasOutdoorTracking ? 'ready' : 'active') : 'organizer',
      eyebrow: 'SESSIONE DI OGGI · ORGANIZER',
      status: checkedIn > 0
        ? `${checkedIn}/${registered} partecipanti con check-in verificato`
        : verificationCta.status,
      action: checkedIn > 0
        ? hasOutdoorTracking ? 'Avvia attività' : hasWorkout ? 'Avvia allenamento' : 'Apri evento'
        : verificationCta.action,
      actionTarget: checkedIn > 0
        ? hasOutdoorTracking ? 'outdoor' : hasWorkout ? 'workout' : 'event'
        : (canVerify ? 'verify' : 'event'),
      verificationIcon: verificationCta.icon,
      progress: timeline.progress,
      progressLabel: timeline.label,
      canOpenVerification: canVerify
    };
  }

  if (isVerified) {
    const checkedInAt = event?.user_rsvp?.checked_in_at;
    const verifiedAt = checkedInAt ? formatEventTime(checkedInAt) : '';
    return {
      key: hasWorkout || hasOutdoorTracking ? 'ready' : 'active',
      eyebrow: 'SESSIONE DI OGGI',
      status: event?.is_personal
        ? (hasOutdoorTracking ? 'Tracciamento attività pronto' : hasWorkout ? 'Sessione personale pronta' : 'Sessione personale in programma')
        : `Presenza verificata${verifiedAt ? ` alle ${verifiedAt}` : ''}${hasOutdoorTracking ? ' · GPS live pronto' : hasWorkout ? ' · scheda sbloccata' : ' · sessione attiva'}`,
      action: hasOutdoorTracking ? 'Avvia attività' : hasWorkout ? 'Avvia allenamento' : 'Apri evento',
      actionTarget: hasOutdoorTracking ? 'outdoor' : hasWorkout ? 'workout' : 'event',
      progress: timeline.progress,
      progressLabel: timeline.label
    };
  }

  const verificationCta = getVerificationCta(event);

  return {
    key: 'locked',
    eyebrow: 'SESSIONE DI OGGI',
    status: verificationCta.status,
    action: verificationCta.action,
    actionTarget: timing.isCheckInOpen ? 'verify' : 'event',
    verificationIcon: verificationCta.icon,
    progress: timeline.progress,
    progressLabel: timeline.label,
    canOpenVerification: timing.isCheckInOpen
  };
}

function AgendaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('all');
  const [selectedRange, setSelectedRange] = useState(null);
  const [verificationEventId, setVerificationEventId] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = useMemo(() => toDateKey(now), [now]);
  const [calendarCursor, setCalendarCursor] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth()
  }));

  usePageMeta({
    title: 'Eventi | Motrice',
    description: 'Tutti gli eventi che organizzi o a cui partecipi in un unica vista.'
  });

  const loadEvents = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const nextEvents = await api.listEvents({ dateRange: 'all', includePast: true, includeCancelled: true, sortBy: 'soonest' });
      setEvents(Array.isArray(nextEvents) ? nextEvents : []);
    } catch (error) {
      showToast(error?.message || 'Impossibile aggiornare gli eventi', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const ownedEvents = useMemo(
    () => events.filter((event) => event.created_by === 'me'),
    [events]
  );
  const participatingEvents = useMemo(
    () => events.filter((event) => event.created_by !== 'me' && (event.is_going || event.user_rsvp)),
    [events]
  );

  const participatingCount = participatingEvents.length;
  const hasItems = ownedEvents.length > 0 || participatingCount > 0;
  const calendarEvents = useMemo(() => {
    const byId = new Map();
    [...ownedEvents, ...participatingEvents].forEach((event) => byId.set(String(event.id), event));
    return Array.from(byId.values()).sort((a, b) => Date.parse(a.event_datetime) - Date.parse(b.event_datetime));
  }, [ownedEvents, participatingEvents]);
  const todaySession = useMemo(() => {
    const candidates = calendarEvents
      .filter((event) => {
        if (toDateKey(event?.event_datetime) !== todayKey || event?.status === 'cancelled') return false;
        const isOrganizer = event?.created_by === 'me';
        const isParticipant = !isOrganizer && (event?.is_going || event?.user_rsvp);
        return Boolean(isOrganizer || event?.is_personal || isParticipant);
      })
      .map((event) => {
        const primaryAction = resolveEventPrimaryAction({
          event,
          isOrganizer: event?.created_by === 'me' && !event?.is_personal,
          referenceTime: nowMs
        });
        return {
          event,
          state: {
            ...getTodaySessionState(event, nowMs),
            action: primaryAction.label,
            actionTarget: primaryAction.target,
            actionDisabled: primaryAction.disabled,
            primaryAction
          }
        };
      })
      .filter(({ event, state }) => {
        if (state.key === 'completed') return true;
        const startsAt = Date.parse(event?.event_datetime || '');
        const endsAt = startsAt + Math.max(0, Number(event?.duration_minutes || 0)) * 60 * 1000;
        return !Number.isFinite(endsAt) || endsAt >= now.getTime();
      })
      .sort((a, b) => {
        const priority = { ready: 0, active: 0, organizer: 1, locked: 2, scheduled: 3, closed: 4, completed: 5 };
        const stateDelta = priority[a.state.key] - priority[b.state.key];
        if (stateDelta) return stateDelta;
        return Date.parse(a.event.event_datetime) - Date.parse(b.event.event_datetime);
      });

    return candidates[0] || null;
  }, [calendarEvents, now, nowMs, todayKey]);

  const requestedEventId = String(searchParams.get('verifyEvent') || '');
  const requestedAgendaEvent = useMemo(
    () => requestedEventId
      ? calendarEvents.find((item) => String(item.id) === requestedEventId) || null
      : null,
    [calendarEvents, requestedEventId]
  );
  const focusedSession = useMemo(() => {
    if (!requestedAgendaEvent) return todaySession;
    const primaryAction = resolveEventPrimaryAction({
      event: requestedAgendaEvent,
      isOrganizer: requestedAgendaEvent?.created_by === 'me' && !requestedAgendaEvent?.is_personal,
      referenceTime: nowMs
    });
    return {
      event: requestedAgendaEvent,
      state: {
        ...getTodaySessionState(requestedAgendaEvent, nowMs),
        action: primaryAction.label,
        actionTarget: primaryAction.target,
        actionDisabled: primaryAction.disabled,
        primaryAction
      }
    };
  }, [nowMs, requestedAgendaEvent, todaySession]);

  useEffect(() => {
    if (!requestedEventId || !requestedAgendaEvent) return;

    const requestedDate = new Date(requestedAgendaEvent.event_datetime);
    const requestedDateKey = toDateKey(requestedDate);
    if (requestedDateKey) {
      setCalendarCursor({ year: requestedDate.getFullYear(), month: requestedDate.getMonth() });
      setSelectedRange({ start: requestedDateKey, end: requestedDateKey });
    }

    setActiveSection('all');
    setVerificationEventId(requestedEventId);

    window.setTimeout(() => {
      document.getElementById('agenda-focus-event')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, [requestedAgendaEvent, requestedEventId]);
  const visibleCalendarEvents = useMemo(() => {
    if (activeSection === 'created') return ownedEvents;
    if (activeSection === 'participating') return participatingEvents;
    return calendarEvents;
  }, [activeSection, calendarEvents, ownedEvents, participatingEvents]);
  const eventsByDate = useMemo(() => {
    const byDate = new Map();
    visibleCalendarEvents.forEach((event) => {
      const key = toDateKey(event.event_datetime);
      if (!key) return;
      byDate.set(key, [...(byDate.get(key) || []), event]);
    });
    return byDate;
  }, [visibleCalendarEvents]);
  const calendarCells = useMemo(
    () => getCalendarCells(calendarCursor.year, calendarCursor.month),
    [calendarCursor]
  );
  const selectedEvents = useMemo(() => {
    if (!selectedRange) return [];
    return visibleCalendarEvents
      .filter((event) => {
        const key = toDateKey(event.event_datetime);
        return key && key >= selectedRange.start && key <= selectedRange.end;
      })
      .sort((a, b) => Date.parse(a.event_datetime) - Date.parse(b.event_datetime));
  }, [selectedRange, visibleCalendarEvents]);
  function changeCalendarMonth(offset) {
    setSelectedRange(null);
    setCalendarCursor((current) => {
      const next = new Date(current.year, current.month + offset, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function changeActiveSection(section) {
    setActiveSection(section);
    setSelectedRange(null);

    const targetEvents = section === 'created'
      ? ownedEvents
      : section === 'participating'
        ? participatingEvents
        : calendarEvents;
    const monthHasEvents = targetEvents.some((event) => {
      const eventDate = new Date(event.event_datetime);
      return !Number.isNaN(eventDate.getTime()) &&
        eventDate.getFullYear() === calendarCursor.year &&
        eventDate.getMonth() === calendarCursor.month;
    });
    if (!monthHasEvents && targetEvents.length > 0) {
      const upcoming = targetEvents
        .filter((event) => Date.parse(event.event_datetime) >= nowMs)
        .sort((a, b) => Date.parse(a.event_datetime) - Date.parse(b.event_datetime));
      const fallback = [...targetEvents]
        .sort((a, b) => Date.parse(b.event_datetime) - Date.parse(a.event_datetime));
      const nearest = upcoming[0] || fallback[0];
      const nearestDate = new Date(nearest.event_datetime);
      if (!Number.isNaN(nearestDate.getTime())) {
        setCalendarCursor({ year: nearestDate.getFullYear(), month: nearestDate.getMonth() });
      }
    }
  }

  function selectCalendarDay(dateKey) {
    if (!eventsByDate.has(dateKey)) return;
    setSelectedRange((current) => {
      if (!current || current.start !== current.end) return { start: dateKey, end: dateKey };
      if (current.start === dateKey) return current;
      return dateKey < current.start
        ? { start: dateKey, end: current.start }
        : { start: current.start, end: dateKey };
    });
  }

  function openEventPrimaryAction(event, action) {
    if (!event?.id || action?.disabled) return;
    const target = getEventPrimaryActionPath(event, action);
    if (target) navigate(target);
  }

  function openTodaySession() {
    if (!focusedSession?.event?.id) return;
    const { event, state } = focusedSession;
    if (state.actionDisabled) return;
    if (state.actionTarget === 'outdoor' && isOutdoorTrackedEvent(event)) {
      navigate(`/events/${event.id}/activity`);
      return;
    }
    if (state.actionTarget === 'workout' && event.workout_plan) {
      navigate(`/events/${event.id}/workout`);
      return;
    }
    if (state.actionTarget === 'verify' && state.canOpenVerification) {
      setVerificationEventId((current) => current === String(event.id) ? '' : String(event.id));
      return;
    }
    openEventPrimaryAction(event, state.primaryAction);
  }

  return (
    <section className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>I miei eventi</h1>
          <p>Il calendario filtra attività future e storico</p>
        </div>
      </div>

      {focusedSession ? (() => {
        const { event, state } = focusedSession;
        const workoutPlan = event.workout_plan;
        const hasWorkout = Boolean(workoutPlan);
        const hasOutdoorTracking = isOutdoorTrackedEvent(event);
        const exerciseCount = Array.isArray(workoutPlan?.exercises) ? workoutPlan.exercises.length : 0;
        const workoutDuration = Number(workoutPlan?.duration || event.duration_minutes || 0);
        const workoutTitle = event.title || workoutPlan?.title || event.sport_name || 'Sessione Motrice';
        const StatusIcon = state.key === 'locked'
          ? LockKeyhole
          : state.key === 'completed'
            ? CheckCircle2
            : state.key === 'active'
              ? Clock3
              : ShieldCheck;
        const ActionIcon = state.verificationIcon === 'qr'
          ? QrCode
          : state.verificationIcon === 'location'
            ? LocateFixed
            : state.verificationIcon === 'both'
              ? ShieldCheck
              : getPrimaryActionIcon(state.primaryAction);

        return (
          <section
            id="agenda-focus-event"
            className={`${styles.todayWorkoutCard} ${styles[`todayWorkoutCard_${state.key}`]}`}
            aria-labelledby="today-workout-title"
          >
            <div className={styles.todayWorkoutTopline}>
              <span className={styles.todayWorkoutIcon} aria-hidden="true">
                {hasOutdoorTracking ? <Route size={22} /> : hasWorkout ? <Dumbbell size={22} /> : <CalendarDays size={22} />}
              </span>
              <div>
                <small>{state.eyebrow}</small>
                <strong id="today-workout-title">{workoutTitle}</strong>
              </div>
              <time dateTime={event.event_datetime}>{formatEventTime(event.event_datetime)}</time>
            </div>

            <div className={styles.todayWorkoutStatus}>
              <StatusIcon size={18} aria-hidden="true" />
              <span>{state.status}</span>
            </div>

            <div className={styles.todayWorkoutMeta}>
              <span><Dumbbell size={15} aria-hidden="true" /> {event.sport_name || 'Sport'}</span>
              {hasOutdoorTracking ? <span>GPS live</span> : exerciseCount > 0 ? <span>{exerciseCount} esercizi</span> : <span>Sessione libera</span>}
              <span><Clock3 size={15} aria-hidden="true" /> {workoutDuration} min</span>
              <span><MapPin size={15} aria-hidden="true" /> {event.location_name || event.city || 'Luogo evento'}</span>
            </div>

            <div className={styles.todayWorkoutProgress}>
              <div
                role="progressbar"
                aria-label="Progresso temporale della sessione"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={state.progress}
              >
                <span style={{ width: `${state.progress}%` }} />
              </div>
              <small>{state.progressLabel}</small>
              <strong>{state.progress}%</strong>
            </div>

            <button
              type="button"
              className={styles.todayWorkoutAction}
              onClick={openTodaySession}
              disabled={state.actionDisabled}
            >
              <ActionIcon size={20} aria-hidden="true" />
              <span>{state.action}</span>
              {!['workout', 'outdoor'].includes(state.actionTarget) ? <ArrowRight size={18} aria-hidden="true" /> : null}
            </button>
            {verificationEventId === String(event.id) ? (
              <AgendaEventVerificationPanel
                event={event}
                isOrganizer={event.created_by === 'me' && !event.is_personal}
                showToast={showToast}
                onClose={() => setVerificationEventId('')}
                onVerified={() => loadEvents({ silent: true })}
                onStartWorkout={() => navigate(`/events/${event.id}/workout`)}
                onStartOutdoor={() => navigate(`/events/${event.id}/activity`)}
                onOpenEvent={() => navigate(`/events/${event.id}`)}
              />
            ) : null}
          </section>
        );
      })() : null}

      <div className={styles.eventFilters} role="tablist" aria-label="Seleziona gli eventi da mostrare">
        <span className={styles.eventFilterGlider} data-active={activeSection} aria-hidden="true" />
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'all'}
          className={activeSection === 'all' ? styles.filterActive : undefined}
          onClick={() => changeActiveSection('all')}
        >
          Tutti <span>{calendarEvents.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'participating'}
          className={activeSection === 'participating' ? styles.filterActive : undefined}
          onClick={() => changeActiveSection('participating')}
        >
          Partecipo <span>{participatingCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'created'}
          className={activeSection === 'created' ? styles.filterActive : undefined}
          onClick={() => changeActiveSection('created')}
        >
          Creati <span>{ownedEvents.length}</span>
        </button>
      </div>

      <section className={styles.calendarPanel} aria-labelledby="events-calendar-title">
        <div className={styles.calendarHeader}>
          <button
            type="button"
            className={styles.calendarNavButton}
            onClick={() => changeCalendarMonth(-1)}
            aria-label="Mese precedente"
          >
            <span className={styles.calendarNavGlyph} aria-hidden="true">‹</span>
          </button>
          <div className={styles.calendarHeading}>
            <h2 id="events-calendar-title">{formatCalendarMonth(calendarCursor.year, calendarCursor.month)}</h2>
            {selectedRange ? <small>{formatSelectedRange(selectedRange)}</small> : <small>Tocca un giorno con eventi</small>}
          </div>
          <button
            type="button"
            className={styles.calendarNavButton}
            onClick={() => changeCalendarMonth(1)}
            aria-label="Mese successivo"
          >
            <span className={styles.calendarNavGlyph} aria-hidden="true">›</span>
          </button>
        </div>

        <div className={styles.calendarGrid} role="grid" aria-label={formatCalendarMonth(calendarCursor.year, calendarCursor.month)}>
          {CALENDAR_WEEKDAYS.map((weekday, index) => (
            <span key={`${weekday}-${index}`} className={styles.calendarWeekday} role="columnheader">{weekday}</span>
          ))}
          {calendarCells.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} className={styles.calendarEmpty} aria-hidden="true" />;
            const date = new Date(calendarCursor.year, calendarCursor.month, day);
            const dateKey = toDateKey(date);
            const dayEvents = eventsByDate.get(dateKey) || [];
            const hasEvents = dayEvents.length > 0;
            const isToday = dateKey === todayKey;
            const isSelected = Boolean(selectedRange && (dateKey === selectedRange.start || dateKey === selectedRange.end));
            const isInRange = Boolean(selectedRange && dateKey >= selectedRange.start && dateKey <= selectedRange.end);
            const dayTimings = dayEvents.map((event) => getEventTiming(event, nowMs));
            const allPast = hasEvents && dayTimings.every((timing) => timing.hasEnded);
            const hasPast = dayTimings.some((timing) => timing.hasEnded);
            const hasFuture = dayTimings.some((timing) => !timing.hasEnded);
            const timingLabel = allPast
              ? 'svolto'
              : hasPast && hasFuture
                ? 'svolti e da svolgere'
                : 'da svolgere';
            const label = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);

            return (
              <button
                key={dateKey}
                type="button"
                role="gridcell"
                disabled={!hasEvents}
                onClick={() => selectCalendarDay(dateKey)}
                aria-pressed={isInRange}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${label}${hasEvents
                  ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventi'}, ${timingLabel}`
                  : ', nessun evento'}`}
                className={[
                  styles.calendarDay,
                  hasEvents ? styles.calendarDayWithEvents : '',
                  isToday ? styles.calendarDayToday : '',
                  isInRange ? styles.calendarDayInRange : '',
                  isSelected ? styles.calendarDaySelected : ''
                ].filter(Boolean).join(' ')}
              >
                <span className={styles.calendarDayNumber}>{day}</span>
                {isToday && !hasEvents ? <small className={styles.calendarTodayLabel}>OGGI</small> : null}
                {hasEvents ? (
                  <span className={styles.calendarEventDots} aria-hidden="true">
                    {Array.from({ length: Math.min(2, dayEvents.length) }, (_, dotIndex) => (
                      <i
                        key={dotIndex}
                        className={dayEvents[dotIndex]?.status === 'cancelled'
                          ? styles.eventDotCancelled
                          : dayTimings[dotIndex]?.hasEnded ? styles.eventDotPast : styles.eventDotFuture}
                      />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className={styles.calendarLegend} aria-label="Legenda calendario">
          <span><i className={styles.legendFuture} aria-hidden="true" /> Da svolgere</span>
          <span><i className={styles.legendPast} aria-hidden="true" /> Svolto</span>
          <span><i className={styles.legendCancelled} aria-hidden="true" /> Annullato</span>
          <small>Due dot = più eventi</small>
        </div>

        {loading ? (
          <p className={styles.calendarState}><CalendarDays size={17} aria-hidden="true" /> Aggiornamento eventi…</p>
        ) : !hasItems ? (
          <p className={styles.calendarState}><CalendarDays size={17} aria-hidden="true" /> Nessun evento presente</p>
        ) : null}

        {selectedRange ? (
          <section className={styles.calendarDetails} aria-label={`Eventi dal ${formatSelectedRange(selectedRange)}`}>
            <i className={styles.sheetHandle} aria-hidden="true" />
            <header className={styles.calendarDetailsHeader}>
              <div>
                <small>{selectedRange.start === selectedRange.end ? 'GIORNO SELEZIONATO' : 'INTERVALLO SELEZIONATO'}</small>
                <strong>{formatSelectedRange(selectedRange)}</strong>
                <span>{selectedEvents.length} {selectedEvents.length === 1 ? 'evento' : 'eventi'}</span>
              </div>
              <button type="button" onClick={() => setSelectedRange(null)} aria-label="Chiudi dettagli calendario">
                <span className={styles.closeGlyph} aria-hidden="true">×</span>
              </button>
            </header>

            <div className={styles.calendarEventList}>
              {selectedEvents.map((event) => {
                const isPast = getEventTiming(event, nowMs).hasEnded;
                const isCancelled = event.status === 'cancelled';
                const participants = Math.max(0, Number(event.participants_count || 0));
                const capacity = Math.max(participants, Number(event.max_participants || 0));

                if (isCancelled) {
                  return (
                    <EventCard
                      key={event.id}
                      event={event}
                      variant="standard"
                      context="agenda"
                      status={{ label: 'Annullato', tone: 'danger', icon: XCircle }}
                      metaItems={[
                        { label: event.cancellation_note || 'Cancellato dall’organizer' },
                        { label: `${participants}/${capacity || '—'} iscritti` }
                      ]}
                      stats={[
                        { value: 'Restituiti', label: 'Depositi' },
                        { value: `${participants}`, label: 'Iscritti' }
                      ]}
                      showProgress={false}
                      detailsLabel="Riepilogo"
                    />
                  );
                }

                if (isPast) {
                  const stats = getClosedEventStats(event);
                  const StatusIcon = stats.attendance.tone === 'danger' ? XCircle : CheckCircle2;
                  return (
                    <EventCard
                      key={event.id}
                      event={event}
                      variant="standard"
                      context="agenda"
                      status={{ label: stats.attendance.label, tone: stats.attendance.tone, icon: StatusIcon }}
                      stats={[
                        { value: `+${stats.earnedXp} XP`, label: 'Guadagnati' },
                        { value: `${stats.trainedMinutes} min`, label: 'Allenati' },
                        { value: stats.reliability, label: 'Affidabilità' },
                        { value: `${stats.presentCount}/${stats.totalCount}`, label: 'Presenti' }
                      ]}
                      showProgress={false}
                      detailsLabel="Riepilogo"
                    />
                  );
                }

                const isOrganizer = event.created_by === 'me';
                const action = resolveEventPrimaryAction({
                  event,
                  isOrganizer,
                  isFull: capacity > 0 && participants >= capacity,
                  referenceTime: nowMs
                });
                const ActionIcon = getPrimaryActionIcon(action);
                return (
                  <EventCard
                    key={event.id}
                    event={event}
                    variant="standard"
                    context="agenda"
                    status={{ label: 'Da svolgere', tone: 'success' }}
                    primaryAction={{
                      label: action.label,
                      icon: ActionIcon,
                      disabled: action.disabled,
                      onClick: (selectedEvent) => openEventPrimaryAction(selectedEvent, action)
                    }}
                    showProgress
                    detailsLabel={null}
                  />
                );
              })}
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}

export default AgendaPage;

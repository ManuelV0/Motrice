import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Info,
  LockKeyhole,
  LocateFixed,
  MapPin,
  Play,
  QrCode,
  Route,
  Settings2,
  ShieldCheck,
  Users,
  X,
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
import { resolveEventPostSummary } from '../utils/eventPostSummary';
import { getEventSessionTimeline } from '../utils/sessionTimeline';
import { getAppSettings, updateAppSettings } from '../services/appSettings';
import {
  clearSmartArrivalState,
  getSmartArrivalEligibility,
  getSmartArrivalState,
  isEventPresenceVerified,
  SMART_ARRIVAL_STATE_EVENT,
  snoozeSmartArrival
} from '../services/smartArrival';

function SmartArrivalPanel({
  event,
  nowMs,
  enabled,
  permission,
  onToggle,
  onAuthorize,
  onOpenSettings,
  onVerify,
  onSnooze
}) {
  const eligibility = getSmartArrivalEligibility(event, nowMs);
  const arrival = getSmartArrivalState(event?.id);
  const checkedInAt = event?.session_started_at || event?.checked_in_at || event?.user_rsvp?.checked_in_at;
  const permissionDenied = ['denied', 'unavailable'].includes(permission);
  const permissionApproximate = permission === 'approximate';
  const permissionReady = permission === 'granted';

  if (eligibility.phase === 'unavailable' || eligibility.phase === 'expired') return null;

  if (eligibility.phase === 'verified' || isEventPresenceVerified(event)) {
    return (
      <div className={`${styles.smartArrival} ${styles.smartArrivalSuccess}`}>
        <span className={styles.smartArrivalIcon}><CheckCircle2 size={18} aria-hidden="true" /></span>
        <span className={styles.smartArrivalCopy}>
          <strong>Presenza verificata{checkedInAt ? ` alle ${formatEventTime(checkedInAt)}` : ''}</strong>
          <small>Allenamento iniziato dal check-in</small>
        </span>
      </div>
    );
  }

  if (arrival.detectedAt && (!arrival.snoozedUntil || arrival.snoozedUntil <= nowMs)) {
    const organizer = event?.created_by === 'me';
    return (
      <div className={`${styles.smartArrival} ${styles.smartArrivalDetected}`} role="status" aria-live="polite">
        <span className={styles.smartArrivalIcon}><LocateFixed size={20} aria-hidden="true" /></span>
        <span className={styles.smartArrivalCopy}>
          <strong>Sei arrivato?</strong>
          <small>La posizione è nell’area. Conferma tu la presenza.</small>
        </span>
        <div className={styles.smartArrivalActions}>
          <button type="button" className={styles.smartArrivalPrimary} onClick={() => onVerify(event, 'geo')}>
            <LocateFixed size={15} aria-hidden="true" /> Conferma con GPS
          </button>
          <button type="button" onClick={() => onVerify(event, 'qr')}>
            <QrCode size={15} aria-hidden="true" /> {organizer ? 'Scansiona QR' : 'Mostra QR'}
          </button>
          <button type="button" className={styles.smartArrivalLater} onClick={() => onSnooze(event)}>Non ora</button>
        </div>
      </div>
    );
  }

  const scheduled = eligibility.phase === 'scheduled';
  const statusCopy = !enabled
    ? 'Disattivato'
    : permissionDenied
      ? 'Posizione non autorizzata'
      : permissionApproximate
        ? 'Serve la posizione precisa'
        : permissionReady
          ? scheduled
            ? `Si attiva alle ${formatEventTime(eligibility.timing.checkInOpensAtMs)}`
            : 'Attivo · ti avviseremo quando arrivi'
          : 'Autorizza la posizione per ricevere l’avviso';

  return (
    <div className={styles.smartArrival} data-tone={permissionDenied || permissionApproximate ? 'warning' : 'default'}>
      <span className={styles.smartArrivalIcon}><BellRing size={18} aria-hidden="true" /></span>
      <span className={styles.smartArrivalCopy}>
        <strong>Arrivo intelligente</strong>
        <small>{statusCopy}</small>
      </span>
      <button
        type="button"
        className={`${styles.smartArrivalSwitch} ${enabled ? styles.smartArrivalSwitchOn : ''}`}
        role="switch"
        aria-checked={enabled}
        aria-label="Arrivo intelligente"
        onClick={() => onToggle(!enabled)}
      >
        <span aria-hidden="true" />
      </button>
      {enabled && !permissionReady ? (
        <button
          type="button"
          className={styles.smartArrivalPermission}
          onClick={permissionDenied ? onOpenSettings : onAuthorize}
        >
          {permissionDenied ? 'Impostazioni' : 'Autorizza'}
        </button>
      ) : null}
    </div>
  );
}

const CALENDAR_WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

function isHistoricalEvent(event, referenceTime = Date.now()) {
  if (event?.status === 'cancelled') return true;
  const timing = getEventTiming(event, referenceTime);
  return getEventSessionTimeline(event, timing, referenceTime).hasEnded;
}

function getPendingRequestsCount(events) {
  return events.reduce((total, event) => {
    const explicitCount = Number(event?.pending_requests_count ?? event?.pending_join_requests_count);
    if (Number.isFinite(explicitCount)) return total + Math.max(0, explicitCount);
    const requests = Array.isArray(event?.join_requests) ? event.join_requests : [];
    return total + requests.filter((request) => String(request?.status || 'pending').toLowerCase() === 'pending').length;
  }, 0);
}

function getAgendaEventCardData(event) {
  const title = String(event?.title || '').trim();
  const sport = String(event?.sport_name || '').trim();
  const location = String(event?.location_name || event?.city || '').trim();
  if (!title || !sport || !location) return event;

  const normalize = (value) => value.toLocaleLowerCase('it-IT').replace(/\s+/g, ' ').trim();
  const automaticTitles = [`${sport} · ${location}`, `${sport} - ${location}`].map(normalize);
  return automaticTitles.includes(normalize(title)) ? { ...event, title: sport } : event;
}

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
    if (outcome.id === 'completed') {
      return { key: 'host-present', label: 'Presente · Organizer', tone: 'success' };
    }
    if (outcome.id === 'no_show') {
      return { key: 'host-no-show', label: 'No-show · Organizer', tone: 'danger' };
    }
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
  if (outcome.id === 'requested') {
    return { key: 'request-expired', label: 'Richiesta non accettata', tone: 'neutral' };
  }
  return { key: 'unverified', label: 'Non verificata', tone: 'neutral' };
}

function getClosedEventStats(event) {
  const attendance = getAttendanceState(event);
  const isVerifiedPresence = ['present', 'host-present'].includes(attendance.key);
  const explicitXp = Number(event?.earned_xp ?? event?.xp_earned ?? event?.user_rsvp?.earned_xp);
  const earnedXp = Number.isFinite(explicitXp)
    ? Math.max(0, explicitXp)
    : isVerifiedPresence
      ? Math.max(0, Number(event?.completion_xp || 0) + (event?.user_rsvp?.review_bonus_awarded ? Number(event?.review_bonus_xp || 0) : 0))
      : 0;
  const explicitMinutes = Number(event?.trained_minutes ?? event?.minutes_trained);
  const trainedMinutes = Number.isFinite(explicitMinutes)
    ? Math.max(0, explicitMinutes)
    : isVerifiedPresence
      ? Math.max(0, Number(event?.user_rsvp?.elapsed_minutes ?? event?.minimum_presence_minutes ?? 0))
      : 0;
  const summary = resolveEventPostSummary(event);

  let reliability = 'Nessun impatto';
  if (attendance.key === 'present') reliability = '+ Presenza verificata';
  if (attendance.key === 'no-show') reliability = '− No-show registrato';
  if (attendance.key === 'late-cancel') reliability = '− Cancellazione tardiva';
  if (attendance.key === 'host') reliability = 'Evento completato';
  if (attendance.key === 'host-present') reliability = '+ Presenza organizer';
  if (attendance.key === 'host-no-show') reliability = '− Assenza organizer';
  if (attendance.key === 'unverified') reliability = 'In attesa di esito';

  return {
    attendance,
    earnedXp,
    trainedMinutes,
    presentCount: summary.presentCount,
    noShowCount: summary.noShowCount,
    totalCount: summary.totalCount,
    reliability
  };
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
  const timeline = getEventSessionTimeline(event, timing, referenceTime);
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

  if (timeline.hasEnded) {
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
  const [loadError, setLoadError] = useState('');
  const [activeSection, setActiveSection] = useState('all');
  const [activeTimeline, setActiveTimeline] = useState('upcoming');
  const [selectedRange, setSelectedRange] = useState(null);
  const [calendarSheetSnap, setCalendarSheetSnap] = useState('medium');
  const [legendOpen, setLegendOpen] = useState(false);
  const [verificationEventId, setVerificationEventId] = useState('');
  const [appSettings, setAppSettings] = useState(() => getAppSettings());
  const [arrivalPermission, setArrivalPermission] = useState('prompt');
  const [, setArrivalStateVersion] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = useMemo(() => toDateKey(now), [now]);
  const [calendarCursor, setCalendarCursor] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth()
  }));
  const calendarSheetRef = useRef(null);
  const calendarSheetDragRef = useRef(null);
  const calendarSheetMoveFrameRef = useRef(null);
  const calendarSheetTransitionTimerRef = useRef(null);
  const pendingCalendarSheetHeightRef = useRef(null);

  usePageMeta({
    title: 'Eventi | Motrice',
    description: 'Tutti gli eventi che organizzi o a cui partecipi in un unica vista.'
  });

  const loadEvents = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const nextEvents = await api.listEvents({ dateRange: 'all', includePast: true, includeCancelled: true, sortBy: 'soonest' });
      setEvents(Array.isArray(nextEvents) ? nextEvents : []);
    } catch (error) {
      const message = error?.message || 'Impossibile aggiornare gli eventi';
      setLoadError(message);
      showToast(message, 'error');
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

  useEffect(() => {
    if (!selectedRange) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedRange(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedRange]);

  useEffect(() => () => {
    if (calendarSheetMoveFrameRef.current) window.cancelAnimationFrame(calendarSheetMoveFrameRef.current);
    if (calendarSheetTransitionTimerRef.current) window.clearTimeout(calendarSheetTransitionTimerRef.current);
  }, []);

  const ownedEvents = useMemo(
    () => events.filter((event) => event.created_by === 'me'),
    [events]
  );
  const participatingEvents = useMemo(
    () => events.filter((event) => event.created_by !== 'me' && (event.is_going || event.user_rsvp)),
    [events]
  );

  const calendarEvents = useMemo(() => {
    const byId = new Map();
    [...ownedEvents, ...participatingEvents].forEach((event) => byId.set(String(event.id), event));
    return Array.from(byId.values()).sort((a, b) => Date.parse(a.event_datetime) - Date.parse(b.event_datetime));
  }, [ownedEvents, participatingEvents]);

  useEffect(() => {
    const onSettings = (event) => setAppSettings(event?.detail || getAppSettings());
    const onArrivalState = () => setArrivalStateVersion((version) => version + 1);
    const onArrivalPermission = (event) => {
      if (event?.detail?.permission) setArrivalPermission(event.detail.permission);
    };
    const onArrivalDetected = (event) => {
      const eventId = String(event?.detail?.eventId || '');
      const arrivedEvent = calendarEvents.find((item) => String(item.id) === eventId);
      if (!arrivedEvent) return;
      const date = new Date(arrivedEvent.event_datetime);
      const dateKey = toDateKey(date);
      if (dateKey) {
        setActiveTimeline('upcoming');
        setCalendarCursor({ year: date.getFullYear(), month: date.getMonth() });
        setSelectedRange({ start: dateKey, end: dateKey });
        setCalendarSheetSnap('medium');
      }
    };

    window.addEventListener('motrice:app-settings-changed', onSettings);
    window.addEventListener(SMART_ARRIVAL_STATE_EVENT, onArrivalState);
    window.addEventListener('motrice:smart-arrival-permission', onArrivalPermission);
    window.addEventListener('motrice:smart-arrival-detected', onArrivalDetected);
    return () => {
      window.removeEventListener('motrice:app-settings-changed', onSettings);
      window.removeEventListener(SMART_ARRIVAL_STATE_EVENT, onArrivalState);
      window.removeEventListener('motrice:smart-arrival-permission', onArrivalPermission);
      window.removeEventListener('motrice:smart-arrival-detected', onArrivalDetected);
    };
  }, [calendarEvents]);
  const timelineCalendarEvents = useMemo(
    () => calendarEvents.filter((event) => activeTimeline === 'history'
      ? isHistoricalEvent(event, nowMs)
      : !isHistoricalEvent(event, nowMs)),
    [activeTimeline, calendarEvents, nowMs]
  );
  const timelineOwnedEvents = useMemo(
    () => timelineCalendarEvents.filter((event) => event.created_by === 'me'),
    [timelineCalendarEvents]
  );
  const timelineParticipatingEvents = useMemo(
    () => timelineCalendarEvents.filter((event) => event.created_by !== 'me' && (event.is_going || event.user_rsvp)),
    [timelineCalendarEvents]
  );
  const pendingRequestsCount = useMemo(
    () => getPendingRequestsCount(timelineOwnedEvents),
    [timelineOwnedEvents]
  );
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
        const timing = getEventTiming(event, nowMs);
        return !getEventSessionTimeline(event, timing, nowMs).hasEnded;
      })
      .sort((a, b) => {
        const priority = { ready: 0, active: 0, organizer: 1, locked: 2, scheduled: 3, closed: 4, completed: 5 };
        const stateDelta = priority[a.state.key] - priority[b.state.key];
        if (stateDelta) return stateDelta;
        return Date.parse(a.event.event_datetime) - Date.parse(b.event.event_datetime);
      });

    return candidates[0] || null;
  }, [calendarEvents, nowMs, todayKey]);

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
    setActiveTimeline(isHistoricalEvent(requestedAgendaEvent) ? 'history' : 'upcoming');
    setVerificationEventId(requestedEventId);

    window.setTimeout(() => {
      document.getElementById('agenda-focus-event')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, [requestedAgendaEvent, requestedEventId]);
  const visibleCalendarEvents = useMemo(() => {
    if (activeSection === 'created') return timelineOwnedEvents;
    if (activeSection === 'participating') return timelineParticipatingEvents;
    return timelineCalendarEvents;
  }, [activeSection, timelineCalendarEvents, timelineOwnedEvents, timelineParticipatingEvents]);
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
  const isCurrentCalendarMonth = calendarCursor.year === now.getFullYear() && calendarCursor.month === now.getMonth();
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
      ? timelineOwnedEvents
      : section === 'participating'
        ? timelineParticipatingEvents
        : timelineCalendarEvents;
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

  function changeActiveTimeline(timeline) {
    setActiveTimeline(timeline);
    setSelectedRange(null);

    const matchesTimeline = (event) => timeline === 'history'
      ? isHistoricalEvent(event, nowMs)
      : !isHistoricalEvent(event, nowMs);
    const roleEvents = activeSection === 'created'
      ? ownedEvents
      : activeSection === 'participating'
        ? participatingEvents
        : calendarEvents;
    const targetEvents = roleEvents.filter(matchesTimeline);
    if (targetEvents.length === 0) return;

    const sorted = [...targetEvents].sort((a, b) => timeline === 'history'
      ? Date.parse(b.event_datetime) - Date.parse(a.event_datetime)
      : Date.parse(a.event_datetime) - Date.parse(b.event_datetime));
    const targetDate = new Date(sorted[0].event_datetime);
    if (!Number.isNaN(targetDate.getTime())) {
      setCalendarCursor({ year: targetDate.getFullYear(), month: targetDate.getMonth() });
    }
  }

  function returnToToday() {
    setSelectedRange(null);
    setCalendarCursor({ year: now.getFullYear(), month: now.getMonth() });
  }

  function selectCalendarDay(dateKey) {
    if (!eventsByDate.has(dateKey)) return;
    setCalendarSheetSnap('medium');
    setSelectedRange((current) => current?.start === dateKey
      ? null
      : { start: dateKey, end: dateKey });
  }

  function getCalendarSheetSnapHeights() {
    const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const usableHeight = Math.max(0, viewportHeight - 4.5 * rootFontSize);
    const compact = 7.4 * rootFontSize;
    const medium = Math.min(27 * rootFontSize, Math.max(compact, usableHeight * 0.62));
    const full = Math.max(medium, usableHeight - 4.5 * rootFontSize);
    return { compact, medium, full };
  }

  function onCalendarSheetPointerDown(event) {
    const sheet = calendarSheetRef.current;
    if (!sheet) return;
    if (calendarSheetTransitionTimerRef.current) window.clearTimeout(calendarSheetTransitionTimerRef.current);
    sheet.style.removeProperty('height');
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const currentHeight = sheet.getBoundingClientRect().height;
    calendarSheetDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: performance.now(),
      velocity: 0,
      startHeight: currentHeight,
      currentHeight,
      moved: false
    };
    sheet.classList.add(styles.calendarDetailsDragging);
  }

  function onCalendarSheetPointerMove(event) {
    const drag = calendarSheetDragRef.current;
    const sheet = calendarSheetRef.current;
    if (!drag || !sheet || drag.pointerId !== event.pointerId) return;
    const timestamp = performance.now();
    const elapsed = Math.max(1, timestamp - drag.lastTime);
    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = timestamp;
    const heights = getCalendarSheetSnapHeights();
    drag.currentHeight = Math.min(heights.full, Math.max(heights.compact, drag.startHeight - (event.clientY - drag.startY)));
    drag.moved ||= Math.abs(event.clientY - drag.startY) > 5;
    pendingCalendarSheetHeightRef.current = drag.currentHeight;

    if (!calendarSheetMoveFrameRef.current) {
      calendarSheetMoveFrameRef.current = window.requestAnimationFrame(() => {
        calendarSheetMoveFrameRef.current = null;
        if (calendarSheetRef.current && pendingCalendarSheetHeightRef.current != null) {
          calendarSheetRef.current.style.height = `${pendingCalendarSheetHeightRef.current}px`;
        }
      });
    }
  }

  function finishCalendarSheetDrag(event) {
    const drag = calendarSheetDragRef.current;
    const sheet = calendarSheetRef.current;
    if (!drag || !sheet || drag.pointerId !== event.pointerId) return;
    if (calendarSheetMoveFrameRef.current) {
      window.cancelAnimationFrame(calendarSheetMoveFrameRef.current);
      calendarSheetMoveFrameRef.current = null;
    }
    pendingCalendarSheetHeightRef.current = null;
    const heights = getCalendarSheetSnapHeights();
    const snaps = [
      ['compact', heights.compact],
      ['medium', heights.medium],
      ['full', heights.full]
    ];
    let nextSnap = calendarSheetSnap;

    if (event.type !== 'pointercancel' && !drag.moved) {
      nextSnap = calendarSheetSnap === 'compact' ? 'medium' : calendarSheetSnap === 'medium' ? 'full' : 'medium';
    } else if (event.type !== 'pointercancel') {
      const projectedHeight = drag.currentHeight - drag.velocity * 150;
      nextSnap = snaps.reduce((best, candidate) =>
        Math.abs(candidate[1] - projectedHeight) < Math.abs(best[1] - projectedHeight) ? candidate : best
      )[0];
    }

    calendarSheetDragRef.current = null;
    sheet.classList.remove(styles.calendarDetailsDragging);
    sheet.style.height = `${drag.currentHeight}px`;
    setCalendarSheetSnap(nextSnap);
    window.requestAnimationFrame(() => {
      if (!calendarSheetRef.current) return;
      calendarSheetRef.current.style.height = `${heights[nextSnap]}px`;
      calendarSheetTransitionTimerRef.current = window.setTimeout(() => {
        calendarSheetRef.current?.style.removeProperty('height');
      }, 280);
    });
  }

  function openEventPrimaryAction(event, action) {
    if (!event?.id || action?.disabled) return;
    const target = getEventPrimaryActionPath(event, action);
    if (target) navigate(target);
  }

  function toggleSmartArrival(nextEnabled) {
    const next = updateAppSettings({ smartArrivalEnabled: nextEnabled });
    setAppSettings(next);
    if (nextEnabled) {
      window.dispatchEvent(new Event('motrice:smart-arrival-authorize'));
      showToast('Arrivo intelligente attivato', 'success');
    } else {
      showToast('Arrivo intelligente disattivato', 'info');
    }
  }

  function authorizeSmartArrival() {
    window.dispatchEvent(new Event('motrice:smart-arrival-authorize'));
    showToast('Controllo della posizione in corso…', 'info');
  }

  async function openSmartArrivalSettings() {
    const { openNotificationSettings } = await import('../services/notificationCenter');
    const opened = await openNotificationSettings();
    if (!opened) showToast('Apri le autorizzazioni di Motrice dalle impostazioni del telefono', 'info');
  }

  function openSmartArrivalVerification(event, method) {
    if (!event?.id) return;
    navigate(`/agenda?verifyEvent=${encodeURIComponent(String(event.id))}&arrival=1&arrivalMethod=${method}`);
  }

  function postponeSmartArrival(event) {
    if (!event?.id) return;
    snoozeSmartArrival(event.id);
    showToast('Avviso rimandato di 5 minuti', 'info');
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
          <p>Programma, check-in e storico in un’unica agenda</p>
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
        const isCompactFocus = ['completed', 'closed'].includes(state.key);
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
            className={`${styles.todayWorkoutCard} ${styles[`todayWorkoutCard_${state.key}`]} ${isCompactFocus ? styles.todayWorkoutCardCompact : ''}`}
            aria-labelledby="today-workout-title"
          >
            <div className={styles.todayWorkoutTopline}>
              <span className={styles.todayWorkoutIcon} aria-hidden="true">
                {hasOutdoorTracking ? <Route size={22} /> : hasWorkout ? <Dumbbell size={22} /> : <CalendarDays size={22} />}
              </span>
              <div>
                <small>{isCompactFocus ? 'AZIONE RICHIESTA' : 'DA FARE ORA'} · {state.eyebrow}</small>
                <strong id="today-workout-title">{workoutTitle}</strong>
              </div>
              <time dateTime={event.event_datetime}>{formatEventTime(event.event_datetime)}</time>
            </div>

            <div className={styles.todayWorkoutStatus}>
              <StatusIcon size={18} aria-hidden="true" />
              <span>{state.status}</span>
            </div>

            {!isCompactFocus ? (
              <>
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
              </>
            ) : (
              <div className={styles.compactFocusSummary}>
                <span><Dumbbell size={14} aria-hidden="true" /> {event.sport_name || 'Sport'}</span>
                <span><Clock3 size={14} aria-hidden="true" /> {workoutDuration} min</span>
              </div>
            )}

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
                initialMethod={String(searchParams.get('arrivalMethod') || '')}
                showToast={showToast}
                onClose={() => setVerificationEventId('')}
                onVerified={() => {
                  clearSmartArrivalState(event.id);
                  return loadEvents({ silent: true });
                }}
                onStartWorkout={() => navigate(`/events/${event.id}/workout`)}
                onStartOutdoor={() => navigate(`/events/${event.id}/activity`)}
                onOpenEvent={() => navigate(`/events/${event.id}`)}
              />
            ) : null}
          </section>
        );
      })() : null}

      <div className={styles.timelineFilters} role="tablist" aria-label="Mostra eventi in programma o conclusi">
        <button
          type="button"
          role="tab"
          aria-selected={activeTimeline === 'upcoming'}
          className={activeTimeline === 'upcoming' ? styles.timelineFilterActive : undefined}
          onClick={() => changeActiveTimeline('upcoming')}
        >
          In programma
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTimeline === 'history'}
          className={activeTimeline === 'history' ? styles.timelineFilterActive : undefined}
          onClick={() => changeActiveTimeline('history')}
        >
          Conclusi
        </button>
      </div>

      <div className={styles.eventFilters} role="tablist" aria-label="Seleziona gli eventi da mostrare">
        <span className={styles.eventFilterGlider} data-active={activeSection} aria-hidden="true" />
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'all'}
          className={activeSection === 'all' ? styles.filterActive : undefined}
          onClick={() => changeActiveSection('all')}
        >
          Tutti <span>{timelineCalendarEvents.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'participating'}
          className={activeSection === 'participating' ? styles.filterActive : undefined}
          onClick={() => changeActiveSection('participating')}
        >
          Partecipo <span>{timelineParticipatingEvents.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'created'}
          className={activeSection === 'created' ? styles.filterActive : undefined}
          onClick={() => changeActiveSection('created')}
        >
          Organizzo <span>{timelineOwnedEvents.length}</span>
          {pendingRequestsCount > 0 ? <em aria-label={`${pendingRequestsCount} richieste in attesa`}>{pendingRequestsCount}</em> : null}
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
            <div className={styles.calendarHeadingMeta}>
              {selectedRange ? <small>{formatSelectedRange(selectedRange)}</small> : <small>Tocca un giorno con eventi</small>}
              {!isCurrentCalendarMonth ? <button type="button" onClick={returnToToday}>Oggi</button> : null}
            </div>
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
            const dayHistory = dayEvents.map((event) => isHistoricalEvent(event, nowMs));
            const allPast = hasEvents && dayHistory.every(Boolean);
            const hasPast = dayHistory.some(Boolean);
            const hasFuture = dayHistory.some((isPast) => !isPast);
            const allCancelled = hasEvents && dayEvents.every((event) => event.status === 'cancelled');
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
                  <span
                    className={`${styles.calendarEventCount} ${allCancelled ? styles.calendarEventCountCancelled : allPast ? styles.calendarEventCountPast : styles.calendarEventCountFuture}`}
                    aria-hidden="true"
                  >
                    {dayEvents.length > 9 ? '9+' : dayEvents.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className={styles.calendarLegendArea}>
          <button
            type="button"
            className={styles.calendarLegendTrigger}
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((current) => !current)}
          >
            <Info size={14} aria-hidden="true" /> Legenda
          </button>
          {legendOpen ? (
            <div className={styles.calendarLegend} aria-label="Legenda calendario">
              <span><i className={styles.legendFuture} aria-hidden="true" /> Da svolgere</span>
              <span><i className={styles.legendPast} aria-hidden="true" /> Svolto</span>
              <span><i className={styles.legendCancelled} aria-hidden="true" /> Annullato</span>
              <small>Il numero indica gli eventi del giorno</small>
            </div>
          ) : null}
        </div>

        {loading ? (
          <p className={styles.calendarState}><CalendarDays size={17} aria-hidden="true" /> Aggiornamento eventi…</p>
        ) : loadError && visibleCalendarEvents.length === 0 ? (
          <div className={styles.calendarState} role="alert">
            <CalendarDays size={17} aria-hidden="true" />
            <span>Eventi non disponibili</span>
            <button type="button" onClick={() => loadEvents()}>Riprova</button>
          </div>
        ) : visibleCalendarEvents.length === 0 ? (
          <p className={styles.calendarState}>
            <CalendarDays size={17} aria-hidden="true" />
            {activeTimeline === 'history' ? 'Nessun evento concluso' : 'Nessun evento in programma'}
          </p>
        ) : null}

        {selectedRange ? (
            <section
              ref={calendarSheetRef}
              className={`${styles.calendarDetails} ${styles[`calendarDetails${calendarSheetSnap[0].toUpperCase()}${calendarSheetSnap.slice(1)}`]}`}
              role="region"
              aria-label={`Eventi del ${formatSelectedRange(selectedRange)}`}
            >
            <button
              type="button"
              className={styles.calendarSheetHandle}
              onPointerDown={onCalendarSheetPointerDown}
              onPointerMove={onCalendarSheetPointerMove}
              onPointerUp={finishCalendarSheetDrag}
              onPointerCancel={finishCalendarSheetDrag}
              aria-label={calendarSheetSnap === 'full' ? 'Riduci pannello eventi' : 'Espandi pannello eventi'}
              aria-expanded={calendarSheetSnap === 'full'}
            >
              <span aria-hidden="true" />
            </button>
            <header className={styles.calendarDetailsHeader}>
              <div>
                <small>GIORNO SELEZIONATO</small>
                <strong>{formatSelectedRange(selectedRange)}</strong>
                <span>{selectedEvents.length} {selectedEvents.length === 1 ? 'evento' : 'eventi'}</span>
              </div>
              <button
                type="button"
                className={styles.calendarSheetClose}
                onClick={() => setSelectedRange(null)}
                aria-label="Chiudi dettagli calendario"
              >
                <X size={23} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.calendarEventList}>
              {selectedEvents.map((event) => {
                const timing = getEventTiming(event, nowMs);
                const isPast = isHistoricalEvent(event, nowMs);
                const isArchived = timing.lifecycleState === 'archived';
                const isCancelled = event.status === 'cancelled';
                const participants = Math.max(0, Number(event.participants_count || 0));
                const capacity = Math.max(participants, Number(event.max_participants || 0));
                const cardEvent = getAgendaEventCardData(event);

                if (isCancelled) {
                  return (
                    <EventCard
                      key={event.id}
                      event={cardEvent}
                      variant="compact"
                      context="agendaSheet"
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
                  const outcomeLabel = stats.attendance.key === 'host'
                    ? 'Completato'
                    : stats.attendance.key === 'present'
                      ? 'Verificata'
                      : stats.attendance.key === 'no-show'
                        ? 'No-show'
                        : stats.attendance.key === 'late-cancel'
                          ? 'Tardiva'
                          : stats.attendance.label;
                  return (
                    <EventCard
                      key={event.id}
                      event={cardEvent}
                      variant="compact"
                      context="agendaSheet"
                      status={{
                        label: isArchived
                          ? 'Archiviato'
                          : stats.attendance.key === 'host'
                            ? 'Concluso'
                            : stats.attendance.label,
                        tone: isArchived ? 'neutral' : stats.attendance.tone,
                        icon: StatusIcon
                      }}
                      stats={[
                        { value: `+${stats.earnedXp} XP`, label: 'Guadagnati' },
                        { value: `${stats.trainedMinutes} min`, label: 'Allenati' },
                        { value: outcomeLabel, label: 'Esito' },
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
                const smartArrivalPhase = getSmartArrivalEligibility(event, nowMs).phase;
                return (
                  <EventCard
                    key={event.id}
                    event={cardEvent}
                    variant="compact"
                    context="agendaSheet"
                    status={{ label: 'Da svolgere', tone: 'success' }}
                    secondaryAction={isOrganizer ? {
                      label: 'Modifica evento',
                      icon: Settings2,
                      onClick: (selectedEvent) => navigate(`/events/${selectedEvent.id}?manage=1`)
                    } : undefined}
                    primaryAction={isOrganizer ? {
                      label: 'Gestisci richieste',
                      icon: Users,
                      tone: 'warning',
                      onClick: (selectedEvent) => navigate(`/events/${selectedEvent.id}#organizer-controls`)
                    } : {
                      label: action.label,
                      icon: ActionIcon,
                      disabled: action.disabled,
                      onClick: (selectedEvent) => openEventPrimaryAction(selectedEvent, action)
                    }}
                    extraContent={!event.is_personal && !['unavailable', 'expired'].includes(smartArrivalPhase) ? (
                      <SmartArrivalPanel
                        event={event}
                        nowMs={nowMs}
                        enabled={appSettings.smartArrivalEnabled}
                        permission={arrivalPermission}
                        onToggle={toggleSmartArrival}
                        onAuthorize={authorizeSmartArrival}
                        onOpenSettings={openSmartArrivalSettings}
                        onVerify={openSmartArrivalVerification}
                        onSnooze={postponeSmartArrival}
                      />
                    ) : null}
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

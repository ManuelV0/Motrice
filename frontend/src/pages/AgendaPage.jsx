import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Settings2,
  ShieldCheck,
  Users,
  X,
  XCircle
} from 'lucide-react';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import styles from '../styles/pages/agenda.module.css';

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

function getEventXp(event) {
  return Math.max(0, Number(event?.completion_xp || 0) + Number(event?.review_bonus_xp || 0));
}

function getAttendanceState(event) {
  const attendance = String(event?.user_rsvp?.attendance || '').toLowerCase();
  const participantStatus = String(event?.user_rsvp?.status || '').toLowerCase();

  if (event?.created_by === 'me') {
    return { key: 'host', label: 'Svolto · Organizer', tone: 'neutral' };
  }
  if (attendance === 'attended' || participantStatus === 'completed' || event?.user_rsvp?.checked_in_at) {
    return { key: 'present', label: 'Presente', tone: 'success' };
  }
  if (attendance === 'no_show' || participantStatus === 'no_show') {
    return { key: 'no-show', label: 'No-Show', tone: 'danger' };
  }
  if (attendance === 'cancelled_late') {
    return { key: 'late-cancel', label: 'Cancellazione tardiva', tone: 'danger' };
  }
  return { key: 'no-show', label: 'No-Show', tone: 'danger' };
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

  return { attendance, earnedXp, trainedMinutes, presentCount, totalCount, reliability };
}

function getSummaryXp(event, todayKey) {
  const eventKey = toDateKey(event?.event_datetime);
  if (eventKey && eventKey < todayKey) return getClosedEventStats(event).earnedXp;
  return getEventXp(event);
}

function AgendaPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('all');
  const [selectedRange, setSelectedRange] = useState(null);
  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(now), [now]);
  const [calendarCursor, setCalendarCursor] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth()
  }));

  usePageMeta({
    title: 'Eventi | Motrice',
    description: 'Tutti gli eventi che organizzi o a cui partecipi in un unica vista.'
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listEvents({ dateRange: 'all', includePast: true, includeCancelled: true, sortBy: 'soonest' })
      .then((nextEvents) => {
        if (!active) return;
        setEvents(Array.isArray(nextEvents) ? nextEvents : []);
      })
      .catch((error) => {
        if (active) showToast(error?.message || 'Impossibile aggiornare gli eventi', 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [showToast]);

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
  const calendarMonthEvents = useMemo(
    () =>
      visibleCalendarEvents.filter((event) => {
        const eventDate = new Date(event.event_datetime);
        return (
          eventDate.getFullYear() === calendarCursor.year &&
          eventDate.getMonth() === calendarCursor.month
        );
      }),
    [calendarCursor, visibleCalendarEvents]
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
  const summaryEvents = selectedRange ? selectedEvents : calendarMonthEvents;
  const summaryMinutes = useMemo(
    () => summaryEvents.reduce((total, event) => total + Math.max(0, Number(event.duration_minutes || 0)), 0),
    [summaryEvents]
  );
  const summaryXp = useMemo(
    () => summaryEvents.reduce((total, event) => total + getSummaryXp(event, todayKey), 0),
    [summaryEvents, todayKey]
  );
  const summaryLabel = selectedRange
    ? formatSelectedRange(selectedRange)
    : formatCalendarMonth(calendarCursor.year, calendarCursor.month);
  const summaryCountLabel = activeSection === 'created'
    ? `${summaryEvents.length} creati`
    : activeSection === 'participating'
      ? `${summaryEvents.length} partecipati`
      : `${summaryEvents.length} eventi`;

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

  function openEvent(event) {
    navigate(`/events/${event.id}`);
  }

  function openFutureAction(event) {
    if (event.created_by === 'me') {
      openEvent(event);
      return;
    }
    navigate(`/chat/event_${event.id}`);
  }

  return (
    <section className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>I miei eventi</h1>
          <p>Il calendario filtra attività future e storico</p>
        </div>
      </div>

      <div className={styles.monthSummary} aria-label={`Riepilogo di ${summaryLabel}`}>
        <strong>{summaryLabel}</strong>
        <i aria-hidden="true" />
        <span>{summaryCountLabel}</span>
        <i aria-hidden="true" />
        <span>{summaryMinutes} min</span>
        <i aria-hidden="true" />
        <b>{summaryXp} PX <em aria-hidden="true">P</em></b>
      </div>

      <div className={styles.eventFilters} role="tablist" aria-label="Seleziona gli eventi da mostrare">
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'all'}
          className={activeSection === 'all' ? styles.filterActive : undefined}
          onClick={() => changeActiveSection('all')}
        >
          Tutti
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
          Creati da te <span>{ownedEvents.length}</span>
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
            <span aria-hidden="true">{'<'}</span>
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
            <span aria-hidden="true">{'>'}</span>
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
            const isPast = dateKey < todayKey;
            const label = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);

            return (
              <button
                key={dateKey}
                type="button"
                role="gridcell"
                disabled={!hasEvents}
                onClick={() => selectCalendarDay(dateKey)}
                aria-pressed={isInRange}
                aria-label={`${label}${hasEvents
                  ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventi'}, ${isPast ? 'svolto' : 'da svolgere'}`
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
                {hasEvents ? (
                  <span className={styles.calendarEventDots} aria-hidden="true">
                    {Array.from({ length: Math.min(2, dayEvents.length) }, (_, dotIndex) => (
                      <i
                        key={dotIndex}
                        className={dayEvents[dotIndex]?.status === 'cancelled'
                          ? styles.eventDotCancelled
                          : isPast ? styles.eventDotPast : styles.eventDotFuture}
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
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.calendarEventList}>
              {selectedEvents.map((event) => {
                const eventKey = toDateKey(event.event_datetime);
                const isPast = eventKey < todayKey;
                const isCancelled = event.status === 'cancelled';
                const participants = Math.max(0, Number(event.participants_count || 0));
                const capacity = Math.max(participants, Number(event.max_participants || 0));

                if (isCancelled) {
                  return (
                    <article key={event.id} className={`${styles.sheetEventCard} ${styles.cancelledEventCard}`}>
                      <div className={styles.sheetEventTopline}>
                        <span className={`${styles.eventState} ${styles.eventState_danger}`}>
                          <XCircle size={15} aria-hidden="true" /> Annullato
                        </span>
                        <time dateTime={event.event_datetime}>{formatEventTime(event.event_datetime)}</time>
                      </div>
                      <h3>{event.title || event.sport_name || 'Evento Motrice'}</h3>
                      <p>{event.location_name || event.city || 'Luogo da definire'}</p>
                      <div className={styles.cancelledEventMeta}>
                        <span>{event.cancellation_note || 'Evento cancellato dall organizer'}</span>
                        <strong>Depositi restituiti</strong>
                      </div>
                      <button type="button" className={styles.eventDetailAction} onClick={() => openEvent(event)}>
                        Apri riepilogo annullamento
                      </button>
                    </article>
                  );
                }

                if (isPast) {
                  const stats = getClosedEventStats(event);
                  const StatusIcon = stats.attendance.tone === 'danger' ? XCircle : CheckCircle2;
                  return (
                    <article key={event.id} className={`${styles.sheetEventCard} ${styles.closedEventCard}`}>
                      <div className={styles.sheetEventTopline}>
                        <span className={`${styles.eventState} ${styles[`eventState_${stats.attendance.tone}`]}`}>
                          <StatusIcon size={15} aria-hidden="true" /> {stats.attendance.label}
                        </span>
                        <time dateTime={event.event_datetime}>{formatEventTime(event.event_datetime)}</time>
                      </div>
                      <h3>{event.title || event.sport_name || 'Evento Motrice'}</h3>
                      <p>{event.location_name || event.city || 'Luogo da definire'}</p>
                      <div className={styles.closedStatsGrid}>
                        <span><b>+{stats.earnedXp} XP</b><small>guadagnati</small></span>
                        <span><b>{stats.trainedMinutes} min</b><small>allenati</small></span>
                        <span><b>{stats.reliability}</b><small>Affidabilità</small></span>
                        <span><b>{stats.presentCount}/{stats.totalCount}</b><small>presenti</small></span>
                      </div>
                      <button type="button" className={styles.eventDetailAction} onClick={() => openEvent(event)}>
                        Apri riepilogo evento
                      </button>
                    </article>
                  );
                }

                const isOrganizer = event.created_by === 'me';
                const ActionIcon = isOrganizer ? Settings2 : MessageCircle;
                return (
                  <article key={event.id} className={`${styles.sheetEventCard} ${styles.futureEventCard}`}>
                    <div className={styles.sheetEventTopline}>
                      <span className={`${styles.eventState} ${styles.eventState_success}`}>Da svolgere</span>
                      <time dateTime={event.event_datetime}>{formatEventTime(event.event_datetime)}</time>
                    </div>
                    <h3>{event.title || event.sport_name || 'Evento Motrice'}</h3>
                    <p>{event.location_name || event.city || 'Luogo da definire'}</p>
                    <div className={styles.futureEventMeta}>
                      <span><Clock3 size={16} aria-hidden="true" /> {Number(event.duration_minutes || 0)} min</span>
                      <span><Users size={16} aria-hidden="true" /> {participants}/{capacity || '—'}</span>
                      {isOrganizer ? <span><ShieldCheck size={16} aria-hidden="true" /> Organizer</span> : null}
                    </div>
                    <div className={styles.eventActionRow}>
                      <button type="button" className={styles.eventDetailAction} onClick={() => openEvent(event)}>Dettagli</button>
                      <button type="button" className={styles.eventPrimaryAction} onClick={() => openFutureAction(event)}>
                        <ActionIcon size={17} aria-hidden="true" /> {isOrganizer ? 'Gestisci' : 'Chat'}
                      </button>
                    </div>
                  </article>
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

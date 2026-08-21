import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays
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

function getEventXp(event) {
  return Math.max(0, Number(event?.completion_xp || 0) + Number(event?.review_bonus_xp || 0));
}

function AgendaPage() {
  const { showToast } = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('all');
  const now = useMemo(() => new Date(), []);
  const [calendarCursor, setCalendarCursor] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth()
  }));

  usePageMeta({
    title: 'Eventi | Motrice',
    description: 'Tutti gli eventi che organizzi, salvi o a cui partecipi in un unica vista.'
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listEvents({ dateRange: 'all', sortBy: 'soonest' })
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
    () => events.filter((event) => event.created_by !== 'me' && (event.is_going || event.is_saved)),
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
      calendarEvents.filter((event) => {
        const eventDate = new Date(event.event_datetime);
        return (
          eventDate.getFullYear() === calendarCursor.year &&
          eventDate.getMonth() === calendarCursor.month
        );
      }),
    [calendarCursor, calendarEvents]
  );
  const calendarMonthMinutes = useMemo(
    () => calendarMonthEvents.reduce((total, event) => total + Math.max(0, Number(event.duration_minutes || 0)), 0),
    [calendarMonthEvents]
  );
  const calendarMonthCreatedCount = useMemo(
    () => calendarMonthEvents.filter((event) => event.created_by === 'me').length,
    [calendarMonthEvents]
  );
  const calendarMonthXp = useMemo(
    () => calendarMonthEvents.reduce((total, event) => total + getEventXp(event), 0),
    [calendarMonthEvents]
  );
  function changeCalendarMonth(offset) {
    setCalendarCursor((current) => {
      const next = new Date(current.year, current.month + offset, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function changeActiveSection(section) {
    setActiveSection(section);
  }

  return (
    <section className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>I miei eventi</h1>
          <p>Tutto in un unico posto</p>
        </div>
      </div>

      <div className={styles.monthSummary} aria-label={`Riepilogo di ${formatCalendarMonth(calendarCursor.year, calendarCursor.month)}`}>
        <strong>{formatCalendarMonth(calendarCursor.year, calendarCursor.month)}</strong>
        <i aria-hidden="true" />
        <span>{calendarMonthCreatedCount} creati</span>
        <i aria-hidden="true" />
        <span>{calendarMonthMinutes} min</span>
        <i aria-hidden="true" />
        <b>{calendarMonthXp} PX <em aria-hidden="true">P</em></b>
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
          aria-selected={activeSection === 'created'}
          className={activeSection === 'created' ? styles.filterActive : undefined}
          onClick={() => changeActiveSection('created')}
        >
          Creati <span>{ownedEvents.length}</span>
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
            const isToday = dateKey === toDateKey(now);
            const createdCount = dayEvents.filter((event) => event.created_by === 'me').length;
            const participatingDayCount = dayEvents.filter((event) => event.created_by !== 'me').length;
            const label = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);

            return (
              <div
                key={dateKey}
                role="gridcell"
                className={[
                  styles.calendarDay,
                  hasEvents ? styles.calendarDayWithEvents : '',
                  isToday ? styles.calendarDayToday : ''
                ].filter(Boolean).join(' ')}
                aria-label={`${label}${hasEvents
                  ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventi'}, ${createdCount} creati da te, ${participatingDayCount} a cui partecipi`
                  : ', nessun evento'}`}
              >
                <span className={styles.calendarDayNumber}>{day}</span>
                {hasEvents ? (
                  <span className={styles.calendarDayBadges} aria-hidden="true">
                    {createdCount > 0 ? <b className={styles.createdDayBadge}>{createdCount}</b> : null}
                    {participatingDayCount > 0 ? <b className={styles.participatingDayBadge}>{participatingDayCount}</b> : null}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className={styles.calendarLegend} aria-label="Legenda calendario">
          <span><i className={styles.legendCreated} aria-hidden="true" /> Creati da te <small>(numero = quanti)</small></span>
          <span><i className={styles.legendParticipating} aria-hidden="true" /> Partecipi</span>
        </div>

        {loading ? (
          <p className={styles.calendarState}><CalendarDays size={17} aria-hidden="true" /> Aggiornamento eventi…</p>
        ) : !hasItems ? (
          <p className={styles.calendarState}><CalendarDays size={17} aria-hidden="true" /> Nessun evento presente</p>
        ) : null}
      </section>
    </section>
  );
}

export default AgendaPage;

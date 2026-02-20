import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, MessageCircle, Send, Star, UserRound } from 'lucide-react';
import { coachApi } from '../services/coachApi';
import { api } from '../../../services/api';
import { useBilling } from '../../../context/BillingContext';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useToast } from '../../../context/ToastContext';
import Card from '../../../components/Card';
import EmptyState from '../../../components/EmptyState';
import LoadingSkeleton from '../../../components/LoadingSkeleton';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import PaywallModal from '../../../components/PaywallModal';
import { safeStorageGet, safeStorageSet } from '../../../utils/safeStorage';
import styles from '../../../styles/pages/coachMarketplace.module.css';

const TIMELINE_START_HOUR = 0;
const TIMELINE_END_HOUR = 24;
const COACH_MANUAL_EVENTS_KEY = 'motrice_coach_manual_events_v1';

function startOfDay(dateInput) {
  const date = new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(dateInput, amount) {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + amount);
  return date;
}

function startOfWeekMonday(dateInput) {
  const date = startOfDay(dateInput);
  const day = date.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  return addDays(date, shift);
}

function startOfMonth(dateInput) {
  const date = startOfDay(dateInput);
  date.setDate(1);
  return date;
}

function endOfMonth(dateInput) {
  const date = startOfMonth(dateInput);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  date.setHours(23, 59, 59, 999);
  return date;
}

function monthKey(dateInput) {
  const date = new Date(dateInput);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthFromKey(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const date = new Date(year, month - 1, 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function inRange(date, from, to) {
  const time = date.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

function toDayKey(dateInput) {
  const date = startOfDay(dateInput);
  return date.toISOString().slice(0, 10);
}

function readManualEventsSafe() {
  try {
    const raw = safeStorageGet(COACH_MANUAL_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function CoachDashboardPage() {
  const { showToast } = useToast();
  const { entitlements } = useBilling();

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [coachId, setCoachId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [planByRequestId, setPlanByRequestId] = useState({});
  const [updateDrafts, setUpdateDrafts] = useState({});
  const [updateFilesByRequestId, setUpdateFilesByRequestId] = useState({});
  const [updatingRequestId, setUpdatingRequestId] = useState(null);
  const [openCompletedByRequestId, setOpenCompletedByRequestId] = useState({});
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarView, setCalendarView] = useState('today');
  const [calendarAnchorDate, setCalendarAnchorDate] = useState(() => startOfDay(new Date()));
  const [weekMonth, setWeekMonth] = useState(() => monthKey(new Date()));
  const [weekIndex, setWeekIndex] = useState(0);
  const [calendarCollapsed, setCalendarCollapsed] = useState(false);
  const [manualEvents, setManualEvents] = useState(() => readManualEventsSafe());
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventModalDate, setEventModalDate] = useState(() => startOfDay(new Date()));
  const [eventModalHour, setEventModalHour] = useState(9);
  const [eventModalEndHour, setEventModalEndHour] = useState(10);
  const [eventDraft, setEventDraft] = useState({ title: '', notes: '' });
  const [editingManualEventId, setEditingManualEventId] = useState(null);
  const [agendaPaywallOpen, setAgendaPaywallOpen] = useState(false);
  const [chatBookings, setChatBookings] = useState([]);
  const [chatLoading, setChatLoading] = useState(true);

  usePageMeta({
    title: 'Coach Dashboard | Motrice',
    description: 'Agenda coach con regole standard e gestione richieste schede individuali.'
  });

  const timelineHourTicks = useMemo(
    () => Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR }, (_, index) => TIMELINE_START_HOUR + index),
    []
  );
  const pendingRequests = useMemo(() => requests.filter((request) => request.status === 'pending'), [requests]);
  const completedRequests = useMemo(() => requests.filter((request) => request.status === 'completed'), [requests]);
  const sortedChatBookings = useMemo(
    () => [...chatBookings].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    [chatBookings]
  );

  async function loadCoachPlans() {
    try {
      const items = await coachApi.listCoachPlans();
      const byRequest = {};
      const draftsByRequest = {};
      (items || []).forEach((plan) => {
        const key = String(plan.request_id);
        byRequest[key] = plan;
        draftsByRequest[key] = {
          title: plan.title || '',
          content: plan.content || '',
          coachNote: plan.coach_note || ''
        };
      });
      setPlanByRequestId(byRequest);
      setUpdateDrafts((prev) => ({ ...draftsByRequest, ...prev }));
    } catch {
      setPlanByRequestId({});
      setUpdateDrafts({});
    }
  }

  async function loadRequests() {
    setLoading(true);
    try {
      const data = await coachApi.listCoachRequests();
      setCoachId(data.coach_id);
      setRequests(data.items || []);
    } catch (error) {
      setCoachId(null);
      setRequests([]);
      showToast(error.message || 'Impossibile caricare richieste coach', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadChatBookings() {
    setChatLoading(true);
    try {
      const items = await api.listCoachChatBookings();
      setChatBookings(items || []);
    } catch (error) {
      setChatBookings([]);
      showToast(error.message || 'Impossibile caricare prenotazioni chat', 'error');
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setCalendarLoading(true);
    setChatLoading(true);

    Promise.allSettled([coachApi.listCoachRequests(), api.listCoachChatBookings(), coachApi.listCoachPlans()]).then((results) => {
      if (!active) return;

      const requestsResult = results[0];
      if (requestsResult.status === 'fulfilled') {
        const payload = requestsResult.value || {};
        setCoachId(payload.coach_id || null);
        setRequests(payload.items || []);
      } else {
        setCoachId(null);
        setRequests([]);
        showToast(requestsResult.reason?.message || 'Impossibile caricare richieste coach', 'error');
      }

      const chatResult = results[1];
      if (chatResult.status === 'fulfilled') {
        setChatBookings(chatResult.value || []);
      } else {
        setChatBookings([]);
        showToast(chatResult.reason?.message || 'Impossibile caricare prenotazioni chat', 'error');
      }

      const plansResult = results[2];
      if (plansResult.status === 'fulfilled') {
        const items = plansResult.value || [];
        const byRequest = {};
        const draftsByRequest = {};
        items.forEach((plan) => {
          const key = String(plan.request_id);
          byRequest[key] = plan;
          draftsByRequest[key] = {
            title: plan.title || '',
            content: plan.content || '',
            coachNote: plan.coach_note || ''
          };
        });
        setPlanByRequestId(byRequest);
        setUpdateDrafts((prev) => ({ ...draftsByRequest, ...prev }));
      } else {
        setPlanByRequestId({});
        setUpdateDrafts({});
      }

      setLoading(false);
      setCalendarLoading(false);
      setChatLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    safeStorageSet(COACH_MANUAL_EVENTS_KEY, JSON.stringify(manualEvents));
  }, [manualEvents]);

  useEffect(() => {
    if (calendarView !== 'week') return;
    setWeekMonth(monthKey(calendarAnchorDate));
  }, [calendarView, calendarAnchorDate]);

  function selectView(view) {
    if ((view === 'week' || view === 'month') && !entitlements.canUseAgendaWeekMonth) {
      setAgendaPaywallOpen(true);
      return;
    }
    setCalendarView(view);
  }

  async function submitPlan(request) {
    const draft = drafts[request.id] || { title: '', content: '' };
    if (draft.title.trim().length < 4 || draft.content.trim().length < 12) {
      showToast('Titolo minimo 4 caratteri e contenuto minimo 12', 'error');
      return;
    }

    try {
      await coachApi.createPlan(request.id, draft);
      showToast('Scheda consegnata con successo', 'success');
      setDrafts((prev) => ({ ...prev, [request.id]: { title: '', content: '' } }));
      await loadRequests();
      await loadChatBookings();
      await loadCoachPlans();
    } catch (error) {
      showToast(error.message || 'Errore durante consegna scheda', 'error');
    }
  }

  async function submitPlanUpdate(request) {
    const key = String(request.id);
    const draft = updateDrafts[key] || { title: '', content: '', coachNote: '' };
    const files = updateFilesByRequestId[key] || [];
    if (String(draft.title || '').trim().length < 4 || String(draft.content || '').trim().length < 12) {
      showToast('Titolo minimo 4 caratteri e contenuto minimo 12', 'error');
      return;
    }

    setUpdatingRequestId(request.id);
    try {
      const updated =
        files.length > 0
          ? await coachApi.updatePlanWithAttachments(request.id, {
              title: draft.title,
              content: draft.content,
              coachNote: draft.coachNote || '',
              attachments: files
            })
          : await coachApi.updatePlan(request.id, {
              title: draft.title,
              content: draft.content,
              coach_note: draft.coachNote || ''
            });
      setPlanByRequestId((prev) => ({ ...prev, [key]: updated }));
      setUpdateFilesByRequestId((prev) => ({ ...prev, [key]: [] }));
      showToast('Aggiornamento scheda inviato', 'success');
      await loadRequests();
    } catch (error) {
      showToast(error.message || 'Aggiornamento scheda non riuscito', 'error');
    } finally {
      setUpdatingRequestId(null);
    }
  }

  function statusClass(status) {
    if (status === 'live') return styles.chatStatusLive;
    if (status === 'completed') return styles.chatStatusCompleted;
    if (status === 'rated') return styles.chatStatusRated;
    if (status === 'cancelled') return styles.chatStatusCancelled;
    return styles.chatStatusBooked;
  }

  function statusLabel(status) {
    if (status === 'live') return 'In corso';
    if (status === 'completed') return 'Conclusa';
    if (status === 'rated') return 'Valutata';
    if (status === 'cancelled') return 'Annullata';
    return 'Prenotata';
  }

  function buildCalendarEntryFromRequest(request) {
    const when = request.status === 'completed' ? request.delivered_at || request.updated_at || request.created_at : request.created_at;
    const start = new Date(when || Date.now());
    if (Number.isNaN(start.getTime())) return null;
    const fallbackEnd = new Date(start);
    fallbackEnd.setMinutes(fallbackEnd.getMinutes() + 45);

    return {
      id: `request-${request.id}`,
      kind: request.status === 'completed' ? 'delivery' : 'request',
      title: request.status === 'completed' ? 'Scheda consegnata' : 'Nuova richiesta scheda',
      subtitle: `${request.client_name} · ${request.goal}`,
      startsAt: start,
      endsAt: fallbackEnd,
      clientName: request.client_name,
      requestStatus: request.status,
      route: '/dashboard/coach'
    };
  }

  function buildCalendarEntryFromChat(booking) {
    const start = new Date(booking.starts_at);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(booking.ends_at || booking.starts_at);
    if (Number.isNaN(end.getTime()) || end <= start) {
      end.setMinutes(start.getMinutes() + 45);
    }
    return {
      id: `chat-${booking.id}`,
      kind: 'chat',
      title: `Chat coach · ${statusLabel(booking.status)}`,
      subtitle: `Cliente #${booking.client_user_id} · Scheda #${booking.plan_id}`,
      startsAt: start,
      endsAt: end,
      bookingStatus: booking.status,
      route: '/dashboard/plans'
    };
  }

  function buildCalendarEntryFromManual(item) {
    const start = new Date(item.starts_at);
    const end = new Date(item.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return {
      id: `manual-${item.id}`,
      manualId: item.id,
      kind: 'manual',
      title: item.title || 'Appunto coach',
      manualNotes: item.notes || '',
      subtitle: item.notes || 'Evento pianificato dal coach',
      startsAt: start,
      endsAt: end > start ? end : new Date(start.getTime() + 60 * 60 * 1000),
      route: '/dashboard/coach'
    };
  }

  const coachCalendarEntries = useMemo(() => {
    const fromRequests = requests.map(buildCalendarEntryFromRequest).filter(Boolean);
    const fromChat = chatBookings.map(buildCalendarEntryFromChat).filter(Boolean);
    const fromManual = manualEvents.map(buildCalendarEntryFromManual).filter(Boolean);
    return [...fromRequests, ...fromChat, ...fromManual].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }, [requests, chatBookings, manualEvents]);

  const calendarRange = useMemo(() => {
    if (calendarView === 'today') {
      const start = startOfDay(calendarAnchorDate);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (calendarView === 'week') {
      const start = startOfWeekMonday(calendarAnchorDate);
      const end = addDays(start, 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    const start = startOfMonth(calendarAnchorDate);
    const end = endOfMonth(calendarAnchorDate);
    return { start, end };
  }, [calendarView, calendarAnchorDate]);

  const weekMonthDate = useMemo(() => monthFromKey(weekMonth) || startOfMonth(calendarAnchorDate), [weekMonth, calendarAnchorDate]);

  const weekMonthOptions = useMemo(() => {
    const anchor = startOfMonth(new Date());
    return Array.from({ length: 18 }, (_, idx) => {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - 3 + idx, 1);
      return { key: monthKey(d), label: d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) };
    });
  }, []);

  const monthWeeks = useMemo(() => {
    const start = startOfMonth(weekMonthDate);
    const end = endOfMonth(weekMonthDate);
    const daysInMonth = end.getDate();
    const weeks = [];
    let cursor = 1;
    let index = 0;
    while (cursor <= daysInMonth) {
      const segmentEnd = Math.min(cursor + 6, daysInMonth);
      const days = Array.from({ length: segmentEnd - cursor + 1 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), cursor + i));
      weeks.push({
        index,
        start: days[0],
        end: days[days.length - 1],
        days,
        label: `Settimana ${index + 1} · ${String(cursor).padStart(2, '0')}-${String(segmentEnd).padStart(2, '0')}`
      });
      cursor = segmentEnd + 1;
      index += 1;
    }
    return weeks;
  }, [weekMonthDate]);

  useEffect(() => {
    if (weekIndex < monthWeeks.length) return;
    setWeekIndex(0);
  }, [weekIndex, monthWeeks]);

  const selectedMonthWeek = useMemo(() => monthWeeks[weekIndex] || monthWeeks[0] || null, [monthWeeks, weekIndex]);

  const effectiveRange = useMemo(() => {
    if (calendarView === 'week' && selectedMonthWeek) {
      const start = startOfDay(selectedMonthWeek.start);
      const end = startOfDay(selectedMonthWeek.end);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    return calendarRange;
  }, [calendarView, selectedMonthWeek, calendarRange]);

  const visibleEntries = useMemo(
    () => coachCalendarEntries.filter((entry) => inRange(entry.startsAt, effectiveRange.start, effectiveRange.end)),
    [coachCalendarEntries, effectiveRange]
  );

  const hasAgendaItems = visibleEntries.length > 0;

  const calendarColumns = useMemo(() => {
    if (calendarView === 'today') {
      return [{ key: toDayKey(calendarRange.start), label: 'Oggi', date: calendarRange.start }];
    }
    if (calendarView === 'week') {
      return Array.from({ length: 7 }, (_, index) => {
        const date = addDays(calendarRange.start, index);
        return {
          key: toDayKey(date),
          date,
          label: date.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' })
        };
      });
    }
    return [];
  }, [calendarView, calendarRange]);

  const entriesByDay = useMemo(() => {
    const map = new Map();
    visibleEntries.forEach((entry) => {
      const key = toDayKey(entry.startsAt);
      const row = map.get(key) || [];
      row.push(entry);
      map.set(key, row);
    });
    map.forEach((items) => items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()));
    return map;
  }, [visibleEntries]);

  const monthCells = useMemo(() => {
    if (calendarView !== 'month') return [];
    const monthStart = startOfMonth(calendarAnchorDate);
    const monthEnd = endOfMonth(calendarAnchorDate);
    const daysInMonth = monthEnd.getDate();
    return Array.from({ length: daysInMonth }, (_, index) => addDays(monthStart, index));
  }, [calendarView, calendarAnchorDate]);

  function timelineStyle(entry) {
    const startMinutes = entry.startsAt.getHours() * 60 + entry.startsAt.getMinutes();
    const endMinutes = entry.endsAt.getHours() * 60 + entry.endsAt.getMinutes();
    const minStart = TIMELINE_START_HOUR * 60;
    const maxEnd = TIMELINE_END_HOUR * 60;
    const clampedStart = Math.max(minStart, Math.min(startMinutes, maxEnd));
    const clampedEnd = Math.max(clampedStart + 30, Math.min(endMinutes, maxEnd));
    return {
      '--start-min': String(clampedStart - minStart),
      '--duration-min': String(Math.max(clampedEnd - clampedStart, 30))
    };
  }

  function entryClassName(entry) {
    if (entry.kind === 'chat') return `${styles.timelineEvent} ${styles.timelineEventChat}`;
    if (entry.kind === 'delivery') return `${styles.timelineEvent} ${styles.timelineEventDelivery}`;
    if (entry.kind === 'manual') return `${styles.timelineEvent} ${styles.timelineEventManual}`;
    return `${styles.timelineEvent} ${styles.timelineEventRequest}`;
  }

  function formatEntryTime(entry) {
    const from = entry.startsAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const to = entry.endsAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `${from} - ${to}`;
  }

  function changeCalendarPeriod(direction) {
    if (calendarView === 'today') {
      setCalendarAnchorDate((prev) => addDays(prev, direction));
      return;
    }
    if (calendarView === 'week') {
      const base = selectedMonthWeek?.start || calendarAnchorDate;
      const next = addDays(base, direction * 7);
      const nextMonthKey = monthKey(next);
      const nextWeekIdx = Math.floor((next.getDate() - 1) / 7);
      setWeekMonth(nextMonthKey);
      setWeekIndex(Math.max(0, nextWeekIdx));
      setCalendarAnchorDate(next);
      return;
    }
    const next = new Date(calendarAnchorDate);
    next.setMonth(next.getMonth() + direction);
    setCalendarAnchorDate(next);
  }

  function goToToday() {
    setCalendarAnchorDate(startOfDay(new Date()));
  }

  function openHourComposer(targetDate, hour) {
    const safeHour = Math.max(0, Math.min(23, Number(hour) || 0));
    setEventModalDate(startOfDay(targetDate));
    setEventModalHour(safeHour);
    setEventModalEndHour(Math.min(safeHour + 1, 24));
    setEventDraft({ title: '', notes: '' });
    setEditingManualEventId(null);
    setEventModalOpen(true);
  }

  function openManualEdit(entry) {
    const start = new Date(entry.startsAt);
    const end = new Date(entry.endsAt);
    setEventModalDate(startOfDay(start));
    setEventModalHour(start.getHours());
    setEventModalEndHour(Math.max(start.getHours() + 1, Math.min(24, end.getHours() || start.getHours() + 1)));
    setEventDraft({ title: entry.title || '', notes: entry.manualNotes || '' });
    setEditingManualEventId(entry.manualId || null);
    setEventModalOpen(true);
  }

  function removeManualEvent(manualId) {
    if (!manualId) return;
    const confirmed = window.confirm('Vuoi eliminare questo evento manuale?');
    if (!confirmed) return;
    setManualEvents((prev) => prev.filter((item) => String(item.id) !== String(manualId)));
    showToast('Evento eliminato', 'info');
  }

  function saveManualEvent() {
    const title = String(eventDraft.title || '').trim();
    if (title.length < 3) {
      showToast('Titolo minimo 3 caratteri', 'error');
      return;
    }

    const startHour = Number(eventModalHour);
    const endHour = Number(eventModalEndHour);
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || startHour < 0 || endHour > 24 || endHour <= startHour) {
      showToast('Imposta un intervallo valido (ora fine maggiore di ora inizio)', 'error');
      return;
    }

    const start = new Date(eventModalDate);
    start.setHours(startHour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(endHour, 0, 0, 0);

    if (editingManualEventId) {
      setManualEvents((prev) =>
        prev
          .map((item) =>
            String(item.id) === String(editingManualEventId)
              ? {
                  ...item,
                  title,
                  notes: String(eventDraft.notes || '').trim(),
                  starts_at: start.toISOString(),
                  ends_at: end.toISOString()
                }
              : item
          )
          .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
      );
      showToast('Evento aggiornato', 'success');
    } else {
      const next = {
        id: `coach-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        title,
        notes: String(eventDraft.notes || '').trim(),
        starts_at: start.toISOString(),
        ends_at: end.toISOString()
      };
      setManualEvents((prev) => [...prev, next].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)));
      showToast('Evento aggiunto in agenda coach', 'success');
    }
    setEventModalOpen(false);
    setEditingManualEventId(null);
  }

  function openDayFromMonth(date) {
    setCalendarAnchorDate(startOfDay(date));
    setCalendarView('today');
  }

  function onWeekMonthChange(nextMonthKey) {
    const parsed = monthFromKey(nextMonthKey);
    if (!parsed) return;
    setWeekMonth(nextMonthKey);
    setWeekIndex(0);
    setCalendarAnchorDate(parsed);
  }

  function onWeekSegmentSelect(index) {
    const target = monthWeeks[index];
    if (!target) return;
    setWeekIndex(index);
    setCalendarAnchorDate(startOfDay(target.start));
  }

  const calendarRangeLabel = useMemo(() => {
    if (calendarView === 'today') {
      return calendarRange.start.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' });
    }
    if (calendarView === 'week') {
      if (selectedMonthWeek) {
        return `${selectedMonthWeek.start.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} - ${selectedMonthWeek.end.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}`;
      }
      return '';
    }
    return calendarRange.start.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  }, [calendarView, calendarRange, selectedMonthWeek]);

  const focusedWeekDays = useMemo(() => {
    if (calendarView !== 'week') return [];
    if (selectedMonthWeek) return selectedMonthWeek.days;
    return [];
  }, [calendarView, selectedMonthWeek]);

  const coachClients = useMemo(() => {
    const map = new Map();

    function ensureClient(clientId, fallbackName = 'Cliente', fallbackEmail = '') {
      const key = String(clientId);
      if (!map.has(key)) {
        map.set(key, {
          clientId: Number(clientId),
          name: fallbackName,
          email: fallbackEmail,
          completedRequests: [],
          planUpdates: [],
          chats: []
        });
      }
      return map.get(key);
    }

    completedRequests.forEach((request) => {
      const row = ensureClient(request.client_user_id, request.client_name, request.client_email);
      row.name = request.client_name || row.name;
      row.email = request.client_email || row.email;
      row.completedRequests.push(request);
      const plan = planByRequestId[String(request.id)];
      if (plan) {
        row.planUpdates.push({
          requestId: request.id,
          title: plan.title || request.plan_title || 'Scheda',
          updatedAt: plan.updated_at || plan.delivered_at || request.delivered_at || null,
          deliveredAt: plan.delivered_at || request.delivered_at || null
        });
      }
    });

    chatBookings.forEach((booking) => {
      const row = ensureClient(booking.client_user_id, `Cliente #${booking.client_user_id}`, '');
      row.chats.push({
        id: booking.id,
        status: statusLabel(booking.status),
        startsAt: booking.starts_at,
        planId: booking.plan_id
      });
    });

    return Array.from(map.values())
      .map((client) => ({
        ...client,
        completedRequests: client.completedRequests.sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at)),
        planUpdates: client.planUpdates.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0)),
        chats: client.chats.sort((a, b) => Date.parse(b.startsAt || 0) - Date.parse(a.startsAt || 0))
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [completedRequests, planByRequestId, chatBookings]);

  function weekEventClass(entry) {
    if (entry.kind === 'chat') return `${styles.weekEvent} ${styles.weekEventChat}`;
    if (entry.kind === 'delivery') return `${styles.weekEvent} ${styles.weekEventDelivery}`;
    if (entry.kind === 'manual') return `${styles.weekEvent} ${styles.weekEventManual}`;
    return `${styles.weekEvent} ${styles.weekEventRequest}`;
  }

  function toggleCompletedRequest(requestId) {
    const key = String(requestId);
    setOpenCompletedByRequestId((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading) return <LoadingSkeleton rows={3} />;

  if (!coachId) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        imageSrc="/images/default-sport.svg"
        imageAlt="Dashboard coach"
        title="Dashboard non disponibile"
        description="Solo i coach approvati possono accedere alle richieste dei clienti."
      />
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.heroCompact}>
        <p className={styles.kicker}>Coach Dashboard</p>
        <h1>Agenda Coach + Richieste schede</h1>
        <p className="muted">Stesse regole della tua agenda standard, con gestione operativa delle richieste clienti.</p>
      </header>

      <Card className={styles.requestAgendaBox}>
        <div className={styles.headRow}>
          <h2>Box Agenda Richieste Cliente</h2>
          <Link to="/dashboard/plans" className={styles.linkAction}>Vista cliente</Link>
        </div>
        <div className={styles.requestColumns}>
          <div>
            <h3>Pending ({pendingRequests.length})</h3>
            <ul className={styles.listCompact}>
              {pendingRequests.slice(0, 5).map((request) => (
                <li key={request.id}>{request.client_name} · {request.goal}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Completate ({completedRequests.length})</h3>
            <ul className={styles.listCompact}>
              {completedRequests.slice(0, 5).map((request) => (
                <li key={request.id}>{request.client_name} · {request.plan_title || 'Piano consegnato'}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className={styles.requestAgendaBox}>
        <div className={styles.headRow}>
          <h2 className={styles.inlineMeta}>
            <MessageCircle size={16} aria-hidden="true" /> Prenotazioni chat ricevute
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={loadChatBookings}>
            Aggiorna
          </Button>
        </div>
        <p className="muted">Sessioni chat cliente-coach (45 min) ordinate per inizio.</p>

        {chatLoading ? (
          <LoadingSkeleton rows={1} />
        ) : sortedChatBookings.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            imageSrc="/images/default-sport.svg"
            imageAlt="Chat coach"
            title="Nessuna prenotazione chat"
            description="Quando un cliente prenota una chat dalle sue schede, comparira qui."
          />
        ) : (
          <ul className={styles.list}>
            {sortedChatBookings.map((booking) => (
              <li key={booking.id} className={styles.chatBookingItem}>
                <div className={styles.chatBookingMain}>
                  <p className={styles.inlineMeta}>
                    <UserRound size={15} aria-hidden="true" />
                    Cliente #{booking.client_user_id} · Scheda #{booking.plan_id}
                  </p>
                  <p className="muted">
                    {new Date(booking.starts_at).toLocaleString('it-IT', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}{' '}
                    · {booking.slot_label}
                  </p>
                </div>
                <div className={styles.chatBookingMeta}>
                  <span className={`${styles.badgeSoft} ${statusClass(booking.status)}`}>{statusLabel(booking.status)}</span>
                  {Number(booking.rating_stars) > 0 ? (
                    <span className={styles.inlineMeta}>
                      <Star size={14} aria-hidden="true" /> {booking.rating_stars}/5
                    </span>
                  ) : null}
                  <Link to="/dashboard/plans" className={styles.linkAction}>
                    Apri schede
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className={styles.agendaWrap}>
        <div className={styles.headRow}>
          <div>
            <h2>Agenda Operativa Coach</h2>
            <p className="muted">Box collassabile ottimizzata per telefono.</p>
          </div>
          <button
            type="button"
            className={styles.calendarCollapseToggle}
            onClick={() => setCalendarCollapsed((prev) => !prev)}
            aria-expanded={!calendarCollapsed}
            aria-controls="coach-calendar-box"
          >
            {calendarCollapsed ? 'Apri calendario' : 'Chiudi calendario'}
          </button>
        </div>

        {!calendarCollapsed ? (
          <div id="coach-calendar-box" className={styles.calendarBoxBody}>
            <div className={styles.tabs}>
              <Button type="button" variant={calendarView === 'today' ? 'primary' : 'secondary'} onClick={() => selectView('today')}>
                Oggi
              </Button>
              <Button type="button" variant={calendarView === 'week' ? 'primary' : 'secondary'} onClick={() => selectView('week')}>
                Settimana {!entitlements.canUseAgendaWeekMonth ? '🔒' : ''}
              </Button>
              <Button type="button" variant={calendarView === 'month' ? 'primary' : 'secondary'} onClick={() => selectView('month')}>
                Mese {!entitlements.canUseAgendaWeekMonth ? '🔒' : ''}
              </Button>
            </div>

            <div className={styles.calendarControls}>
              <div className={styles.calendarNav}>
                <Button type="button" variant="ghost" size="sm" onClick={() => changeCalendarPeriod(-1)}>
                  ←
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={goToToday}>
                  Oggi
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => changeCalendarPeriod(1)}>
                  →
                </Button>
              </div>
              <p className={styles.calendarRangeLabel}>{calendarRangeLabel}</p>
              {calendarView === 'week' ? (
                <div className={styles.weekPlanner}>
                  <label className={styles.weekPicker}>
                    Mese
                    <select value={weekMonth} onChange={(event) => onWeekMonthChange(event.target.value)}>
                      {weekMonthOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.weekSegments}>
                    {monthWeeks.map((week) => (
                      <button
                        key={`week-seg-${week.index}`}
                        type="button"
                        className={`${styles.weekSegmentButton} ${week.index === weekIndex ? styles.weekSegmentButtonActive : ''}`}
                        onClick={() => onWeekSegmentSelect(week.index)}
                      >
                        {week.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {calendarLoading ? (
              <LoadingSkeleton rows={2} />
            ) : calendarView === 'month' ? (
              <div className={styles.monthWrap}>
                <div className={styles.monthWeekHeader}>
                  {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className={styles.monthGrid}>
                  {monthCells.map((date) => {
                    const key = toDayKey(date);
                    const items = entriesByDay.get(key) || [];
                    const inCurrentMonth = date.getMonth() === calendarRange.start.getMonth();
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => openDayFromMonth(date)}
                        className={`${styles.monthCell} ${!inCurrentMonth ? styles.monthCellMuted : ''}`}
                      >
                        <header className={styles.monthCellHead}>
                          <span>{date.getDate()}</span>
                          <small>{date.toLocaleDateString('it-IT', { weekday: 'short' })}</small>
                        </header>
                        <div className={styles.monthCellEvents}>
                          {items.slice(0, 3).map((entry) => (
                            <article key={entry.id} className={entryClassName(entry)}>
                              <strong>{entry.startsAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</strong>
                              <span>{entry.title}</span>
                            </article>
                          ))}
                          {items.length > 3 ? <small className={styles.monthMore}>+{items.length - 3} altri</small> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : calendarView === 'week' ? (
              <div className={styles.weekFocusWrap}>
                {focusedWeekDays.map((date) => {
                  const key = toDayKey(date);
                  const items = entriesByDay.get(key) || [];
                  return (
                    <section key={key} className={styles.weekFocusDay}>
                      <header className={styles.weekFocusHead}>
                        <strong>{date.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit' })}</strong>
                        <div className={styles.weekFocusActions}>
                          <small>{items.length} attivita</small>
                          <Button type="button" variant="ghost" size="sm" onClick={() => openHourComposer(date, 9)}>
                            + Evento
                          </Button>
                        </div>
                      </header>
                      {items.length === 0 ? (
                        <p className={styles.weekFocusEmpty}>Nessuna attivita.</p>
                      ) : (
                        <ul className={styles.weekEventList}>
                          {items.map((entry) => (
                            <li key={entry.id} className={weekEventClass(entry)}>
                              <p className={styles.timelineEventTime}>{formatEntryTime(entry)}</p>
                              <strong>{entry.title}</strong>
                              <p className={styles.timelineEventSub}>{entry.subtitle}</p>
                              <Link to={entry.route} className={styles.timelineEventLink}>
                                Apri
                              </Link>
                              {entry.kind === 'manual' ? (
                                <div className={styles.manualEventActions}>
                                  <button type="button" onClick={() => openManualEdit(entry)} className={styles.manualActionBtn}>
                                    Modifica
                                  </button>
                                  <button type="button" onClick={() => removeManualEvent(entry.manualId)} className={styles.manualActionBtnDanger}>
                                    Elimina
                                  </button>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
          <div className={`${styles.googleCalendarWrap} ${calendarView === 'today' ? styles.googleCalendarDay : ''}`}>
            <aside className={styles.googleTimeRail} aria-hidden="true">
              {timelineHourTicks.map((hour) => (
                <span key={`tick-${hour}`} className={styles.googleTimeTick}>
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </aside>
            <div
              className={[
                styles.googleColumns,
                calendarView === 'week' ? styles.googleColumnsWeek : '',
                calendarView === 'today' ? styles.googleColumnsDay : ''
              ].join(' ')}
            >
                  {calendarColumns.map((column) => {
                    const dayItems = entriesByDay.get(column.key) || [];
                    return (
                      <section key={column.key} className={styles.googleDayColumn}>
                        <header className={styles.googleDayHead}>
                          <strong>{column.label}</strong>
                          <small>{dayItems.length} attivita</small>
                        </header>
                        <div className={styles.googleDayBody}>
                          <div className={styles.googleDayTimeline}>
                            {timelineHourTicks.map((hour) => (
                              <button
                                key={`${column.key}-${hour}`}
                                type="button"
                                className={styles.googleHourLine}
                                onClick={() => openHourComposer(column.date, hour)}
                                aria-label={`Aggiungi evento alle ${String(hour).padStart(2, '0')}:00`}
                              />
                            ))}
                            {dayItems.map((entry) => (
                              <article key={entry.id} className={entryClassName(entry)} style={timelineStyle(entry)}>
                                <p className={styles.timelineEventTime}>{formatEntryTime(entry)}</p>
                                <strong>{entry.title}</strong>
                                <p className={styles.timelineEventSub}>{entry.subtitle}</p>
                                <Link to={entry.route} className={styles.timelineEventLink}>
                                  Apri
                                </Link>
                                {entry.kind === 'manual' ? (
                                  <div className={styles.manualEventActions}>
                                    <button type="button" onClick={() => openManualEdit(entry)} className={styles.manualActionBtn}>
                                      Modifica
                                    </button>
                                    <button type="button" onClick={() => removeManualEvent(entry.manualId)} className={styles.manualActionBtnDanger}>
                                      Elimina
                                    </button>
                                  </div>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}

            {!hasAgendaItems ? (
              <p className={styles.calendarEmptyInline}>Nessuna attivita in questo periodo. Tocca una fascia oraria per aggiungere un evento.</p>
            ) : null}
          </div>
        ) : (
          <p className={styles.calendarCollapsedHint}>Calendario nascosto. Tocca "Apri calendario" per visualizzarlo.</p>
        )}
      </Card>

      {requests.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          imageSrc="/images/default-sport.svg"
          imageAlt="Richieste coach"
          title="Nessuna richiesta disponibile"
          description="Quando un cliente richiede una scheda, la troverai qui con stato e dettagli."
        />
      ) : (
        <div className={styles.stack}>
          <Card className={styles.requestGroupBox}>
            <div className={styles.requestGroupHead}>
              <h2>Richieste pending</h2>
              <span className={styles.pending}>{pendingRequests.length}</span>
            </div>
            {pendingRequests.length === 0 ? (
              <p className="muted">Nessuna richiesta in attesa.</p>
            ) : (
              <div className={styles.requestRectList}>
                {pendingRequests.map((request) => {
                  const draft = drafts[request.id] || { title: '', content: '' };
                  return (
                    <article key={request.id} className={styles.requestRect}>
                      <div className={styles.requestHead}>
                        <h3>{request.client_name}</h3>
                        <span className={styles.pending}>Pending</span>
                      </div>
                      <p className="muted">{request.client_email}</p>
                      <p>
                        <strong>Obiettivo:</strong> {request.goal}
                      </p>
                      {request.notes ? (
                        <p>
                          <strong>Note:</strong> {request.notes}
                        </p>
                      ) : null}

                      <form className={styles.requestForm} onSubmit={(event) => event.preventDefault()}>
                        <label className={styles.field}>
                          Titolo scheda
                          <input
                            value={draft.title}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [request.id]: { ...draft, title: event.target.value }
                              }))
                            }
                            placeholder="Es. 6 settimane endurance progressivo"
                          />
                        </label>

                        <label className={styles.field}>
                          Contenuto piano
                          <textarea
                            rows="6"
                            value={draft.content}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [request.id]: { ...draft, content: event.target.value }
                              }))
                            }
                            placeholder="Settimana 1: ...\nSettimana 2: ..."
                          />
                        </label>

                        <Button type="button" icon={Send} onClick={() => submitPlan(request)}>
                          Consegna scheda
                        </Button>
                      </form>
                    </article>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className={styles.requestGroupBox}>
            <div className={styles.requestGroupHead}>
              <h2>Richieste completate</h2>
              <span className={styles.done}>{completedRequests.length}</span>
            </div>
            {completedRequests.length === 0 ? (
              <p className="muted">Nessuna richiesta completata.</p>
            ) : (
              <div className={styles.requestRectList}>
                {completedRequests.map((request) => {
                  const key = String(request.id);
                  const linkedPlan = planByRequestId[key] || null;
                  const isOpen = Boolean(openCompletedByRequestId[key]);
                  const updateDraft = updateDrafts[key] || {
                    title: linkedPlan?.title || request.plan_title || '',
                    content: linkedPlan?.content || '',
                    coachNote: linkedPlan?.coach_note || ''
                  };

                  return (
                    <article key={request.id} className={styles.requestRect}>
                      <div className={styles.requestHead}>
                        <h3>{request.client_name}</h3>
                        <span className={styles.done}>Completata</span>
                      </div>
                      <p className="muted">{request.client_email}</p>
                      <p>
                        <strong>Obiettivo:</strong> {request.goal}
                      </p>
                      <p>
                        <strong>Scheda inviata:</strong> {linkedPlan?.title || request.plan_title || 'Piano completato'}
                      </p>
                      {linkedPlan?.content ? (
                        <p className={styles.planPreview}>
                          {linkedPlan.content}
                        </p>
                      ) : (
                        <p className="muted">Contenuto inviato non disponibile.</p>
                      )}
                      <p className="muted">
                        Dettaglio invio:{' '}
                        {request.delivered_at
                          ? new Date(request.delivered_at).toLocaleString('it-IT', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'data non disponibile'}
                      </p>
                      <div className={styles.requestRectActions}>
                        <Button type="button" variant="secondary" size="sm" onClick={() => toggleCompletedRequest(request.id)}>
                          {isOpen ? 'Chiudi scheda' : 'Apri scheda'}
                        </Button>
                        <Link to="/dashboard/plans">
                          <Button type="button" variant="ghost" size="sm">
                            Vai a schede
                          </Button>
                        </Link>
                      </div>

                      {isOpen ? (
                        <form className={styles.requestForm} onSubmit={(event) => event.preventDefault()}>
                          <label className={styles.field}>
                            Aggiorna titolo
                            <input
                              value={updateDraft.title}
                              onChange={(event) =>
                                setUpdateDrafts((prev) => ({
                                  ...prev,
                                  [key]: { ...updateDraft, title: event.target.value }
                                }))
                              }
                              placeholder="Titolo aggiornato"
                            />
                          </label>
                          <label className={styles.field}>
                            Aggiorna contenuto
                            <textarea
                              rows="5"
                              value={updateDraft.content}
                              onChange={(event) =>
                                setUpdateDrafts((prev) => ({
                                  ...prev,
                                  [key]: { ...updateDraft, content: event.target.value }
                                }))
                              }
                              placeholder="Nuovo dettaglio piano"
                            />
                          </label>
                        <label className={styles.field}>
                          Nota coach
                          <textarea
                              rows="3"
                              value={updateDraft.coachNote}
                              onChange={(event) =>
                                setUpdateDrafts((prev) => ({
                                  ...prev,
                                  [key]: { ...updateDraft, coachNote: event.target.value }
                                }))
                              }
                            placeholder="Nota aggiuntiva per il cliente"
                          />
                        </label>
                        <label className={styles.field}>
                          Carica nuovo PDF
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            multiple
                            onChange={(event) =>
                              setUpdateFilesByRequestId((prev) => ({
                                ...prev,
                                [key]: Array.from(event.target.files || [])
                              }))
                            }
                          />
                          <small className={styles.fieldHelp}>
                            {updateFilesByRequestId[key]?.length
                              ? `${updateFilesByRequestId[key].length} file selezionati`
                              : 'Puoi allegare PDF aggiornati (max 5)'}
                          </small>
                        </label>
                        {linkedPlan?.attachments?.length ? (
                          <ul className={styles.attachmentList}>
                            {linkedPlan.attachments.slice(0, 5).map((attachment) => (
                              <li key={`att-${linkedPlan.id}-${attachment.id}`}>
                                <span>{attachment.file_name}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <Button type="button" onClick={() => submitPlanUpdate(request)} disabled={updatingRequestId === request.id}>
                          {updatingRequestId === request.id ? 'Invio aggiornamento...' : 'Invia aggiornamento scheda'}
                        </Button>
                      </form>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className={styles.requestGroupBox}>
            <div className={styles.requestGroupHead}>
              <h2>Clienti coach</h2>
              <span className={styles.badgeSoft}>{coachClients.length}</span>
            </div>
            {coachClients.length === 0 ? (
              <p className="muted">Nessun cliente disponibile.</p>
            ) : (
              <div className={styles.clientRectList}>
                {coachClients.map((client) => (
                  <article key={`coach-client-${client.clientId}`} className={styles.clientRect}>
                    <div className={styles.requestHead}>
                      <h3>{client.name}</h3>
                      <span className={styles.badgeSoft}>Cliente #{client.clientId}</span>
                    </div>
                    <p className="muted">{client.email || 'Email non disponibile'}</p>

                    <div className={styles.clientMetaRow}>
                      <span className={styles.badgeSoft}>Schede inviate: {client.planUpdates.length}</span>
                      <span className={styles.badgeSoft}>Chat: {client.chats.length}</span>
                    </div>

                    <div className={styles.clientActions}>
                      <Link to="/dashboard/plans">
                        <Button type="button" size="sm" variant="secondary">
                          Apri chat cliente
                        </Button>
                      </Link>
                      <Link to="/dashboard/plans">
                        <Button type="button" size="sm" variant="ghost">
                          Schede individuali
                        </Button>
                      </Link>
                    </div>

                    {client.planUpdates.length > 0 ? (
                      <ul className={styles.clientPlanList}>
                        {client.planUpdates.slice(0, 4).map((plan) => (
                          <li key={`client-plan-${client.clientId}-${plan.requestId}`}>
                            <strong>{plan.title}</strong>
                            <span className="muted">
                              {' '}
                              · Ultimo aggiornamento:{' '}
                              {plan.updatedAt
                                ? new Date(plan.updatedAt).toLocaleString('it-IT', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : 'n/d'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Nessuna scheda disponibile.</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={eventModalOpen}
        title={editingManualEventId ? 'Modifica evento agenda coach' : 'Nuovo evento agenda coach'}
        onClose={() => {
          setEventModalOpen(false);
          setEditingManualEventId(null);
        }}
        onConfirm={saveManualEvent}
        confirmText={editingManualEventId ? 'Aggiorna evento' : 'Salva evento'}
      >
        <div className={styles.eventModalBody}>
          <p className="muted">
            {eventModalDate.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} ·{' '}
            {String(eventModalHour).padStart(2, '0')}:00 - {String(eventModalEndHour).padStart(2, '0')}:00
          </p>
          <div className={styles.eventTimeGrid}>
            <label className={styles.field}>
              Da
              <select value={eventModalHour} onChange={(event) => setEventModalHour(Number(event.target.value))}>
                {Array.from({ length: 24 }, (_, idx) => idx).map((hour) => (
                  <option key={`from-${hour}`} value={hour}>
                    {String(hour).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              A
              <select value={eventModalEndHour} onChange={(event) => setEventModalEndHour(Number(event.target.value))}>
                {Array.from({ length: 24 }, (_, idx) => idx + 1).map((hour) => (
                  <option key={`to-${hour}`} value={hour}>
                    {String(hour).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            Titolo evento
            <input
              value={eventDraft.title}
              onChange={(event) => setEventDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Es. Follow-up cliente"
            />
          </label>
          <label className={styles.field}>
            Note
            <textarea
              rows="3"
              value={eventDraft.notes}
              onChange={(event) => setEventDraft((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Dettagli operativi"
            />
          </label>
        </div>
      </Modal>

      <PaywallModal open={agendaPaywallOpen} onClose={() => setAgendaPaywallOpen(false)} feature="Vista agenda Settimana/Mese" />
    </section>
  );
}

export default CoachDashboardPage;

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  WalletCards,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../utils/notificationRules';
import { withTimeout } from '../utils/asyncTimeout';
import styles from '../styles/pages/notifications.module.css';

const NOTIFICATIONS_LOAD_TIMEOUT_MS = 8000;
const SECONDARY_LOAD_TIMEOUT_MS = 4500;
const SWIPE_COMMIT_DISTANCE = 84;
const SWIPE_FAST_MIN_DISTANCE = 56;
const SWIPE_FAST_VELOCITY = 0.9;
const SWIPE_LINEAR_DISTANCE = 48;
const SWIPE_RESISTANCE_RANGE = 64;
const SWIPE_RESISTANCE_DECAY = 60;

const typeIcons = {
  rsvp_confirmed: CheckCircle2,
  event_starting_soon: CalendarClock,
  similar_event: Sparkles,
  event_created: CheckCircle2,
  coach_chat_booking: MessageCircle,
  coach_chat_cancelled: MessageCircle,
  coach_chat_message: MessageCircle,
  coach_chat_ended: MessageCircle,
  coach_chat_rating: Star,
  event_group_message: MessageCircle,
  event_join_requested: BellRing,
  event_join_approved: CheckCircle2,
  event_join_declined: BellOff,
  event_cancelled: BellOff,
  event_updated: CalendarClock,
  event_minimum_reached: CheckCircle2,
  event_checkin_verified: ShieldCheck,
  event_workout_milestone: CheckCircle2,
  event_workout_completed: CheckCircle2,
  wallet_deposit_locked: WalletCards,
  wallet_deposit_returned: WalletCards,
  wallet_no_show_bonus: WalletCards,
  wallet_topup_completed: WalletCards,
  wallet_withdrawal_requested: WalletCards,
  wallet_withdrawal_paid: CheckCircle2,
  wallet_withdrawal_failed: BellOff,
  profile_verification_submitted: ShieldCheck,
  profile_verified: ShieldCheck,
  profile_verification_rejected: BellOff,
  profile_suspended: BellOff,
  convention_application_approved: CheckCircle2,
  convention_application_rejected: BellOff
};

const preferenceRows = [
  {
    key: 'chat_social',
    icon: MessageCircle,
    title: 'Chat e social',
    description: 'Messaggi, inviti, richieste e recensioni.'
  },
  {
    key: 'wallet_account',
    icon: WalletCards,
    title: 'Wallet e account',
    description: 'Depositi, rimborsi, prelievi e verifica del profilo.'
  },
  {
    key: 'promotions',
    icon: Sparkles,
    title: 'Suggerimenti',
    description: 'Eventi consigliati, novità e promozioni.'
  }
];

const notificationFilters = [
  { key: 'all', label: 'Tutte' },
  { key: 'action', label: 'Da gestire' },
  { key: 'events', label: 'Eventi' },
  { key: 'wallet', label: 'Wallet' }
];

const actionableTypes = new Set([
  'event_join_requested',
  'event_starting_soon',
  'wallet_withdrawal_failed',
  'profile_verification_rejected',
  'profile_suspended',
  'convention_application_rejected'
]);

const aggregateTypes = {
  wallet_deposit_locked: {
    title: 'Depositi evento bloccati',
    message: (count) => `${count} quote sono al sicuro fino alla conclusione degli eventi.`
  },
  wallet_deposit_returned: {
    title: 'Depositi evento restituiti',
    message: (count) => `${count} quote sono tornate nel credito disponibile.`
  }
};

function getCalendarDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isNotificationActionable(item) {
  return !item.read && actionableTypes.has(item.type);
}

function getNotificationCategory(type = '') {
  if (type.startsWith('wallet_')) return 'wallet';
  if (type.startsWith('event_') || type.startsWith('rsvp_') || type.includes('chat')) return 'events';
  return 'other';
}

function getNotificationActionLabel(type = '') {
  if (type === 'event_join_requested') return 'Gestisci';
  if (type === 'event_starting_soon') return 'Apri evento';
  if (type === 'wallet_withdrawal_failed') return 'Controlla';
  if (type.includes('verification_rejected') || type.includes('suspended')) return 'Verifica';
  if (type === 'convention_application_rejected') return 'Controlla';
  return '';
}

function aggregateNotifications(items) {
  const aggregated = [];
  const groupIndexes = new Map();

  items.forEach((item) => {
    const aggregateConfig = aggregateTypes[item.type];
    if (!aggregateConfig) {
      aggregated.push({ ...item, memberIds: [item.id], groupCount: 1 });
      return;
    }

    const groupKey = `${item.type}:${getCalendarDayKey(item.created_at)}`;
    const existingIndex = groupIndexes.get(groupKey);
    if (existingIndex === undefined) {
      groupIndexes.set(groupKey, aggregated.length);
      aggregated.push({ ...item, memberIds: [item.id], groupCount: 1 });
      return;
    }

    const existing = aggregated[existingIndex];
    const memberIds = [...existing.memberIds, item.id];
    aggregated[existingIndex] = {
      ...existing,
      title: aggregateConfig.title,
      message: aggregateConfig.message(memberIds.length),
      body: aggregateConfig.message(memberIds.length),
      read: existing.read && item.read,
      memberIds,
      groupCount: memberIds.length
    };
  });

  return aggregated;
}

function getDateGroup(item) {
  const date = new Date(item.created_at);
  if (Number.isNaN(date.getTime())) return 'Precedenti';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startOfToday - startOfDate) / 86400000);
  if (dayDifference === 0) return 'Oggi';
  if (dayDifference === 1) return 'Ieri';
  return 'Precedenti';
}

function groupNotifications(items, filter) {
  if (items.length === 0) return [];

  const groups = [];
  const remainingItems = [...items];
  if (filter === 'all') {
    const actionable = remainingItems.filter(isNotificationActionable);
    if (actionable.length > 0) groups.push({ key: 'action', title: 'Da gestire', items: actionable });
  }

  const actionIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
  const chronologicalItems = filter === 'all'
    ? remainingItems.filter((item) => !actionIds.has(item.id))
    : remainingItems;

  ['Oggi', 'Ieri', 'Precedenti'].forEach((title) => {
    const groupedItems = chronologicalItems.filter((item) => getDateGroup(item) === title);
    if (groupedItems.length > 0) groups.push({ key: title.toLowerCase(), title, items: groupedItems });
  });
  return groups;
}

function formatNotificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startOfToday - startOfDate) / 86400000);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  if (dayDifference === 0 || dayDifference === 1) return time;
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getNotificationTone(type = '') {
  if (type.startsWith('wallet_')) return styles.walletTone;
  if (type.includes('cancelled') || type.includes('declined') || type.includes('failed') || type.includes('suspended')) {
    return styles.alertTone;
  }
  if (type.includes('chat') || type.includes('message')) return styles.socialTone;
  return styles.eventTone;
}

function getResistedSwipeOffset(deltaX) {
  const direction = Math.sign(deltaX);
  const distance = Math.abs(deltaX);
  const linearDistance = Math.min(distance, SWIPE_LINEAR_DISTANCE);
  const resistedDistance = Math.max(0, distance - SWIPE_LINEAR_DISTANCE);
  const rubberBandDistance = SWIPE_RESISTANCE_RANGE * (1 - Math.exp(-resistedDistance / SWIPE_RESISTANCE_DECAY));
  return direction * (linearDistance + rubberBandDistance);
}

function SwipeableNotificationRow({ item, onRead, onDelete }) {
  const navigate = useNavigate();
  const dragRef = useRef(null);
  const frameRef = useRef(null);
  const pendingOffsetRef = useRef(0);
  const actionTimerRef = useRef(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const Icon = typeIcons[item.type] || BellRing;
  const destination = item.action_path || (item.event_id ? `/events/${item.event_id}` : '');
  const actionLabel = getNotificationActionLabel(item.type);

  useEffect(() => () => {
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current);
  }, []);

  function scheduleOffset(nextOffset) {
    pendingOffsetRef.current = nextOffset;
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setOffset(pendingOffsetRef.current);
    });
  }

  function vibrate(duration) {
    try {
      navigator.vibrate?.(duration);
    } catch {
      // Il feedback aptico e opzionale e non deve interrompere l'azione.
    }
  }

  function startSwipe(event) {
    const interactiveTarget = event.target instanceof Element
      ? event.target.closest('a, button, input, label')
      : null;
    if (event.button !== 0 || interactiveTarget) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      recognized: false,
      armedDirection: ''
    };
  }

  function moveSwipe(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.recognized) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
        dragRef.current = null;
        return;
      }
      drag.recognized = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);
    }

    event.preventDefault();
    const now = performance.now();
    drag.velocity = (event.clientX - drag.lastX) / Math.max(1, now - drag.lastTime);
    drag.lastX = event.clientX;
    drag.lastTime = now;
    const resistedOffset = getResistedSwipeOffset(deltaX);
    const nextArmedDirection = resistedOffset <= -SWIPE_COMMIT_DISTANCE
      ? 'delete'
      : !item.read && resistedOffset >= SWIPE_COMMIT_DISTANCE
        ? 'read'
        : '';
    if (nextArmedDirection !== drag.armedDirection) {
      if (nextArmedDirection) vibrate(12);
      drag.armedDirection = nextArmedDirection;
    }
    scheduleOffset(resistedOffset);
  }

  function finishSwipe(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      setOffset(pendingOffsetRef.current);
    }
    setDragging(false);

    const swipedToRead = !item.read && (
      pendingOffsetRef.current >= SWIPE_COMMIT_DISTANCE
      || (pendingOffsetRef.current >= SWIPE_FAST_MIN_DISTANCE && drag.velocity >= SWIPE_FAST_VELOCITY)
    );
    const swipedToDelete = pendingOffsetRef.current <= -SWIPE_COMMIT_DISTANCE;
    if (swipedToDelete) {
      pendingOffsetRef.current = -window.innerWidth;
      setOffset(-window.innerWidth);
      vibrate(35);
      actionTimerRef.current = window.setTimeout(() => {
        Promise.resolve(onDelete(item)).catch(() => {
          pendingOffsetRef.current = 0;
          setOffset(0);
        });
        actionTimerRef.current = null;
      }, 190);
      return;
    }
    pendingOffsetRef.current = 0;
    setOffset(0);
    if (swipedToRead) {
      vibrate(25);
      Promise.resolve(onRead(item)).catch(() => undefined);
    }
  }

  function openNotification(event) {
    if (!destination || dragging) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, label')) return;
    if (!item.read) Promise.resolve(onRead(item)).catch(() => undefined);
    navigate(destination);
  }

  return (
    <div className={`${styles.swipeShell} ${offset <= -SWIPE_COMMIT_DISTANCE ? styles.swipeDeleteArmed : ''} ${!item.read && offset >= SWIPE_COMMIT_DISTANCE ? styles.swipeReadArmed : ''}`}>
      <div className={styles.swipeActions} aria-hidden="true">
        <span className={styles.swipeRead}><Check size={18} /> Letta</span>
        <span className={styles.swipeDelete}><Trash2 size={18} /> Elimina</span>
      </div>
      <article
        className={`${styles.notificationRow} ${destination ? styles.clickableRow : ''} ${!item.read ? styles.unreadRow : ''} ${dragging ? styles.notificationRowDragging : ''}`}
        style={offset ? { transform: `translate3d(${offset}px, 0, 0)` } : undefined}
        onPointerDown={startSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
        onClick={openNotification}
      >
        <span className={`${styles.notificationIcon} ${getNotificationTone(item.type)}`}>
          <Icon size={19} aria-hidden="true" />
        </span>
        <div className={styles.notificationCopy}>
          <div className={styles.notificationTitleRow}>
            <h3>{item.title}</h3>
            {item.groupCount > 1 ? <span className={styles.groupCount}>{item.groupCount}</span> : null}
            {!item.read ? <span className={styles.visuallyHidden}>Non letta</span> : null}
          </div>
          <p>{item.message || item.body}</p>
          <time dateTime={item.created_at}>{formatNotificationDate(item.created_at)}</time>
        </div>
        <div className={styles.notificationActions}>
          {!item.read ? (
            <button type="button" className={styles.readButton} onClick={() => onRead(item)} aria-label={`Segna come letta: ${item.title}`} title="Segna come letta">
              <Check size={17} aria-hidden="true" />
            </button>
          ) : null}
          {destination ? (
            <Link className={styles.openLink} to={destination} aria-label={`Apri: ${item.title}`}>
              {actionLabel ? <span>{actionLabel}</span> : null}
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function NotificationsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  const [savingPreference, setSavingPreference] = useState('');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadRequestRef = useRef(0);

  function closeNotifications() {
    const returnTo = location.state?.notificationReturnTo;
    const hasSafeReturnPath =
      typeof returnTo === 'string' &&
      returnTo.startsWith('/') &&
      !returnTo.startsWith('//') &&
      !returnTo.startsWith('/notifications');

    if (hasSafeReturnPath) {
      navigate(-1);
      return;
    }

    navigate('/map', { replace: true });
  }

  usePageMeta({
    title: 'Notifiche | Motrice',
    description: 'Centro notifiche Motrice: eventi, sicurezza, chat, wallet e account.'
  });

  async function load(options = {}) {
    const showLoading = Boolean(options?.showLoading);
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    if (showLoading) setLoading(true);
    setLoadError('');

    const preferencesRequest = withTimeout(
      api.getNotificationPreferences(),
      SECONDARY_LOAD_TIMEOUT_MS,
      'Preferenze non disponibili'
    ).catch(() => DEFAULT_NOTIFICATION_PREFERENCES);
    try {
      const items = await withTimeout(
        api.listNotifications(),
        NOTIFICATIONS_LOAD_TIMEOUT_MS,
        'Caricamento notifiche non disponibile'
      );
      if (loadRequestRef.current === requestId) {
        setNotifications(Array.isArray(items) ? items : []);
      }
    } catch {
      if (loadRequestRef.current === requestId) {
        setLoadError('Non è stato possibile aggiornare le notifiche. Controlla la connessione e riprova.');
      }
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }

    const nextPreferences = await preferencesRequest;
    if (loadRequestRef.current === requestId) {
      setPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...nextPreferences });
    }
  }

  useEffect(() => {
    load({ showLoading: true });
    window.addEventListener('motrice:notifications-changed', load);
    return () => window.removeEventListener('motrice:notifications-changed', load);
  }, []);

  useEffect(() => {
    if (!preferencesOpen && !actionsOpen) return undefined;
    function handleEscape(event) {
      if (event.key !== 'Escape') return;
      setPreferencesOpen(false);
      setActionsOpen(false);
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [preferencesOpen, actionsOpen]);

  async function togglePreference(key) {
    if (key === 'event_security') return;
    setSavingPreference(key);
    try {
      const next = await api.updateNotificationPreferences({ [key]: !preferences[key] });
      setPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...next });
    } finally {
      setSavingPreference('');
    }
  }

  async function markAsRead(item) {
    const memberIds = item?.memberIds || [item?.id || item];
    const memberIdSet = new Set(memberIds.map(String));
    setNotifications((current) => current.map((notification) => (
      memberIdSet.has(String(notification.id)) ? { ...notification, read: true } : notification
    )));
    await Promise.all(memberIds.map((id) => api.markNotificationRead(id)));
    window.dispatchEvent(new Event('motrice:notifications-changed'));
  }

  async function markAll() {
    setActionsOpen(false);
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    await api.markAllNotificationsRead();
    window.dispatchEvent(new Event('motrice:notifications-changed'));
  }

  async function deleteOne(item) {
    const memberIds = item?.memberIds || [item?.id || item];
    const memberIdSet = new Set(memberIds.map(String));
    setNotifications((current) => current.filter((notification) => !memberIdSet.has(String(notification.id))));
    await Promise.all(memberIds.map((id) => api.deleteNotification(id)));
    window.dispatchEvent(new Event('motrice:notifications-changed'));
  }

  async function clearAll() {
    setActionsOpen(false);
    await api.clearNotifications();
    setNotifications([]);
    window.dispatchEvent(new Event('motrice:notifications-changed'));
  }

  const unreadCount = notifications.filter((item) => !item.read).length;
  const activePreferenceCount = 1 + preferenceRows.filter(({ key }) => preferences[key]).length;
  const preparedNotifications = useMemo(() => aggregateNotifications(notifications), [notifications]);
  const actionableCount = preparedNotifications.filter(isNotificationActionable).length;
  const filteredNotifications = useMemo(() => preparedNotifications.filter((item) => {
    if (activeFilter === 'action') return isNotificationActionable(item);
    if (activeFilter === 'events') return getNotificationCategory(item.type) === 'events';
    if (activeFilter === 'wallet') return getNotificationCategory(item.type) === 'wallet';
    return true;
  }), [preparedNotifications, activeFilter]);
  const notificationGroups = useMemo(
    () => groupNotifications(filteredNotifications, activeFilter),
    [filteredNotifications, activeFilter]
  );

  return (
    <>
      <section className={styles.page}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <h1>Notifiche</h1>
              {!loading && unreadCount > 0 ? <span className={styles.unreadBadge}>{unreadCount}</span> : null}
            </div>
            <p className={styles.subtitle}>
              {loading
                ? 'Aggiornamento in corso…'
                : loadError
                  ? 'Aggiornamento non riuscito'
                  : unreadCount > 0
                    ? `${unreadCount} ${unreadCount === 1 ? 'da leggere' : 'da leggere'}`
                    : 'Tutto aggiornato'}
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerButton}
              onClick={() => {
                setActionsOpen(false);
                setPreferencesOpen(true);
              }}
              aria-label="Apri preferenze notifiche"
              title="Preferenze"
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
            </button>
            <div className={styles.actionMenuShell}>
              <button
                type="button"
                className={styles.headerButton}
                onClick={() => setActionsOpen((current) => !current)}
                aria-expanded={actionsOpen}
                aria-haspopup="menu"
                aria-label="Altre azioni sulle notifiche"
              >
                <MoreHorizontal size={20} aria-hidden="true" />
              </button>
              {actionsOpen ? (
                <div className={styles.actionMenu} role="menu">
                  <button type="button" role="menuitem" onClick={markAll} disabled={loading || unreadCount === 0}>
                    <CheckCheck size={17} aria-hidden="true" />
                    Segna tutte come lette
                  </button>
                  <button type="button" role="menuitem" className={styles.dangerMenuItem} onClick={clearAll} disabled={loading || notifications.length === 0}>
                    <Trash2 size={17} aria-hidden="true" />
                    Elimina tutte
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={`${styles.headerButton} ${styles.closeButton}`}
              onClick={closeNotifications}
              aria-label="Chiudi notifiche"
              title="Chiudi"
            >
              <X size={20} strokeWidth={2.35} aria-hidden="true" />
            </button>
          </div>
        </header>

        <nav className={styles.filterBar} aria-label="Filtra le notifiche">
          {notificationFilters.map(({ key, label }) => (
            <button
              type="button"
              key={key}
              className={activeFilter === key ? styles.activeFilter : ''}
              aria-pressed={activeFilter === key}
              onClick={() => setActiveFilter(key)}
            >
              <span>{label}</span>
              {key === 'action' && actionableCount > 0 ? <small>{actionableCount}</small> : null}
            </button>
          ))}
        </nav>

        {loadError && notifications.length > 0 ? (
          <div className={styles.inlineError} role="status">
            <span>Non è stato possibile aggiornare l’elenco.</span>
            <button type="button" onClick={() => load({ showLoading: true })}>Riprova</button>
          </div>
        ) : null}

        <section className={styles.activitySection}>
          <div className={styles.notificationList} aria-live="polite" aria-busy={loading}>
            {loading ? (
              Array.from({ length: 3 }, (_, index) => (
                <div className={styles.skeletonRow} key={index} aria-hidden="true">
                  <span className={styles.skeletonIcon} />
                  <span className={styles.skeletonCopy}><i /><i /><i /></span>
                </div>
              ))
            ) : loadError && notifications.length === 0 ? (
              <div className={styles.emptyState} role="alert">
                <span><BellOff size={24} aria-hidden="true" /></span>
                <h3>Notifiche non disponibili</h3>
                <p>{loadError}</p>
                <button type="button" onClick={() => load({ showLoading: true })}>Riprova</button>
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <span><BellOff size={24} aria-hidden="true" /></span>
                <h3>Nessuna notifica</h3>
                <p>Sei aggiornato. I prossimi avvisi compariranno qui.</p>
                <button type="button" onClick={() => navigate('/map')}>Esplora gli eventi</button>
              </div>
            ) : notificationGroups.length === 0 ? (
              <div className={styles.emptyState}>
                <span><CheckCircle2 size={24} aria-hidden="true" /></span>
                <h3>Niente in questa sezione</h3>
                <p>Non ci sono notifiche corrispondenti al filtro selezionato.</p>
                <button type="button" onClick={() => setActiveFilter('all')}>Mostra tutte</button>
              </div>
            ) : (
              notificationGroups.map((group) => (
                <section className={styles.notificationGroup} key={group.key} aria-labelledby={`notification-group-${group.key}`}>
                  <div className={styles.groupHeading}>
                    <h2 id={`notification-group-${group.key}`}>{group.title}</h2>
                    <span>{group.items.length}</span>
                  </div>
                  {group.items.map((item) => (
                    <SwipeableNotificationRow
                      key={item.memberIds.join('-')}
                      item={item}
                      onRead={markAsRead}
                      onDelete={deleteOne}
                    />
                  ))}
                </section>
              ))
            )}
          </div>
        </section>
      </section>

      {actionsOpen ? <button type="button" className={styles.menuScrim} aria-label="Chiudi menu" onClick={() => setActionsOpen(false)} /> : null}

      {preferencesOpen ? (
        <div className={styles.sheetBackdrop} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPreferencesOpen(false);
        }}>
          <section className={styles.preferencesSheet} role="dialog" aria-modal="true" aria-labelledby="notification-preferences-title">
            <div className={styles.sheetHandle} aria-hidden="true" />
            <header className={styles.sheetHeader}>
              <div>
                <p>PERSONALIZZA</p>
                <h2 id="notification-preferences-title">Preferenze notifiche</h2>
                <span>{activePreferenceCount}/4 attive · sicurezza sempre attiva</span>
              </div>
              <button type="button" onClick={() => setPreferencesOpen(false)} aria-label="Chiudi preferenze">
                <X size={19} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.preferenceList}>
              <div className={`${styles.preferenceRow} ${styles.preferenceRowLocked}`}>
                <span className={styles.preferenceIcon}><ShieldCheck size={18} aria-hidden="true" /></span>
                <span className={styles.preferenceCopy}>
                  <strong>Eventi e sicurezza</strong>
                  <small>Check-in, variazioni, annullamenti e no-show.</small>
                </span>
                <span className={styles.lockedBadge}><LockKeyhole size={13} aria-hidden="true" /> Sempre attiva</span>
              </div>

              {preferenceRows.map(({ key, icon: Icon, title, description }) => (
                <label className={styles.preferenceRow} key={key}>
                  <span className={styles.preferenceIcon}><Icon size={18} aria-hidden="true" /></span>
                  <span className={styles.preferenceCopy}>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <span className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={preferences[key]}
                      disabled={savingPreference === key}
                      onChange={() => togglePreference(key)}
                      aria-label={`${title}: ${preferences[key] ? 'attive' : 'disattivate'}`}
                    />
                    <span className={styles.switchTrack} aria-hidden="true" />
                  </span>
                </label>
              ))}
            </div>
            <p className={styles.sheetNote}>Gli avvisi essenziali restano attivi per proteggere eventi, presenze e credito.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default NotificationsPage;

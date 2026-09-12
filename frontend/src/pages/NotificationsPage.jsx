import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  WalletCards
} from 'lucide-react';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import ContextInfoButton from '../components/ContextInfoButton';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../utils/notificationRules';
import { withTimeout } from '../utils/asyncTimeout';
import styles from '../styles/pages/notifications.module.css';

const NOTIFICATIONS_LOAD_TIMEOUT_MS = 8000;
const SECONDARY_LOAD_TIMEOUT_MS = 4500;

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

function formatNotificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startOfToday - startOfDate) / 86400000);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  if (dayDifference === 0) return `Oggi, ${time}`;
  if (dayDifference === 1) return `Ieri, ${time}`;
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

function SwipeableNotificationRow({ item, onRead, onDelete }) {
  const dragRef = useRef(null);
  const frameRef = useRef(null);
  const pendingOffsetRef = useRef(0);
  const actionTimerRef = useRef(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const Icon = typeIcons[item.type] || BellRing;
  const destination = item.action_path || (item.event_id ? `/events/${item.event_id}` : '');

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
      recognized: false
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
    const resistedOffset = Math.sign(deltaX) * Math.min(112, Math.abs(deltaX) * 0.82);
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

    const swipedToRead = !item.read && (pendingOffsetRef.current >= 68 || drag.velocity >= 0.5);
    const swipedToDelete = pendingOffsetRef.current <= -68 || drag.velocity <= -0.5;
    if (swipedToDelete) {
      pendingOffsetRef.current = -window.innerWidth;
      setOffset(-window.innerWidth);
      vibrate(35);
      actionTimerRef.current = window.setTimeout(() => {
        Promise.resolve(onDelete(item.id)).catch(() => {
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
      Promise.resolve(onRead(item.id)).catch(() => undefined);
    }
  }

  return (
    <div className={styles.swipeShell}>
      <div className={styles.swipeActions} aria-hidden="true">
        <span className={styles.swipeRead}><Check size={18} /> Letta</span>
        <span className={styles.swipeDelete}><Trash2 size={18} /> Elimina</span>
      </div>
      <article
        className={`${styles.notificationRow} ${!item.read ? styles.unreadRow : ''} ${dragging ? styles.notificationRowDragging : ''}`}
        style={offset ? { transform: `translate3d(${offset}px, 0, 0)` } : undefined}
        onPointerDown={startSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
      >
        <span className={`${styles.notificationIcon} ${getNotificationTone(item.type)}`}>
          <Icon size={19} aria-hidden="true" />
        </span>
        <div className={styles.notificationCopy}>
          <div className={styles.notificationTitleRow}>
            <h3>{item.title}</h3>
            {!item.read ? <span className={styles.unreadDot} aria-label="Non letta" /> : null}
          </div>
          <p>{item.message || item.body}</p>
          <time dateTime={item.created_at}>{formatNotificationDate(item.created_at)}</time>
        </div>
        <div className={styles.notificationActions}>
          {!item.read ? (
            <button type="button" className={styles.readButton} onClick={() => onRead(item.id)} aria-label={`Segna come letta: ${item.title}`} title="Segna come letta">
              <Check size={17} aria-hidden="true" />
            </button>
          ) : null}
          {destination ? (
            <Link className={styles.openLink} to={destination} aria-label={`Apri: ${item.title}`}>
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  const [savingPreference, setSavingPreference] = useState('');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadRequestRef = useRef(0);

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

  async function markAsRead(id) {
    await api.markNotificationRead(id);
    await load();
    window.dispatchEvent(new Event('motrice:notifications-changed'));
  }

  async function markAll() {
    await api.markAllNotificationsRead();
    await load();
    window.dispatchEvent(new Event('motrice:notifications-changed'));
  }

  async function deleteOne(id) {
    await api.deleteNotification(id);
    setNotifications((current) => current.filter((item) => String(item.id) !== String(id)));
    window.dispatchEvent(new Event('motrice:notifications-changed'));
  }

  async function clearAll() {
    await api.clearNotifications();
    await load();
    window.dispatchEvent(new Event('motrice:notifications-changed'));
  }

  const unreadCount = notifications.filter((item) => !item.read).length;
  const activePreferenceCount = 1 + preferenceRows.filter(({ key }) => preferences[key]).length;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CENTRO NOTIFICHE</p>
          <div className={styles.titleRow}>
            <h1>Notifiche</h1>
            {!loading && unreadCount > 0 ? <span className={styles.unreadBadge}>{unreadCount}</span> : null}
          </div>
          <p className={styles.subtitle}>
            {loading
              ? 'Aggiornamento in corso…'
              : loadError
                ? 'Aggiornamento non riuscito. Puoi riprovare.'
              : unreadCount > 0
                ? `${unreadCount} ${unreadCount === 1 ? 'aggiornamento da leggere' : 'aggiornamenti da leggere'}`
                : 'Sei al passo con tutte le attività.'}
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerButton}
            onClick={markAll}
            disabled={loading || unreadCount === 0}
            aria-label="Segna tutte le notifiche come lette"
            title="Segna tutte come lette"
          >
            <CheckCheck size={18} aria-hidden="true" />
            <span>Leggi tutte</span>
          </button>
          <button
            type="button"
            className={`${styles.headerButton} ${styles.deleteButton}`}
            onClick={clearAll}
            disabled={loading || notifications.length === 0}
            aria-label="Elimina tutte le notifiche"
            title="Elimina notifiche"
          >
            <Trash2 size={17} aria-hidden="true" />
            <span>Elimina</span>
          </button>
        </div>
      </header>

      <section className={styles.preferencesCard}>
        <div className={styles.preferenceDrawerHeader}>
          <button
            type="button"
            className={styles.preferenceDrawerTrigger}
            aria-expanded={preferencesOpen}
            aria-controls="notification-preferences-grid"
            onClick={() => setPreferencesOpen((current) => !current)}
          >
            <span className={styles.preferenceDrawerIcon} aria-hidden="true">
              <SlidersHorizontal size={18} />
            </span>
            <span className={styles.preferenceDrawerCopy}>
              <strong>Preferenze notifiche</strong>
              <small>{activePreferenceCount}/4 attive · Sicurezza sempre attiva</small>
            </span>
            <ChevronDown className={styles.preferenceDrawerChevron} size={19} aria-hidden="true" />
          </button>
          <ContextInfoButton
            title="Preferenze notifiche"
            description="Motrice separa gli avvisi essenziali dagli aggiornamenti facoltativi."
            items={[
              { title: 'Eventi e sicurezza', text: 'Restano sempre attivi per check-in, variazioni, annullamenti e no-show.' },
              { title: 'Chat e wallet', text: 'Puoi disattivarli separatamente senza perdere gli avvisi di sicurezza.' },
              { title: 'Suggerimenti', text: 'Comprendono eventi consigliati, novità e comunicazioni promozionali.' }
            ]}
            note="Le preferenze modificano gli avvisi facoltativi, non le operazioni già registrate nel tuo account."
          />
        </div>

        {preferencesOpen ? (
          <div
            id="notification-preferences-grid"
            className={styles.preferenceGrid}
            aria-label="Preferenze notifiche"
          >
            <div className={`${styles.preferenceTile} ${styles.preferenceTileLocked}`}>
              <span className={styles.preferenceTileIcon}><ShieldCheck size={18} aria-hidden="true" /></span>
              <strong>Eventi</strong>
              <LockKeyhole className={styles.preferenceTileLock} size={14} aria-label="Sempre attiva" />
            </div>

            {preferenceRows.map(({ key, icon: Icon, title }) => (
              <label className={styles.preferenceTile} key={key}>
                <span className={styles.preferenceTileIcon}><Icon size={18} aria-hidden="true" /></span>
                <strong>{title}</strong>
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
        ) : null}
      </section>

      <section className={styles.activitySection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Attività recente</h2>
            <p>{notifications.length > 0 ? `${notifications.length} ${notifications.length === 1 ? 'notifica' : 'notifiche'}` : 'Nessun aggiornamento'}</p>
          </div>
        </div>

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
          ) : (
            notifications.map((item) => (
              <SwipeableNotificationRow
                key={item.id}
                item={item}
                onRead={markAsRead}
                onDelete={deleteOne}
              />
            ))
          )}
        </div>
      </section>
    </section>
  );
}

export default NotificationsPage;

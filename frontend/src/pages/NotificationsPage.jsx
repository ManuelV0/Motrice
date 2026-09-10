import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
  WalletCards
} from 'lucide-react';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import EmptyState from '../components/EmptyState';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  scheduleEventReminders
} from '../services/notificationCenter';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../utils/notificationRules';

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

function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  const [permission, setPermission] = useState({ display: 'unsupported', receive: 'unsupported' });
  const [savingPreference, setSavingPreference] = useState('');

  usePageMeta({
    title: 'Notifiche | Motrice',
    description: 'Centro notifiche Motrice: eventi, sicurezza, chat, wallet e account.'
  });

  async function load() {
    const [items, nextPreferences, nextPermission] = await Promise.all([
      api.listNotifications().catch(() => []),
      api.getNotificationPreferences().catch(() => DEFAULT_NOTIFICATION_PREFERENCES),
      getNotificationPermissionStatus().catch(() => ({ display: 'unsupported', receive: 'unsupported' }))
    ]);
    setNotifications(items);
    setPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...nextPreferences });
    setPermission(nextPermission);
  }

  useEffect(() => {
    load();
    window.addEventListener('motrice:notifications-changed', load);
    return () => window.removeEventListener('motrice:notifications-changed', load);
  }, []);

  async function enableDeviceNotifications() {
    const next = await requestNotificationPermission();
    setPermission(next);
    if (next.display === 'granted') await scheduleEventReminders();
  }

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

  async function clearAll() {
    await api.clearNotifications();
    await load();
    window.dispatchEvent(new Event('motrice:notifications-changed'));
  }

  return (
    <section className="page">
      <div className="section-head">
        <h1>Notifiche</h1>
        <div className="inline-actions">
          <button type="button" className="secondary" onClick={markAll}>Segna tutte come lette</button>
          <button type="button" className="secondary" onClick={clearAll}>Elimina notifiche</button>
        </div>
      </div>

      <section className="card">
        <h2><Bell size={19} aria-hidden="true" /> Notifiche sul telefono</h2>
        <p className="muted">
          {permission.display === 'granted'
            ? 'Attive: riceverai promemoria anche con Motrice chiusa.'
            : permission.display === 'unsupported'
              ? 'Le notifiche push saranno disponibili nell’app installata sul telefono.'
              : 'Autorizza Motrice per ricevere promemoria e aggiornamenti importanti.'}
        </p>
        {permission.display !== 'granted' && permission.display !== 'unsupported' ? (
          <button type="button" onClick={enableDeviceNotifications}>Attiva notifiche</button>
        ) : null}
      </section>

      <section className="card">
        <h2>Preferenze</h2>
        <div className="grid">
          <label className="card">
            <span><ShieldCheck size={18} aria-hidden="true" /> Eventi e sicurezza</span>
            <input type="checkbox" checked readOnly aria-label="Eventi e sicurezza sempre attivi" />
            <small className="muted">Sempre attive: check-in, variazioni, annullamenti e no-show.</small>
          </label>
          <label className="card">
            <span><MessageCircle size={18} aria-hidden="true" /> Chat e social</span>
            <input type="checkbox" checked={preferences.chat_social} disabled={savingPreference === 'chat_social'} onChange={() => togglePreference('chat_social')} />
            <small className="muted">Messaggi, inviti, richieste e recensioni.</small>
          </label>
          <label className="card">
            <span><WalletCards size={18} aria-hidden="true" /> Wallet e account</span>
            <input type="checkbox" checked={preferences.wallet_account} disabled={savingPreference === 'wallet_account'} onChange={() => togglePreference('wallet_account')} />
            <small className="muted">Depositi, rimborsi, prelievi e verifica del profilo.</small>
          </label>
          <label className="card">
            <span><Sparkles size={18} aria-hidden="true" /> Suggerimenti</span>
            <input type="checkbox" checked={preferences.promotions} disabled={savingPreference === 'promotions'} onChange={() => togglePreference('promotions')} />
            <small className="muted">Eventi consigliati, novità e promozioni.</small>
          </label>
        </div>
      </section>

      <div className="grid">
          {notifications.length === 0 ? (
            <EmptyState
              icon={BellOff}
              imageSrc="/images/default-sport.svg"
              imageAlt="Icona notifiche"
              title="Nessuna notifica"
              description="Sei aggiornato. Quando ci saranno novita le vedrai qui."
              primaryActionLabel="Apri la mappa"
              onPrimaryAction={() => navigate('/map')}
            />
          ) : (
            notifications.map((item) => {
              const Icon = typeIcons[item.type] || BellRing;
              return (
                <article key={item.id} className="card">
                  <h3><Icon size={16} aria-hidden="true" /> {item.title}</h3>
                  <p>{item.message}</p>
                  <p className="muted">{new Date(item.created_at).toLocaleString('it-IT')}</p>
                  <div className="inline-actions">
                    {item.action_path ? (
                      <Link to={item.action_path}>Apri dettaglio</Link>
                    ) : item.event_id ? (
                      <Link to={`/events/${item.event_id}`}>Apri evento</Link>
                    ) : null}
                    {!item.read && (
                      <button type="button" className="secondary" onClick={() => markAsRead(item.id)}>
                        Segna letta
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
      </div>
    </section>
  );
}

export default NotificationsPage;

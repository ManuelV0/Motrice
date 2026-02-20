import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellOff, BellRing, CalendarClock, CheckCircle2, Sparkles, Lock, MessageCircle, Star } from 'lucide-react';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { useBilling } from '../context/BillingContext';
import PaywallModal from '../components/PaywallModal';
import EmptyState from '../components/EmptyState';

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
  convention_application_approved: CheckCircle2,
  convention_application_rejected: BellOff
};

function NotificationsPage() {
  const navigate = useNavigate();
  const { entitlements } = useBilling();
  const [notifications, setNotifications] = useState([]);
  const [paywallOpen, setPaywallOpen] = useState(false);

  usePageMeta({
    title: 'Notifiche | Motrice',
    description: 'Centro notifiche locale: RSVP, eventi in partenza e suggerimenti.'
  });

  async function load() {
    if (!entitlements.canUseNotifications) return;
    const items = await api.listNotifications();
    setNotifications(items);
  }

  useEffect(() => {
    if (!entitlements.canUseNotifications) {
      setPaywallOpen(true);
      return;
    }
    load();
  }, [entitlements.canUseNotifications]);

  async function markAsRead(id) {
    await api.markNotificationRead(id);
    await load();
  }

  async function markAll() {
    await api.markAllNotificationsRead();
    await load();
  }

  async function clearAll() {
    await api.clearNotifications();
    await load();
  }

  return (
    <section className="page">
      <div className="section-head">
        <h1>Notifiche</h1>
        {entitlements.canUseNotifications && (
          <div className="inline-actions">
            <button type="button" className="secondary" onClick={markAll}>
              Segna tutte come lette
            </button>
            <button type="button" className="secondary" onClick={clearAll}>
              Elimina notifiche
            </button>
          </div>
        )}
      </div>

      {!entitlements.canUseNotifications ? (
        <EmptyState
          icon={Lock}
          imageSrc="/images/default-sport.svg"
          imageAlt="Icona sport"
          title="Upgrade"
          description="Sblocca alert RSVP, reminder pre-evento e suggerimenti personalizzati."
          primaryActionLabel="Upgrade"
          onPrimaryAction={() => setPaywallOpen(true)}
        />
      ) : (
        <div className="grid">
          {notifications.length === 0 ? (
            <EmptyState
              icon={BellOff}
              imageSrc="/images/default-sport.svg"
              imageAlt="Icona notifiche"
              title="Nessuna notifica"
              description="Sei aggiornato. Quando ci saranno novita le vedrai qui."
              primaryActionLabel="Explore nearby"
              onPrimaryAction={() => navigate('/explore')}
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
                    {item.event_id && <Link to={`/events/${item.event_id}`}>Apri evento</Link>}
                    {item.plan_id && <Link to="/dashboard/plans">Apri schede</Link>}
                    {item.action_path && <Link to={item.action_path}>Apri dettaglio</Link>}
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
      )}

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature="Upgrade"
      />
    </section>
  );
}

export default NotificationsPage;

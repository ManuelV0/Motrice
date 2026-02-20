import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BadgeCheck, Mail, MessageCircle, SendHorizonal, Star } from 'lucide-react';
import { coachApi } from '../services/coachApi';
import { api } from '../../../services/api';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useToast } from '../../../context/ToastContext';
import { useBilling } from '../../../context/BillingContext';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import LoadingSkeleton from '../../../components/LoadingSkeleton';
import PaywallModal from '../../../components/PaywallModal';
import avatarPlaceholder from '../../../assets/avatar-placeholder.svg';
import styles from '../../../styles/pages/coachMarketplace.module.css';

function CoachProfilePage() {
  const { id } = useParams();
  const { showToast } = useToast();
  const { entitlements } = useBilling();
  const [loading, setLoading] = useState(true);
  const [coach, setCoach] = useState(null);
  const [accountProfile, setAccountProfile] = useState(null);
  const [ratingSummary, setRatingSummary] = useState({ average: 0, count: 0 });
  const [form, setForm] = useState({ goal: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [selectedChatSlot, setSelectedChatSlot] = useState('');

  usePageMeta({
    title: 'Coach Profile | Motrice',
    description: 'Profilo coach approvato e richiesta scheda personalizzata.'
  });

  useEffect(() => {
    let active = true;
    setLoading(true);

    coachApi
      .getCoach(id)
      .then(async (data) => {
        if (!active) return;
        setCoach(data);
        const [profile, rating] = await Promise.all([
          api.getAccountProfileByUserId(data.user_id),
          api.getCoachRatingSummary(data.user_id)
        ]);
        return { profile, rating };
      })
      .then((payload) => {
        if (!active || !payload) return;
        setAccountProfile(payload.profile || null);
        setRatingSummary(payload.rating || { average: 0, count: 0 });
      })
      .catch(() => {
        if (!active) return;
        setCoach(null);
        setAccountProfile(null);
        setRatingSummary({ average: 0, count: 0 });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  async function onRequestPlan(event) {
    event.preventDefault();
    if (form.goal.trim().length < 4) {
      showToast('Inserisci un obiettivo di almeno 4 caratteri', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await coachApi.requestPlan(id, {
        goal: form.goal,
        notes: form.notes
      });
      setForm({ goal: '', notes: '' });
      showToast('Richiesta inviata al coach', 'success');
    } catch (error) {
      showToast(error.message || 'Impossibile inviare la richiesta', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingSkeleton rows={3} />;

  if (!coach) {
    return (
      <EmptyState
        title="Coach non trovato"
        description="Il profilo potrebbe non essere approvato o non piu disponibile."
        imageSrc="/images/default-sport.svg"
        imageAlt="Coach non disponibile"
      />
    );
  }

  const coachAvatar = accountProfile?.avatar_url || '';
  const coachBio = accountProfile?.bio || coach.bio;
  const chatSlots = Array.isArray(accountProfile?.chat_slots) ? accountProfile.chat_slots : [];

  return (
    <section className={styles.page}>
      <Card className={styles.profileTop}>
        <div className={styles.coachHeader}>
          <div className={styles.coachTitleBlock}>
            <img src={coachAvatar || avatarPlaceholder} alt={`Avatar coach ${coach.name}`} className={styles.coachAvatar} />
            <h1>{coach.name}</h1>
          </div>
          <span className={styles.badge}>
            <BadgeCheck size={16} aria-hidden="true" /> Verified
          </span>
        </div>
        <p className="muted">{coachBio || 'Coach approvato Motrice.'}</p>
        <p className={styles.inlineMeta}>
          <Mail size={16} aria-hidden="true" /> {coach.contact_email}
        </p>
        <p className={styles.inlineMeta}>
          <Star size={16} aria-hidden="true" />
          {ratingSummary.count > 0
            ? `${Number(ratingSummary.average).toFixed(1)}/5 (${ratingSummary.count} recensioni)`
            : 'Nessuna valutazione disponibile'}
        </p>
        <p>
          <strong>Tariffa oraria: €{Number(coach.hourly_rate).toFixed(0)}</strong>
        </p>
        {coach.sports_practiced?.length ? (
          <div className={styles.tagRow}>
            {coach.sports_practiced.map((sport) => (
              <span key={`${sport.sport_id}-${sport.level}`} className={styles.tag}>
                {sport.sport_name} · {sport.level}
              </span>
            ))}
          </div>
        ) : null}
      </Card>

      <Card>
        <h2>Richiedi una scheda individuale</h2>
        <p className="muted">La scheda sara privata e visibile solo nella tua dashboard personale.</p>

        <form className={styles.requestForm} onSubmit={onRequestPlan}>
          <label className={styles.field}>
            Obiettivo
            <input
              value={form.goal}
              onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
              placeholder="Es. preparazione 10K in 8 settimane"
            />
          </label>

          <label className={styles.field}>
            Note aggiuntive
            <textarea
              rows="4"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Disponibilita, infortuni, attrezzatura disponibile..."
            />
          </label>

          <Button type="submit" icon={SendHorizonal} disabled={submitting}>
            {submitting ? 'Invio in corso...' : 'Invia richiesta'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={MessageCircle}
            onClick={() => {
              if (!entitlements.canUseCoachChat) {
                setPaywallOpen(true);
                return;
              }
              if (!chatSlots.length) {
                showToast('Il coach non ha ancora impostato fasce orarie chat.', 'info');
                return;
              }
              if (!selectedChatSlot) {
                showToast('Seleziona prima una fascia oraria chat.', 'error');
                return;
              }
              showToast(`Richiesta chat inviata per: ${selectedChatSlot}`, 'success');
            }}
          >
            Chatta con il coach
          </Button>
        </form>

        {chatSlots.length ? (
          <label className={styles.field}>
            Fascia oraria disponibile
            <select value={selectedChatSlot} onChange={(event) => setSelectedChatSlot(event.target.value)}>
              <option value="">Seleziona fascia oraria</option>
              {chatSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="muted">Il coach non ha ancora pubblicato fasce orarie per la chat.</p>
        )}
      </Card>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} feature="Chatta con il coach" />
    </section>
  );
}

export default CoachProfilePage;

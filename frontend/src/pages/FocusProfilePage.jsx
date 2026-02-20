import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import styles from '../styles/pages/focusProfile.module.css';

function FocusProfilePage() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);

  const eventId = searchParams.get('eventId');

  usePageMeta({
    title: 'Profilo focus | Motrice',
    description: 'Profilo persona incontrata con contesto evento e azioni amico/chat.'
  });

  async function load() {
    setLoading(true);
    try {
      const payload = await api.getFocusProfile(userId, { eventId: eventId ? Number(eventId) : null });
      setProfile(payload || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [userId, eventId]);

  async function requestFriendship() {
    if (!profile) return;
    setBusy(true);
    try {
      await api.sendFriendRequest({ toUserId: profile.userId, eventId: profile?.metContext?.eventId || null });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function openDm() {
    if (!profile) return;
    setBusy(true);
    try {
      const dm = await api.getOrCreateDMThread(profile.userId);
      navigate(`/chat/${dm.threadId}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingSkeleton rows={3} variant="detail" />;
  if (!profile) return <p className="muted">Profilo non disponibile.</p>;

  const status = String(profile.friendshipStatus || 'none');

  return (
    <section className={styles.page}>
      <Card className={styles.card}>
        {profile.avatar_url ? (
          <img className={styles.avatar} src={profile.avatar_url} alt={`Profilo di ${profile.display_name}`} loading="lazy" />
        ) : null}
        <h1>{profile.display_name || `Utente ${profile.userId}`}</h1>
        <p className="muted">{profile.bio || 'Nessuna bio disponibile.'}</p>

        <div className={styles.metBox}>
          <h2>Ci siamo incontrati a</h2>
          {profile.metContext ? (
            <p>
              {profile.metContext.eventPlace || 'Luogo evento'}
              {profile.metContext.eventStartsAt ? ` · ${new Date(profile.metContext.eventStartsAt).toLocaleDateString('it-IT')}` : ''}
            </p>
          ) : (
            <p className="muted">Contesto incontro non disponibile.</p>
          )}
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Indietro</Button>
          {status === 'friends' ? (
            <Button type="button" onClick={openDm} disabled={busy}>Apri chat</Button>
          ) : status === 'requested' ? (
            <Button type="button" variant="secondary" disabled>Richiesta inviata</Button>
          ) : (
            <Button type="button" onClick={requestFriendship} disabled={busy}>Invia richiesta</Button>
          )}
        </div>
      </Card>
    </section>
  );
}

export default FocusProfilePage;

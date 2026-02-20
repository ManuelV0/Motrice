import { ChevronLeft, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FriendRequestsPanel from '../components/chat/FriendRequestsPanel';
import Button from '../components/Button';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import styles from '../styles/pages/friends.module.css';

function FriendsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState({ inbound: [], outbound: [] });

  usePageMeta({
    title: 'Amici | Motrice',
    description: 'Gestisci richieste amicizia e apri DM dopo accettazione.'
  });

  async function load() {
    setLoading(true);
    try {
      const payload = await api.listFriendRequests();
      setRequests({
        inbound: Array.isArray(payload?.inbound) ? payload.inbound : [],
        outbound: Array.isArray(payload?.outbound) ? payload.outbound : []
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRespond(requestId, decision) {
    await api.respondFriendRequest({ requestId, decision });
    await load();
  }

  async function handleOpenDm(userId) {
    const dm = await api.getOrCreateDMThread(userId);
    navigate(`/chat/${dm.threadId}`);
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/chat/inbox')} aria-label="Torna alla inbox chat">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div>
          <h1><Users size={18} aria-hidden="true" /> Amici</h1>
          <p className="muted">Inviti, richieste e accesso ai DM.</p>
        </div>
      </header>

      <FriendRequestsPanel
        requests={requests}
        loading={loading}
        onRespond={handleRespond}
        onOpenProfile={(userId, eventId) => navigate(`/chat/focus/${userId}?eventId=${eventId || ''}`)}
        onOpenDm={handleOpenDm}
      />

      <div className={styles.metPeopleAction}>
        <Button type="button" variant="secondary" onClick={() => navigate('/chat/met')}>Persone incontrate</Button>
      </div>
    </section>
  );
}

export default FriendsPage;

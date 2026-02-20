import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../components/Button';
import LoadingSkeleton from '../components/LoadingSkeleton';
import MetPeopleList from '../components/chat/MetPeopleList';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import styles from '../styles/pages/metPeople.module.css';

function MetPeoplePage() {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [sendingById, setSendingById] = useState({});

  usePageMeta({
    title: 'Persone incontrate | Motrice',
    description: 'Aggiungi amici solo dopo un allenamento completato insieme.'
  });

  async function load() {
    setLoading(true);
    try {
      const list = await api.listMetPeople({ eventId: eventId ? Number(eventId) : null });
      setItems(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [eventId]);

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => String(item.display_name || '').toLowerCase().includes(q));
  }, [items, query]);

  async function sendRequest(toUserId, selectedEventId) {
    const key = String(toUserId);
    setSendingById((prev) => ({ ...prev, [key]: true }));
    try {
      await api.sendFriendRequest({ toUserId, eventId: selectedEventId });
      await load();
    } catch {
      // errors surfaced by current global toast layer where present
    } finally {
      setSendingById((prev) => ({ ...prev, [key]: false }));
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>Persone incontrate</h1>
        <p className="muted">Puoi aggiungere solo persone con cui hai completato un allenamento.</p>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => navigate('/chat/inbox')}>Torna alla chat</Button>
        </div>
      </header>

      <label className={styles.searchField}>
        Cerca persone
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome" aria-label="Cerca persone incontrate" />
      </label>

      {loading ? (
        <LoadingSkeleton rows={3} variant="list" />
      ) : (
        <MetPeopleList
          items={filtered}
          sendingById={sendingById}
          onSendRequest={sendRequest}
          onOpenProfile={(userId, selectedEventId) => navigate(`/chat/focus/${userId}?eventId=${selectedEventId || ''}`)}
        />
      )}
    </section>
  );
}

export default MetPeoplePage;

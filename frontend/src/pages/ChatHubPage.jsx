import { MessageCircleMore, Shield } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HeroCard from '../components/HeroCard';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import { chatApi } from '../services/chatApi';
import styles from '../styles/pages/chatHub.module.css';

function ChatHubPage() {
  const navigate = useNavigate();
  const [pendingRequests, setPendingRequests] = useState(0);
  const [unreadThreads, setUnreadThreads] = useState(0);

  usePageMeta({
    title: 'Chat | Motrice',
    description: 'Hub premium con accesso rapido a ChatRICE e Community Motrice.'
  });

  useEffect(() => {
    let active = true;

    Promise.all([api.listFriendRequests(), chatApi.listThreads()])
      .then(([requestsPayload, threads]) => {
        if (!active) return;
        const inbound = Array.isArray(requestsPayload?.inbound) ? requestsPayload.inbound : [];
        const pending = inbound.filter((item) => String(item.status || '') === 'pending').length;
        const unread = (Array.isArray(threads) ? threads : []).reduce((acc, item) => acc + Number(item?.unreadCount || 0), 0);
        setPendingRequests(pending);
        setUnreadThreads(unread);
      })
      .catch(() => {
        if (!active) return;
        setPendingRequests(0);
        setUnreadThreads(0);
      });

    return () => {
      active = false;
    };
  }, []);

  const chatBadge = useMemo(() => {
    if (pendingRequests > 0) return `${pendingRequests} richiesta${pendingRequests > 1 ? 'e' : ''}`;
    if (unreadThreads > 0) return `${unreadThreads}`;
    return 'Apri';
  }, [pendingRequests, unreadThreads]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>Chat</h1>
      </header>

      <div className={styles.grid}>
        <HeroCard
          icon={MessageCircleMore}
          title="ChatRICE"
          subtitle="Eventi, DM e organizzazione"
          badge={chatBadge}
          onClick={() => navigate('/chat/inbox')}
          ariaLabel="Apri ChatRICE"
        />

        <HeroCard
          icon={Shield}
          title="Community Motrice"
          subtitle="Regole, accesso e gruppi locali"
          badge="Semi-privata"
          onClick={() => navigate('/community')}
          ariaLabel="Apri Community Motrice"
        />
      </div>
    </section>
  );
}

export default ChatHubPage;

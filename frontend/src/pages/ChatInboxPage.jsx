import { MessageCircleOff, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatTabs from '../components/chat/ChatTabs';
import ChatTopActions from '../components/chat/ChatTopActions';
import ThreadRow from '../components/chat/ThreadRow';
import MetPeoplePill from '../components/chat/MetPeoplePill';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import { useChatStore } from '../hooks/useChatStore';
import styles from '../styles/pages/chatInbox.module.css';

function ChatInboxPage() {
  const navigate = useNavigate();
  const { threadsLoading, threads } = useChatStore(null);
  const [activeTab, setActiveTab] = useState('event');
  const [query, setQuery] = useState('');

  usePageMeta({
    title: 'Inbox Chat | Motrice',
    description: 'Inbox ChatRICE con tab Eventi e DM, ottimizzata mobile.'
  });

  const filtered = useMemo(() => {
    const base = (Array.isArray(threads) ? threads : []).filter((item) => String(item?.type || '') === activeTab);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return base;
    return base.filter((item) => {
      const title = String(item?.title || '').toLowerCase();
      const preview = String(item?.lastMessage || '').toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }, [threads, activeTab, query]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <h1>ChatRICE</h1>
          <p>Eventi, DM e organizzazione</p>
        </div>
        <ChatTopActions onSearch={() => navigate('/chat/search')} onFriends={() => navigate('/chat/friends')} onNewChat={() => {}} />
      </header>

      <ChatTabs value={activeTab} onChange={setActiveTab} />

      <label className={styles.searchWrap}>
        <Search size={16} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={activeTab === 'event' ? 'Cerca chat evento' : 'Cerca chat DM'}
          aria-label="Cerca nella tab corrente"
        />
      </label>

      <div className={styles.metPillWrap}>
        <MetPeoplePill onClick={() => navigate('/chat/met')} />
      </div>

      <div className={styles.list}>
        {threadsLoading ? (
          <LoadingSkeleton rows={4} variant="list" />
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <MessageCircleOff size={20} aria-hidden="true" />
            <h2>Nessuna chat ancora</h2>
            <p>Allenati e sblocca nuove connessioni</p>
          </div>
        ) : (
          filtered.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} onOpen={() => navigate(`/chat/${thread.id}`)} />
          ))
        )}
      </div>
    </section>
  );
}

export default ChatInboxPage;

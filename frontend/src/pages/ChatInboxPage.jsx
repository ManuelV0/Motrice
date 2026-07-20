import { MessageCircleMore, Search } from 'lucide-react';
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
          <span className={styles.eyebrow}>MESSAGGI</span>
          <h1>Chat</h1>
          <p>Organizzati con chi si allena con te.</p>
        </div>
        <ChatTopActions
          onSearch={() => navigate('/chat/search')}
          onFriends={() => navigate('/chat/friends')}
          onCommunity={() => navigate('/community')}
        />
      </header>

      <div className={styles.tabsWrap}>
        <ChatTabs value={activeTab} onChange={setActiveTab} />
      </div>

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
        <div className={styles.listHead}>
          <span>{activeTab === 'event' ? 'Chat degli eventi' : 'Messaggi diretti'}</span>
          <small>{filtered.length}</small>
        </div>
        {threadsLoading ? (
          <LoadingSkeleton rows={4} variant="list" />
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <MessageCircleMore size={28} />
            </span>
            <h2>{activeTab === 'event' ? 'Nessuna chat evento' : 'Nessun messaggio diretto'}</h2>
            <p>
              {activeTab === 'event'
                ? 'Partecipa a un evento: la chat si attiverà automaticamente.'
                : 'Aggiungi un amico per iniziare una conversazione privata.'}
            </p>
            <button
              type="button"
              className={styles.emptyCta}
              onClick={() => navigate(activeTab === 'event' ? '/explore' : '/chat/friends')}
            >
              {activeTab === 'event' ? 'Trova un evento' : 'Apri amici'}
            </button>
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

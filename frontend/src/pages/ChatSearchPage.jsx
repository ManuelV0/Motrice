import { ChevronLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatList from '../components/chat/ChatList';
import { usePageMeta } from '../hooks/usePageMeta';
import { useChatStore } from '../hooks/useChatStore';
import styles from '../styles/pages/chatSearch.module.css';

function ChatSearchPage() {
  const navigate = useNavigate();
  const { threadsLoading, filteredThreads, query, setQuery } = useChatStore(null);
  const [focusedOnce, setFocusedOnce] = useState(true);

  usePageMeta({
    title: 'Cerca chat | Motrice',
    description: 'Ricerca full-screen tra thread chat Motrice.'
  });

  const title = useMemo(() => (query ? `${filteredThreads.length} risultati` : 'Cerca chat'), [query, filteredThreads.length]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/chat/inbox')} aria-label="Torna alla inbox chat">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div>
          <h1>{title}</h1>
          <p className="muted">Trova thread evento e chat dirette.</p>
        </div>
      </header>

      <div className={styles.listWrap}>
        <ChatList
          threads={filteredThreads}
          loading={threadsLoading}
          query={query}
          onQueryChange={(value) => {
            if (focusedOnce) setFocusedOnce(false);
            setQuery(value);
          }}
          autoFocusSearch={focusedOnce}
          selectedThreadId={null}
          onSelectThread={(threadId) => navigate(`/chat/${threadId}`)}
        />
      </div>
    </section>
  );
}

export default ChatSearchPage;

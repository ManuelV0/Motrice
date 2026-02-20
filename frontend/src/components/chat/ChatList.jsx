import { MessageCircle } from 'lucide-react';
import EmptyState from '../EmptyState';
import LoadingSkeleton from '../LoadingSkeleton';
import ChatListItem from './ChatListItem';
import ChatSearchBar from './ChatSearchBar';
import styles from '../../styles/components/chat/chatList.module.css';

function ChatList({
  threads,
  loading,
  query,
  onQueryChange,
  autoFocusSearch = false,
  hideSearch = false,
  selectedThreadId,
  onSelectThread
}) {
  return (
    <section className={styles.listPane} aria-label="Lista chat">
      {!hideSearch ? <ChatSearchBar value={query} onChange={onQueryChange} autoFocus={autoFocusSearch} /> : null}

      {loading ? (
        <LoadingSkeleton rows={4} variant="list" />
      ) : threads.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          imageSrc="/images/default-sport.svg"
          imageAlt="Nessuna chat"
          title="Nessuna chat"
          description="Partecipa agli eventi o avvia una conversazione per vedere le chat qui."
        />
      ) : (
        <div className={styles.items}>
          {threads.map((thread) => (
            <ChatListItem
              key={thread.id}
              thread={thread}
              active={String(selectedThreadId || '') === String(thread.id)}
              onClick={() => onSelectThread(thread.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default ChatList;

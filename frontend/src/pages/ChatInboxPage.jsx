import { MessageCircleMore, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatTabs from '../components/chat/ChatTabs';
import ChatTopActions from '../components/chat/ChatTopActions';
import ThreadRow from '../components/chat/ThreadRow';
import MetPeoplePill from '../components/chat/MetPeoplePill';
import LoadingSkeleton from '../components/LoadingSkeleton';
import Modal from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useChatStore } from '../hooks/useChatStore';
import styles from '../styles/pages/chatInbox.module.css';

const ARCHIVED_EVENT_STATUSES = new Set(['completed', 'cancelled', 'closed', 'archived']);

function isArchivedEventThread(thread) {
  if (String(thread?.type || '') !== 'event') return false;
  const status = String(thread?.meta?.eventStatus || '').trim().toLowerCase();
  if (ARCHIVED_EVENT_STATUSES.has(status)) return true;
  const startsAtMs = Date.parse(String(thread?.meta?.startsAt || ''));
  return Number.isFinite(startsAtMs) && startsAtMs < Date.now() - 24 * 60 * 60 * 1000;
}

function ChatInboxPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { threadsLoading, threads, deleteThread } = useChatStore(null);
  const [activeTab, setActiveTab] = useState('event');
  const [eventView, setEventView] = useState('active');
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  usePageMeta({
    title: 'Inbox Chat | Motrice',
    description: 'Inbox ChatRICE con tab Eventi e DM, ottimizzata mobile.'
  });

  const filtered = useMemo(() => {
    const base = (Array.isArray(threads) ? threads : []).filter((item) => {
      if (String(item?.type || '') !== activeTab) return false;
      if (activeTab !== 'event') return true;
      const archived = isArchivedEventThread(item);
      return eventView === 'archived' ? archived : !archived;
    });
    const q = String(query || '').trim().toLowerCase();
    if (!q) return base;
    return base.filter((item) => {
      const title = String(item?.title || '').toLowerCase();
      const preview = String(item?.lastMessage || '').toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }, [threads, activeTab, eventView, query]);

  const counts = useMemo(() => {
    const items = Array.isArray(threads) ? threads : [];
    const eventItems = items.filter((item) => String(item?.type || '') === 'event');
    return {
      event: eventItems.length,
      dm: items.filter((item) => String(item?.type || '') === 'dm').length,
      active: eventItems.filter((item) => !isArchivedEventThread(item)).length,
      archived: eventItems.filter(isArchivedEventThread).length
    };
  }, [threads]);

  async function confirmDeleteThread() {
    if (!deleteTarget?.id || deleting) return;
    setDeleting(true);
    try {
      await deleteThread(deleteTarget.id);
      setDeleteTarget(null);
      showToast('Chat eliminata dalla lista', 'success');
    } catch (error) {
      showToast(error?.message || 'Impossibile eliminare la chat', 'error');
    } finally {
      setDeleting(false);
    }
  }

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
        <ChatTabs value={activeTab} counts={counts} onChange={setActiveTab} />
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

      {activeTab === 'event' ? (
        <div className={styles.statusTabs} role="group" aria-label="Stato chat evento">
          <button
            type="button"
            className={eventView === 'active' ? styles.statusTabActive : ''}
            aria-pressed={eventView === 'active'}
            onClick={() => setEventView('active')}
          >
            Attive <span>{counts.active}</span>
          </button>
          <button
            type="button"
            className={eventView === 'archived' ? styles.statusTabActive : ''}
            aria-pressed={eventView === 'archived'}
            onClick={() => setEventView('archived')}
          >
            Archiviate <span>{counts.archived}</span>
          </button>
        </div>
      ) : null}

      <div className={styles.list}>
        <div className={styles.listHead}>
          <span>
            {activeTab === 'event'
              ? eventView === 'archived'
                ? 'Eventi conclusi'
                : 'Eventi attivi'
              : 'Messaggi diretti'}
          </span>
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
              onClick={() => navigate(activeTab === 'event' ? '/map' : '/chat/friends')}
            >
              {activeTab === 'event' ? 'Trova un evento' : 'Apri amici'}
            </button>
          </div>
        ) : (
          filtered.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              archived={isArchivedEventThread(thread)}
              onOpen={() => navigate(`/chat/${thread.id}`)}
              onDeleteRequest={setDeleteTarget}
            />
          ))
        )}
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        title="Eliminare questa chat?"
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={confirmDeleteThread}
        confirmText={deleting ? 'Eliminazione...' : 'Elimina chat'}
        confirmDisabled={deleting}
        confirmClassName={styles.deleteConfirmButton}
      >
        <div className={styles.deleteDialog}>
          <span className={styles.deleteDialogIcon} aria-hidden="true"><Trash2 size={24} /></span>
          <div>
            <strong>{deleteTarget?.title || 'Chat'}</strong>
            <p>
              Verrà rimossa solo dalla tua lista su questo dispositivo. Gli altri partecipanti
              conserveranno i messaggi.
            </p>
            <small>Se arriva un nuovo messaggio, la conversazione comparirà di nuovo.</small>
          </div>
        </div>
      </Modal>
    </section>
  );
}

export default ChatInboxPage;

import { MoreVertical, ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ChatComposer from './ChatComposer';
import DayDivider from './DayDivider';
import MessageBubble from './MessageBubble';
import LoadingSkeleton from '../LoadingSkeleton';
import styles from '../../styles/components/chat/chatThread.module.css';

function initialsFromTitle(title = '') {
  const clean = String(title || '').trim();
  if (!clean) return 'CH';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function parseMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function getDayLabel(iso) {
  const ms = parseMs(iso);
  if (!ms) return 'Data';
  const d = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.floor((today - day) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Ieri';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isNearBottom(node) {
  if (!node) return true;
  const threshold = 88;
  return node.scrollHeight - node.scrollTop - node.clientHeight < threshold;
}

function ChatThread({
  thread,
  messages,
  loading,
  hasMore,
  onLoadMore,
  draft,
  onDraftChange,
  onSend,
  sending,
  currentUserId,
  onBack,
  onOpenProfile,
  mobile = false,
  fullScreenMobile = false
}) {
  const bodyRef = useRef(null);
  const prevThreadRef = useRef(null);
  const prevLengthRef = useRef(0);
  const wasNearBottomRef = useRef(true);
  const [showNewIndicator, setShowNewIndicator] = useState(false);

  const timeline = useMemo(() => {
    const rows = [];
    let lastLabel = '';

    (Array.isArray(messages) ? messages : []).forEach((message) => {
      const label = getDayLabel(message.ts);
      if (label !== lastLabel) {
        rows.push({ type: 'day', id: `day_${label}_${message.id}`, label });
        lastLabel = label;
      }
      rows.push({ type: 'message', id: `msg_${message.id}`, message });
    });

    return rows;
  }, [messages]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;

    const threadChanged = prevThreadRef.current !== String(thread?.id || '');
    if (threadChanged) {
      window.requestAnimationFrame(() => {
        node.scrollTop = node.scrollHeight;
        setShowNewIndicator(false);
      });
      prevThreadRef.current = String(thread?.id || '');
      prevLengthRef.current = Array.isArray(messages) ? messages.length : 0;
      wasNearBottomRef.current = true;
      return;
    }

    const len = Array.isArray(messages) ? messages.length : 0;
    const increased = len > prevLengthRef.current;

    if (increased) {
      const last = messages[len - 1];
      const mine = Number(last?.senderId || 0) === Number(currentUserId);
      if (mine || wasNearBottomRef.current) {
        window.requestAnimationFrame(() => {
          node.scrollTop = node.scrollHeight;
          setShowNewIndicator(false);
        });
      } else {
        setShowNewIndicator(true);
      }
    }

    prevLengthRef.current = len;
  }, [messages, thread?.id, currentUserId]);

  function jumpToBottom() {
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    setShowNewIndicator(false);
  }

  if (!thread) {
    return (
      <section className={`${styles.emptyPanel} ${fullScreenMobile ? styles.threadFullscreen : ''}`}>
        <p className="muted">Seleziona una chat dalla lista per iniziare.</p>
      </section>
    );
  }

  return (
    <section className={`${styles.threadPane} ${fullScreenMobile ? styles.threadFullscreen : ''}`} aria-label={`Conversazione ${thread.title}`}>
      <header className={styles.head}>
        {mobile ? (
          <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Torna alla lista chat">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        ) : null}

        <span className={styles.avatar} aria-hidden="true">{initialsFromTitle(thread.title)}</span>

        <div className={styles.headMeta}>
          {thread.type === 'dm' && Number(thread?.otherUserId || 0) > 0 && typeof onOpenProfile === 'function' ? (
            <button
              type="button"
              className={styles.profileLink}
              onClick={() => onOpenProfile(Number(thread.otherUserId))}
              aria-label={`Apri profilo di ${thread.title}`}
            >
              {thread.title}
            </button>
          ) : (
            <h2>{thread.title}</h2>
          )}
          {thread.type === 'event' ? (
            <p>{Number(thread?.meta?.participantsCount || 0)} partecipanti</p>
          ) : (
            <p>{String(thread?.meta?.status || 'online')}</p>
          )}
        </div>

        <button type="button" className={styles.menuBtn} aria-label="Opzioni chat">
          <MoreVertical size={18} aria-hidden="true" />
        </button>
      </header>

      {loading ? (
        <div className={styles.loadingWrap}>
          <LoadingSkeleton rows={4} variant="detail" />
        </div>
      ) : (
        <>
          <div
            ref={bodyRef}
            className={styles.messages}
            onScroll={(event) => {
              const node = event.currentTarget;
              wasNearBottomRef.current = isNearBottom(node);
              if (wasNearBottomRef.current && showNewIndicator) {
                setShowNewIndicator(false);
              }
            }}
          >
            {hasMore ? (
              <button type="button" className={styles.loadMore} onClick={onLoadMore}>
                Carica messaggi precedenti
              </button>
            ) : null}

            {timeline.map((row) => {
              if (row.type === 'day') {
                return <DayDivider key={row.id} label={row.label} />;
              }
              const message = row.message;
              const mine = Number(message?.senderId || 0) === Number(currentUserId);
              const senderLabel = thread.type === 'event' && !mine ? `Utente ${message.senderId}` : '';
              return <MessageBubble key={row.id} message={message} mine={mine} senderLabel={senderLabel} />;
            })}
          </div>

          {showNewIndicator ? (
            <button type="button" className={styles.newIndicator} onClick={jumpToBottom}>
              Nuovi messaggi
            </button>
          ) : null}

          <ChatComposer value={draft} onChange={onDraftChange} onSend={onSend} disabled={false} sending={sending} />
        </>
      )}
    </section>
  );
}

export default ChatThread;

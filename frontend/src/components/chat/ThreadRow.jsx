import styles from '../../styles/components/chat/threadRow.module.css';

function initialsFromTitle(title = '') {
  const clean = String(title || '').trim();
  if (!clean) return 'CH';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatThreadTime(iso) {
  const ms = Date.parse(String(iso || ''));
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function ThreadRow({ thread, onOpen }) {
  const preview = String(thread?.lastMessage || '').trim() || 'Apri la conversazione';
  const title = String(thread?.title || 'Chat').trim() || 'Chat';
  const formattedTime = formatThreadTime(thread?.lastTs);
  const unreadCount = Number(thread?.unreadCount || 0);
  const senderPrefix = String(thread?.lastMessageSenderName || '').trim();
  const previewText = senderPrefix && thread?.lastMessage ? `${senderPrefix}: ${preview}` : preview;
  return (
    <button type="button" className={styles.row} onClick={onOpen} aria-label={`Apri chat ${title}`}>
      <span className={styles.avatar} aria-hidden="true">
        {thread?.avatarUrl ? (
          <img
            src={thread.avatarUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
        <span>{initialsFromTitle(title)}</span>
      </span>

      <span className={styles.copy}>
        <span className={styles.top}>
          <strong className={styles.title}>{title}</strong>
          <small className={`${styles.time} ${unreadCount > 0 ? styles.timeUnread : ''}`}>{formattedTime}</small>
        </span>
        <span className={styles.bottom}>
          <span className={styles.preview}>{previewText}</span>
          {unreadCount > 0 ? <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
        </span>
      </span>
    </button>
  );
}

export default ThreadRow;

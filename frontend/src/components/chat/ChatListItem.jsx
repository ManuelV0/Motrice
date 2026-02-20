import styles from '../../styles/components/chat/chatListItem.module.css';

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
  if (sameDay) {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function ChatListItem({ thread, active = false, onClick }) {
  const preview = String(thread.lastMessage || '').trim() || 'Apri la conversazione';

  return (
    <button
      type="button"
      className={`${styles.item} ${active ? styles.active : ''}`}
      onClick={onClick}
      aria-label={`Apri chat ${thread.title}`}
    >
      <span className={styles.avatar} aria-hidden="true">{initialsFromTitle(thread.title)}</span>

      <span className={styles.meta}>
        <span className={styles.topRow}>
          <strong className={styles.title}>{thread.title}</strong>
          <small className={styles.time}>{formatThreadTime(thread.lastTs)}</small>
        </span>
        <span className={styles.bottomRow}>
          <span className={styles.preview}>{preview}</span>
          {thread.unreadCount > 0 ? <span className={styles.badge}>{thread.unreadCount}</span> : null}
        </span>
      </span>
    </button>
  );
}

export default ChatListItem;

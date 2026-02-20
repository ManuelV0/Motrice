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
  return (
    <button type="button" className={styles.row} onClick={onOpen} aria-label={`Apri chat ${thread.title}`}>
      <span className={styles.avatar} aria-hidden="true">{initialsFromTitle(thread.title)}</span>

      <span className={styles.copy}>
        <span className={styles.top}>
          <strong>{thread.title}</strong>
          <small>{formatThreadTime(thread.lastTs)}</small>
        </span>
        <span className={styles.bottom}>
          <span>{preview}</span>
          {Number(thread?.unreadCount || 0) > 0 ? <span className={styles.badge}>{thread.unreadCount}</span> : null}
        </span>
      </span>
    </button>
  );
}

export default ThreadRow;

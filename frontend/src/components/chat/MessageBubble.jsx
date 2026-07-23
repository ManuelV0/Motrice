import { AlertCircle, CheckCheck, Clock3 } from 'lucide-react';
import styles from '../../styles/components/chat/messageBubble.module.css';

function formatTime(iso) {
  const ms = Date.parse(String(iso || ''));
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function initialsFromName(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'M';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function MessageBubble({ message, mine = false, senderLabel = '', onSenderClick }) {
  const status = String(message?.status || 'sent');

  return (
    <article className={`${styles.bubble} ${mine ? styles.mine : styles.other}`}>
      {!mine && senderLabel ? (
        <button
          type="button"
          className={styles.senderButton}
          onClick={onSenderClick}
          disabled={typeof onSenderClick !== 'function'}
          aria-label={typeof onSenderClick === 'function' ? `Apri profilo di ${senderLabel}` : undefined}
        >
          <span className={styles.senderAvatar} aria-hidden="true">
            {message?.senderAvatarUrl ? (
              <img
                src={message.senderAvatarUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            ) : null}
            <span>{initialsFromName(senderLabel)}</span>
          </span>
          <span className={styles.sender}>{senderLabel}</span>
        </button>
      ) : null}
      <p className={styles.text}>{message.text}</p>
      <p className={styles.meta}>
        <small>{formatTime(message.ts)}</small>
        {mine ? (
          <span
            className={`${styles.status} ${status === 'failed' ? styles.statusFailed : ''}`}
            aria-label={status === 'sending' ? 'Invio in corso' : status === 'failed' ? 'Invio non riuscito' : 'Messaggio inviato'}
            title={status === 'sending' ? 'Invio in corso' : status === 'failed' ? 'Invio non riuscito' : 'Messaggio inviato'}
          >
            {status === 'sending' ? (
              <Clock3 size={13} aria-hidden="true" />
            ) : status === 'failed' ? (
              <AlertCircle size={13} aria-hidden="true" />
            ) : (
              <CheckCheck size={14} aria-hidden="true" />
            )}
          </span>
        ) : null}
      </p>
    </article>
  );
}

export default MessageBubble;

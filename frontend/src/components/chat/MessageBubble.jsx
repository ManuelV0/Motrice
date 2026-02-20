import styles from '../../styles/components/chat/messageBubble.module.css';

function formatTime(iso) {
  const ms = Date.parse(String(iso || ''));
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({ message, mine = false, senderLabel = '' }) {
  const status = String(message?.status || 'sent');

  return (
    <article className={`${styles.bubble} ${mine ? styles.mine : styles.other}`}>
      {!mine && senderLabel ? <p className={styles.sender}>{senderLabel}</p> : null}
      <p className={styles.text}>{message.text}</p>
      <p className={styles.meta}>
        <small>{formatTime(message.ts)}</small>
        {mine ? <small>{status === 'sending' ? 'Invio...' : status === 'failed' ? 'Errore' : 'Inviato'}</small> : null}
      </p>
    </article>
  );
}

export default MessageBubble;

import { Paperclip, Send } from 'lucide-react';
import { useRef } from 'react';
import styles from '../../styles/components/chat/chatComposer.module.css';

function resizeTextarea(node) {
  if (!node) return;
  node.style.height = 'auto';
  const lineHeight = 24;
  const minHeight = lineHeight;
  const maxHeight = lineHeight * 4;
  const next = Math.min(maxHeight, Math.max(minHeight, node.scrollHeight));
  node.style.height = `${next}px`;
}

function ChatComposer({ value, onChange, onSend, disabled = false, sending = false }) {
  const textareaRef = useRef(null);

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <button
        type="button"
        className={styles.attach}
        aria-label="Allega file (presto disponibile)"
        title="Allegati presto disponibili"
        disabled
      >
        <Paperclip size={18} aria-hidden="true" />
      </button>

      <label htmlFor="chat-composer-input" className={styles.srOnly}>Scrivi messaggio</label>
      <textarea
        id="chat-composer-input"
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value.slice(0, 1000));
          resizeTextarea(event.target);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        className={styles.input}
        rows={1}
        placeholder="Scrivi un messaggio"
        disabled={disabled}
        aria-label="Messaggio"
      />

      <button
        type="submit"
        className={styles.send}
        aria-label="Invia messaggio"
        disabled={disabled || sending || !String(value || '').trim()}
      >
        <Send size={18} aria-hidden="true" />
      </button>
    </form>
  );
}

export default ChatComposer;

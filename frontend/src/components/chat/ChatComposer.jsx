import { Send, Smile } from 'lucide-react';
import { useRef, useState } from 'react';
import styles from '../../styles/components/chat/chatComposer.module.css';

const QUICK_EMOJIS = ['👍', '💪', '🔥', '🙌', '😄', '⚡', '🏃', '⚽', '🏋️', '✅'];

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
  const [showEmojis, setShowEmojis] = useState(false);

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        setShowEmojis(false);
        onSend();
      }}
    >
      <div className={styles.emojiWrap}>
        <button
          type="button"
          className={styles.emojiButton}
          aria-label="Apri emoji"
          aria-expanded={showEmojis}
          onClick={() => setShowEmojis((valueOpen) => !valueOpen)}
          disabled={disabled}
        >
          <Smile size={21} aria-hidden="true" />
        </button>
        {showEmojis ? (
          <div className={styles.emojiPanel} aria-label="Emoji rapide">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onChange(`${String(value || '')}${emoji}`.slice(0, 1000));
                  textareaRef.current?.focus();
                }}
                aria-label={`Inserisci ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>

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
            setShowEmojis(false);
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

import { Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import styles from '../../styles/components/chat/chatSearchBar.module.css';

function ChatSearchBar({ value, onChange, autoFocus = false }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className={styles.searchWrap}>
      <label htmlFor="chat-search" className={styles.srOnly}>Cerca chat</label>
      <Search size={16} className={styles.icon} aria-hidden="true" />
      <input
        id="chat-search"
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Cerca chat"
        aria-label="Cerca chat"
      />
      {value ? (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() => onChange('')}
          aria-label="Cancella ricerca"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export default ChatSearchBar;

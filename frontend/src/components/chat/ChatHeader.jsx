import { Edit3, Search } from 'lucide-react';
import styles from '../../styles/components/chat/chatHeader.module.css';

function ChatHeader({ title = 'Chat', onSearchClick, showActions = true }) {
  return (
    <header className={styles.header} aria-label="Header chat">
      <h1 className={styles.title}>{title}</h1>
      {showActions ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onSearchClick}
            aria-label="Vai alla ricerca chat"
          >
            <Search size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Nuova chat"
            title="Nuova chat presto disponibile"
            disabled
          >
            <Edit3 size={18} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </header>
  );
}

export default ChatHeader;

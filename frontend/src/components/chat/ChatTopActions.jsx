import { Edit3, Search, Users } from 'lucide-react';
import styles from '../../styles/components/chat/chatTopActions.module.css';

function ChatTopActions({ onSearch, onFriends, onNewChat }) {
  return (
    <div className={styles.actions} aria-label="Azioni chat">
      <button type="button" className={styles.iconBtn} onClick={onSearch} aria-label="Cerca chat">
        <Search size={16} aria-hidden="true" />
      </button>
      <button type="button" className={styles.iconBtn} onClick={onFriends} aria-label="Apri amici">
        <Users size={16} aria-hidden="true" />
      </button>
      <button type="button" className={styles.iconBtn} onClick={onNewChat} aria-label="Nuova chat" title="Nuova chat presto disponibile" disabled>
        <Edit3 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default ChatTopActions;

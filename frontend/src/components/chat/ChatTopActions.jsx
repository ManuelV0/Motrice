import { Search, UserRoundCheck, UsersRound } from 'lucide-react';
import styles from '../../styles/components/chat/chatTopActions.module.css';

function ChatTopActions({ onSearch, onFriends, onCommunity }) {
  return (
    <div className={styles.actions} aria-label="Azioni chat">
      <button type="button" className={styles.iconBtn} onClick={onSearch} aria-label="Cerca chat">
        <Search size={18} aria-hidden="true" />
        <span>Cerca</span>
      </button>
      <button type="button" className={styles.iconBtn} onClick={onFriends} aria-label="Apri amici">
        <UserRoundCheck size={18} aria-hidden="true" />
        <span>Amici</span>
      </button>
      <button type="button" className={styles.iconBtn} onClick={onCommunity} aria-label="Apri community">
        <UsersRound size={18} aria-hidden="true" />
        <span>Community</span>
      </button>
    </div>
  );
}

export default ChatTopActions;

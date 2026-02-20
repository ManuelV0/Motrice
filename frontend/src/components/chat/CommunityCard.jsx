import { Users } from 'lucide-react';
import styles from '../../styles/components/chat/communityCard.module.css';

function CommunityCard({ onOpen }) {
  return (
    <button type="button" className={styles.card} onClick={onOpen} aria-label="Apri community">
      <span className={styles.avatar} aria-hidden="true">
        <Users size={18} />
      </span>
      <span className={styles.meta}>
        <strong>Community Motrice</strong>
        <small>Regole, accesso e gruppo sportivo locale</small>
      </span>
      <span className={styles.badge}>Gate</span>
    </button>
  );
}

export default CommunityCard;

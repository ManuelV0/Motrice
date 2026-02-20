import { ChevronRight, Users } from 'lucide-react';
import styles from '../../styles/components/chat/metPeoplePill.module.css';

function MetPeoplePill({ onClick }) {
  return (
    <button type="button" className={styles.pill} onClick={onClick} aria-label="Apri persone incontrate">
      <Users size={14} aria-hidden="true" />
      <span>Persone incontrate</span>
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  );
}

export default MetPeoplePill;

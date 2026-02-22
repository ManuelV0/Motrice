import { TrendingUp } from 'lucide-react';
import styles from '../../styles/components/accountStickyHeader.module.css';
import avatarPlaceholder from '../../assets/avatar-placeholder.svg';

function AccountStickyHeader({ displayName, avatarUrl, plan, xpGlobal }) {
  return (
    <header className={styles.header}>
      <img
        src={avatarUrl || avatarPlaceholder}
        alt="Avatar"
        loading="lazy"
        className={styles.avatar}
      />
      <div className={styles.info}>
        <h2 className={styles.name}>{displayName || 'Utente Motrice'}</h2>
        <div className={styles.meta}>
          <span className={styles.planBadge}>{(plan || 'free').toUpperCase()}</span>
          <span className={styles.xpMini}>
            <TrendingUp aria-hidden="true" />
            {xpGlobal ?? 0} XP
          </span>
        </div>
      </div>
    </header>
  );
}

export default AccountStickyHeader;

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import styles from '../../styles/components/accountMenuList.module.css';

function AccountMenuItem({ to, icon: Icon, label, sublabel, iconColor, statusText, onClick }) {
  const colorClass = iconColor === 'primary' ? styles.iconPrimary
    : iconColor === 'warning' ? styles.iconWarning
    : iconColor === 'success' ? styles.iconSuccess
    : iconColor === 'muted' ? styles.iconMuted
    : styles.iconAccent;

  const content = (
    <>
      <span className={`${styles.iconWrap} ${colorClass}`}>
        <Icon aria-hidden="true" />
      </span>
      <span className={styles.copy}>
        <p className={styles.label}>{label}</p>
        {sublabel ? <p className={styles.sublabel}>{sublabel}</p> : null}
      </span>
      <span className={styles.trailing}>
        {statusText ? <span className={styles.statusBadge}>{statusText}</span> : null}
        <span className={styles.chevron}><ChevronRight aria-hidden="true" /></span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={styles.item} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <Link to={to} className={styles.item}>
      {content}
    </Link>
  );
}

function AccountMenuList({ items = [], sectionLabel }) {
  return (
    <nav className={styles.list} aria-label={sectionLabel || 'Menu account'}>
      {sectionLabel ? <p className={styles.sectionLabel}>{sectionLabel}</p> : null}
      {items.map((item) => (
        <AccountMenuItem key={item.id} {...item} />
      ))}
    </nav>
  );
}

export default AccountMenuList;

import styles from '../styles/components/heroCard.module.css';

function HeroCard({ icon: Icon, title, subtitle, badge, onClick, ariaLabel }) {
  return (
    <button type="button" className={styles.card} onClick={onClick} aria-label={ariaLabel || title}>
      <span className={styles.iconWrap} aria-hidden="true">
        {Icon ? <Icon size={30} /> : null}
      </span>

      <span className={styles.copy}>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>

      <span className={styles.badge}>{badge}</span>
    </button>
  );
}

export default HeroCard;

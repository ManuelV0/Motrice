import styles from '../styles/components/heroCard.module.css';

function HeroCard({ icon: Icon, title, subtitle, badge, onClick, ariaLabel, image }) {
  return (
    <button type="button" className={`${styles.card} ${image ? styles.hasImage : ''}`} onClick={onClick} aria-label={ariaLabel || title}>
      {image ? (
        <span className={styles.imageWrap} aria-hidden="true">
          <img src={image} alt="" className={styles.image} loading="lazy" />
        </span>
      ) : (
        <span className={styles.iconWrap} aria-hidden="true">
          {Icon ? <Icon size={30} /> : null}
        </span>
      )}

      <span className={styles.copy}>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>

      <span className={styles.badge}>{badge}</span>
    </button>
  );
}

export default HeroCard;

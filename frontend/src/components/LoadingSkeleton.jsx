import styles from '../styles/components/loadingSkeleton.module.css';

function LoadingSkeleton({ rows = 3, variant = 'list' }) {
  const gridClass = variant === 'detail' ? styles.detailGrid : styles.grid;
  const cardClass = variant === 'detail' ? `${styles.card} ${styles.detailCard}` : styles.card;
  return (
    <div className={gridClass} aria-busy="true" aria-label="Caricamento contenuti">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className={cardClass}>
          <div className={`${styles.line} ${variant === 'detail' ? styles.title : ''}`} />
          <div className={`${styles.line} ${styles.short}`} />
          <div className={styles.line} />
          {variant === 'detail' ? <div className={`${styles.line} ${styles.long}`} /> : null}
        </div>
      ))}
    </div>
  );
}

export default LoadingSkeleton;

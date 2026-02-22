import { Link } from 'react-router-dom';
import styles from '../../styles/components/exploreMapToggle.module.css';

function ExploreMapToggle({
  activeView = 'explore',
  exploreTo = '/explore',
  mapTo = '/map',
  leftLabel = 'Esplora',
  rightLabel = 'Mappa',
  thirdLabel = '',
  leftTo,
  rightTo,
  thirdTo = ''
}) {
  const resolvedLeftTo = leftTo || exploreTo;
  const resolvedRightTo = rightTo || mapTo;
  const hasThird = Boolean(String(thirdLabel || '').trim() && String(thirdTo || '').trim());
  const normalizedActive = activeView === 'map' ? 'right' : activeView;
  const noActive = normalizedActive === 'none';
  const isLeftActive = normalizedActive === 'left' || normalizedActive === 'explore' || (!['right', 'third'].includes(normalizedActive));
  const isRightActive = normalizedActive === 'right';
  const isThirdActive = hasThird && normalizedActive === 'third';
  const navLabel = hasThird
    ? `Passa tra ${leftLabel}, ${rightLabel} e ${thirdLabel}`
    : `Passa tra ${leftLabel} e ${rightLabel}`;

  return (
    <nav className={`${styles.wrap} ${hasThird ? styles.wrapThree : ''}`} aria-label={navLabel}>
      {!noActive && isLeftActive ? (
        <span className={`${styles.item} ${styles.active}`} aria-current="page">
          {leftLabel}
        </span>
      ) : (
        <Link className={styles.item} to={resolvedLeftTo}>
          {leftLabel}
        </Link>
      )}

      {!noActive && isRightActive ? (
        <span className={`${styles.item} ${styles.active}`} aria-current="page">
          {rightLabel}
        </span>
      ) : (
        <Link className={styles.item} to={resolvedRightTo}>
          {rightLabel}
        </Link>
      )}

      {hasThird ? (
        !noActive && isThirdActive ? (
          <span className={`${styles.item} ${styles.active}`} aria-current="page">
            {thirdLabel}
          </span>
        ) : (
          <Link className={styles.item} to={thirdTo}>
            {thirdLabel}
          </Link>
        )
      ) : null}
    </nav>
  );
}

export default ExploreMapToggle;

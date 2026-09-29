import styles from './xpMarketplaceUi.module.css';
import { getXpProgressPercent } from '../xpMarketplaceConfig';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

export default function XpProgressBar({ value, max, label, color = 'var(--primary)', compact = false }) {
  const safeMax = Math.max(1, Number(max || 1));
  const safeValue = clamp(value, 0, safeMax);
  const percent = getXpProgressPercent(safeValue, safeMax);

  return (
    <div
      className={`${styles.progressTrack} ${compact ? styles.progressTrackCompact : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
    >
      <span style={{ width: `${percent}%`, '--xp-progress-color': color }} />
    </div>
  );
}

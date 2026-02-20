import styles from '../../styles/components/chat/dayDivider.module.css';

function DayDivider({ label }) {
  return (
    <div className={styles.wrap} role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

export default DayDivider;

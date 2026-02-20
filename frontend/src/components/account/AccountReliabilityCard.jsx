import AccountCard from './AccountCard';
import styles from '../../styles/components/accountReliabilityCard.module.css';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function AccountReliabilityCard({ reliability = 0, attended = 0, noShow = 0, cancelled = 0 }) {
  const pct = clamp(reliability, 0, 100);

  return (
    <AccountCard title="Progressi / Reputazione" subtitle="Andamento partecipazioni e affidabilita.">
      <div className={styles.progressWrap}>
        <p className={styles.value}>Affidabilita: <strong>{pct}%</strong></p>
        <div className={styles.bar} role="progressbar" aria-label="Affidabilita profilo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className={styles.metrics}>
        <p><span>Partecipati</span><strong>{Number(attended || 0)}</strong></p>
        <p><span>No-show</span><strong>{Number(noShow || 0)}</strong></p>
        <p><span>Cancellati</span><strong>{Number(cancelled || 0)}</strong></p>
      </div>
    </AccountCard>
  );
}

export default AccountReliabilityCard;

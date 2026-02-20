import { useMemo, useState } from 'react';
import Button from '../Button';
import AccountCard from './AccountCard';
import styles from '../../styles/components/accountWalletCard.module.css';

function eur(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2)} EUR`;
}

function AccountWalletCard({ wallet, onInvest, onWithdraw, onPricing }) {
  const [showHistory, setShowHistory] = useState(false);
  const historyRows = useMemo(() => (Array.isArray(wallet?.history) ? wallet.history.slice(0, showHistory ? 12 : 4) : []), [wallet?.history, showHistory]);
  const available = Number(wallet?.available_cents || 0);
  const reinvested = Number(wallet?.reinvested_cents || 0);
  const frozen = Number(wallet?.frozen_cents || 0);
  const total = available + reinvested + frozen;
  const availablePct = total > 0 ? Math.round((available / total) * 100) : 0;
  const reinvestedPct = total > 0 ? Math.round((reinvested / total) * 100) : 0;
  const frozenPct = total > 0 ? Math.round((frozen / total) * 100) : 0;

  return (
    <AccountCard
      title="Wallet / Salvadanaio"
      subtitle="Vista rapida del tuo capitale: disponibile, reinvestito e quota congelata."
      actions={
        <div className={styles.ctaRow}>
          <Button type="button" variant="secondary" onClick={onPricing}>
            Vai a Pricing
          </Button>
        </div>
      }
    >
      <div className={styles.heroStats} role="status" aria-label="Riepilogo saldo wallet">
        <p className={styles.totalLabel}>Capitale totale</p>
        <p className={styles.totalValue}>{eur(total)}</p>
        <p className={styles.totalHint}>Aggiornato in tempo reale sul tuo profilo locale</p>
      </div>

      <div className={styles.metrics}>
        <p className={styles.metricCard}>
          <span>Disponibile</span>
          <strong>{eur(available)}</strong>
          <small>{availablePct}% del totale</small>
        </p>
        <p className={styles.metricCard}>
          <span>Reinvestito</span>
          <strong>{eur(reinvested)}</strong>
          <small>{reinvestedPct}% del totale</small>
        </p>
        <p className={styles.metricCard}>
          <span>Stake congelati</span>
          <strong>{eur(frozen)}</strong>
          <small>{frozenPct}% del totale</small>
        </p>
      </div>

      <div className={styles.bars} aria-label="Distribuzione saldo wallet">
        <div className={styles.barRow}>
          <span>Disponibile</span>
          <div className={styles.track}><span className={styles.fillAvailable} style={{ width: `${availablePct}%` }} /></div>
          <strong>{availablePct}%</strong>
        </div>
        <div className={styles.barRow}>
          <span>Reinvestito</span>
          <div className={styles.track}><span className={styles.fillReinvested} style={{ width: `${reinvestedPct}%` }} /></div>
          <strong>{reinvestedPct}%</strong>
        </div>
        <div className={styles.barRow}>
          <span>Congelati</span>
          <div className={styles.track}><span className={styles.fillFrozen} style={{ width: `${frozenPct}%` }} /></div>
          <strong>{frozenPct}%</strong>
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="button" onClick={onInvest} disabled={available <= 0}>
          Reinvesti saldo
        </Button>
        <Button type="button" variant="secondary" onClick={onWithdraw} disabled={reinvested <= 0}>
          Riporta disponibile
        </Button>
      </div>

      <div className={styles.historyBlock}>
        <div className={styles.historyHead}>
          <h3>Storico recente</h3>
          {Array.isArray(wallet?.history) && wallet.history.length > 4 ? (
            <button type="button" className={styles.toggle} onClick={() => setShowHistory((prev) => !prev)}>
              {showHistory ? 'Mostra meno' : 'Vedi tutto'}
            </button>
          ) : null}
        </div>
        <div className={styles.historyList}>
          {historyRows.length === 0 ? <p className={styles.empty}>Nessun movimento ancora.</p> : null}
          {historyRows.map((entry) => (
            <p key={entry.id} className={styles.row}>
              <span>{entry.note || entry.type}</span>
              <strong>{eur(entry.amount_cents)}</strong>
            </p>
          ))}
        </div>
      </div>
    </AccountCard>
  );
}

export default AccountWalletCard;

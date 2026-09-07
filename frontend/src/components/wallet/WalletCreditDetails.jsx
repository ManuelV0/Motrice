import {
  ArrowDownToLine,
  ChevronRight,
  Clock3,
  Gift,
  LockKeyhole,
  ShieldCheck,
  WalletCards,
  X
} from 'lucide-react';
import styles from '../../styles/components/headerWallet.module.css';

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function readValue(wallet, snakeCaseKey, camelCaseKey) {
  return wallet?.[snakeCaseKey] ?? wallet?.[camelCaseKey];
}

export function formatWalletCredit(cents) {
  const value = safeNumber(cents) / 100;
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function getCreditWalletDetails(wallet) {
  const availableCents = safeNumber(readValue(wallet, 'available_cents', 'availableCents'));
  const lockedCents = safeNumber(readValue(wallet, 'locked_cents', 'lockedCents'));
  const pendingCents = safeNumber(readValue(wallet, 'pending_cents', 'pendingCents'));
  const withdrawableCents = safeNumber(readValue(wallet, 'withdrawable_cents', 'withdrawableCents'));
  const trialEventsRemaining = safeNumber(readValue(wallet, 'trial_events_remaining', 'trialEventsRemaining'));
  const depositsEnabled = Boolean(readValue(wallet, 'deposits_enabled', 'depositsEnabled'));
  const withdrawalsEnabled = Boolean(readValue(wallet, 'withdrawals_enabled', 'withdrawalsEnabled'));
  const totalCents = availableCents + lockedCents + pendingCents + withdrawableCents;

  return {
    kicker: 'Credito Motrice',
    title: `${formatWalletCredit(totalCents)} totali`,
    totalCents,
    availableCents,
    lockedCents,
    pendingCents,
    withdrawableCents,
    trialEventsRemaining,
    depositsEnabled,
    withdrawalsEnabled,
    rows: [
      { label: 'Disponibili', value: formatWalletCredit(availableCents) },
      { label: 'Bloccati negli eventi', value: formatWalletCredit(lockedCents) },
      { label: 'In attesa (48 ore)', value: formatWalletCredit(pendingCents) },
      { label: 'Prelevabili', value: formatWalletCredit(withdrawableCents) },
      { label: 'Eventi prova rimasti', value: new Intl.NumberFormat('it-IT').format(trialEventsRemaining) },
      { label: 'Pagamenti', value: depositsEnabled || withdrawalsEnabled ? 'Test attivo' : 'Test protetto' }
    ]
  };
}

function WalletCreditDetails({
  wallet,
  loading = false,
  onClose,
  onFullDetails,
  children
}) {
  const details = getCreditWalletDetails(wallet);
  const statusLabel = details.depositsEnabled ? 'Stripe attivo' : 'Ambiente protetto';

  return (
    <>
      <header className={styles.walletPanelHeader}>
        <div>
          <span>{details.kicker}</span>
          <h2>Il tuo saldo</h2>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Chiudi dettaglio">
            <X size={17} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <div className={styles.walletPanelBody}>
        <section className={styles.creditHero} aria-label="Riepilogo credito">
          <div className={styles.creditHeroIcon} aria-hidden="true">
            <WalletCards size={21} />
          </div>
          <div className={styles.creditHeroCopy}>
            <span>Credito complessivo</span>
            <strong>{loading ? '…' : formatWalletCredit(details.totalCents)}</strong>
            <small>
              <ShieldCheck size={13} aria-hidden="true" />
              {statusLabel}
            </small>
          </div>
        </section>

        <div className={styles.creditQuickGrid}>
          <article className={`${styles.creditQuickCard} ${styles.creditQuickCardPrimary}`}>
            <ArrowDownToLine size={16} aria-hidden="true" />
            <span>Disponibili</span>
            <strong>{loading ? '…' : formatWalletCredit(details.availableCents)}</strong>
          </article>
          <article className={styles.creditQuickCard}>
            <LockKeyhole size={16} aria-hidden="true" />
            <span>Negli eventi</span>
            <strong>{loading ? '…' : formatWalletCredit(details.lockedCents)}</strong>
          </article>
          <article className={styles.creditQuickCard}>
            <Clock3 size={16} aria-hidden="true" />
            <span>In attesa</span>
            <strong>{loading ? '…' : formatWalletCredit(details.pendingCents)}</strong>
          </article>
          <article className={styles.creditQuickCard}>
            <ArrowDownToLine size={16} aria-hidden="true" />
            <span>Prelevabili</span>
            <strong>{loading ? '…' : formatWalletCredit(details.withdrawableCents)}</strong>
          </article>
        </div>

        {details.trialEventsRemaining > 0 ? (
          <div className={styles.creditTrialNote}>
            <span className={styles.creditTrialIcon} aria-hidden="true">
              <Gift size={15} />
            </span>
            <div>
              <strong>{details.trialEventsRemaining} eventi prova inclusi</strong>
              <span>Puoi conoscere Motrice prima del primo deposito.</span>
            </div>
          </div>
        ) : null}

        {onFullDetails ? (
          <button
            type="button"
            className={styles.walletFullButton}
            onClick={onFullDetails}
          >
            Apri Credito Motrice
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : null}

        {children}
      </div>
    </>
  );
}

export default WalletCreditDetails;

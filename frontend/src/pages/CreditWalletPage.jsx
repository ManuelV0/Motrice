import { useCallback, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  CreditCard,
  Gift,
  History,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  WalletCards
} from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import { getAuthSession } from '../services/authSession';
import { getProfileV3State } from '../services/profileV3';
import {
  formatWalletCredit,
  getCreditWalletDetails
} from '../components/wallet/WalletCreditDetails';
import styles from '../styles/pages/creditWallet.module.css';

const FIXED_DEPOSIT_CENTS = 1000;

const LEDGER_LABELS = {
  deposit_succeeded: 'Deposito completato',
  event_hold_locked: 'Credito bloccato per evento',
  hold_locked: 'Credito bloccato per evento',
  pending_return: 'Rimborso in verifica',
  hold_released: 'Credito restituito',
  event_hold_released: 'Credito restituito',
  no_show_forfeited: 'Quota no-show',
  withdrawal_requested: 'Prelievo richiesto',
  withdrawal_completed: 'Prelievo completato'
};

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ledgerLabel(type) {
  const key = String(type || '').toLowerCase();
  if (LEDGER_LABELS[key]) return LEDGER_LABELS[key];
  if (key.includes('deposit')) return 'Movimento deposito';
  if (key.includes('withdraw')) return 'Movimento prelievo';
  if (key.includes('no_show') || key.includes('forfeit')) return 'Quota no-show';
  if (key.includes('hold') || key.includes('lock')) return 'Movimento evento';
  return 'Movimento credito';
}

function ledgerImpact(entry) {
  const deltas = [
    entry?.available_delta,
    entry?.locked_delta,
    entry?.pending_delta,
    entry?.withdrawable_delta
  ].map(safeNumber);
  const net = deltas.reduce((total, value) => total + value, 0);
  if (net !== 0) return `${net > 0 ? '+' : '−'}${formatWalletCredit(Math.abs(net))}`;
  return 'Trasferimento';
}

function formatLedgerDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function CreditWalletPage() {
  const location = useLocation();
  const { showToast } = useToast();
  const session = getAuthSession();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [depositing, setDepositing] = useState(false);

  usePageMeta({
    title: 'Credito Motrice | Motrice',
    description: 'Saldo, deposito protetto e movimenti del Credito Motrice.'
  });

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await api.getLocalProfile();
      const [stateResult, ledgerResult] = await Promise.allSettled([
        getProfileV3State(profile),
        typeof api.listMoneyLedger === 'function'
          ? api.listMoneyLedger({ limit: 12 })
          : Promise.resolve([])
      ]);

      if (stateResult.status === 'rejected') throw stateResult.reason;
      setWallet(stateResult.value?.credit_wallet || null);
      setLedger(ledgerResult.status === 'fulfilled' && Array.isArray(ledgerResult.value)
        ? ledgerResult.value
        : []);
    } catch (error) {
      showToast(error?.message || 'Impossibile caricare il credito', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const outcome = new URLSearchParams(location.search).get('deposit');
    if (outcome === 'success') {
      showToast('Pagamento ricevuto. Il saldo si aggiornerà tra pochi secondi.', 'success');
      const timer = window.setTimeout(hydrate, 1600);
      return () => window.clearTimeout(timer);
    }
    if (outcome === 'cancelled') showToast('Deposito annullato: non è stato addebitato nulla.', 'info');
    return undefined;
  }, [hydrate, location.search, showToast]);

  const details = useMemo(() => getCreditWalletDetails(wallet), [wallet]);
  const withdrawal = wallet?.withdrawal || {};
  const canDeposit = details.depositsEnabled && typeof api.createWalletDepositCheckout === 'function';

  async function startDeposit() {
    if (!canDeposit || depositing) return;
    setDepositing(true);
    try {
      const checkout = await api.createWalletDepositCheckout();
      if (!checkout?.checkout_url) throw new Error('Pagina di pagamento non disponibile');

      if (Capacitor.isNativePlatform()) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: checkout.checkout_url, presentationStyle: 'popover' });
      } else {
        window.location.assign(checkout.checkout_url);
      }
    } catch (error) {
      showToast(error?.message || 'Impossibile aprire il pagamento', 'error');
      setDepositing(false);
    }
  }

  if (!session?.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: '/wallet/credit' }} />;
  }

  if (loading && !wallet) {
    return (
      <section className={styles.page}>
        <div className={styles.backRow}>
          <Link to="/account" className={styles.backLink}>
            <ArrowLeft size={17} aria-hidden="true" /> Profilo
          </Link>
        </div>
        <LoadingSkeleton rows={6} variant="detail" />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <Link to="/account" className={styles.backButton} aria-label="Torna al profilo">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div>
          <span>Wallet personale</span>
          <h1>Credito Motrice</h1>
        </div>
        <span className={styles.secureBadge}>
          <ShieldCheck size={15} aria-hidden="true" /> Protetto
        </span>
      </header>

      <section className={styles.balanceHero} aria-label="Saldo complessivo">
        <div className={styles.balanceTopline}>
          <span>Saldo complessivo</span>
          <div className={styles.walletGlyph} aria-hidden="true">
            <WalletCards size={23} />
          </div>
        </div>
        <strong className={styles.balanceAmount}>{formatWalletCredit(details.totalCents)}</strong>
        <p>Il credito accompagna le tue prenotazioni e resta separato da MOT e XP.</p>

        <div className={styles.balanceHighlights}>
          <div>
            <span>Utilizzabile ora</span>
            <strong>{formatWalletCredit(details.availableCents)}</strong>
          </div>
          <div>
            <span>Eventi prova</span>
            <strong>{details.trialEventsRemaining}</strong>
          </div>
        </div>
      </section>

      <section className={styles.balanceSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span>Il tuo credito</span>
            <h2>Dove si trova il saldo</h2>
          </div>
        </div>

        <div className={styles.balanceGrid}>
          <article className={`${styles.balanceCard} ${styles.balanceCardActive}`}>
            <ArrowDownToLine size={18} aria-hidden="true" />
            <span>Disponibili</span>
            <strong>{formatWalletCredit(details.availableCents)}</strong>
            <small>Pronti per prenotare</small>
          </article>
          <article className={styles.balanceCard}>
            <LockKeyhole size={18} aria-hidden="true" />
            <span>Bloccati</span>
            <strong>{formatWalletCredit(details.lockedCents)}</strong>
            <small>Impegnati negli eventi</small>
          </article>
          <article className={styles.balanceCard}>
            <Clock3 size={18} aria-hidden="true" />
            <span>In attesa</span>
            <strong>{formatWalletCredit(details.pendingCents)}</strong>
            <small>Verifica di 48 ore</small>
          </article>
          <article className={styles.balanceCard}>
            <Landmark size={18} aria-hidden="true" />
            <span>Prelevabili</span>
            <strong>{formatWalletCredit(details.withdrawableCents)}</strong>
            <small>Verso il tuo conto</small>
          </article>
        </div>
      </section>

      <section className={styles.depositCard}>
        <div className={styles.depositIntro}>
          <span className={styles.depositIcon} aria-hidden="true">
            <CreditCard size={21} />
          </span>
          <div>
            <span>Aggiungi credito</span>
            <h2>Ricarica la riserva</h2>
          </div>
        </div>

        <p className={styles.depositDescription}>
          Mantieni la quota necessaria per creare e prenotare eventi dopo il periodo di prova.
        </p>

        <div className={styles.depositChoice} aria-label="Importo deposito selezionato">
          <span>
            <Check size={16} aria-hidden="true" /> Importo fisso
          </span>
          <strong>{formatWalletCredit(FIXED_DEPOSIT_CENTS)}</strong>
          <small>Riserva di partecipazione Motrice</small>
        </div>

        <div className={styles.providerNotice}>
          <LockKeyhole size={17} aria-hidden="true" />
          <p>
            Carta, scadenza e CVC vengono inseriti nella pagina sicura Stripe. Motrice non salva i dati della carta.
          </p>
        </div>

        <button
          type="button"
          className={styles.depositButton}
          onClick={startDeposit}
          disabled={!canDeposit || depositing}
        >
          {depositing ? 'Apertura pagamento…' : `Continua con Stripe · ${formatWalletCredit(FIXED_DEPOSIT_CENTS)}`}
          {!depositing ? <ArrowRight size={18} aria-hidden="true" /> : null}
        </button>

        {!details.depositsEnabled ? (
          <p className={styles.disabledNote} role="status">
            Il deposito è pronto nell’app ma resta bloccato finché l’ambiente Stripe non viene abilitato dall’amministratore.
          </p>
        ) : null}
      </section>

      <section className={styles.flowCard}>
        <div className={styles.sectionHeading}>
          <div>
            <span>Come funziona</span>
            <h2>Un saldo, quattro momenti</h2>
          </div>
        </div>
        <div className={styles.flowSteps}>
          <div><span>1</span><p><strong>Disponibile</strong> nel wallet</p></div>
          <ArrowRight size={15} aria-hidden="true" />
          <div><span>2</span><p><strong>Bloccato</strong> alla prenotazione</p></div>
          <ArrowRight size={15} aria-hidden="true" />
          <div><span>3</span><p><strong>In attesa</strong> dopo l’evento</p></div>
          <ArrowRight size={15} aria-hidden="true" />
          <div><span>4</span><p><strong>Restituito</strong> o maturato</p></div>
        </div>
      </section>

      <section className={styles.withdrawalCard}>
        <div className={styles.withdrawalIcon} aria-hidden="true">
          <Landmark size={20} />
        </div>
        <div>
          <span>Prelievo</span>
          <h2>{formatWalletCredit(details.withdrawableCents)} disponibili</h2>
          <p>
            {details.withdrawalsEnabled
              ? `Puoi prelevare mantenendo ${formatWalletCredit(withdrawal.required_reserve_cents || 1000)} di riserva.`
              : 'I prelievi si attiveranno dopo la verifica del conto di accredito.'}
          </p>
        </div>
      </section>

      <section className={styles.historyCard}>
        <div className={styles.sectionHeading}>
          <div>
            <span>Attività</span>
            <h2>Ultimi movimenti</h2>
          </div>
          <History size={18} aria-hidden="true" />
        </div>

        {ledger.length > 0 ? (
          <div className={styles.historyList}>
            {ledger.map((entry) => {
              const impact = ledgerImpact(entry);
              return (
                <article key={entry.id}>
                  <span className={styles.historyDot} aria-hidden="true" />
                  <div>
                    <strong>{ledgerLabel(entry.entry_type)}</strong>
                    <span>{formatLedgerDate(entry.created_at)}</span>
                  </div>
                  <b className={impact.startsWith('+') ? styles.positiveImpact : ''}>{impact}</b>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyHistory}>
            <Gift size={22} aria-hidden="true" />
            <strong>Nessun movimento ancora</strong>
            <span>I depositi e le quote degli eventi appariranno qui.</span>
          </div>
        )}
      </section>
    </section>
  );
}

export default CreditWalletPage;

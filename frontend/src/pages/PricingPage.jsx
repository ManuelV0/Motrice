import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PiggyBank } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  COACH_CHAT_REVENUE_SHARE_PCT,
  PREMIUM_MONTHLY_PRICE_EUR,
  REWARDED_COOLDOWN_MINUTES,
  REWARDED_DAILY_LIMIT,
  REWARDED_DAILY_UNLOCK_LIMIT,
  REWARDED_UNLOCK_MINUTES,
  REWARDED_VIDEOS_REQUIRED
} from '../services/entitlements';
import { piggybank } from '../services/piggybank';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { useToast } from '../context/ToastContext';
import styles from '../styles/pages/pricing.module.css';

function eur(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2)} EUR`;
}

function PricingPage() {
  const { showToast } = useToast();
  const [wallet, setWallet] = useState(() => piggybank.getWallet());

  usePageMeta({
    title: 'Salvadanaio | Motrice',
    description: 'Pricing e salvadanaio digitale: quote evento motivate e credito disponibile/congelato.'
  });

  function refreshWallet() {
    setWallet(piggybank.getWallet());
  }

  function unlockDeferred() {
    const next = piggybank.unlockDeferredOnParticipation();
    setWallet(next);
    showToast('Quote differite sbloccate dopo partecipazione evento.', 'success');
  }

  function investAvailable() {
    const next = piggybank.investAvailableBalance();
    setWallet(next);
    showToast('Credito disponibile reinvestito nel budget community.', 'success');
  }

  function withdrawInvestment() {
    const next = piggybank.withdrawReinvestedBalance();
    setWallet(next);
    showToast('Credito reinvestito riportato su disponibile.', 'info');
  }

  const hasDeferred = useMemo(
    () => (wallet.entries || []).some((entry) => entry.status === 'frozen_until_next_participation'),
    [wallet]
  );
  const hasAvailable = Number(wallet.available_cents || 0) > 0;
  const hasReinvested = Number(wallet.reinvested_cents || 0) > 0;

  return (
    <section className={styles.page}>
      <Card className={styles.hero}>
        <p>Salvadanaio + Pricing</p>
        <h1>Un solo upgrade, con quota motivazionale evento e credito digitale.</h1>
        <p className="muted">Mantieni i piani classici e aggiungi la meccanica quota 5/10 EUR per incentivare la partecipazione reale.</p>
      </Card>

      <Card className={styles.walletCard}>
        <div className={styles.walletHead}>
          <h2 className="row">
            <PiggyBank size={18} aria-hidden="true" /> Salvadanaio digitale
          </h2>
          <Badge tone="premium">Motivazione evento</Badge>
        </div>
        <div className={styles.walletGrid}>
          <p>Disponibile: <strong>{eur(wallet.available_cents)}</strong></p>
          <p>Reinvestito: <strong>{eur(wallet.reinvested_cents)}</strong></p>
          <p>Totale credito: <strong>{eur(wallet.total_cents)}</strong></p>
          <p>Congelato: <strong>{eur(wallet.frozen_cents)}</strong></p>
          <p>Congelato fino a prossima partecipazione: <strong>{eur(wallet.deferred_cents)}</strong></p>
        </div>
        <p className="muted">
          Se il raduno e confermato in posizione, la quota torna disponibile. Se non sei nel punto raduno, resta congelata fino alla prossima partecipazione evento. Ogni presenza confermata aggiunge reward al credito.
        </p>
        <div className={styles.walletActions}>
          <Link to="/agenda">
            <Button type="button" variant="secondary">
              Vai in Agenda per sblocco quota
            </Button>
          </Link>
          <Button type="button" variant="ghost" onClick={unlockDeferred} disabled={!hasDeferred}>
            Sblocca quote dopo prossima partecipazione
          </Button>
          <Button type="button" variant="ghost" onClick={investAvailable} disabled={!hasAvailable}>
            Reinvesti disponibile
          </Button>
          <Button type="button" variant="ghost" onClick={withdrawInvestment} disabled={!hasReinvested}>
            Tieni indietro (ritira reinvestito)
          </Button>
        </div>
        <p className="muted">
          Buono convenzione: costo 2 EUR dal salvadanaio per utenti Free. Premium: buono incluso.
        </p>
      </Card>

      <Card>
        <h2>FAQ</h2>
        <p>
          <strong>Revenue share coach chat:</strong> sul piano Premium da €{PREMIUM_MONTHLY_PRICE_EUR}/mese, il {COACH_CHAT_REVENUE_SHARE_PCT}% puo essere destinato al coach che attiva chat con i propri clienti.
        </p>
        <p>
          <strong>Come funziona il salvadanaio quota evento?</strong> Congeli 5 EUR o 10 EUR prima dell evento. Se il raduno viene confermato in posizione, la quota torna disponibile.
        </p>
        <p>
          <strong>Se non sono al raduno?</strong> La quota resta congelata fino alla prossima partecipazione evento.
        </p>
        <p>
          <strong>Free con pubblicita:</strong> {REWARDED_VIDEOS_REQUIRED} video per {REWARDED_UNLOCK_MINUTES} minuti Pro (max {REWARDED_DAILY_LIMIT} video/giorno, cooldown {REWARDED_COOLDOWN_MINUTES} minuti, max {REWARDED_DAILY_UNLOCK_LIMIT} sblocco/giorno).
        </p>
      </Card>
    </section>
  );
}

export default PricingPage;

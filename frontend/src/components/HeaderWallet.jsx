import { useCallback, useEffect, useRef, useState } from 'react';
import { WalletCards, X } from 'lucide-react';
import styles from '../styles/components/headerWallet.module.css';

const EMPTY_SUMMARY = {
  availableCents: 0,
  lockedCents: 0,
  mot: 0,
  xp: 0
};

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatCredit(cents) {
  const value = safeNumber(cents) / 100;
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat('it-IT').format(safeNumber(value));
}

function HeaderWallet({ open, onOpenChange, authenticated = false }) {
  const rootRef = useRef(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);

  const refreshSummary = useCallback(async () => {
    if (!authenticated) {
      setSummary(EMPTY_SUMMARY);
      return;
    }

    setLoading(true);
    try {
      const [{ api }, { getProfileV3State }] = await Promise.all([
        import('../services/api'),
        import('../services/profileV3')
      ]);
      const profile = await api.getLocalProfile();
      const state = await getProfileV3State(profile);
      setSummary({
        availableCents: safeNumber(state?.credit_wallet?.available_cents),
        lockedCents: safeNumber(state?.credit_wallet?.locked_cents),
        mot: safeNumber(state?.mot?.total),
        xp: safeNumber(state?.xp?.total)
      });
    } catch {
      // Keep the last valid summary when an optional header refresh fails.
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    function refreshFromApp() {
      refreshSummary();
    }

    window.addEventListener('motrice:pull-refreshed', refreshFromApp);
    window.addEventListener('motrice-auth-changed', refreshFromApp);
    window.addEventListener('motrice-profile-updated', refreshFromApp);
    return () => {
      window.removeEventListener('motrice:pull-refreshed', refreshFromApp);
      window.removeEventListener('motrice-auth-changed', refreshFromApp);
      window.removeEventListener('motrice-profile-updated', refreshFromApp);
    };
  }, [refreshSummary]);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) onOpenChange(false);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') onOpenChange(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const creditTotal = summary.availableCents + summary.lockedCents;
  const statusLabel = `Credito ${formatCredit(creditTotal)}, ${formatNumber(summary.mot)} MOT, ${formatNumber(summary.xp)} XP`;

  return (
    <div
      ref={rootRef}
      className={`${styles.wallet} ${open ? styles.walletOpen : ''}`}
      aria-label="Riepilogo Wallet Motrice"
    >
      <button
        type="button"
        className={styles.walletIconButton}
        onClick={() => {
          refreshSummary();
          onOpenChange(true);
        }}
        aria-label={`Apri Wallet Motrice. ${statusLabel}`}
        aria-expanded={open}
      >
        <WalletCards size={19} aria-hidden="true" />
        <span className={styles.walletDot} aria-hidden="true" />
      </button>

      <div className={styles.walletSummary} aria-hidden={!open} aria-live="polite">
        <div className={styles.walletMetric} title={`Disponibili ${formatCredit(summary.availableCents)} · Bloccati ${formatCredit(summary.lockedCents)}`}>
          <span>Credito</span>
          <strong>{loading ? '…' : formatCredit(creditTotal)}</strong>
        </div>
        <div className={styles.walletMetric} title="MOT maturati con presenze verificate">
          <span>MOT</span>
          <strong>{loading ? '…' : formatNumber(summary.mot)}</strong>
        </div>
        <div className={styles.walletMetric} title="XP di progressione maturati">
          <span>XP</span>
          <strong>{loading ? '…' : formatNumber(summary.xp)}</strong>
        </div>
      </div>

      <button
        type="button"
        className={styles.walletCloseButton}
        onClick={() => onOpenChange(false)}
        aria-label="Chiudi riepilogo Wallet Motrice"
        tabIndex={open ? 0 : -1}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default HeaderWallet;

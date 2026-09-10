import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, WalletCards, X } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';
import WalletCreditDetails, { formatWalletCredit } from './wallet/WalletCreditDetails';
import styles from '../styles/components/headerWallet.module.css';

const EMPTY_SUMMARY = {
  availableCents: 0,
  lockedCents: 0,
  pendingCents: 0,
  withdrawableCents: 0,
  trialEventsRemaining: 2,
  depositsEnabled: false,
  withdrawalsEnabled: false,
  mot: 0,
  verifiedCheckins: 0,
  lastMot: 0,
  xp: 0,
  xpLevel: 1,
  xpNextLevelAt: 250
};

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat('it-IT').format(safeNumber(value));
}

function HeaderWallet({ open, onOpenChange, authenticated = false }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const swipeStartRef = useRef(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const [panelPosition, setPanelPosition] = useState({ top: 76, right: 8 });

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
      const latestMot = Array.isArray(state?.mot?.logs) ? state.mot.logs[0] : null;
      setSummary({
        availableCents: safeNumber(state?.credit_wallet?.available_cents),
        lockedCents: safeNumber(state?.credit_wallet?.locked_cents),
        pendingCents: safeNumber(state?.credit_wallet?.pending_cents),
        withdrawableCents: safeNumber(state?.credit_wallet?.withdrawable_cents),
        trialEventsRemaining: safeNumber(state?.credit_wallet?.trial_events_remaining),
        depositsEnabled: Boolean(state?.credit_wallet?.deposits_enabled),
        withdrawalsEnabled: Boolean(state?.credit_wallet?.withdrawals_enabled),
        mot: safeNumber(state?.mot?.total),
        verifiedCheckins: safeNumber(state?.verified_checkins ?? state?.reliability?.present),
        lastMot: safeNumber(latestMot?.mot),
        xp: safeNumber(state?.xp?.total),
        xpLevel: Math.max(1, safeNumber(state?.xp?.level) || 1),
        xpNextLevelAt: Math.max(250, safeNumber(state?.xp?.next_level_at) || 250)
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
    if (!open) {
      setActiveSection(null);
      return undefined;
    }

    function onPointerDown(event) {
      if (rootRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      setActiveSection(null);
      onOpenChange(false);
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      if (activeSection) setActiveSection(null);
      else onOpenChange(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activeSection, open, onOpenChange]);

  const updatePanelPosition = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelPosition({
      top: Math.round(rect.bottom + 8),
      right: Math.max(8, Math.round(window.innerWidth - rect.right))
    });
  }, []);

  useEffect(() => {
    if (!activeSection) return undefined;
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    return () => window.removeEventListener('resize', updatePanelPosition);
  }, [activeSection, updatePanelPosition]);

  const creditTotal = summary.availableCents + summary.lockedCents + summary.pendingCents + summary.withdrawableCents;
  const animatedValues = {
    credit: <AnimatedNumber value={creditTotal} formatter={(value) => formatWalletCredit(Math.round(value))} />,
    mot: <AnimatedNumber value={summary.mot} formatter={(value) => formatNumber(Math.round(value))} />,
    xp: <AnimatedNumber value={summary.xp} formatter={(value) => formatNumber(Math.round(value))} />
  };
  const xpRemaining = Math.max(0, summary.xpNextLevelAt - summary.xp);
  const xpProgress = summary.xpNextLevelAt > 0
    ? Math.min(100, Math.round((summary.xp / summary.xpNextLevelAt) * 100))
    : 0;
  const statusLabel = `Credito ${formatWalletCredit(creditTotal)}, ${formatNumber(summary.mot)} MOT, ${formatNumber(summary.xp)} XP`;

  const sections = useMemo(() => ({
    mot: {
      kicker: 'Presenza reale verificata',
      title: `${formatNumber(summary.mot)} MOT`,
      rows: [
        { label: 'Ultimo check-in QR', value: summary.lastMot > 0 ? `+${formatNumber(summary.lastMot)} MOT` : 'Nessuno' },
        { label: 'Presenze verificate', value: formatNumber(summary.verifiedCheckins) }
      ]
    },
    xp: {
      kicker: 'Progressione personale',
      title: `${formatNumber(summary.xp)} XP`,
      rows: [
        { label: 'Livello attuale', value: `Lv ${formatNumber(summary.xpLevel)}` },
        { label: `XP al Lv ${formatNumber(summary.xpLevel + 1)}`, value: formatNumber(xpRemaining) },
        { label: 'Avanzamento', progress: xpProgress }
      ]
    }
  }), [creditTotal, summary, xpProgress, xpRemaining]);

  const selected = activeSection === 'credit'
    ? { kind: 'credit' }
    : (activeSection ? sections[activeSection] : null);

  function closePanel() {
    setActiveSection(null);
  }

  function closeWallet() {
    closePanel();
    onOpenChange(false);
  }

  function selectSection(section) {
    updatePanelPosition();
    setActiveSection((current) => (current === section ? null : section));
  }

  function openFullDetails() {
    closeWallet();
    navigate(activeSection === 'credit' ? '/wallet/credit' : '/account');
  }

  const detailLayer = typeof document !== 'undefined'
    ? createPortal(
        <>
          <button
            type="button"
            className={`${styles.walletBackdrop} ${selected ? styles.walletBackdropOpen : ''}`}
            onClick={closePanel}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="Chiudi dettaglio Wallet Motrice"
            tabIndex={selected ? 0 : -1}
          />
          <section
            ref={panelRef}
            className={`${styles.walletPanel} ${selected ? styles.walletPanelOpen : ''}`}
            style={{ top: `${panelPosition.top}px`, right: `${panelPosition.right}px` }}
            data-section={activeSection || undefined}
            aria-hidden={!selected}
            aria-live="polite"
            onPointerDown={(event) => {
              swipeStartRef.current = event.clientY;
            }}
            onPointerUp={(event) => {
              const startY = swipeStartRef.current;
              swipeStartRef.current = null;
              if (startY !== null && event.clientY - startY < -42) closePanel();
            }}
            onPointerCancel={() => {
              swipeStartRef.current = null;
            }}
          >
            <span className={styles.walletPanelHandle} aria-hidden="true" />
            {activeSection === 'credit' ? (
              <WalletCreditDetails
                wallet={summary}
                loading={loading}
                onClose={closePanel}
                onFullDetails={openFullDetails}
              />
            ) : (
              <>
                <header className={styles.walletPanelHeader}>
                  <div>
                    <span>{selected?.kicker || ''}</span>
                    <h2>{loading ? '…' : selected?.title || ''}</h2>
                  </div>
                  <button type="button" onClick={closePanel} aria-label="Chiudi dettaglio">
                    <X size={17} aria-hidden="true" />
                  </button>
                </header>

                <div key={activeSection || 'empty'} className={styles.walletPanelBody}>
                  <div className={styles.walletRows}>
                    {(selected?.rows || []).map((row) => (
                      <div key={row.label} className={styles.walletRow}>
                        <span>{row.label}</span>
                        {typeof row.progress === 'number' ? (
                          <span
                            className={styles.walletProgress}
                            role="progressbar"
                            aria-valuemin="0"
                            aria-valuemax="100"
                            aria-valuenow={row.progress}
                            aria-label={`Avanzamento XP ${row.progress}%`}
                          >
                            <i style={{ width: `${row.progress}%` }} />
                          </span>
                        ) : (
                          <strong>{loading ? '…' : row.value}</strong>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.walletFullButton}
                    onClick={openFullDetails}
                  >
                    Visualizza dettagli completi
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </section>
        </>,
        document.body
      )
    : null;

  return (
    <>
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
          <button
            type="button"
            className={`${styles.walletMetric} ${styles.walletMetricCredit} ${activeSection === 'credit' ? styles.walletMetricSelected : ''}`}
            onClick={() => selectSection('credit')}
            title={`Disponibili ${formatWalletCredit(summary.availableCents)} · Bloccati ${formatWalletCredit(summary.lockedCents)}`}
            aria-pressed={activeSection === 'credit'}
            tabIndex={open ? 0 : -1}
          >
            <span>Credito</span>
            <strong>{loading ? '…' : animatedValues.credit}</strong>
          </button>
          <button
            type="button"
            className={`${styles.walletMetric} ${styles.walletMetricMot} ${activeSection === 'mot' ? styles.walletMetricSelected : ''}`}
            onClick={() => selectSection('mot')}
            title="MOT maturati con presenze verificate"
            aria-pressed={activeSection === 'mot'}
            tabIndex={open ? 0 : -1}
          >
            <span>MOT</span>
            <strong>{loading ? '…' : animatedValues.mot}</strong>
          </button>
          <button
            type="button"
            className={`${styles.walletMetric} ${styles.walletMetricXp} ${activeSection === 'xp' ? styles.walletMetricSelected : ''}`}
            onClick={() => selectSection('xp')}
            title="XP di progressione maturati"
            aria-pressed={activeSection === 'xp'}
            tabIndex={open ? 0 : -1}
          >
            <span>XP</span>
            <strong>{loading ? '…' : animatedValues.xp}</strong>
          </button>
        </div>

        <button
          type="button"
          className={styles.walletCloseButton}
          onClick={closeWallet}
          aria-label="Chiudi riepilogo Wallet Motrice"
          tabIndex={open ? 0 : -1}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {detailLayer}
    </>
  );
}

export default HeaderWallet;

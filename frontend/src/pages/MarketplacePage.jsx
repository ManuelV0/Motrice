import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trophy,
  X
} from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { getAuthSession } from '../services/authSession';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';
import ProductDetailSheet from '../features/xp/components/ProductDetailSheet';
import ProductVisual from '../features/xp/components/ProductVisual';
import XpProgressBar from '../features/xp/components/XpProgressBar';
import {
  XP_TIERS,
  getXpTierIntervalProgress,
  getXpTierProgress,
  resolveAchievementStates,
  resolveMarketplaceProducts
} from '../features/xp/xpMarketplaceConfig';
import { useXpProgression } from '../features/xp/useXpProgression';
import styles from '../styles/pages/marketplace.module.css';

const numberFormatter = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });

function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

function ProductCard({ product, tier, onOpen }) {
  return (
    <button
      type="button"
      className={`${styles.productCard} ${product.isUnlocked ? styles.productCardUnlocked : styles.productCardLocked}`}
      style={{ '--tier-color': tier.color }}
      onClick={() => onOpen(product)}
      aria-label={`${product.name}, ${product.isUnlocked ? 'sbloccato' : `bloccato, mancano ${product.remainingXp} XP`}`}
    >
      <div className={styles.productMedia}>
        <ProductVisual item={product} color={tier.color} />
        <span className={styles.productStatusIcon}>
          {product.isUnlocked ? <Check size={14} /> : <LockKeyhole size={14} />}
        </span>
      </div>
      <span className={styles.productCopy}>
        <small>{product.category}</small>
        <strong>{product.name}</strong>
      </span>
      <span className={styles.productMeta}>
        {product.isUnlocked
          ? <b>SBLOCCATO</b>
          : <><b>{tier.label}</b><small>{formatNumber(product.requiredXp)} XP</small></>}
      </span>
    </button>
  );
}

function ProductGrid({ products, tier, onOpen }) {
  return (
    <div className={styles.productGrid}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} tier={tier} onOpen={onOpen} />
      ))}
    </div>
  );
}

function CollectionPreview({ products, tier }) {
  const previewProducts = products.slice(0, 3);
  return (
    <div className={styles.collectionPreview} aria-hidden="true">
      <div>
        {previewProducts.map((product) => (
          <span key={product.id} className={product.isUnlocked ? styles.previewUnlocked : ''}>
            <ProductVisual item={product} color={tier.color} />
          </span>
        ))}
      </div>
      <strong>{products.length} capi</strong>
    </div>
  );
}

function MarketplacePage() {
  const { loading, error, xpState, profileStats, refresh } = useXpProgression();
  const [selectedItem, setSelectedItem] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [expandedTierId, setExpandedTierId] = useState(null);
  const [selectedGender, setSelectedGender] = useState('tutti');
  const [showAllTiers, setShowAllTiers] = useState(false);
  const celebrationActionRef = useRef(null);
  const celebrationDialogRef = useRef(null);

  usePageMeta({
    title: 'Marketplace XP | Motrice',
    description: 'Collezioni Motrice sbloccate dalla progressione XP permanente.'
  });

  const userXp = Number(xpState?.xp_global || 0);
  const level = Number(xpState?.progress?.level || Math.floor(userXp / 250) + 1);
  const grade = getXpTierProgress(userXp);
  const nextTierProgress = grade.nextTier
    ? getXpTierIntervalProgress(grade.nextTier.id, userXp)
    : null;
  const products = useMemo(() => resolveMarketplaceProducts(userXp), [userXp]);
  const achievements = useMemo(() => resolveAchievementStates(userXp, {
    communityEvents: Number(profileStats?.attended || 0)
  }).map((item) => ({ ...item, isSpecial: true })), [profileStats?.attended, userXp]);
  const productsByTier = useMemo(() => Object.fromEntries(
    XP_TIERS.map((tier) => [tier.id, products.filter((product) => product.tier === tier.id)])
  ), [products]);
  const unlockedTierCount = XP_TIERS.filter((tier) => userXp >= tier.requiredXp).length;
  const compactTierIds = useMemo(() => {
    const focusIndex = Math.max(0, XP_TIERS.findIndex((tier) => tier.id === grade.focusTier.id));
    const indexes = grade.nextTier
      ? [Math.max(0, focusIndex - 1), focusIndex, Math.min(XP_TIERS.length - 1, focusIndex + 1)]
      : [Math.max(0, focusIndex - 1), focusIndex];
    return new Set(indexes.map((index) => XP_TIERS[index].id));
  }, [grade.focusTier.id, grade.nextTier?.id]);
  const visibleTiers = showAllTiers
    ? XP_TIERS
    : XP_TIERS.filter((tier) => compactTierIds.has(tier.id));
  const filterCounts = useMemo(() => {
    const tierProducts = productsByTier[grade.focusTier.id] || [];
    return {
      tutti: tierProducts.length,
      uomo: tierProducts.filter((product) => product.gender === 'uomo').length,
      donna: tierProducts.filter((product) => product.gender === 'donna').length
    };
  }, [grade.focusTier.id, productsByTier]);
  const orderedAchievements = useMemo(() => [...achievements].sort((first, second) => {
    if (first.isUnlocked !== second.isUnlocked) return Number(second.isUnlocked) - Number(first.isUnlocked);
    if (first.hasProgress !== second.hasProgress) return Number(second.hasProgress) - Number(first.hasProgress);
    return 0;
  }), [achievements]);
  const unlockedAchievementCount = achievements.filter((achievement) => achievement.isUnlocked).length;

  useEffect(() => {
    if (loading) return;
    setExpandedTierId((current) => current ?? grade.focusTier.id);
  }, [grade.focusTier.id, loading]);

  useEffect(() => {
    if (loading) return;
    const session = getAuthSession();
    const userKey = session.authUserId || session.userId || 'guest';
    const key = `motrice.xp-marketplace-unlocks.${userKey}`;
    const seen = Number(safeStorageGet(key) || 0);
    const newestTier = XP_TIERS.filter((tier) => userXp >= tier.requiredXp).at(-1);
    if (newestTier && newestTier.requiredXp > seen) {
      setCelebration({ type: 'tier', tier: newestTier, storageKey: key });
    }
  }, [loading, userXp]);

  function dismissCelebration() {
    if (celebration?.storageKey && celebration?.tier?.requiredXp) {
      safeStorageSet(celebration.storageKey, String(celebration.tier.requiredXp));
    }
    setCelebration(null);
  }

  function openTier(tierId, { scroll = true } = {}) {
    setShowAllTiers(true);
    setExpandedTierId(tierId);
    if (!scroll) return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`xp-collection-${tierId}`);
      target?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
      target?.querySelector(`.${styles.collectionToggle}`)?.focus({ preventScroll: true });
    });
  }

  function exploreCelebrationTier() {
    const tierId = celebration?.tier?.id;
    dismissCelebration();
    if (tierId) openTier(tierId);
  }

  useEffect(() => {
    if (!celebration) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => celebrationActionRef.current?.focus());

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissCelebration();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = celebrationDialogRef.current?.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [celebration]);

  if (loading) {
    return (
      <section className={styles.page}>
        <Link className={styles.backLink} to="/account/xp"><ArrowLeft /> Progressione XP</Link>
        <LoadingSkeleton rows={9} variant="detail" />
      </section>
    );
  }

  if (error && !xpState) {
    return (
      <section className={styles.page}>
        <Link className={styles.backLink} to="/account/xp"><ArrowLeft /> Progressione XP</Link>
        <section className={styles.loadError} role="alert">
          <RefreshCw aria-hidden="true" />
          <div><h1>Progressione non disponibile</h1><p>{error}</p></div>
          <button type="button" onClick={refresh}>Riprova</button>
        </section>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <Link className={styles.backLink} to="/account/xp"><ArrowLeft /> Progressione XP</Link>

      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <span><ShoppingBag /> MARKETPLACE XP</span>
          <span><ShieldCheck /> Sblocchi, non acquisti</span>
        </div>
        <div className={styles.heroSummary}>
          <div className={styles.xpTotal}>
            <small>LA TUA PROGRESSIONE</small>
            <strong>{formatNumber(userXp)} <span>XP</span></strong>
            <p>LV {level} · {grade.currentTier?.label || `Verso ${grade.nextTier?.label || 'NORMAL'}`}</p>
          </div>

          {grade.nextTier ? (
            <div className={styles.nextUnlock} style={{ '--next-color': grade.nextTier.color }}>
              <div>
                <span>PROSSIMO SBLOCCO · {grade.nextTier.label}</span>
                <strong>{formatNumber(grade.remainingXp)} XP mancanti</strong>
              </div>
              <XpProgressBar
                value={nextTierProgress.intervalValue}
                max={nextTierProgress.intervalMax}
                label={`Progresso ${grade.nextTier.label}`}
                color={grade.nextTier.color}
              />
            </div>
          ) : (
            <p className={styles.allUnlocked}><Trophy size={17} /> Tutte le collezioni XP sono sbloccate.</p>
          )}
        </div>
        <div className={styles.heroFooter}>
          <p>Gli XP sbloccano le collezioni e non vengono mai consumati.</p>
          <Link to="/account/xp#come-guadagnare-xp">Come guadagnare XP <ChevronRight aria-hidden="true" /></Link>
        </div>
      </header>

      {error ? <p className={styles.errorState}>{error}</p> : null}

      <section className={styles.roadmapSection} aria-labelledby="xp-roadmap-title">
        <div className={styles.sectionTitleRow}>
          <div><span>PERCORSO DEI GRADI</span><h2 id="xp-roadmap-title">{unlockedTierCount} di {XP_TIERS.length} sbloccati</h2></div>
          <small>Scorri e seleziona</small>
        </div>
        <div className={styles.tierRoadmap}>
          {XP_TIERS.map((tier) => {
            const isUnlocked = userXp >= tier.requiredXp;
            const isFocus = grade.focusTier.id === tier.id;
            return (
              <button
                key={tier.id}
                type="button"
                className={`${styles.roadmapTier} ${isUnlocked ? styles.roadmapTierUnlocked : ''} ${isFocus ? styles.roadmapTierFocus : ''}`}
                style={{ '--tier-color': tier.color }}
                aria-current={isFocus ? 'step' : undefined}
                onClick={() => openTier(tier.id)}
              >
                <span>{isUnlocked ? <Check size={14} /> : <LockKeyhole size={13} />}</span>
                <strong>{tier.label}</strong>
                <small>{formatNumber(tier.requiredXp)} XP</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.collectionToolbar} aria-labelledby="xp-collections-title">
        <div>
          <span>COLLEZIONI MOTRICE</span>
          <h2 id="xp-collections-title">Tutto visibile dal primo giorno</h2>
        </div>
        <div className={styles.genderSelector} role="group" aria-label="Filtra le collezioni">
          {[
            { id: 'tutti', label: 'TUTTI' },
            { id: 'uomo', label: 'UOMO' },
            { id: 'donna', label: 'DONNA' }
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={selectedGender === filter.id ? styles.genderActive : ''}
              aria-pressed={selectedGender === filter.id}
              onClick={() => setSelectedGender(filter.id)}
            >
              {filter.label} <span>{filterCounts[filter.id]}</span>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.collectionList}>
        {visibleTiers.map((tier) => {
          const tierProducts = productsByTier[tier.id] || [];
          const tierProgress = getXpTierIntervalProgress(tier.id, userXp);
          const isUnlocked = tierProgress.isUnlocked;
          const remaining = tierProgress.remainingXp;
          const isExpanded = expandedTierId === tier.id;
          const visibleProducts = selectedGender === 'tutti'
            ? tierProducts
            : tierProducts.filter((product) => product.gender === selectedGender);
          return (
            <section
              key={tier.id}
              id={`xp-collection-${tier.id}`}
              className={`${styles.collection} ${isExpanded ? styles.collectionExpanded : ''}`}
              style={{ '--tier-color': tier.color }}
            >
              <button
                type="button"
                className={styles.collectionToggle}
                aria-expanded={isExpanded}
                aria-controls={`xp-collection-content-${tier.id}`}
                onClick={() => setExpandedTierId((current) => current === tier.id ? null : tier.id)}
              >
                <span className={styles.collectionHeader}>
                  <span className={styles.tierIdentity}>
                    <span className={styles.tierMark}>M</span>
                    <span><small>{tier.tone}</small><strong>{tier.label}</strong></span>
                  </span>
                  <span className={styles.collectionHeaderActions}>
                    <span className={`${styles.collectionState} ${isUnlocked ? styles.collectionStateUnlocked : ''}`}>
                      {isUnlocked ? <Check size={14} /> : <LockKeyhole size={14} />}
                      {isUnlocked ? 'SBLOCCATA' : `${formatNumber(tier.requiredXp)} XP`}
                    </span>
                    <ChevronDown className={styles.collectionChevron} aria-hidden="true" />
                  </span>
                </span>
              </button>

              <div className={styles.collectionProgress}>
                <XpProgressBar value={tierProgress.intervalValue} max={tierProgress.intervalMax} label={`Progresso collezione ${tier.label}`} color={tier.color} compact />
                <span>{isUnlocked ? 'Sbloccata' : `Mancano ${formatNumber(remaining)} XP`}</span>
              </div>

              {!isExpanded ? <CollectionPreview products={tierProducts} tier={tier} /> : null}

              {isExpanded ? (
                <div id={`xp-collection-content-${tier.id}`} className={styles.collectionContent}>
                  <ProductGrid products={visibleProducts} tier={tier} onOpen={setSelectedItem} />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <button type="button" className={styles.showAllButton} onClick={() => setShowAllTiers((current) => !current)}>
        {showAllTiers ? 'Mostra solo i gradi rilevanti' : `Mostra tutti i ${XP_TIERS.length} gradi`}
        <ChevronDown className={showAllTiers ? styles.showAllChevronOpen : ''} aria-hidden="true" />
      </button>

      <section className={styles.specialSection}>
        <header className={styles.specialHeader}>
          <span><Sparkles /> CAPI SPECIALI</span>
          <h2>Sfide speciali · {unlockedAchievementCount}/{achievements.length}</h2>
          <p>Obiettivi indipendenti dai gradi. Le metriche non ancora attive sono indicate chiaramente.</p>
        </header>
        <div className={styles.specialGrid}>
          {orderedAchievements.map((achievement) => (
            <button
              key={achievement.id}
              type="button"
              className={`${styles.specialCard} ${achievement.isUnlocked ? styles.specialCardUnlocked : ''}`}
              onClick={() => setSelectedItem(achievement)}
              aria-label={`${achievement.name}, ${achievement.isUnlocked ? 'sbloccato' : 'bloccato'}, ${achievement.description}`}
            >
              <div className={styles.specialVisual}>
                <ProductVisual item={achievement} color={achievement.isUnlocked ? 'var(--primary)' : '#9a7cff'} />
                <span>{achievement.isUnlocked ? <Check size={14} /> : <LockKeyhole size={14} />}</span>
              </div>
              <strong>{achievement.name}</strong>
              <small>{achievement.description}</small>
              <div className={styles.specialProgressCopy}>
                {achievement.hasProgress
                  ? `${formatNumber(achievement.progress)} / ${formatNumber(achievement.requirement)} ${achievement.unit}`
                  : 'PROSSIMAMENTE'}
              </div>
              {achievement.hasProgress ? (
                <XpProgressBar
                  value={achievement.progress}
                  max={achievement.requirement}
                  label={`Progresso ${achievement.name}`}
                  color={achievement.isUnlocked ? 'var(--primary)' : '#9a7cff'}
                  compact
                />
              ) : <span className={styles.specialPending}>Tracciamento in arrivo</span>}
              {achievement.rewardXp > 0 ? <b>+{formatNumber(achievement.rewardXp)} XP</b> : <b>SOLO DIAMOND</b>}
            </button>
          ))}
        </div>
      </section>

      {selectedItem ? (
        <ProductDetailSheet
          item={selectedItem}
          userXp={userXp}
          color={selectedItem.isSpecial ? '#9a7cff' : XP_TIERS.find((tier) => tier.id === selectedItem.tier)?.color}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}

      {celebration ? (
        <div className={styles.celebrationLayer} role="presentation">
          <button type="button" className={styles.celebrationBackdrop} onClick={dismissCelebration} aria-label="Chiudi celebrazione" />
          <section
            ref={celebrationDialogRef}
            className={styles.celebrationCard}
            style={{ '--celebration-color': celebration.tier.color }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="xp-celebration-title"
            aria-describedby="xp-celebration-description"
            tabIndex={-1}
          >
            <button type="button" onClick={dismissCelebration} aria-label="Chiudi"><X /></button>
            <span className={styles.celebrationMark}><Sparkles /></span>
            <small>NUOVO SBLOCCO!</small>
            <h2 id="xp-celebration-title">{celebration.tier.label} SBLOCCATO</h2>
            <p id="xp-celebration-description">La collezione è ora disponibile. I tuoi XP restano invariati.</p>
            <ProductVisual item={{ id: `celebration-${celebration.tier.id}`, name: celebration.tier.label, visual: 'tshirt' }} color={celebration.tier.color} />
            <button ref={celebrationActionRef} type="button" className={styles.celebrationAction} onClick={exploreCelebrationTier}>Esplora la collezione</button>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default MarketplacePage;

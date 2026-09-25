import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  Check,
  ChevronRight,
  LockKeyhole,
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

function ProductCard({ product, tier, userXp, onOpen }) {
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
          : <><b>{formatNumber(product.requiredXp)} XP</b><small>-{formatNumber(product.remainingXp)} XP</small></>}
      </span>
      {!product.isUnlocked ? (
        <XpProgressBar value={userXp} max={product.requiredXp} label={`Progresso ${product.name}`} color={tier.color} compact />
      ) : null}
    </button>
  );
}

function ProductRail({ title, products, tier, userXp, onOpen }) {
  return (
    <div className={styles.genderGroup}>
      <div className={styles.genderHeader}><strong>{title}</strong><span>{products.length} capi</span></div>
      <div className={styles.productRail}>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} tier={tier} userXp={userXp} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function MarketplacePage() {
  const { loading, error, xpState, profileStats } = useXpProgression();
  const [selectedItem, setSelectedItem] = useState(null);
  const [celebration, setCelebration] = useState(null);

  usePageMeta({
    title: 'Marketplace XP | Motrice',
    description: 'Collezioni Motrice sbloccate dalla progressione XP permanente.'
  });

  const userXp = Number(xpState?.xp_global || 0);
  const level = Number(xpState?.progress?.level || Math.floor(userXp / 250) + 1);
  const grade = getXpTierProgress(userXp);
  const products = useMemo(() => resolveMarketplaceProducts(userXp), [userXp]);
  const achievements = useMemo(() => resolveAchievementStates(userXp, {
    communityEvents: Number(profileStats?.attended || 0)
  }).map((item) => ({ ...item, isSpecial: true })), [profileStats?.attended, userXp]);
  const productsByTier = useMemo(() => Object.fromEntries(
    XP_TIERS.map((tier) => [tier.id, products.filter((product) => product.tier === tier.id)])
  ), [products]);

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

  if (loading) {
    return (
      <section className={styles.page}>
        <Link className={styles.backLink} to="/account/xp"><ArrowLeft /> Progressione XP</Link>
        <LoadingSkeleton rows={9} variant="detail" />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <Link className={styles.backLink} to="/account/xp"><ArrowLeft /> Progressione XP</Link>

      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <span><ShoppingBag /> MARKETPLACE XP</span>
          <span><ShieldCheck /> XP permanenti</span>
        </div>
        <h1>Il tuo impegno<br /><span>sblocca il tuo stile.</span></h1>
        <p>Raggiungi gli obiettivi XP per sbloccare capi esclusivi. Gli XP non vengono mai spesi.</p>

        <div className={styles.heroStats}>
          <div><small>XP TOTALI</small><strong>{formatNumber(userXp)}</strong></div>
          <div><small>LIVELLO</small><strong>LV {level}</strong></div>
          <div><small>GRADO</small><strong style={{ color: (grade.currentTier || grade.focusTier).color }}>{grade.currentTier?.label || 'DA SBLOCCARE'}</strong></div>
        </div>

        {grade.nextTier ? (
          <div className={styles.nextUnlock} style={{ '--next-color': grade.nextTier.color }}>
            <div>
              <span>PROSSIMO SBLOCCO · {grade.nextTier.label}</span>
              <strong>{formatNumber(grade.remainingXp)} XP mancanti</strong>
            </div>
            <XpProgressBar value={userXp} max={grade.nextTier.requiredXp} label={`Progresso ${grade.nextTier.label}`} color={grade.nextTier.color} />
          </div>
        ) : (
          <p className={styles.allUnlocked}><Trophy size={17} /> Tutte le collezioni XP sono sbloccate.</p>
        )}
      </header>

      {error ? <p className={styles.errorState}>{error}</p> : null}

      <section className={styles.introSection}>
        <div><span>COLLEZIONI MOTRICE</span><h2>Tutto visibile dal primo giorno</h2></div>
        <p>I capi bloccati restano visibili: puoi esplorarli, controllare la soglia e vedere quanto manca allo sblocco.</p>
      </section>

      <div className={styles.collectionList}>
        {XP_TIERS.map((tier) => {
          const tierProducts = productsByTier[tier.id] || [];
          const isUnlocked = userXp >= tier.requiredXp;
          const remaining = Math.max(0, tier.requiredXp - userXp);
          return (
            <section key={tier.id} className={styles.collection} style={{ '--tier-color': tier.color }}>
              <header className={styles.collectionHeader}>
                <div className={styles.tierIdentity}>
                  <span className={styles.tierMark}>M</span>
                  <div><small>{tier.tone}</small><h2>{tier.label}</h2></div>
                </div>
                <span className={`${styles.collectionState} ${isUnlocked ? styles.collectionStateUnlocked : ''}`}>
                  {isUnlocked ? <Check size={14} /> : <LockKeyhole size={14} />}
                  {isUnlocked ? 'SBLOCCATA' : `${formatNumber(tier.requiredXp)} XP`}
                </span>
              </header>

              {!isUnlocked ? (
                <div className={styles.collectionProgress}>
                  <XpProgressBar value={userXp} max={tier.requiredXp} label={`Progresso collezione ${tier.label}`} color={tier.color} compact />
                  <span>Mancano {formatNumber(remaining)} XP</span>
                </div>
              ) : null}

              <ProductRail
                title="UOMO"
                products={tierProducts.filter((product) => product.gender === 'uomo')}
                tier={tier}
                userXp={userXp}
                onOpen={setSelectedItem}
              />
              <ProductRail
                title="DONNA"
                products={tierProducts.filter((product) => product.gender === 'donna')}
                tier={tier}
                userXp={userXp}
                onOpen={setSelectedItem}
              />
            </section>
          );
        })}
      </div>

      <section className={styles.specialSection}>
        <header className={styles.specialHeader}>
          <span><Sparkles /> CAPI SPECIALI</span>
          <h2>Obiettivi raggiunti</h2>
          <p>Questi capi richiedono achievement specifici. Restano visibili anche prima del completamento.</p>
        </header>
        <div className={styles.specialGrid}>
          {achievements.map((achievement) => (
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
                  : 'Progresso in collegamento'}
              </div>
              <XpProgressBar
                value={achievement.hasProgress ? achievement.progress : 0}
                max={achievement.requirement}
                label={`Progresso ${achievement.name}`}
                color={achievement.isUnlocked ? 'var(--primary)' : '#9a7cff'}
                compact
              />
              {achievement.rewardXp > 0 ? <b>+{formatNumber(achievement.rewardXp)} XP</b> : <b>SOLO DIAMOND</b>}
            </button>
          ))}
        </div>
      </section>

      <Link className={styles.progressLink} to="/account/xp">
        <Award size={19} aria-hidden="true" />
        <span><strong>Torna alla progressione XP</strong><small>Livello, storico e modalità di guadagno</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>

      {selectedItem ? (
        <ProductDetailSheet
          item={selectedItem}
          userXp={userXp}
          color={selectedItem.isSpecial ? '#9a7cff' : XP_TIERS.find((tier) => tier.id === selectedItem.tier)?.color}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}

      {celebration ? (
        <div className={styles.celebrationLayer} role="dialog" aria-modal="true" aria-label="Nuovo sblocco">
          <button type="button" className={styles.celebrationBackdrop} onClick={dismissCelebration} aria-label="Chiudi celebrazione" />
          <section className={styles.celebrationCard} style={{ '--celebration-color': celebration.tier.color }}>
            <button type="button" onClick={dismissCelebration} aria-label="Chiudi"><X /></button>
            <span className={styles.celebrationMark}><Sparkles /></span>
            <small>NUOVO SBLOCCO!</small>
            <h2>{celebration.tier.label} SBLOCCATO</h2>
            <p>La collezione è ora disponibile. I tuoi XP restano invariati.</p>
            <ProductVisual item={{ id: `celebration-${celebration.tier.id}`, name: celebration.tier.label, visual: 'tshirt' }} color={celebration.tier.color} />
            <button type="button" className={styles.celebrationAction} onClick={dismissCelebration}>Esplora la collezione</button>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default MarketplacePage;

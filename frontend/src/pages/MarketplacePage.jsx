import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  Check,
  ChevronDown,
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
          : <><b>{formatNumber(product.requiredXp)} XP</b><small>BLOCCATO</small></>}
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
  return (
    <div className={styles.collectionPreview} aria-hidden="true">
      {products.map((product) => (
        <span key={product.id} className={product.isUnlocked ? styles.previewUnlocked : ''}>
          <ProductVisual item={product} color={tier.color} />
        </span>
      ))}
    </div>
  );
}

function MarketplacePage() {
  const { loading, error, xpState, profileStats } = useXpProgression();
  const [selectedItem, setSelectedItem] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [expandedTierId, setExpandedTierId] = useState(null);
  const [selectedGender, setSelectedGender] = useState('uomo');

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
          const isExpanded = expandedTierId === tier.id;
          const visibleProducts = tierProducts.filter((product) => product.gender === selectedGender);
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
                <XpProgressBar value={userXp} max={tier.requiredXp} label={`Progresso collezione ${tier.label}`} color={tier.color} compact />
                <span>{isUnlocked ? 'Sbloccata' : `Mancano ${formatNumber(remaining)} XP`}</span>
              </div>

              {!isExpanded ? <CollectionPreview products={tierProducts} tier={tier} /> : null}

              {isExpanded ? (
                <div id={`xp-collection-content-${tier.id}`} className={styles.collectionContent}>
                  <div className={styles.genderSelector} role="group" aria-label={`Collezione ${tier.label}`}>
                    <button
                      type="button"
                      className={selectedGender === 'uomo' ? styles.genderActive : ''}
                      aria-pressed={selectedGender === 'uomo'}
                      onClick={() => setSelectedGender('uomo')}
                    >
                      UOMO <span>4</span>
                    </button>
                    <button
                      type="button"
                      className={selectedGender === 'donna' ? styles.genderActive : ''}
                      aria-pressed={selectedGender === 'donna'}
                      onClick={() => setSelectedGender('donna')}
                    >
                      DONNA <span>4</span>
                    </button>
                  </div>
                  <ProductGrid products={visibleProducts} tier={tier} onOpen={setSelectedItem} />
                </div>
              ) : null}
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

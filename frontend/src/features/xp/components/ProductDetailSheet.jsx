import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, LockKeyhole, Sparkles } from 'lucide-react';
import ProductVisual from './ProductVisual';
import XpProgressBar from './XpProgressBar';
import styles from './xpMarketplaceUi.module.css';

const numberFormatter = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });

function formatValue(value, unit = 'XP') {
  return `${numberFormatter.format(Number(value || 0))} ${unit}`;
}

export default function ProductDetailSheet({ item, userXp, color, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!item) return null;

  const isSpecial = Boolean(item.isSpecial);
  const required = isSpecial ? item.requirement : item.requiredXp;
  const current = isSpecial ? item.progress : userXp;
  const hasProgress = isSpecial ? item.hasProgress : true;
  const remaining = hasProgress ? Math.max(0, Number(required || 0) - Number(current || 0)) : null;
  const statusCopy = item.isUnlocked ? 'SBLOCCATO' : 'BLOCCATO';

  return createPortal(
    <div className={styles.sheetLayer} role="presentation">
      <button type="button" className={styles.sheetBackdrop} onClick={onClose} aria-label="Chiudi dettaglio capo" />
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="xp-product-title">
        <div className={styles.sheetHandle} aria-hidden="true" />
        <header className={styles.sheetHeader}>
          <div>
            <span>{isSpecial ? 'CAPO SPECIALE' : item.tier?.toUpperCase()}</span>
            <h2 id="xp-product-title">{item.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi"><span className={styles.closeGlyph} aria-hidden="true">×</span></button>
        </header>
        <div className={styles.sheetScroll}>
          <ProductVisual item={item} color={color} large />

          <div className={`${styles.detailStatus} ${item.isUnlocked ? styles.detailStatusUnlocked : ''}`}>
            {item.isUnlocked ? <Check size={18} /> : <LockKeyhole size={18} />}
            <strong>{statusCopy}</strong>
          </div>

          <div className={styles.detailMetrics}>
            <p><span>{isSpecial ? 'Obiettivo' : 'XP necessari'}</span><strong>{formatValue(required, item.unit || 'XP')}</strong></p>
            <p><span>{isSpecial ? 'Progresso' : 'Hai'}</span><strong>{hasProgress ? formatValue(current, item.unit || 'XP') : 'In collegamento'}</strong></p>
            {!item.isUnlocked ? (
              <p><span>Ti mancano</span><strong>{remaining === null ? 'Dati non disponibili' : formatValue(remaining, item.unit || 'XP')}</strong></p>
            ) : null}
          </div>

          <XpProgressBar
            value={hasProgress ? current : 0}
            max={required}
            label={`Progresso ${item.name}`}
            color={color}
          />

          <p className={styles.detailMessage}>
            {item.isUnlocked
              ? 'Hai conquistato questo sblocco. Gli XP restano nel tuo profilo e non vengono consumati.'
              : hasProgress
                ? 'Continua ad allenarti per raggiungere lo sblocco.'
                : 'Il capo resta visibile. Il relativo progresso sarà collegato quando la metrica sarà disponibile.'}
          </p>

          {isSpecial && item.rewardXp > 0 ? (
            <p className={styles.rewardNote}><Sparkles size={16} /> Ricompensa prevista: +{numberFormatter.format(item.rewardXp)} XP alla verifica dell’obiettivo.</p>
          ) : null}
          {item.isUnlocked && !isSpecial ? (
            <p className={styles.futureAction}>Sbloccato non significa acquistato: ordini e selezione del capo verranno collegati in una fase successiva.</p>
          ) : null}
        </div>
      </section>
    </div>,
    document.body
  );
}

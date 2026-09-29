import { useEffect, useRef } from 'react';
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
  const sheetRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousActive = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getFocusable = () => Array.from(
      sheetRef.current?.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ) || []
    );
    const focusFrame = window.requestAnimationFrame(() => {
      (closeButtonRef.current || getFocusable()[0] || sheetRef.current)?.focus();
    });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        sheetRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!focusable.includes(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      if (previousActive?.isConnected && typeof previousActive.focus === 'function') {
        previousActive.focus();
      }
    };
  }, []);

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
      <section ref={sheetRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="xp-product-title" tabIndex={-1}>
        <div className={styles.sheetHandle} aria-hidden="true" />
        <header className={styles.sheetHeader}>
          <div>
            <span>{isSpecial ? 'CAPO SPECIALE' : item.tier?.toUpperCase()}</span>
            <h2 id="xp-product-title">{item.name}</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Chiudi"><span className={styles.closeGlyph} aria-hidden="true">×</span></button>
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

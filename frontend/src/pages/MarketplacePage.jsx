import { Award, ChevronRight, LockKeyhole, ShoppingBag, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import styles from '../styles/pages/marketplace.module.css';

function MarketplacePage() {
  usePageMeta({
    title: 'Marketplace XP | Motrice',
    description: 'Il futuro marketplace Motrice sbloccato dalla progressione XP.'
  });

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.icon} aria-hidden="true">
          <ShoppingBag />
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><Sparkles size={15} aria-hidden="true" /> Marketplace XP</p>
          <h1>Il tuo impegno sblocca il tuo stile.</h1>
          <p>
            Qui troverai abbigliamento e accessori sportivi disponibili in base al livello XP raggiunto.
            Gli XP saranno un requisito di accesso e non verranno consumati durante l’acquisto.
          </p>
        </div>
      </header>

      <div className={styles.status} role="status">
        <span className={styles.statusIcon}><LockKeyhole aria-hidden="true" /></span>
        <div>
          <strong>Marketplace in preparazione</strong>
          <p>La sezione è collegata all’app. Catalogo, livelli e acquisti verranno costruiti nella fase successiva.</p>
        </div>
      </div>

      <Link className={styles.progressLink} to="/account/xp">
        <Award size={19} aria-hidden="true" />
        <span>
          <strong>Visualizza la tua progressione XP</strong>
          <small>Controlla livello, badge e cronologia</small>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}

export default MarketplacePage;

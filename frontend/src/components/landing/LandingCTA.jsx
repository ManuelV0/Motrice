import { ArrowRight, Handshake, Zap } from 'lucide-react';
import CTAButton from '../CTAButton';
import styles from '../../styles/components/landingCta.module.css';

function LandingCTA() {
  return (
    <section className={styles.wrap} aria-labelledby="landing-final-cta-title">
      <div className={styles.bgGlow} aria-hidden="true" />
      <p className={styles.kicker}>
        <Zap size={14} aria-hidden="true" />
        Pronto a partire
      </p>
      <h2 id="landing-final-cta-title">Passa dallo scrolling<br />all'allenamento reale.</h2>
      <p className={styles.description}>
        Unisciti agli eventi locali o porta nuovi utenti certificati nella tua struttura.
      </p>
      <div className={styles.actions}>
        <CTAButton to="/explore" aria-label="Trova eventi vicino a te ora">
          Trova eventi vicino a te <ArrowRight size={16} aria-hidden="true" />
        </CTAButton>
        <CTAButton to="/convenzioni#join" variant="secondary" aria-label="Diventa partner Motrice">
          <Handshake size={16} aria-hidden="true" /> Diventa partner
        </CTAButton>
      </div>
    </section>
  );
}

export default LandingCTA;

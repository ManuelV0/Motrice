import { ArrowRight, Handshake, MapPin, QrCode } from 'lucide-react';
import CTAButton from '../CTAButton';
import styles from '../../styles/components/landingHero.module.css';

function LandingHero({ onPrimaryHref = '/explore', onSecondaryHref = '/convenzioni#join' }) {
  return (
    <section className={styles.hero} aria-labelledby="landing-hero-title">
      <div className={styles.copy}>
        <p className={styles.kicker}>Motrice Platform</p>
        <h1 id="landing-hero-title">Lo sport locale, finalmente organizzato.</h1>
        <p className={styles.subtitle}>
          Eventi reali, QR validato in palestra e reputazione che premia chi partecipa davvero.
          Meno caos, piu presenza, piu risultati.
        </p>

        <div className={styles.actions}>
          <CTAButton to={onPrimaryHref} aria-label="Trova eventi vicino a te">
            Trova eventi vicino a te <ArrowRight size={16} aria-hidden="true" />
          </CTAButton>
          <CTAButton to={onSecondaryHref} variant="secondary" aria-label="Sei una palestra?">
            <Handshake size={16} aria-hidden="true" /> Sei una palestra?
          </CTAButton>
        </div>

        <div className={styles.chips} aria-label="Punti chiave Motrice">
          <span><MapPin size={14} aria-hidden="true" /> Sport locale</span>
          <span><QrCode size={14} aria-hidden="true" /> QR valido 90 min</span>
        </div>
      </div>

      <aside className={styles.mockup} aria-label="Anteprima app Motrice">
        <img
          src="/images/palestra.svg"
          alt="Mockup Motrice con flusso evento e validazione QR"
          loading="lazy"
          width="420"
          height="300"
        />
        <div className={styles.mockupMeta}>
          <p>Evento live: Functional Training</p>
          <strong>Check-in QR attivo</strong>
        </div>
      </aside>
    </section>
  );
}

export default LandingHero;

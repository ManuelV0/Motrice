import { ArrowRight, Handshake, MapPin, QrCode, Zap } from 'lucide-react';
import CTAButton from '../CTAButton';
import styles from '../../styles/components/landingHero.module.css';

function LandingHero({ onPrimaryHref = '/explore', onSecondaryHref = '/convenzioni#join' }) {
  return (
    <section className={styles.hero} aria-labelledby="landing-hero-title">
      <div className={styles.bgImage} aria-hidden="true">
        <img
          src="/images/landing-hero.png"
          alt=""
          loading="eager"
          width="1280"
          height="720"
        />
      </div>

      <div className={styles.overlay} aria-hidden="true" />

      <div className={styles.content}>
        <div className={styles.copy}>
          <p className={styles.kicker}>
            <Zap size={14} aria-hidden="true" />
            Motrice Platform
          </p>
          <h1 id="landing-hero-title">Lo sport locale,<br />finalmente organizzato.</h1>
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

        <aside className={styles.previewCard} aria-label="Anteprima app Motrice">
          <div className={styles.previewImageWrap}>
            <img
              src="/images/landing-gym-qr.png"
              alt="Validazione QR in palestra"
              loading="lazy"
              width="420"
              height="315"
            />
          </div>
          <div className={styles.previewMeta}>
            <p>Evento live: Functional Training</p>
            <strong>Check-in QR attivo</strong>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default LandingHero;

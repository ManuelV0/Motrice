import { Dumbbell, MapPin, QrCode, ShieldCheck, Trophy } from 'lucide-react';
import { portalStyles as styles } from '../../components/partner-portal/PortalPrimitives';
import loginStyles from './LoginPage.module.css';

export default function LoginPage({ onLogin }) {
  return (
    <section className={`${styles.page} ${loginStyles.page}`}>
      <article className={loginStyles.hero}>
        <div className={loginStyles.heroContent}>
          <p className={loginStyles.kicker}>Portale Gestionale Convenzioni</p>
          <h1>Attiva voucher, valida QR e monitora earnings in tempo reale</h1>
          <p className={styles.muted}>
            Una dashboard sportiva e operativa per palestre, ASD e coach partner Motrice.
          </p>

          <div className={loginStyles.featureGrid}>
            <div className={loginStyles.feature}>
              <QrCode size={16} aria-hidden="true" />
              <span>Redeem QR in pochi secondi</span>
            </div>
            <div className={loginStyles.feature}>
              <MapPin size={16} aria-hidden="true" />
              <span>Convenzioni locali in evidenza</span>
            </div>
            <div className={loginStyles.feature}>
              <Trophy size={16} aria-hidden="true" />
              <span>Badge e performance 30 giorni</span>
            </div>
            <div className={loginStyles.feature}>
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Flusso candidatura e contratto guidato</span>
            </div>
          </div>

          <div className={styles.row}>
            <button type="button" className={styles.actionBtn} onClick={() => onLogin('google')}>
              Continua con Google
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.secondaryBtn}`}
              onClick={() => onLogin('facebook')}
            >
              Continua con Facebook
            </button>
          </div>
        </div>

        <div className={loginStyles.heroVisual} aria-hidden="true">
          <div className={loginStyles.ring} />
          <div className={loginStyles.ringAlt} />
          <div className={loginStyles.statsCard}>
            <p>Partner attivi oggi</p>
            <strong>+128</strong>
          </div>
          <div className={loginStyles.statsCard}>
            <p>QR validati (24h)</p>
            <strong>1.904</strong>
          </div>
          <div className={loginStyles.badgeCard}>
            <Dumbbell size={18} aria-hidden="true" />
            <span>Modalità Operativa</span>
          </div>
        </div>
      </article>
    </section>
  );
}

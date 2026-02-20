import { PageHero, portalStyles as styles } from '../../components/partner-portal/PortalPrimitives';

export default function AccessDeniedPage({ activationStatus, onLogout, mainAppUrl }) {
  return (
    <section className={styles.page}>
      <PageHero
        title="Accesso partner non disponibile"
        description={
          activationStatus === 'expired'
            ? 'Abbonamento convenzione scaduto. Completa nuovamente la procedura dal sito principale.'
            : 'Account non ancora approvato. Invia candidatura dal sito principale e attendi revisione admin.'
        }
        primaryCta={
          <a href={mainAppUrl} className={styles.actionBtn} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Vai al sito principale
          </a>
        }
        secondaryCta={
          <button type="button" className={`${styles.actionBtn} ${styles.ghostBtn}`} onClick={onLogout}>
            Logout
          </button>
        }
      />
    </section>
  );
}

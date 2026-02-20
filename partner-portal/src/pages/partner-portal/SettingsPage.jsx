import { PageCard, PageHero, portalStyles as styles } from '../../components/partner-portal/PortalPrimitives';
import { usePartnerPortal } from '../../components/partner-portal/PartnerPortalContext';

export default function SettingsPage() {
  const { session, onLogout, onRefresh, setRoute, setInfo } = usePartnerPortal();

  return (
    <section className={styles.page}>
      <PageHero
        title="Impostazioni"
        description="Contatti, preferenze operative e azioni account del partner portal."
        primaryCta={
          <button type="button" className={styles.actionBtn} onClick={() => setRoute('convenzione')}>
            Modifica profilo
          </button>
        }
        secondaryCta={
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.secondaryBtn}`}
            onClick={() => {
              onRefresh();
              setInfo('Dati ricaricati');
            }}
          >
            Aggiorna dati
          </button>
        }
      />

      <PageCard title="Account" description="Sessione corrente del portale partner.">
        <p><strong>User ID:</strong> {session.userId || 'n/d'}</p>
        <p><strong>Provider:</strong> {session.provider || 'n/d'}</p>
        <div className={styles.row}>
          <button type="button" className={`${styles.actionBtn} ${styles.ghostBtn}`} onClick={onLogout}>
            Logout
          </button>
        </div>
      </PageCard>

      <PageCard title="Supporto" description="Canali rapidi per assistenza convenzioni.">
        <div className={styles.list}>
          <article className={styles.item}>
            <p><strong>FAQ:</strong> verifica requisiti contratto, firma e voucher.</p>
          </article>
          <article className={styles.item}>
            <p><strong>Help:</strong> contatta il team Motrice dal portale principale.</p>
          </article>
        </div>
      </PageCard>
    </section>
  );
}

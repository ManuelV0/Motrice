import { PageCard, PageHero, portalStyles as styles } from '../../components/partner-portal/PortalPrimitives';
import { usePartnerPortal } from '../../components/partner-portal/PartnerPortalContext';
import { eur, formatDate, getBadgeLabel } from '../../utils/convenzioni/formatters';

function statusText(status) {
  if (status === 'active') return 'Convenzione attiva';
  if (status === 'pending') return 'Convenzione in approvazione';
  if (status === 'expired') return 'Convenzione scaduta';
  return 'Convenzione non attiva';
}

export default function DashboardPage() {
  const {
    ctx,
    vouchers,
    annualStats,
    liveStats,
    partnerMetrics,
    remainingDays,
    remainingHours,
    isPremiumPlan,
    setRoute,
    applications
  } = usePartnerPortal();

  const recentRedeems = vouchers
    .filter((voucher) => String(voucher.status || '').toLowerCase() === 'redeemed')
    .slice(0, 5);

  return (
    <section className={styles.page}>
      <PageHero
        title="Dashboard Partner"
        description="Controlla stato convenzione, redeem QR e credito in un unico pannello operativo."
        primaryCta={
          <button type="button" className={styles.actionBtn} onClick={() => setRoute('voucher')}>
            Riscatta voucher
          </button>
        }
        secondaryCta={
          <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={() => setRoute('convenzione')}>
            Completa convenzione
          </button>
        }
      />

      <PageCard title="Stato convenzione" description="Capisci subito se sei operativo e cosa manca.">
        <div className={styles.kpiGrid}>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Stato</p>
            <p className={styles.kpiValue}>{statusText(ctx.activationStatus)}</p>
            <p className={styles.kpiHint}>Scadenza: {formatDate(ctx.partnerProfile?.subscription_expires_at)}</p>
          </article>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Timer residuo</p>
            <p className={styles.kpiValue}>{remainingDays}g {remainingHours}h</p>
            <p className={styles.kpiHint}>Aggiornato live</p>
          </article>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Piano</p>
            <p className={styles.kpiValue}>{isPremiumPlan ? 'Premium' : 'Free'}</p>
            <p className={styles.kpiHint}>Promo limite: {ctx.partnerProfile?.promo_limit || 0}</p>
          </article>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Candidature</p>
            <p className={styles.kpiValue}>{applications.length}</p>
            <p className={styles.kpiHint}>Storico account corrente</p>
          </article>
        </div>
      </PageCard>

      <div className={styles.grid2}>
        <PageCard title="Performance 30 giorni" description="Redeem e qualità operativa del partner.">
          <div className={styles.grid}>
            <p><strong>Redeem validi:</strong> {Number(partnerMetrics.redeemed_count || 0)}</p>
            <p><strong>Redeem rate:</strong> {(Number(partnerMetrics.redeem_rate || 0) * 100).toFixed(1)}%</p>
            <p><strong>Voucher scaduti:</strong> {Number(partnerMetrics.expired_count || 0)}</p>
            <p><strong>Importo redeem:</strong> {eur(partnerMetrics.redeemed_amount_cents || 0)}</p>
          </div>
        </PageCard>

        <PageCard title="Credito & Earnings" description="Quanto hai generato e quanto manca al break-even annuale.">
          <div className={styles.grid}>
            <p><strong>Totale saldo:</strong> {eur(ctx.partnerProfile?.earnings_total_cents || 0)}</p>
            <p><strong>Cashback anno:</strong> {eur(annualStats.totalCashbackCents)}</p>
            <p><strong>Voucher attivi:</strong> {liveStats.active_vouchers}</p>
            <p><strong>Voucher riscattati:</strong> {liveStats.redeemed_vouchers}</p>
          </div>
        </PageCard>
      </div>

      <div className={styles.grid2}>
        <PageCard title="Badge e vetrina" description="Più redeem corretti, migliore posizionamento.">
          <div className={styles.grid}>
            <p>
              <strong>Badge attuale:</strong>{' '}
              <span className={styles.badge}>{getBadgeLabel(ctx.partnerProfile?.badge_level || 'rame')}</span>
            </p>
            <p><strong>Score rolling 30gg:</strong> {Number(ctx.partnerProfile?.score_rolling_30d || 0)}</p>
          </div>
        </PageCard>

        <PageCard title="Attività recente" description="Ultimi voucher riscattati.">
          {recentRedeems.length === 0 ? (
            <p className={styles.muted}>Nessun riscatto recente.</p>
          ) : (
            <div className={styles.list}>
              {recentRedeems.map((item) => (
                <article className={styles.item} key={item.id}>
                  <p><strong>{item.id}</strong> · User #{item.user_id || 'n/d'}</p>
                  <p className={styles.muted}>Riscattato: {formatDate(item.redeemed_at)}</p>
                </article>
              ))}
            </div>
          )}
        </PageCard>
      </div>
    </section>
  );
}

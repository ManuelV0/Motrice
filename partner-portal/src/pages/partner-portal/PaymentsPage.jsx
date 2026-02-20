import { useState } from 'react';
import { PageCard, PageHero, portalStyles as styles } from '../../components/partner-portal/PortalPrimitives';
import { usePartnerPortal } from '../../components/partner-portal/PartnerPortalContext';
import { eur, formatDate } from '../../utils/convenzioni/formatters';

export default function PaymentsPage() {
  const { ctx, annualStats } = usePartnerPortal();
  const [annualPriceX, setAnnualPriceX] = useState(14900);
  const netAnnualCostCents = Math.max(0, Number(annualPriceX || 0) - Number(annualStats.totalCashbackCents || 0));
  const breakEvenY = Number(annualPriceX || 0) > 0 ? Math.ceil(Number(annualPriceX || 0) / 60) : 0;
  const earningsHistory = Array.isArray(ctx.partnerProfile?.earnings_history) ? ctx.partnerProfile.earnings_history : [];

  return (
    <section className={styles.page}>
      <PageHero
        title="Pagamenti e credito"
        description="Vista trasparente su guadagni convenzioni, copertura abbonamento e movimenti storici."
        primaryCta={<button type="button" className={styles.actionBtn}>Vai a pricing</button>}
        secondaryCta={<button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`}>Gestisci reinvestimento</button>}
      />

      <PageCard title="Credito accumulato" description="Utilizzabile per coprire il costo annuale o reinvestire.">
        <label className={styles.field}>
          Costo abbonamento annuale X (EUR)
          <input
            type="number"
            min="0"
            step="1"
            value={Math.round(Number(annualPriceX || 0) / 100)}
            onChange={(event) => {
              const eurValue = Math.max(0, Number(event.target.value) || 0);
              setAnnualPriceX(Math.round(eurValue * 100));
            }}
          />
        </label>

        <div className={styles.grid2}>
          <p><strong>Totale saldo:</strong> {eur(ctx.partnerProfile?.earnings_total_cents || 0)}</p>
          <p><strong>Revenue share voucher:</strong> {eur(ctx.partnerProfile?.earnings_voucher_share_cents || 0)}</p>
          <p><strong>Spesa utenti su voucher:</strong> {eur(ctx.partnerProfile?.earnings_voucher_gross_cents || 0)}</p>
          <p><strong>Cashback corsi:</strong> {eur(ctx.partnerProfile?.cashback_course_cents || 0)}</p>
          <p><strong>Cashback anno:</strong> {eur(annualStats.totalCashbackCents)}</p>
          <p><strong>Buoni annui:</strong> {annualStats.voucherActivationsY}</p>
          <p><strong>Costo netto (X - cashback):</strong> {eur(netAnnualCostCents)}</p>
          <p><strong>Pareggio annuale:</strong> {breakEvenY} buoni</p>
        </div>
      </PageCard>

      <PageCard title="Movimenti" description="Storico earnings_history (voucher share e cashback corsi).">
        {earningsHistory.length === 0 ? (
          <p className={styles.muted}>Nessun movimento registrato.</p>
        ) : (
          <div className={styles.list}>
            {earningsHistory.slice(0, 14).map((item) => (
              <article className={styles.item} key={item.id}>
                <p><strong>{item.type === 'voucher_share' ? 'Voucher share' : 'Cashback corso'}</strong></p>
                <p className={styles.muted}>Importo: {eur(item.amount_cents)} · {formatDate(item.created_at)}</p>
                {item.note ? <p className={styles.muted}>{item.note}</p> : null}
              </article>
            ))}
          </div>
        )}
      </PageCard>
    </section>
  );
}

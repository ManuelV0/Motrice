import { useMemo } from 'react';
import CameraScanner from '../../components/partner-portal/CameraScanner';
import { PageCard, PageHero, portalStyles as styles } from '../../components/partner-portal/PortalPrimitives';
import { usePartnerPortal } from '../../components/partner-portal/PartnerPortalContext';
import { formatDate } from '../../utils/convenzioni/formatters';

export default function VoucherPage() {
  const {
    voucherInput,
    setVoucherInput,
    voucherNote,
    setVoucherNote,
    scannerOpen,
    setScannerOpen,
    onRedeem,
    vouchers,
    voucherFilter,
    setVoucherFilter,
    redeemBusy,
    setRoute,
    setInfo
  } = usePartnerPortal();

  const filteredVouchers = useMemo(() => {
    if (voucherFilter === 'all') return vouchers;
    const now = Date.now();
    return vouchers.filter((item) => {
      const ts = Date.parse(item?.created_at || '');
      if (!Number.isFinite(ts)) return voucherFilter === 'all';
      if (voucherFilter === 'today') return ts >= now - 24 * 60 * 60 * 1000;
      if (voucherFilter === '7d') return ts >= now - 7 * 24 * 60 * 60 * 1000;
      return ts >= now - 30 * 24 * 60 * 60 * 1000;
    });
  }, [voucherFilter, vouchers]);

  return (
    <section className={styles.page}>
      <PageHero
        title="Voucher"
        description="Azione primaria: valida codice QR, conferma e chiudi sessione voucher in tempo reale."
        primaryCta={
          <button type="button" className={styles.actionBtn} onClick={onRedeem} disabled={redeemBusy}>
            {redeemBusy ? 'Riscatto...' : 'Riscatta voucher'}
          </button>
        }
        secondaryCta={
          <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={() => setRoute('dashboard')}>
            Torna dashboard
          </button>
        }
      />

      <PageCard title="Riscatta voucher" description="Incolla codice/URL oppure usa scanner fotocamera.">
        <div className={styles.grid2}>
          <label className={styles.field}>
            Codice voucher o URL
            <input
              value={voucherInput}
              onChange={(event) => setVoucherInput(event.target.value)}
              placeholder="cv_... oppure URL completo"
              aria-label="Codice voucher o URL"
            />
          </label>
          <label className={styles.field}>
            Nota verifica
            <input
              value={voucherNote}
              onChange={(event) => setVoucherNote(event.target.value.slice(0, 240))}
              placeholder="Es. reception ore 18:40"
              aria-label="Nota verifica"
            />
          </label>
        </div>
        <div className={styles.row}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.secondaryBtn}`}
            onClick={() => setScannerOpen((prev) => !prev)}
          >
            {scannerOpen ? 'Chiudi scanner' : 'Apri scanner'}
          </button>
          <button type="button" className={styles.actionBtn} onClick={onRedeem} disabled={redeemBusy}>
            Conferma redeem
          </button>
        </div>
        <CameraScanner
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onDetected={(value) => {
            setVoucherInput(value);
            setInfo('QR rilevato: codice compilato automaticamente.');
          }}
        />
      </PageCard>

      <PageCard title="Ultimi voucher" description="Monitora stato, orario e scadenza.">
        <div className={styles.chips}>
          {[
            { key: 'all', label: 'Tutti' },
            { key: 'today', label: 'Oggi' },
            { key: '7d', label: '7 giorni' },
            { key: '30d', label: '30 giorni' }
          ].map((item) => (
            <button
              type="button"
              key={item.key}
              className={styles.filterBtn}
              data-active={voucherFilter === item.key}
              onClick={() => setVoucherFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {filteredVouchers.length === 0 ? (
          <p className={styles.muted}>Nessun voucher in questo intervallo.</p>
        ) : (
          <div className={styles.list}>
            {filteredVouchers.slice(0, 20).map((voucher) => (
              <article className={styles.item} key={voucher.id}>
                <div className={styles.rowBetween}>
                  <p><strong>{voucher.id}</strong></p>
                  <span className={styles.badge}>{String(voucher.status || 'n/d').toUpperCase()}</span>
                </div>
                <p className={styles.muted}>Partner: {voucher.partner?.name || 'n/d'} · User #{voucher.user_id || 'n/d'}</p>
                <p className={styles.muted}>Creato: {formatDate(voucher.created_at)} · Scade: {formatDate(voucher.expires_at)}</p>
                {voucher.redeemed_at ? <p className={styles.muted}>Riscattato: {formatDate(voucher.redeemed_at)}</p> : null}
              </article>
            ))}
          </div>
        )}
      </PageCard>
    </section>
  );
}

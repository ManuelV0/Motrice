import { useMemo } from 'react';
import { PageCard, PageHero, portalStyles as styles } from '../../components/partner-portal/PortalPrimitives';
import { usePartnerPortal } from '../../components/partner-portal/PartnerPortalContext';
import { ASSOCIATION_PLACEHOLDER_IMAGE, formatDate } from '../../utils/convenzioni/formatters';

export default function ConventionPage() {
  const {
    ctx,
    applications,
    isPremiumPlan,
    coursesDraft,
    setCoursesDraft,
    onSetPlan,
    profile,
    setProfile,
    onSelectProfileImage,
    onSaveAssociationProfile,
    coursePromos,
    promoDraft,
    setPromoDraft,
    onCreateCoursePromo,
    promoFilterType,
    setPromoFilterType,
    promoTypeOptions,
    filteredCoursePromos,
    editingPromoId,
    setEditingPromoId,
    editingPromo,
    setEditingPromo,
    savePromoEdit,
    onDeactivatePromo
  } = usePartnerPortal();

  const coursePromoCounters = useMemo(() => {
    const byCourse = {};
    coursePromos
      .filter((item) => String(item.status || '').toLowerCase() === 'active')
      .forEach((item) => {
        const key = String(item.course_type || 'Corso').trim() || 'Corso';
        byCourse[key] = (byCourse[key] || 0) + 1;
      });
    return byCourse;
  }, [coursePromos]);

  return (
    <section className={styles.page}>
      <PageHero
        title="Convenzione"
        description="Gestisci profilo pubblico, piano, promo corsi e stato contrattuale della tua convenzione."
        primaryCta={
          <button type="button" className={styles.actionBtn} onClick={onSaveAssociationProfile}>
            Salva profilo partner
          </button>
        }
        secondaryCta={
          <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={() => onSetPlan(isPremiumPlan ? 'free' : 'premium')}>
            {isPremiumPlan ? 'Passa a Free' : 'Upgrade Premium'}
          </button>
        }
      />

      <PageCard title="Contratto & attivazione" description="Verifica se ci sono blocchi prima dell'operatività.">
        <div className={styles.grid}>
          <p><strong>Stato:</strong> {String(ctx.activationStatus || 'inactive').toUpperCase()}</p>
          <p><strong>Termini accettati:</strong> {ctx.latestApplication?.contract_terms_accepted ? 'Si' : 'No'}</p>
          <p><strong>Firmato caricato:</strong> {ctx.latestApplication?.signed_contract_uploaded_at ? `Si (${formatDate(ctx.latestApplication.signed_contract_uploaded_at)})` : 'No'}</p>
        </div>
      </PageCard>

      <div className={styles.grid2}>
        <PageCard title="Piano convenzione" description="Free: 2 promo. Premium: 7 promo per corso (max 5 corsi).">
          <label className={styles.field}>
            Corsi disponibili (solo Premium)
            <input
              type="number"
              min="1"
              max="5"
              value={coursesDraft}
              onChange={(event) => setCoursesDraft(Math.max(1, Math.min(5, Number(event.target.value) || 1)))}
            />
          </label>
          <div className={styles.row}>
            <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={() => onSetPlan('free')}>
              Attiva Free
            </button>
            <button type="button" className={styles.actionBtn} onClick={() => onSetPlan('premium')}>
              Attiva Premium
            </button>
          </div>
        </PageCard>

        <PageCard title="Scheda partner" description="Queste info sono mostrate nel catalogo convenzioni.">
          <div className={styles.grid2}>
            <label className={styles.field}>
              Sottotitolo
              <input value={profile.tagline} onChange={(event) => setProfile((prev) => ({ ...prev, tagline: event.target.value.slice(0, 120) }))} />
            </label>
            <label className={styles.field}>
              Indirizzo
              <input value={profile.address} onChange={(event) => setProfile((prev) => ({ ...prev, address: event.target.value.slice(0, 160) }))} />
            </label>
            <label className={styles.field}>
              Telefono
              <input value={profile.phone} onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value.slice(0, 60) }))} />
            </label>
            <label className={styles.field}>
              Email
              <input value={profile.email} onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value.slice(0, 120) }))} />
            </label>
          </div>
          <label className={styles.field}>
            Descrizione
            <textarea rows="3" value={profile.description} onChange={(event) => setProfile((prev) => ({ ...prev, description: event.target.value.slice(0, 600) }))} />
          </label>
          <label className={styles.field}>
            Corsi offerti (uno per riga)
            <textarea rows="4" value={profile.coursesText} onChange={(event) => setProfile((prev) => ({ ...prev, coursesText: event.target.value }))} />
          </label>
          <label className={styles.field}>
            Immagine struttura
            <input type="file" accept="image/*" onChange={onSelectProfileImage} />
          </label>
          <img
            src={profile.imageDataUrl || ASSOCIATION_PLACEHOLDER_IMAGE}
            alt="Anteprima struttura"
            loading="lazy"
            style={{ width: '100%', maxHeight: '14rem', objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)' }}
          />
        </PageCard>
      </div>

      <PageCard title="Promo corsi" description="Gestione promo visibili in app Motrice.">
        <div className={styles.grid2}>
          <label className={styles.field}>
            Tipologia corso
            <input
              value={promoDraft.courseType}
              onChange={(event) => setPromoDraft((prev) => ({ ...prev, courseType: event.target.value }))}
              maxLength={80}
              disabled={!isPremiumPlan}
            />
          </label>
          <label className={styles.field}>
            Prezzo scontato (EUR)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={promoDraft.discountedPrice}
              onChange={(event) => setPromoDraft((prev) => ({ ...prev, discountedPrice: event.target.value }))}
              disabled={!isPremiumPlan}
            />
          </label>
          <label className={styles.field}>
            Fine promo
            <input
              type="date"
              value={promoDraft.expiresAt}
              onChange={(event) => setPromoDraft((prev) => ({ ...prev, expiresAt: event.target.value }))}
              disabled={!isPremiumPlan}
            />
          </label>
        </div>
        <div className={styles.row}>
          <button type="button" className={styles.actionBtn} disabled={!isPremiumPlan} onClick={onCreateCoursePromo}>
            Crea promo
          </button>
          {!isPremiumPlan ? <p className={styles.muted}>Attiva Premium per creare promo.</p> : null}
        </div>

        {Object.keys(coursePromoCounters).length > 0 ? (
          <div className={styles.grid2}>
            {Object.entries(coursePromoCounters).map(([course, count]) => (
              <p key={course}><strong>{course}:</strong> {count}/7 promo</p>
            ))}
          </div>
        ) : null}

        {coursePromos.length > 0 ? (
          <label className={styles.field}>
            Filtro corso
            <select value={promoFilterType} onChange={(event) => setPromoFilterType(event.target.value)}>
              <option value="all">Tutti</option>
              {promoTypeOptions.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
        ) : null}

        {filteredCoursePromos.length === 0 ? (
          <p className={styles.muted}>Nessuna promo trovata.</p>
        ) : (
          <div className={styles.list}>
            {filteredCoursePromos.slice(0, 30).map((promo) => (
              <article className={styles.item} key={promo.id}>
                {String(editingPromoId) === String(promo.id) ? (
                  <div className={styles.grid}>
                    <label className={styles.field}>
                      Corso
                      <input value={editingPromo.courseType} onChange={(event) => setEditingPromo((prev) => ({ ...prev, courseType: event.target.value }))} />
                    </label>
                    <label className={styles.field}>
                      Prezzo
                      <input type="number" value={editingPromo.discountedPrice} onChange={(event) => setEditingPromo((prev) => ({ ...prev, discountedPrice: event.target.value }))} />
                    </label>
                    <label className={styles.field}>
                      Scadenza
                      <input type="date" value={editingPromo.expiresAt} onChange={(event) => setEditingPromo((prev) => ({ ...prev, expiresAt: event.target.value }))} />
                    </label>
                    <div className={styles.row}>
                      <button type="button" className={styles.actionBtn} onClick={() => savePromoEdit(promo.id)}>Salva</button>
                      <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={() => setEditingPromoId('')}>Annulla</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.rowBetween}>
                      <p><strong>{promo.course_type}</strong> · {Number(promo.discounted_price_eur || 0).toFixed(2)} EUR</p>
                      <span className={styles.badge}>{String(promo.status || 'active').toUpperCase()}</span>
                    </div>
                    <p className={styles.muted}>Codice: {promo.promo_code}</p>
                    <p className={styles.muted}>Creata: {formatDate(promo.created_at)} · Fine: {promo.expires_at ? formatDate(promo.expires_at) : 'Nessuna'}</p>
                    <div className={styles.row}>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.secondaryBtn}`}
                        onClick={() => {
                          setEditingPromoId(String(promo.id || ''));
                          setEditingPromo({
                            courseType: String(promo.course_type || ''),
                            discountedPrice: String(Number(promo.discounted_price_eur || 0)),
                            expiresAt: String(promo.expires_at || '').slice(0, 10)
                          });
                        }}
                      >
                        Modifica
                      </button>
                      {String(promo.status || '').toLowerCase() !== 'inactive' ? (
                        <button type="button" className={`${styles.actionBtn} ${styles.ghostBtn}`} onClick={() => onDeactivatePromo(promo.id)}>
                          Disattiva
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </PageCard>

      <PageCard title="Storico candidature" description="Richieste inviate da questo account.">
        {applications.length === 0 ? (
          <p className={styles.muted}>Nessuna candidatura trovata.</p>
        ) : (
          <div className={styles.list}>
            {applications.map((item) => (
              <article className={styles.item} key={item.id}>
                <p><strong>{item.organization}</strong> · {item.city}</p>
                <p className={styles.muted}>Stato: {item.status} · Piano: {String(item.partner_plan || 'free').toUpperCase()}</p>
                <p className={styles.muted}>Inviata: {formatDate(item.created_at)}</p>
              </article>
            ))}
          </div>
        )}
      </PageCard>
    </section>
  );
}

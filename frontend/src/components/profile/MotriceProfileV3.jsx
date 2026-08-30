import { useEffect, useMemo, useRef, useState } from 'react';
import BrandLogo from '../BrandLogo';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Coins,
  CreditCard,
  ImagePlus,
  LockKeyhole,
  MapPin,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  UserRoundPlus,
  WalletCards,
  Zap
} from 'lucide-react';
import styles from '../../styles/components/profile/motriceProfileV3.module.css';

const RATING_ROWS = ['Puntualità', 'Impegno', 'Collaborazione', 'Correttezza', 'Atteggiamento'];

function euro(cents) {
  return `${(Number(cents || 0) / 100).toFixed(0)}€`;
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('Lettura immagine non riuscita')));
    reader.readAsDataURL(file);
  });
}

function MotriceProfileV3({
  profile,
  state,
  mode,
  onModeChange,
  onSaveProfile,
  onUploadMedia,
  onVerify,
  onInvite,
  isPremium = false,
  publicActionLabel = 'INVITA AD EVENTO'
}) {
  const [identityOpen, setIdentityOpen] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingKind, setUploadingKind] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [form, setForm] = useState({
    display_name: '',
    city: '',
    bio: '',
    avatar_url: '',
    cover_url: ''
  });
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);

  useEffect(() => {
    setForm({
      display_name: profile?.display_name || profile?.name || 'Alessandro',
      city: profile?.city || 'Ascoli Piceno',
      bio: profile?.bio || '',
      avatar_url: profile?.avatar_url || '',
      cover_url: profile?.cover_url || ''
    });
  }, [profile]);

  const identity = state.identity;
  const displayName = form.display_name.trim() || identity.display_name || 'Alessandro';
  const initials = displayName.slice(0, 1).toUpperCase();
  const reliability = state.reliability;
  const walletTotal = state.credit_wallet.available_cents + state.credit_wallet.locked_cents;
  const xpProgress = Math.min(100, Math.round((state.xp.total / state.xp.next_level_at) * 100));
  const verified = Number(state.verified_checkins || reliability.present || 0);
  const isPrivate = mode === 'mine';
  const verificationStatus = String(state.identity_verification?.status || 'unverified');
  const verificationLabels = {
    unverified: 'Profilo non verificato',
    pending: 'Verifica in revisione',
    verified: 'Profilo verificato',
    rejected: 'Verifica da ripetere',
    expired: 'Verifica scaduta',
    suspended: 'Profilo sospeso'
  };
  const verificationLabel = verificationLabels[verificationStatus] || verificationLabels.unverified;
  const profileCompletion = Math.round(
    [form.display_name, form.city, form.bio, form.avatar_url, form.cover_url]
      .filter((value) => String(value || '').trim()).length / 5 * 100
  );
  const missingProfileFields = [
    !form.display_name && 'nome',
    !form.city && 'città',
    !form.bio && 'bio',
    !form.avatar_url && 'foto profilo',
    !form.cover_url && 'copertina'
  ].filter(Boolean);
  const hasHistory = verified > 0 || state.mot.total > 0 || state.recent_activity.length > 0;
  const lastMot = state.mot.logs?.[0];

  const metricDetails = useMemo(() => ({
    events: {
      label: 'ATTIVITÀ',
      title: 'I tuoi eventi',
      value: state.host.events,
      subtitle: state.host.events === 1 ? 'evento organizzato' : 'eventi organizzati',
      rows: [
        ['Partecipanti ospitati', state.host.participants],
        ['Ruolo principale', state.host.events > 0 ? 'Organizer' : 'Partecipante'],
        ['Gestione', 'Calendario · Chat · Check-in']
      ]
    },
    mot: {
      label: 'PRESENZA REALE',
      title: 'MOT',
      value: state.mot.total,
      subtitle: 'ottenuti con check-in QR',
      rows: [
        ['Check-in verificati', verified],
        ['Ultimo accredito', lastMot ? `+${lastMot.mot} MOT` : 'Nessuno'],
        ['Valore', 'Presenza confermata dall’host']
      ]
    },
    trust: {
      label: 'REPUTAZIONE',
      title: 'Affidabilità',
      value: `${reliability.score}%`,
      subtitle: reliability.score > 0 ? 'profilo affidabile' : 'da costruire',
      rows: [
        ['Presenze verificate', reliability.present],
        ['No-show', reliability.no_show],
        ['Cancellazioni tardive', reliability.late_cancellations]
      ]
    }
  }), [lastMot, reliability, state.host.events, state.host.participants, state.mot.total, verified]);

  async function saveIdentity(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await onSaveProfile(form);
      if (saved !== false) setIdentityOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function selectMedia(event, kind) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !isPrivate) return;

    const field = kind === 'cover' ? 'cover_url' : 'avatar_url';
    const previous = form;
    const previewUrl = URL.createObjectURL(file);
    setMediaError('');
    setUploadingKind(kind);
    setForm((current) => ({ ...current, [field]: previewUrl }));

    try {
      const uploadedUrl = onUploadMedia
        ? await onUploadMedia(file, kind)
        : await fileAsDataUrl(file);
      const next = { ...previous, [field]: uploadedUrl };
      setForm(next);
      const saved = await onSaveProfile(next);
      if (saved === false) throw new Error('Salvataggio immagine non riuscito');
    } catch (error) {
      setForm(previous);
      setMediaError(error?.message || 'Caricamento immagine non riuscito');
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingKind('');
    }
  }

  function toggleMetric(metric) {
    setActiveMetric((current) => current === metric ? '' : metric);
  }

  const activeMetricDetail = activeMetric ? metricDetails[activeMetric] : null;

  return (
    <main className={`${styles.page} ${!isPrivate ? styles.publicMode : ''}`}>
      <header className={styles.topHeader}>
        <span>PROFILO</span>
        <button
          type="button"
          className={styles[`verification_${verificationStatus}`]}
          onClick={isPrivate && onVerify ? onVerify : undefined}
          aria-label={isPrivate ? `${verificationLabel}. Apri verifica profilo` : verificationLabel}
        >
          <i aria-hidden="true" /> {verificationLabel} <ChevronDown size={14} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.modeToggle} role="tablist" aria-label="Vista del profilo">
        <button type="button" role="tab" aria-selected={isPrivate} className={isPrivate ? styles.modeActive : ''} onClick={() => onModeChange('mine')}>Mio profilo</button>
        <button type="button" role="tab" aria-selected={!isPrivate} className={!isPrivate ? styles.modeActive : ''} onClick={() => onModeChange('public')}>Anteprima pubblica</button>
      </div>

      {isPrivate && verificationStatus !== 'verified' ? (
        <section className={styles.verificationBanner}>
          <span className={styles.verificationBannerIcon}><ShieldCheck size={22} /></span>
          <span>
            <strong>{verificationLabel}</strong>
            <small>{verificationStatus === 'pending' ? 'Puoi esplorare mentre completiamo la revisione.' : 'Verifica il profilo per creare e partecipare agli eventi.'}</small>
          </span>
          <button type="button" onClick={onVerify}>{verificationStatus === 'pending' ? 'Vedi stato' : 'Verifica'} <ArrowRight size={15} /></button>
        </section>
      ) : null}

      {isPrivate && profileCompletion < 100 ? (
        <section className={styles.completionCard} aria-label={`Profilo completato al ${profileCompletion}%`}>
          <div><strong>Profilo completato</strong><span>{profileCompletion}%</span></div>
          <i><b style={{ width: `${profileCompletion}%` }} /></i>
          <small>Aggiungi {missingProfileFields.join(', ')} per rendere il profilo più riconoscibile.</small>
        </section>
      ) : null}

      <section className={`${styles.card} ${styles.heroCard}`}>
        <div className={`${styles.coverMedia} ${form.cover_url ? styles.coverWithImage : ''}`}>
          {form.cover_url ? (
            <img src={form.cover_url} alt="Copertina del profilo" />
          ) : (
            <span className={styles.coverFallback} aria-hidden="true">
              <BrandLogo className={styles.coverFallbackLogo} decorative />
              <small>MOTRICE</small>
            </span>
          )}
          {isPrivate ? (
            <>
              <button
                type="button"
                className={styles.coverButton}
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingKind === 'cover'}
                aria-label="Scegli l’immagine di copertina dalla galleria"
                title="Scegli copertina dalla galleria"
              >
                {uploadingKind === 'cover' ? <span className={styles.mediaSpinner} /> : <ImagePlus size={15} strokeWidth={2.4} aria-hidden="true" />}
              </button>
              <input ref={coverInputRef} className={styles.mediaInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectMedia(event, 'cover')} />
            </>
          ) : null}
        </div>

        <div className={styles.heroContent}>
          <span className={styles.avatarWrap}>
            <span className={styles.avatarImageFrame}>
              {form.avatar_url ? <img src={form.avatar_url} alt={`Foto profilo di ${displayName}`} /> : <b>{initials}</b>}
            </span>
            <i aria-hidden="true" />
            {isPrivate ? (
              <button
                type="button"
                className={styles.avatarButton}
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingKind === 'avatar'}
                aria-label="Scegli la foto profilo dalla galleria"
                title="Scegli dalla galleria"
              >
                {uploadingKind === 'avatar' ? <span className={styles.mediaSpinner} /> : <ImagePlus size={14} strokeWidth={2.4} aria-hidden="true" />}
              </button>
            ) : null}
          </span>
          {isPrivate ? <input ref={avatarInputRef} className={styles.mediaInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectMedia(event, 'avatar')} /> : null}

          <div className={styles.heroActions}>
            {isPrivate ? (
              <button type="button" onClick={() => setIdentityOpen((value) => !value)}><Pencil size={14} /> Modifica profilo</button>
            ) : (
              <button type="button" className={styles.inviteHeroButton} onClick={onInvite}><UserRoundPlus size={14} /> Invita a evento</button>
            )}
          </div>

          <div className={styles.heroIdentity}>
            <span className={styles.nameLine}><strong>{displayName}</strong>{isPremium ? <em>PREMIUM</em> : null}</span>
            <span className={styles.locationLine}><MapPin size={14} aria-hidden="true" /> {form.city || identity.city} · Lv {state.xp.level}</span>
            <p className={styles.heroBio}>{form.bio.trim() || 'Aggiungi una bio per raccontare come ti alleni.'}</p>
            <span className={styles.sportPills}>{identity.sports.map((sport) => <small key={sport}>{sport}</small>)}</span>
          </div>

          <div className={styles.metricButtons} aria-label="Approfondimenti profilo">
            <button type="button" aria-expanded={activeMetric === 'events'} className={activeMetric === 'events' ? styles.metricActive : ''} onClick={() => toggleMetric('events')}>
              <strong>{state.host.events}</strong><span>Eventi</span><ChevronDown size={15} />
            </button>
            <button type="button" aria-expanded={activeMetric === 'mot'} className={activeMetric === 'mot' ? styles.metricActive : ''} onClick={() => toggleMetric('mot')}>
              <strong>{state.mot.total}</strong><span>MOT</span><ChevronDown size={15} />
            </button>
            <button type="button" aria-expanded={activeMetric === 'trust'} className={activeMetric === 'trust' ? styles.metricActive : ''} onClick={() => toggleMetric('trust')}>
              <strong>{reliability.score}%</strong><span>Affidabilità</span><ChevronDown size={15} />
            </button>
          </div>

          {activeMetricDetail ? (
            <section className={styles.metricAccordion} aria-live="polite">
              <header>
                <div><small>{activeMetricDetail.label}</small><strong>{activeMetricDetail.title}</strong></div>
                <button type="button" onClick={() => setActiveMetric('')} aria-label="Chiudi riepilogo"><ChevronUp size={17} /></button>
              </header>
              <div className={styles.metricValue}><strong>{activeMetricDetail.value}</strong><span>{activeMetricDetail.subtitle}</span></div>
              <div className={styles.metricRows}>
                {activeMetricDetail.rows.map(([label, value]) => <p key={label}><span>{label}</span><strong>{value}</strong></p>)}
              </div>
            </section>
          ) : null}

          {mediaError ? <p className={styles.mediaError}>{mediaError}</p> : null}

          {identityOpen ? (
            <div id="profile-v3-identity" className={styles.identityAccordion}>
              <form onSubmit={saveIdentity}>
                <div className={styles.accordionTitle}><Pencil size={16} aria-hidden="true" /><div><strong>Bio e dati personali</strong><span>Unica identità per eventi e chat.</span></div></div>
                <label>Nome<input value={form.display_name} maxLength={40} required onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label>
                <label>Città<input value={form.city} maxLength={80} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
                <label className={styles.fullField}>Bio<textarea value={form.bio} maxLength={600} rows={4} placeholder="Racconta come ti alleni e cosa cerchi..." onChange={(event) => setForm({ ...form, bio: event.target.value })} /><small>{form.bio.length}/600</small></label>
                <button type="submit" className={styles.saveButton} disabled={saving}><Save size={17} aria-hidden="true" /> {saving ? 'Salvataggio...' : 'Salva profilo'}</button>
              </form>
            </div>
          ) : null}
        </div>
      </section>

      {!hasHistory ? (
        <section className={styles.firstEventCard}>
          <span><Sparkles size={20} /></span>
          <div><small>IL PROSSIMO PASSO</small><strong>Completa il primo evento</strong><p>Sblocca valutazioni, achievement e attività recente.</p></div>
          <ArrowRight size={18} />
        </section>
      ) : null}

      {state.ratings.verified_count > 0 ? (
        <section className={`${styles.card} ${styles.ratingsCard}`}>
          <div className={styles.cardTitleRow}>
            <div><span>VALUTAZIONI</span><h2>{state.ratings.average.toFixed(1).replace('.', ',')} / 5 <Star size={24} fill="currentColor" /></h2></div>
            <button type="button" onClick={() => setRatingsOpen((value) => !value)} aria-expanded={ratingsOpen}>{ratingsOpen ? 'Nascondi dettaglio' : 'Vedi dettaglio'}</button>
          </div>
          <p><strong>{state.ratings.verified_count} valutazioni verificate</strong> · Solo da partecipanti verificati</p>
          {ratingsOpen ? <div className={styles.ratingDetails}>{RATING_ROWS.map((label) => <div key={label}><span>{label}</span><i><b style={{ width: '0%' }} /></i><strong>0,0</strong></div>)}</div> : null}
        </section>
      ) : null}

      <section className={`${styles.card} ${styles.hostCard}`}>
        <div className={styles.hostHeader}><span>ESPERIENZA HOST</span><em>ORGANIZZATORE</em></div>
        <div className={styles.hostStats}>
          <article><strong>{state.host.events}</strong><span>EVENTI ORGANIZZATI</span></article>
          <article><strong>{state.host.participants}</strong><span>PARTECIPANTI OSPITATI</span></article>
        </div>
      </section>

      <section className={`${styles.card} ${styles.xpCard}`}>
        <div className={styles.levelBadge}>{state.xp.level}</div>
        <div><span>LIVELLO · XP</span><h2>Lv {state.xp.level} · {state.xp.total} XP</h2><p>{Math.max(0, state.xp.next_level_at - state.xp.total)} XP al Lv {state.xp.level + 1}</p></div>
        <div className={styles.progress}><i style={{ width: `${xpProgress}%` }} /></div>
        <small>XP = progressione, non affidabilità.</small>
      </section>

      {isPrivate ? (
        <section className={`${styles.card} ${styles.walletCard}`}>
          <div className={styles.cardTitleRow}><div><span>CREDITO MOTRICE</span><h2>{euro(walletTotal)} totali</h2></div><WalletCards size={34} aria-hidden="true" /></div>
          <div className={styles.walletStats}>
            <article><CreditCard size={18} /><span>Disponibili</span><strong>{euro(state.credit_wallet.available_cents)}</strong></article>
            <article><LockKeyhole size={18} /><span>Bloccati</span><strong>{euro(state.credit_wallet.locked_cents)}</strong></article>
          </div>
        </section>
      ) : null}

      {hasHistory ? (
        <section className={`${styles.card} ${styles.achievementsCard}`}>
          <div className={styles.cardTitleRow}><span>ACHIEVEMENT</span><small>4 obiettivi</small></div>
          <div className={styles.achievementGrid}>
            {state.achievements.slice(0, 4).map((item) => <article key={item.id} aria-label={`${item.label}, bloccato`}><i>{item.icon}</i><strong>{item.label}</strong><span>{item.detail}</span><LockKeyhole size={13} /></article>)}
          </div>
        </section>
      ) : null}

      {state.recent_activity.length ? (
        <section className={`${styles.card} ${styles.activityCard}`}>
          <span>ATTIVITÀ RECENTE</span>
          <ul>{state.recent_activity.map((item) => <li key={item.id}><CircleCheck size={22} /><div><strong>{item.title}</strong><p>{item.subtitle}</p></div></li>)}</ul>
        </section>
      ) : null}

      <section className={styles.legend} aria-label="Legenda sistemi Motrice">
        <p><CreditCard size={16} /><strong>CREDITO</strong><span>partecipazione</span></p>
        <p><Coins size={16} /><strong>MOT</strong><span>presenza QR</span></p>
        <p><Zap size={16} /><strong>XP</strong><span>progressione</span></p>
      </section>

      {!isPrivate ? <div className={styles.publicSticky}><button type="button" onClick={onInvite}><UserRoundPlus size={20} /> {publicActionLabel}</button></div> : null}
    </main>
  );
}

export default MotriceProfileV3;

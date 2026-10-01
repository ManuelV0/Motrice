import { useEffect, useMemo, useRef, useState } from 'react';
import BrandLogo from '../BrandLogo';
import {
  ArrowRight,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Dumbbell,
  ImagePlus,
  LockKeyhole,
  MapPin,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trash2,
  UserRound,
  UserRoundPlus,
  X,
  Zap
} from 'lucide-react';
import styles from '../../styles/components/profile/motriceProfileV3.module.css';
import ContextInfoButton from '../ContextInfoButton';

const RATING_ROWS = [
  ['punctuality', 'Puntualità'],
  ['respect', 'Correttezza'],
  ['collaboration', 'Collaborazione'],
  ['communication', 'Comunicazione'],
  ['organization', 'Organizzazione']
];
const SPORT_LEVELS = ['Principiante', 'Intermedio', 'Avanzato'];
const SPORT_OPTIONS = ['Calisthenics', 'Running', 'Palestra', 'Calcio', 'Padel', 'Tennis', 'Trekking', 'Basket', 'Yoga', 'Ciclismo', 'Nuoto'];
const TRAINING_GOALS = [
  'Forza e costanza',
  'Migliorare resistenza',
  'Socialità e benessere',
  'Preparazione gara'
];
const TRAINING_PREFERENCES = ['Allenamento intenso', 'In gruppo', 'Mattina', 'Sera'];

function normalizeSportProfiles(profile, identity) {
  const saved = Array.isArray(profile?.sport_profiles) ? profile.sport_profiles : [];
  const fallbackSports = Array.isArray(identity?.sports) && identity.sports.length
    ? identity.sports
    : [];
  const normalized = saved
    .map((item) => ({
      name: String(item?.name || '').trim(),
      level: SPORT_LEVELS.includes(String(item?.level || '')) ? String(item.level) : 'Principiante'
    }))
    .filter((item) => item.name)
    .slice(0, 6);
  if (normalized.length) return normalized;
  return fallbackSports.slice(0, 6).map((name, index) => ({
    name: String(name),
    level: index === 0 ? 'Intermedio' : 'Principiante'
  }));
}

function profileForm(profile, identity) {
  return {
    display_name: profile?.display_name || profile?.name || identity?.display_name || '',
    city: profile?.city || identity?.city || '',
    bio: profile?.bio || identity?.bio || '',
    avatar_url: profile?.avatar_url || identity?.avatar_url || '',
    cover_url: profile?.cover_url || identity?.cover_url || '',
    sport_profiles: normalizeSportProfiles(profile, identity),
    training_goal: String(profile?.training_goal || identity?.training_goal || ''),
    looking_for: String(profile?.looking_for || identity?.looking_for || ''),
    training_preferences: Array.isArray(profile?.training_preferences)
      ? profile.training_preferences.map(String).filter(Boolean).slice(0, 8)
      : Array.isArray(identity?.training_preferences)
        ? identity.training_preferences.map(String).filter(Boolean).slice(0, 8)
        : []
  };
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('Lettura immagine non riuscita')));
    reader.readAsDataURL(file);
  });
}

function formatActivityDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function MotriceProfileV3({
  profile,
  state,
  mode,
  onSaveProfile,
  onUploadMedia,
  moments = [],
  onUploadMoment,
  onDeleteMoment,
  onOpenXp,
  photoReview = { status: 'none' },
  onVerify,
  onInvite,
  isPremium = false,
  publicActionLabel = 'INVITA AD EVENTO'
}) {
  const [identityOpen, setIdentityOpen] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState('');
  const [activeProfileSection, setActiveProfileSection] = useState('overview');
  const [activeHighlight, setActiveHighlight] = useState('sport');
  const [saving, setSaving] = useState(false);
  const [uploadingKind, setUploadingKind] = useState('');
  const [uploadingMoment, setUploadingMoment] = useState(false);
  const [deletingMomentId, setDeletingMomentId] = useState('');
  const [selectedMoment, setSelectedMoment] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [momentError, setMomentError] = useState('');
  const [avatarConsentOpen, setAvatarConsentOpen] = useState(false);
  const [form, setForm] = useState(() => profileForm(profile, state?.identity));
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const momentInputRef = useRef(null);
  const editSnapshotRef = useRef(null);
  const profileSwipeRef = useRef(null);
  const profileTabIndicatorRef = useRef(null);

  useEffect(() => {
    if (!identityOpen) setForm(profileForm(profile, state?.identity));
  }, [identityOpen, profile, state?.identity]);

  const identity = state.identity;
  const displayName = form.display_name.trim() || identity.display_name || 'Atleta Motrice';
  const initials = displayName.slice(0, 1).toUpperCase();
  const reliability = state.reliability;
  const currentLevelStartsAt = Math.max(0, (state.xp.level - 1) * 250);
  const xpProgress = Math.min(100, Math.max(0, Math.round(
    ((state.xp.total - currentLevelStartsAt) / Math.max(1, state.xp.next_level_at - currentLevelStartsAt)) * 100
  )));
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
  const photoReviewStatus = String(photoReview?.status || 'none');
  const avatarReviewPending = photoReviewStatus === 'pending';
  const profileCompletion = Math.round(
    [form.display_name, form.city, form.bio, form.avatar_url, form.cover_url, form.training_goal, form.looking_for]
      .filter((value) => String(value || '').trim()).length / 7 * 100
  );
  const missingProfileFields = [
    !form.display_name && 'nome',
    !form.city && 'città',
    !form.bio && 'bio',
    !form.avatar_url && 'foto profilo',
    !form.cover_url && 'copertina',
    !form.training_goal && 'obiettivo',
    !form.looking_for && 'cosa cerchi'
  ].filter(Boolean);
  const hasHistory = verified > 0 || state.mot.total > 0 || state.recent_activity.length > 0;
  const lastMot = state.mot.logs?.[0];
  const availableRatingRows = RATING_ROWS.filter(([key]) => Number(state.ratings.breakdown?.[key] || 0) > 0);

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
        ['Cancellazioni tardive', reliability.late_cancellations],
        ['Calcolo', 'Esiti + valutazioni verificate']
      ]
    }
  }), [lastMot, reliability, state.host.events, state.host.participants, state.mot.total, verified]);

  async function saveIdentity(event) {
    event.preventDefault();
    setSaveError('');
    setSaving(true);
    try {
      const saved = await onSaveProfile(form);
      if (saved !== false) {
        editSnapshotRef.current = null;
        setIdentityOpen(false);
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
          document.getElementById('main-content')?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
        });
      } else {
        setSaveError('Non è stato possibile salvare il profilo. Controlla i dati e riprova.');
      }
    } catch (error) {
      setSaveError(error?.message || 'Non è stato possibile salvare il profilo. Riprova.');
    } finally {
      setSaving(false);
    }
  }

  function openIdentityEditor() {
    editSnapshotRef.current = {
      ...form,
      sport_profiles: form.sport_profiles.map((item) => ({ ...item })),
      training_preferences: [...form.training_preferences]
    };
    setMediaError('');
    setSaveError('');
    setIdentityOpen(true);
  }

  function closeIdentityEditor() {
    if (editSnapshotRef.current) setForm(editSnapshotRef.current);
    editSnapshotRef.current = null;
    setMediaError('');
    setSaveError('');
    setAvatarConsentOpen(false);
    setIdentityOpen(false);
  }

  async function selectMedia(event, kind) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !isPrivate) return;

    const field = kind === 'cover' ? 'cover_url' : 'avatar_url';
    const previous = {
      ...form,
      sport_profiles: form.sport_profiles.map((item) => ({ ...item })),
      training_preferences: [...form.training_preferences]
    };
    const previewUrl = URL.createObjectURL(file);
    setMediaError('');
    setUploadingKind(kind);
    setForm((current) => ({ ...current, [field]: previewUrl }));

    try {
      const uploadResult = onUploadMedia
        ? await onUploadMedia(file, kind)
        : await fileAsDataUrl(file);
      if (kind === 'avatar' && uploadResult && typeof uploadResult === 'object') {
        setForm(previous);
        return;
      }
      const uploadedUrl = String(uploadResult || '');
      setForm((current) => ({ ...current, [field]: uploadedUrl }));
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

  function selectProfileSection(section) {
    setActiveProfileSection(section);
    if (section === 'overview') setActiveHighlight('sport');
    if (section === 'achievements') setActiveHighlight('badge');
    if (section === 'moments') setActiveHighlight('');
    if (profileTabIndicatorRef.current) profileTabIndicatorRef.current.style.removeProperty('transform');
    if (section !== 'overview') {
      setActiveMetric('');
    }
  }

  function startProfileSwipe(event) {
    if (event.button !== 0) return;
    profileSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: performance.now(),
      deltaX: 0,
      velocity: 0,
      recognized: false
    };
  }

  function moveProfileSwipe(event) {
    const swipe = profileSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    if (!swipe.recognized) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
        profileSwipeRef.current = null;
        return;
      }
      swipe.recognized = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    event.preventDefault();
    const now = performance.now();
    swipe.velocity = (event.clientX - swipe.lastX) / Math.max(1, now - swipe.lastTime);
    swipe.lastX = event.clientX;
    swipe.lastTime = now;
    swipe.deltaX = Math.max(-72, Math.min(72, deltaX * 0.55));
    if (profileTabIndicatorRef.current) {
      profileTabIndicatorRef.current.style.transform = `translate3d(${swipe.deltaX}px, 0, 0)`;
    }
  }

  function finishProfileSwipe(event) {
    const swipe = profileSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    profileSwipeRef.current = null;
    if (profileTabIndicatorRef.current) profileTabIndicatorRef.current.style.removeProperty('transform');
    if (!swipe.recognized) return;

    const sections = ['overview', 'moments', 'achievements'];
    const currentIndex = sections.indexOf(activeProfileSection);
    if (swipe.deltaX <= -32 || swipe.velocity <= -0.45) {
      selectProfileSection(sections[Math.min(sections.length - 1, currentIndex + 1)]);
    } else if (swipe.deltaX >= 32 || swipe.velocity >= 0.45) {
      selectProfileSection(sections[Math.max(0, currentIndex - 1)]);
    }
  }

  function updateSportLevel(index, level) {
    setForm((current) => ({
      ...current,
      sport_profiles: current.sport_profiles.map((item, itemIndex) => (
        itemIndex === index ? { ...item, level } : item
      ))
    }));
  }

  function updateSportName(index, name) {
    setForm((current) => ({
      ...current,
      sport_profiles: current.sport_profiles.map((item, itemIndex) => (
        itemIndex === index ? { ...item, name } : item
      ))
    }));
  }

  function addSportProfile() {
    setForm((current) => {
      if (current.sport_profiles.length >= 6) return current;
      const firstAvailable = SPORT_OPTIONS.find((sport) => (
        !current.sport_profiles.some((item) => item.name === sport)
      )) || '';
      return {
        ...current,
        sport_profiles: [...current.sport_profiles, { name: firstAvailable, level: 'Principiante' }]
      };
    });
  }

  function removeSportProfile(index) {
    setForm((current) => ({
      ...current,
      sport_profiles: current.sport_profiles.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function toggleTrainingPreference(preference) {
    setForm((current) => {
      const selected = current.training_preferences.includes(preference);
      return {
        ...current,
        training_preferences: selected
          ? current.training_preferences.filter((item) => item !== preference)
          : [...current.training_preferences, preference]
      };
    });
  }

  async function selectMoments(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || !isPrivate || !onUploadMoment) return;

    setMomentError('');
    setUploadingMoment(true);
    try {
      for (const file of files) await onUploadMoment(file);
    } catch (error) {
      setMomentError(error?.message || 'Caricamento del momento non riuscito');
    } finally {
      setUploadingMoment(false);
    }
  }

  async function removeMoment(event, moment) {
    event.stopPropagation();
    if (!isPrivate || !onDeleteMoment || deletingMomentId) return;
    setMomentError('');
    setDeletingMomentId(moment.id);
    try {
      await onDeleteMoment(moment);
      if (selectedMoment?.id === moment.id) setSelectedMoment(null);
    } catch (error) {
      setMomentError(error?.message || 'Eliminazione del momento non riuscita');
    } finally {
      setDeletingMomentId('');
    }
  }

  const activeMetricDetail = activeMetric ? metricDetails[activeMetric] : null;
  const highlightDetails = {
    sport: {
      title: 'Sport',
      text: form.sport_profiles.length
        ? form.sport_profiles.map((sport) => `${sport.name} · ${sport.level}`).join('  •  ')
        : 'Aggiungi i tuoi sport dal profilo.'
    },
    host: {
      title: 'Host',
      text: `${state.host.events} ${state.host.events === 1 ? 'evento' : 'eventi'} · ${state.host.participants} ${state.host.participants === 1 ? 'persona ospitata' : 'persone ospitate'}`
    },
    xp: {
      title: 'Progressione',
      text: `Livello ${state.xp.level} · ${state.xp.total} XP · ${Math.max(0, state.xp.next_level_at - state.xp.total)} XP al prossimo livello`
    },
    badge: {
      title: 'Traguardi',
      text: `${state.achievements.length} obiettivi disponibili nel tuo percorso.`
    }
  };
  const activeHighlightDetail = highlightDetails[activeHighlight];

  function chooseHighlight(highlight) {
    if (highlight === 'xp' && isPrivate && onOpenXp) {
      onOpenXp();
      return;
    }
    if (highlight === 'badge') selectProfileSection('achievements');
    else selectProfileSection('overview');
    setActiveHighlight(highlight);
  }

  if (isPrivate && identityOpen) {
    return (
      <main className={`${styles.page} ${styles.editPage}`}>
        <header className={styles.editHeader}>
          <button type="button" onClick={closeIdentityEditor}>ANNULLA</button>
          <strong>MODIFICA PROFILO</strong>
          <button type="submit" form="profile-v3-edit-form" disabled={saving}>{saving ? 'SALVO…' : 'SALVA'}</button>
        </header>

        <section className={`${styles.card} ${styles.editMediaCard}`}>
          <div className={`${styles.coverMedia} ${styles.editCoverMedia} ${form.cover_url ? styles.coverWithImage : ''}`}>
            {form.cover_url ? (
              <img src={form.cover_url} alt="Anteprima copertina del profilo" />
            ) : (
              <span className={styles.coverFallback} aria-hidden="true">
                <BrandLogo className={styles.coverFallbackLogo} decorative />
                <small>MOTRICE</small>
              </span>
            )}
            <button
              type="button"
              className={styles.editCoverButton}
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingKind === 'cover'}
              aria-label="Scegli la copertina dalla galleria"
            >
              {uploadingKind === 'cover' ? <span className={styles.mediaSpinner} /> : <ImagePlus size={17} aria-hidden="true" />}
            </button>
            <input ref={coverInputRef} className={styles.mediaInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectMedia(event, 'cover')} />
          </div>

          <span className={`${styles.avatarWrap} ${styles.editAvatarWrap}`}>
            <span className={styles.avatarImageFrame}>
              {form.avatar_url ? <img src={form.avatar_url} alt={`Foto profilo di ${displayName}`} /> : <b>{initials}</b>}
            </span>
            <i aria-hidden="true" />
            <button
              type="button"
              className={styles.editAvatarButton}
              onClick={() => {
                if (verificationStatus !== 'verified') {
                  onVerify?.();
                  return;
                }
                setAvatarConsentOpen(true);
              }}
              disabled={uploadingKind === 'avatar' || avatarReviewPending}
              aria-label={avatarReviewPending ? 'Foto profilo in revisione' : 'Scegli la foto profilo dalla galleria'}
            >
              {uploadingKind === 'avatar' ? <span className={styles.mediaSpinner} /> : <Camera size={16} aria-hidden="true" />}
            </button>
          </span>
          <input ref={avatarInputRef} className={styles.mediaInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectMedia(event, 'avatar')} />
        </section>

        {avatarConsentOpen ? (
          <section className={styles.avatarConsent} role="dialog" aria-label="Consenso confronto foto profilo">
            <span><ShieldCheck size={19} /></span>
            <div>
              <strong>Confronto foto profilo</strong>
              <small>La nuova foto sarà confrontata con la foto privata di verifica. L’avatar attuale resta visibile fino all’approvazione.</small>
            </div>
            <div className={styles.avatarConsentActions}>
              <button type="button" onClick={() => setAvatarConsentOpen(false)}>Annulla</button>
              <button type="button" onClick={() => { setAvatarConsentOpen(false); avatarInputRef.current?.click(); }}>Accetto e scelgo</button>
            </div>
          </section>
        ) : null}

        {avatarReviewPending ? (
          <p className={styles.photoReviewStatus} role="status"><ShieldCheck size={16} /><span><strong>Nuova foto in verifica</strong>L’avatar attuale resta pubblico fino all’esito.</span></p>
        ) : null}
        {photoReviewStatus === 'rejected' ? (
          <p className={`${styles.photoReviewStatus} ${styles.photoReviewRejected}`} role="status"><ImagePlus size={16} /><span><strong>Foto non approvata</strong>{photoReview.rejection_reason || 'Scegli una foto frontale più nitida.'}</span></p>
        ) : null}

        <form id="profile-v3-edit-form" className={styles.editForm} onSubmit={saveIdentity}>
          <section className={`${styles.card} ${styles.editSection}`}>
            <div className={styles.editSectionTitle}>
              <UserRound size={17} aria-hidden="true" />
              <div><strong>Bio e dati personali</strong><span>Visibili nel profilo e negli eventi.</span></div>
            </div>
            <div className={styles.editFields}>
              <label>Nome<input value={form.display_name} maxLength={40} required onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label>
              <label>Città<input value={form.city} maxLength={80} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
              <label className={styles.editFullField}>Bio<textarea value={form.bio} maxLength={600} rows={4} placeholder="Racconta come ti alleni e cosa cerchi..." onChange={(event) => setForm({ ...form, bio: event.target.value })} /><small>{form.bio.length}/600</small></label>
            </div>
          </section>

          <section className={`${styles.card} ${styles.editSection}`}>
            <div className={styles.editSectionTitle}>
              <Dumbbell size={17} aria-hidden="true" />
              <div><strong>Identità sportiva</strong><span>I livelli aiutano a trovare persone compatibili.</span></div>
            </div>
            <div className={styles.sportProfileRows}>
              {form.sport_profiles.map((sport, index) => (
                <div className={styles.sportProfileRow} key={`${sport.name}-${index}`}>
                  <label className={styles.sportNameField}>
                    <span>Sport</span>
                    <select value={sport.name} onChange={(event) => updateSportName(index, event.target.value)} required>
                      <option value="">Seleziona sport</option>
                      {SPORT_OPTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Livello</span>
                    <select value={sport.level} onChange={(event) => updateSportLevel(index, event.target.value)}>
                      {SPORT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                  </label>
                  <button type="button" className={styles.removeSportButton} onClick={() => removeSportProfile(index)} aria-label={`Rimuovi ${sport.name || 'sport'}`}><Trash2 size={16} /></button>
                </div>
              ))}
              {form.sport_profiles.length < 6 ? <button type="button" className={styles.addSportButton} onClick={addSportProfile}><Dumbbell size={16} /> Aggiungi sport</button> : null}
            </div>
          </section>

          <section className={`${styles.card} ${styles.editSection}`}>
            <div className={styles.editSectionTitle}>
              <Target size={17} aria-hidden="true" />
              <div><strong>Obiettivi e preferenze</strong><span>Informazioni personali, non statistiche.</span></div>
            </div>
            <div className={styles.editFields}>
              <label className={styles.editFullField}>Obiettivo principale<select value={form.training_goal} onChange={(event) => setForm({ ...form, training_goal: event.target.value })}><option value="">Seleziona obiettivo</option>{TRAINING_GOALS.map((goal) => <option key={goal} value={goal}>{goal}</option>)}</select></label>
              <label className={styles.editFullField}>Cosa cerco<textarea value={form.looking_for} maxLength={300} rows={3} placeholder="Es. compagni costanti per allenarmi due volte a settimana" onChange={(event) => setForm({ ...form, looking_for: event.target.value })} /><small>{form.looking_for.length}/300</small></label>
              <fieldset className={styles.preferenceFieldset}>
                <legend>Preferenze</legend>
                <div>{TRAINING_PREFERENCES.map((preference) => {
                  const selected = form.training_preferences.includes(preference);
                  return <button type="button" key={preference} aria-pressed={selected} onClick={() => toggleTrainingPreference(preference)}>{preference}</button>;
                })}</div>
              </fieldset>
            </div>
          </section>

          <aside className={styles.lockedStatsNote}>
            <LockKeyhole size={18} aria-hidden="true" />
            <span><strong>Statistiche protette</strong>Eventi, MOT, affidabilità, valutazioni e XP si aggiornano automaticamente e non sono modificabili.</span>
          </aside>

          {mediaError ? <p className={styles.mediaError}>{mediaError}</p> : null}
          {saveError ? <p className={styles.mediaError} role="alert">{saveError}</p> : null}

          <div className={styles.editFooter}>
            <button type="button" onClick={closeIdentityEditor}>Annulla</button>
            <button type="submit" disabled={saving}><Save size={17} aria-hidden="true" /> {saving ? 'Salvataggio…' : 'Salva profilo'}</button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className={`${styles.page} ${!isPrivate ? styles.publicMode : ''}`}>
      <header className={styles.topHeader}>
        <span>PROFILO</span>
        {!isPrivate ? (
          <button
            type="button"
            className={styles[`verification_${verificationStatus}`]}
            aria-label={verificationLabel}
          >
            <i aria-hidden="true" /> {verificationLabel}
          </button>
        ) : null}
      </header>

      {isPrivate && verificationStatus !== 'verified' ? (
        <section className={styles.verificationBanner}>
          <span className={styles.verificationBannerIcon}><ShieldCheck size={22} /></span>
          <span>
            <strong>{verificationLabel}</strong>
            <small>{verificationStatus === 'pending'
              ? 'Puoi usare Motrice mentre completiamo la revisione.'
              : verificationStatus === 'suspended'
                ? 'Apri lo stato per conoscere i prossimi passaggi.'
                : 'Facoltativa nella beta: completa la verifica per ottenere il badge.'}</small>
          </span>
          <button type="button" onClick={onVerify}>{['pending', 'suspended'].includes(verificationStatus) ? 'Vedi stato' : 'Verifica'} <ArrowRight size={15} /></button>
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
        </div>

        <div className={styles.heroContent}>
          <div className={styles.profileTopRow}>
            <span className={styles.avatarWrap}>
              <span className={styles.avatarImageFrame}>
                {form.avatar_url ? <img src={form.avatar_url} alt={`Foto profilo di ${displayName}`} /> : <b>{initials}</b>}
              </span>
              <i aria-hidden="true" />
            </span>

            <div className={styles.metricButtons} aria-label="Statistiche del profilo">
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
          </div>

          <div className={styles.heroIdentity}>
            <span className={styles.nameLine}><strong>{displayName}</strong>{isPremium ? <em>PREMIUM</em> : null}</span>
            <span className={styles.locationLine}><MapPin size={14} aria-hidden="true" /> {form.city || identity.city ? `${form.city || identity.city} · ` : ''}Lv {state.xp.level}</span>
            <p className={styles.heroBio}>{form.bio.trim() || 'Aggiungi una bio per raccontare come ti alleni.'}</p>
            <span className={styles.sportPills}>{form.sport_profiles.map((sport, index) => <small key={`${sport.name}-${index}`}>{sport.name} · {sport.level}</small>)}</span>
          </div>

          <div className={styles.heroActions}>
            {isPrivate ? (
              <button type="button" onClick={openIdentityEditor}><Pencil size={14} /> Modifica profilo</button>
            ) : (
              <button type="button" className={styles.inviteHeroButton} onClick={onInvite}><UserRoundPlus size={14} /> Invita a evento</button>
            )}
          </div>

          {isPrivate && profileCompletion < 100 ? (
            <section className={styles.completionInline} aria-label={`Profilo completato al ${profileCompletion}%`}>
              <div><strong>Completa il profilo</strong><span>{profileCompletion}%</span></div>
              <i><b style={{ width: `${profileCompletion}%` }} /></i>
              <small>Mancano: {missingProfileFields.join(', ')}.</small>
            </section>
          ) : null}

          <div className={styles.profileHighlights} aria-label="In evidenza nel profilo">
            <button type="button" aria-pressed={activeHighlight === 'sport'} className={activeHighlight === 'sport' ? styles.profileHighlightActive : ''} onClick={() => chooseHighlight('sport')}>
              <span><Dumbbell size={20} /></span><strong>Sport</strong>
            </button>
            <button type="button" aria-pressed={activeHighlight === 'host'} className={activeHighlight === 'host' ? styles.profileHighlightActive : ''} onClick={() => chooseHighlight('host')}>
              <span><UserRoundPlus size={20} /></span><strong>Host</strong>
            </button>
            <button type="button" aria-pressed={activeHighlight === 'xp'} className={activeHighlight === 'xp' ? styles.profileHighlightActive : ''} onClick={() => chooseHighlight('xp')}>
              <span><Zap size={20} /></span><strong>XP</strong>
            </button>
            <button type="button" aria-pressed={activeHighlight === 'badge'} className={activeHighlight === 'badge' ? styles.profileHighlightActive : ''} onClick={() => chooseHighlight('badge')}>
              <span><Sparkles size={20} /></span><strong>Badge</strong>
            </button>
          </div>

          {activeHighlightDetail ? <p className={styles.highlightDetail} aria-live="polite"><strong>{activeHighlightDetail.title}</strong><span>{activeHighlightDetail.text}</span></p> : null}

          <div
            className={styles.profileSectionTabs}
            role="tablist"
            aria-label="Contenuto del profilo"
            onPointerDown={startProfileSwipe}
            onPointerMove={moveProfileSwipe}
            onPointerUp={finishProfileSwipe}
            onPointerCancel={finishProfileSwipe}
          >
            <span
              ref={profileTabIndicatorRef}
              className={`${styles.profileTabIndicator} ${activeProfileSection === 'moments' ? styles.profileTabIndicatorMoments : ''} ${activeProfileSection === 'achievements' ? styles.profileTabIndicatorAchievements : ''}`}
              aria-hidden="true"
            />
            <button
              type="button"
              role="tab"
              aria-selected={activeProfileSection === 'overview'}
              className={activeProfileSection === 'overview' ? styles.profileSectionActive : ''}
              onClick={() => selectProfileSection('overview')}
            >
              Panoramica
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeProfileSection === 'moments'}
              className={activeProfileSection === 'moments' ? styles.profileSectionActive : ''}
              onClick={() => selectProfileSection('moments')}
            >
              Momenti
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeProfileSection === 'achievements'}
              className={activeProfileSection === 'achievements' ? styles.profileSectionActive : ''}
              onClick={() => selectProfileSection('achievements')}
            >
              Traguardi
            </button>
          </div>

          {activeProfileSection === 'overview' && isPrivate && avatarReviewPending ? (
            <p className={styles.photoReviewStatus} role="status"><ShieldCheck size={16} /><span><strong>Nuova foto in verifica</strong>L’avatar attuale resta pubblico fino all’esito.</span></p>
          ) : null}
          {activeProfileSection === 'overview' && isPrivate && photoReviewStatus === 'rejected' ? (
            <p className={`${styles.photoReviewStatus} ${styles.photoReviewRejected}`} role="status"><ImagePlus size={16} /><span><strong>Foto non approvata</strong>{photoReview.rejection_reason || 'Scegli una foto frontale più nitida.'}</span></p>
          ) : null}

          {activeProfileSection === 'overview' && activeMetricDetail ? (
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

          {activeProfileSection === 'overview' ? (
            <div className={styles.metricsInfoRow}>
              <span>STATISTICHE VERIFICATE</span>
              <ContextInfoButton
                title="Statistiche del profilo"
                description="Questi valori vengono aggiornati automaticamente dalle attività verificate e non possono essere modificati manualmente."
                items={[
                  { title: 'Eventi', text: 'Conta gli eventi di gruppo organizzati, esclusi quelli personali e annullati.' },
                  { title: 'MOT', text: 'Premiano soprattutto le presenze confermate tramite il flusso di check-in.' },
                  { title: 'Affidabilità', text: 'Combina presenze, cancellazioni tardive, no-show e valutazioni verificate. Le recensioni incidono gradualmente fino al 20%.' },
                  { title: 'XP', text: 'Misurano la progressione nell’app e determinano livello e obiettivi.' }
                ]}
                note="MOT, XP, credito e affidabilità sono indicatori distinti e non si sostituiscono tra loro."
              />
            </div>
          ) : null}

          {mediaError ? <p className={styles.mediaError}>{mediaError}</p> : null}

        </div>
      </section>

      {activeProfileSection === 'moments' ? (
        <section className={styles.momentsPanel} role="tabpanel" aria-label="Momenti sportivi">
          <header className={styles.momentsHeader}>
            <div>
              <span>MOMENTI SPORTIVI</span>
              <h2>Il tuo percorso</h2>
              <p>Foto di allenamenti ed esperienze vissute.</p>
            </div>
          </header>

          <div className={styles.momentsGrid}>
            {moments.map((moment) => (
              <article
                className={styles.momentTile}
                key={moment.id}
              >
                <button type="button" className={styles.openMomentButton} onClick={() => setSelectedMoment(moment)} aria-label="Apri momento sportivo">
                  <img src={moment.image_url} alt="Momento sportivo" loading="lazy" />
                </button>
                <span>FOTO PERSONALE</span>
                {isPrivate ? (
                  <button
                    type="button"
                    className={styles.deleteMomentButton}
                    onClick={(event) => removeMoment(event, moment)}
                    disabled={deletingMomentId === moment.id}
                    aria-label="Rimuovi foto"
                  >
                    {deletingMomentId === moment.id ? <span className={styles.mediaSpinner} /> : <Trash2 size={14} />}
                  </button>
                ) : null}
              </article>
            ))}

            {isPrivate ? (
              <button
                type="button"
                className={`${styles.momentTile} ${styles.addMomentTile}`}
                onClick={() => momentInputRef.current?.click()}
                disabled={uploadingMoment}
              >
                {uploadingMoment ? <span className={styles.mediaSpinner} /> : <ImagePlus size={25} />}
                <strong>{uploadingMoment ? 'CARICAMENTO...' : 'AGGIUNGI FOTO'}</strong>
              </button>
            ) : null}
          </div>

          {!moments.length && !isPrivate ? (
            <div className={styles.emptyMoments}><ImagePlus size={26} /><strong>Nessun momento pubblicato</strong></div>
          ) : null}

          {isPrivate ? (
            <input
              ref={momentInputRef}
              className={styles.mediaInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={selectMoments}
            />
          ) : null}
          {momentError ? <p className={styles.momentsError}>{momentError}</p> : null}
        </section>
      ) : activeProfileSection === 'overview' ? (
        <>
      {!hasHistory ? (
        <section className={styles.firstEventCard}>
          <span><Sparkles size={20} /></span>
          <div><small>IL PROSSIMO PASSO</small><strong>Completa il primo evento</strong><p>Sblocca valutazioni, achievement e attività recente.</p></div>
          <ArrowRight size={18} />
        </section>
      ) : null}

      {(form.training_goal || form.looking_for || form.training_preferences.length > 0) ? (
        <section className={`${styles.card} ${styles.personalProfileCard}`}>
          <header>
            <span><Target size={16} aria-hidden="true" /></span>
            <div><small>PROFILO SPORTIVO</small><strong>Come mi piace allenarmi</strong></div>
          </header>
          <div className={styles.personalProfileGrid}>
            {form.training_goal ? <p><small>OBIETTIVO</small><strong>{form.training_goal}</strong></p> : null}
            {form.looking_for ? <p><small>COSA CERCO</small><strong>{form.looking_for}</strong></p> : null}
          </div>
          {form.training_preferences.length ? (
            <div className={styles.personalPreferencePills}>
              {form.training_preferences.map((preference) => <span key={preference}>{preference}</span>)}
            </div>
          ) : null}
        </section>
      ) : null}

      {state.ratings.verified_count > 0 ? (
        <section className={`${styles.card} ${styles.ratingsCard}`}>
          <div className={styles.cardTitleRow}>
            <div><span>VALUTAZIONI</span><h2>{state.ratings.average.toFixed(1).replace('.', ',')} / 5 <Star size={24} fill="currentColor" /></h2></div>
            <button type="button" onClick={() => setRatingsOpen((value) => !value)} aria-expanded={ratingsOpen}>{ratingsOpen ? 'Nascondi dettaglio' : 'Vedi dettaglio'}</button>
          </div>
          <p><strong>{state.ratings.verified_count} valutazioni verificate</strong> · Solo da partecipanti verificati</p>
          {ratingsOpen ? (
            availableRatingRows.length ? (
              <div className={styles.ratingDetails}>{availableRatingRows.map(([key, label]) => {
                const value = Number(state.ratings.breakdown?.[key] || 0);
                return <div key={key}><span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(100, value / 5 * 100))}%` }} /></i><strong>{value.toFixed(1).replace('.', ',')}</strong></div>;
              })}</div>
            ) : <p className={styles.ratingExplanation}>La media deriva esclusivamente dalle valutazioni inviate dopo eventi verificati.</p>
          ) : null}
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
        <small>Continua ad allenarti per raggiungere il prossimo livello.</small>
      </section>

      {state.recent_activity.length ? (
        <section className={`${styles.card} ${styles.activityCard}`}>
          <span>ATTIVITÀ RECENTE</span>
          <ul>{state.recent_activity.map((item) => <li key={item.id}><CircleCheck size={22} /><div><strong>{item.title}</strong><p>{item.subtitle}</p>{formatActivityDate(item.created_at) ? <time dateTime={item.created_at}>{formatActivityDate(item.created_at)}</time> : null}</div></li>)}</ul>
        </section>
      ) : null}
        </>
      ) : (
        <section className={`${styles.card} ${styles.achievementsCard} ${styles.achievementsPanel}`} role="tabpanel" aria-label="Traguardi del profilo">
          <header className={styles.achievementsHeader}>
            <span><Sparkles size={19} /></span>
            <div><small>TRAGUARDI</small><h2>Il tuo percorso</h2><p>Gli obiettivi si aggiornano con le attività verificate.</p></div>
          </header>
          <div className={styles.achievementGrid}>
            {state.achievements.map((item) => (
              <article key={item.id} className={item.unlocked ? styles.achievementUnlocked : ''} aria-label={`${item.label}, ${item.unlocked ? 'sbloccato' : 'bloccato'}`}>
                <i>{item.icon}</i><strong>{item.label}</strong><span>{item.detail}</span>{item.unlocked ? <CircleCheck size={14} /> : <LockKeyhole size={13} />}
              </article>
            ))}
          </div>
          {!state.achievements.length ? <p className={styles.emptyAchievements}>I primi traguardi compariranno qui.</p> : null}
        </section>
      )}

      {!isPrivate ? <div className={styles.publicSticky}><button type="button" onClick={onInvite}><UserRoundPlus size={20} /> {publicActionLabel}</button></div> : null}

      {selectedMoment ? (
        <div className={styles.momentLightbox} role="dialog" aria-modal="true" aria-label="Momento sportivo" onClick={() => setSelectedMoment(null)}>
          <div onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setSelectedMoment(null)} aria-label="Chiudi foto"><X size={21} /></button>
            <img src={selectedMoment.image_url} alt="Momento sportivo ingrandito" />
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default MotriceProfileV3;

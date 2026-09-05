import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  ImagePlus,
  Info,
  LockKeyhole,
  RefreshCw,
  ScanFace,
  Send,
  Shield,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSkeleton from '../components/LoadingSkeleton';
import BrandLogo from '../components/BrandLogo';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import { getAuthSession } from '../services/authSession';
import {
  getMyProfileVerification,
  markProfileVerificationOnboardingSeen,
  submitProfileVerification
} from '../services/profileVerification';
import {
  cameraResultToFile,
  captureProfileVerificationPhoto,
  consumeRestoredProfileCameraCapture,
  initializeProfileVerificationCamera,
  profileCameraRestoredEvent
} from '../services/profileVerificationCamera';
import styles from '../styles/pages/profileVerification.module.css';

const CHALLENGES = [
  { id: 'open_hand', emoji: '✋', title: 'Mano aperta', description: 'Tieni la mano aperta vicino al viso.' },
  { id: 'thumb_up', emoji: '👍', title: 'Pollice in su', description: 'Porta il pollice in su vicino alla spalla.' },
  { id: 'two_fingers', emoji: '✌️', title: 'Due dita', description: 'Mostra due dita mantenendo il viso visibile.' }
];

const SPORTS = ['Calisthenics', 'Running', 'Palestra', 'Calcio', 'Padel', 'Tennis', 'Trekking', 'Basket', 'Yoga'];
const MONTHS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre'
];
const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: CURRENT_YEAR - 1899 }, (_, index) => CURRENT_YEAR - index);

function splitBirthDate(value) {
  const [year = '', month = '', day = ''] = String(value || '').slice(0, 10).split('-');
  return { day, month, year };
}

function getMonthDays(year, month) {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

function isValidBirthDate(value) {
  const { day, month, year } = splitBirthDate(value);
  if (!day || !month || !year) return false;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year)
    && date.getMonth() === Number(month) - 1
    && date.getDate() === Number(day)
    && date <= new Date();
}

function splitDisplayName(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: words.shift() || '',
    lastName: words.join(' ')
  };
}

function statusCopy(status) {
  if (status === 'verified') {
    return {
      eyebrow: 'Esito verifica',
      title: 'Profilo verificato.',
      body: 'Il badge è attivo e puoi creare eventi, partecipare e usare il check-in QR.'
    };
  }
  if (status === 'suspended') {
    return {
      eyebrow: 'Verifica sospesa',
      title: 'Profilo temporaneamente sospeso.',
      body: 'Le funzioni sensibili restano bloccate. Contatta l’assistenza Motrice per una revisione.'
    };
  }
  return {
    eyebrow: 'Richiesta inviata',
    title: 'Verifica in revisione.',
    body: 'Ti avviseremo appena il controllo manuale sarà concluso. Nel frattempo puoi esplorare Motrice.'
  };
}

function ProfileVerificationPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const profileInputRef = useRef(null);
  const profileGalleryInputRef = useRef(null);
  const challengeInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cameraBusy, setCameraBusy] = useState('');
  const [cameraIssue, setCameraIssue] = useState('');
  const [step, setStep] = useState(0);
  const [summary, setSummary] = useState({ status: 'unverified', rejection_reason: '' });
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [challengePhoto, setChallengePhoto] = useState(null);
  const [profilePreview, setProfilePreview] = useState('');
  const [challengePreview, setChallengePreview] = useState('');
  const [consent, setConsent] = useState(false);
  const [challengeIndex, setChallengeIndex] = useState(() => Math.floor(Math.random() * CHALLENGES.length));
  const [birthDateParts, setBirthDateParts] = useState({ day: '', month: '', year: '' });
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    city: '',
    primarySport: 'Calisthenics',
    sportLevel: 'beginner',
    bio: ''
  });

  const challenge = CHALLENGES[challengeIndex];
  const copy = statusCopy(summary.status);

  usePageMeta({
    title: 'Verifica profilo | Motrice',
    description: 'Completa la verifica beta del profilo Motrice.'
  });

  useEffect(() => {
    const session = getAuthSession();
    if (!session.isAuthenticated) {
      navigate('/login', { replace: true });
      return undefined;
    }

    let active = true;
    Promise.all([api.getLocalProfile(), getMyProfileVerification()])
      .then(([profile, verification]) => {
        if (!active) return;
        const name = splitDisplayName(profile?.display_name || profile?.name);
        const birthDate = String(profile?.birth_date || '').slice(0, 10);
        setForm((current) => ({
          ...current,
          ...name,
          birthDate,
          city: profile?.city || '',
          sportLevel: ['beginner', 'intermediate', 'advanced'].includes(profile?.level)
            ? profile.level
            : 'beginner',
          bio: profile?.bio || ''
        }));
        setBirthDateParts(splitBirthDate(birthDate));
        setSummary(verification);
        if (['pending', 'verified', 'suspended'].includes(verification.status)) {
          markProfileVerificationOnboardingSeen();
          setStep(5);
        }
      })
      .catch((error) => showToast(error.message || 'Impossibile aprire la verifica', 'error'))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [navigate, showToast]);

  useEffect(() => () => {
    if (profilePreview.startsWith('blob:')) URL.revokeObjectURL(profilePreview);
  }, [profilePreview]);

  useEffect(() => () => {
    if (challengePreview.startsWith('blob:')) URL.revokeObjectURL(challengePreview);
  }, [challengePreview]);

  useEffect(() => {
    let active = true;

    async function restoreCapture(payload) {
      if (!active || !payload) return;
      if (payload.error || !payload.result) {
        setCameraIssue(payload.error || 'La fotocamera è stata interrotta. Riprova.');
        return;
      }
      try {
        const file = await cameraResultToFile(payload.result, payload.kind);
        if (!active) return;
        choosePhoto(payload.kind, file);
        setStep(payload.kind === 'challenge' ? 3 : 2);
        setCameraIssue('');
        showToast('Foto recuperata correttamente', 'success');
      } catch (error) {
        if (active) setCameraIssue(error.message || 'Impossibile recuperare la foto. Riprova.');
      }
    }

    const handleRestored = (event) => {
      consumeRestoredProfileCameraCapture();
      restoreCapture(event.detail);
    };
    window.addEventListener(profileCameraRestoredEvent, handleRestored);

    initializeProfileVerificationCamera()
      .then(() => {
        const restored = consumeRestoredProfileCameraCapture();
        if (restored) restoreCapture(restored);
      })
      .catch((error) => {
        if (active) setCameraIssue(error?.message || 'Fotocamera non disponibile. Puoi usare la galleria.');
      });

    return () => {
      active = false;
      window.removeEventListener(profileCameraRestoredEvent, handleRestored);
    };
  }, [showToast]);

  const canAdvance = useMemo(() => {
    if (step === 1) {
      return form.firstName.trim().length >= 2
        && form.lastName.trim().length >= 2
        && isValidBirthDate(form.birthDate)
        && form.city.trim().length >= 2
        && Boolean(form.primarySport);
    }
    if (step === 2) return Boolean(profilePhoto);
    if (step === 3) return Boolean(challengePhoto);
    if (step === 4) return consent;
    return true;
  }, [challengePhoto, consent, form, profilePhoto, step]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateBirthDatePart(field, value) {
    const next = { ...birthDateParts, [field]: value };
    const maxDay = getMonthDays(next.year, next.month);
    if (Number(next.day) > maxDay) next.day = String(maxDay).padStart(2, '0');
    const birthDate = next.day && next.month && next.year
      ? `${next.year}-${next.month}-${next.day}`
      : '';
    setBirthDateParts(next);
    setForm((currentForm) => ({ ...currentForm, birthDate }));
  }

  function choosePhoto(kind, file) {
    if (!file) return;
    if (Number(file.size || 0) > 8 * 1024 * 1024) {
      showToast('La foto non può superare 8 MB', 'error');
      return;
    }
    setCameraIssue('');
    const preview = URL.createObjectURL(file);
    if (kind === 'profile') {
      setProfilePhoto(file);
      setProfilePreview(preview);
    } else {
      setChallengePhoto(file);
      setChallengePreview(preview);
    }
  }

  async function openCamera(kind, fallbackInputRef) {
    if (cameraBusy) return;
    const isNative = Capacitor.isNativePlatform();
    setCameraBusy(kind);
    setCameraIssue('');
    try {
      const file = await captureProfileVerificationPhoto(kind);
      if (file) {
        choosePhoto(kind, file);
        showToast('Foto acquisita', 'success');
      } else if (!isNative) {
        fallbackInputRef.current?.click();
      }
    } catch (error) {
      const message = error.message || 'Fotocamera non disponibile. Usa la galleria.';
      setCameraIssue(message);
      showToast(message, 'error');
    } finally {
      setCameraBusy('');
    }
  }

  function skipVerification() {
    markProfileVerificationOnboardingSeen();
    navigate('/map', { replace: true });
  }

  async function sendVerification() {
    if (!canAdvance || submitting) return;
    setSubmitting(true);
    try {
      const result = await submitProfileVerification({
        ...form,
        profilePhoto,
        challengePhoto,
        challengeType: challenge.id
      });
      setSummary(result);
      setStep(5);
      showToast('Richiesta di verifica inviata', 'success');
    } catch (error) {
      showToast(error.message || 'Invio non riuscito', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    if (!canAdvance) return;
    if (step === 4) {
      sendVerification();
      return;
    }
    setStep((current) => Math.min(5, current + 1));
  }

  if (loading) return <LoadingSkeleton rows={5} variant="detail" />;

  return (
    <main className={styles.viewport}>
      <section className={styles.phone} aria-label="Verifica profilo Motrice">
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <BrandLogo className={styles.mark} decorative />
            <span><strong>MOTRICE</strong><small>Verifica profilo beta</small></span>
          </div>
          <span className={styles.stepCount}>{step + 1} / 6</span>
        </header>

        <div className={styles.progress} aria-label={`Passaggio ${step + 1} di 6`}>
          {Array.from({ length: 6 }, (_, index) => (
            <i key={index} className={index <= step ? styles.progressActive : ''} />
          ))}
        </div>

        <div className={styles.content}>
          {step === 0 ? (
            <>
              <p className={styles.eyebrow}>Prima di iniziare</p>
              <h1>Una community fatta di persone reali.</h1>
              <p className={styles.lead}>La verifica protegge chi crea e partecipa agli eventi. Richiede circa 2 minuti e durante la beta viene controllata manualmente.</p>

              {summary.status === 'rejected' || summary.status === 'expired' ? (
                <div className={styles.warning} role="alert">
                  <Info size={19} />
                  <span><strong>{summary.status === 'expired' ? 'Verifica scaduta' : 'Verifica da ripetere'}</strong>{summary.rejection_reason || 'Acquisisci nuovamente foto e challenge.'}</span>
                </div>
              ) : null}

              <section className={`${styles.card} ${styles.trustCard}`}>
                <div className={styles.row}>
                  <span className={styles.iconBox}><ShieldCheck size={22} /></span>
                  <span><strong>Profilo verificato Motrice</strong><small>Conferma che profilo, foto e challenge appartengano alla stessa persona.</small></span>
                </div>
                <div className={styles.lockGrid}>
                  <span><LockKeyhole size={14} /> Crea eventi</span>
                  <span><LockKeyhole size={14} /> Partecipa</span>
                  <span><LockKeyhole size={14} /> Check-in</span>
                </div>
                <p className={styles.note}><Eye size={16} /> Puoi comunque esplorare eventi e mappa.</p>
              </section>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <p className={styles.eyebrow}>Passaggio 1</p>
              <h1>Completa il tuo profilo.</h1>
              <p className={styles.lead}>Questi dati costruiscono la tua identità sportiva e saranno usati anche negli eventi.</p>
              <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
                <div className={styles.twoColumns}>
                  <label>Nome<input value={form.firstName} maxLength={40} autoComplete="given-name" onChange={(event) => updateField('firstName', event.target.value)} /></label>
                  <label>Cognome<input value={form.lastName} maxLength={40} autoComplete="family-name" onChange={(event) => updateField('lastName', event.target.value)} /></label>
                </div>
                <label>Data di nascita
                  <div className={styles.dateSelectors}>
                    <select aria-label="Giorno di nascita" value={birthDateParts.day} onChange={(event) => updateBirthDatePart('day', event.target.value)}>
                      <option value="">Giorno</option>
                      {Array.from({ length: getMonthDays(birthDateParts.year, birthDateParts.month) }, (_, index) => {
                        const day = String(index + 1).padStart(2, '0');
                        return <option key={day} value={day}>{index + 1}</option>;
                      })}
                    </select>
                    <select aria-label="Mese di nascita" value={birthDateParts.month} onChange={(event) => updateBirthDatePart('month', event.target.value)}>
                      <option value="">Mese</option>
                      {MONTHS.map((month, index) => {
                        const value = String(index + 1).padStart(2, '0');
                        return <option key={month} value={value}>{month}</option>;
                      })}
                    </select>
                    <select aria-label="Anno di nascita" value={birthDateParts.year} onChange={(event) => updateBirthDatePart('year', event.target.value)}>
                      <option value="">Anno</option>
                      {BIRTH_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </div>
                </label>
                <label>Città<input value={form.city} maxLength={80} autoComplete="address-level2" onChange={(event) => updateField('city', event.target.value)} /></label>
                <div className={styles.twoColumns}>
                  <label>Sport principale<select value={form.primarySport} onChange={(event) => updateField('primarySport', event.target.value)}>{SPORTS.map((sport) => <option key={sport}>{sport}</option>)}</select></label>
                  <label>Livello<select value={form.sportLevel} onChange={(event) => updateField('sportLevel', event.target.value)}><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzato</option></select></label>
                </div>
                <label>Bio sportiva<textarea rows={4} maxLength={600} value={form.bio} placeholder="Come ti alleni e cosa cerchi..." onChange={(event) => updateField('bio', event.target.value)} /></label>
              </form>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className={styles.eyebrow}>Passaggio 2</p>
              <h1>Scatta una foto per la verifica.</h1>
              <p className={styles.lead}>Viso ben visibile, luce frontale e niente occhiali scuri. La foto resterà privata e non sostituirà l’immagine del profilo.</p>
              <div className={styles.cameraFrame}>
                {profilePreview ? <img src={profilePreview} alt="Anteprima foto di verifica" /> : <span className={styles.silhouette}><UserRound size={62} /></span>}
                {profilePreview ? <span className={styles.captureOk}><Check size={18} /> Foto di verifica acquisita</span> : <small>Inquadra viso e spalle</small>}
              </div>
              <input ref={profileInputRef} className={styles.hiddenInput} type="file" accept="image/*" capture="user" onChange={(event) => { choosePhoto('profile', event.target.files?.[0]); event.target.value = ''; }} />
              <input ref={profileGalleryInputRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={(event) => { choosePhoto('profile', event.target.files?.[0]); event.target.value = ''; }} />
              <div className={styles.photoActions}>
                <button type="button" className={styles.primarySmall} disabled={Boolean(cameraBusy)} onClick={() => openCamera('profile', profileInputRef)}><Camera size={18} /> {cameraBusy === 'profile' ? 'Apertura...' : 'Scatta foto'}</button>
                <button type="button" onClick={() => profileGalleryInputRef.current?.click()}><ImagePlus size={18} /> Galleria</button>
              </div>
              {cameraIssue ? <p className={styles.cameraIssue} role="alert"><Info size={17} /> {cameraIssue}</p> : null}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className={styles.eyebrow}>Passaggio 3</p>
              <h1>Conferma che sei tu con un gesto.</h1>
              <p className={styles.lead}>È sufficiente una sola foto con il gesto mostrato. Se non ti è comodo, scegli “Cambia gesto”. L’immagine non sarà pubblica.</p>
              <div className={styles.gesture}>
                <b>{challenge.emoji}</b>
                <span><strong>{challenge.title}</strong><small>{challenge.description}</small></span>
              </div>
              <div className={styles.cameraFrame}>
                {challengePreview ? <img src={challengePreview} alt="Anteprima foto challenge" /> : <span className={styles.silhouette}><ScanFace size={62} /></span>}
                {challengePreview ? <span className={styles.captureOk}><Check size={18} /> Challenge acquisita</span> : <small>Viso e gesto devono essere visibili</small>}
              </div>
              <input ref={challengeInputRef} className={styles.hiddenInput} type="file" accept="image/*" capture="user" onChange={(event) => { choosePhoto('challenge', event.target.files?.[0]); event.target.value = ''; }} />
              <div className={styles.photoActions}>
                <button type="button" className={styles.orangeSmall} disabled={Boolean(cameraBusy)} onClick={() => openCamera('challenge', challengeInputRef)}><Camera size={18} /> {cameraBusy === 'challenge' ? 'Apertura...' : 'Scatta challenge'}</button>
                <button type="button" onClick={() => { setChallengePhoto(null); setChallengePreview(''); setChallengeIndex((current) => (current + 1) % CHALLENGES.length); }}><RefreshCw size={18} /> Cambia gesto</button>
              </div>
              {cameraIssue ? <p className={styles.cameraIssue} role="alert"><Info size={17} /> {cameraIssue}</p> : null}
              {challengePhoto ? <p className={styles.continueHint} role="status"><CheckCircle2 size={17} /> Foto acquisita. Premi “Avanti” per il controllo finale.</p> : null}
              <p className={styles.note}><Shield size={16} /> Foto privata, accessibile solo ai revisori autorizzati.</p>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <p className={styles.eyebrow}>Passaggio 4</p>
              <h1>Controlla e invia.</h1>
              <p className={styles.lead}>Nella beta la richiesta viene verificata manualmente. Non è una certificazione legale dell’identità.</p>
              <div className={styles.checklist}>
                <span><CheckCircle2 size={20} /><strong>Dati profilo completi<small>{form.firstName} {form.lastName} · {form.city}</small></strong></span>
                <span><CheckCircle2 size={20} /><strong>Foto di verifica acquisita<small>Privata e separata dall’immagine del profilo</small></strong></span>
                <span><CheckCircle2 size={20} /><strong>Challenge privata acquisita<small>Solo per la revisione</small></strong></span>
              </div>
              <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Confermo che dati e foto appartengono a me e accetto il trattamento necessario alla verifica.</span></label>
              <p className={styles.note}><Info size={16} /> La foto challenge sarà programmata per la rimozione entro 30 giorni dall’esito.</p>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <p className={styles.eyebrow}>{copy.eyebrow}</p>
              <h1>{copy.title}</h1>
              <p className={styles.lead}>{copy.body}</p>
              <div className={`${styles.statusCard} ${summary.status === 'verified' ? styles.statusVerified : ''}`}>
                <span className={styles.statusIcon}>{summary.status === 'verified' ? <BadgeCheck size={40} /> : <Clock3 size={40} />}</span>
                <h2>{summary.status === 'verified' ? 'Verifica completata' : summary.status === 'suspended' ? 'Accesso sospeso' : 'Stato: in attesa'}</h2>
                <p>{summary.status === 'verified' ? 'Il badge sarà visibile nel profilo pubblico e nelle schede evento.' : 'Creazione eventi, partecipazione, chat evento e check-in restano bloccati.'}</p>
                {summary.status === 'verified' ? <div className={styles.unlockGrid}><span>Crea eventi</span><span>Partecipa</span><span>Check-in QR</span></div> : null}
              </div>
            </>
          ) : null}
        </div>

        <footer className={styles.actions}>
          {step > 0 && step < 5 ? <button type="button" className={styles.backButton} aria-label="Indietro" onClick={() => setStep((current) => current - 1)}><ArrowLeft size={19} /></button> : null}
          {step === 0 ? <button type="button" className={styles.primaryButton} onClick={() => setStep(1)}>Inizia verifica <ArrowRight size={19} /></button> : null}
          {step > 0 && step < 4 ? <button type="button" className={styles.primaryButton} disabled={!canAdvance} onClick={goNext}>Avanti <ArrowRight size={19} /></button> : null}
          {step === 4 ? <button type="button" className={styles.primaryButton} disabled={!canAdvance || submitting} onClick={sendVerification}>{submitting ? 'Invio in corso...' : 'Invia verifica'} <Send size={18} /></button> : null}
          {step === 5 ? <button type="button" className={styles.primaryButton} onClick={() => navigate(summary.status === 'verified' ? '/account' : '/map', { replace: true })}>{summary.status === 'verified' ? 'Vai al profilo' : 'Continua su Motrice'} <ArrowRight size={19} /></button> : null}
          {step === 0 ? <button type="button" className={styles.skipButton} onClick={skipVerification}>Esplora per ora</button> : null}
        </footer>
      </section>
    </main>
  );
}

export default ProfileVerificationPage;

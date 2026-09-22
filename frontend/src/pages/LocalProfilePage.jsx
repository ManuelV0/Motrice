import {
  CheckCircle2,
  Dumbbell,
  MapPin,
  MessageCircleMore,
  Save,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import avatarPlaceholder from '../assets/avatar-placeholder.svg';
import Button from '../components/Button';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import styles from '../styles/pages/localProfile.module.css';

const EMPTY_FORM = {
  display_name: '',
  bio: '',
  city: '',
  level: 'beginner',
  avatar_url: ''
};

const LEVEL_LABELS = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzato'
};

function profileToForm(data) {
  return {
    display_name: String(data?.display_name || data?.name || ''),
    bio: String(data?.bio || ''),
    city: String(data?.city || ''),
    level: String(data?.level || 'beginner'),
    avatar_url: String(data?.avatar_url || '')
  };
}

function LocalProfilePage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  usePageMeta({
    title: 'Profilo personale | Motrice',
    description: 'Gestisci il nome, la foto e la bio visibili nella chat e negli eventi.'
  });

  useEffect(() => {
    let active = true;
    api.getLocalProfile().then((data) => {
      if (!active) return;
      setProfile(data);
      setForm(profileToForm(data));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setAvatarFailed(false);
  }, [form.avatar_url]);

  const avatarSrc = useMemo(
    () => (!avatarFailed && form.avatar_url ? form.avatar_url : avatarPlaceholder),
    [avatarFailed, form.avatar_url]
  );
  const displayName = form.display_name.trim() || 'Il tuo nome';
  const reliability = Math.max(0, Math.min(100, Number(profile?.reliability || 0)));

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updateLocalProfile(form);
      const refreshed = await api.getLocalProfile();
      setProfile(refreshed);
      setForm(profileToForm(refreshed));
      showToast('Profilo aggiornato anche nella chat', 'success');
    } catch (error) {
      showToast(error.message || 'Impossibile aggiornare il profilo', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <LoadingSkeleton rows={3} variant="detail" />;
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.avatarWrap}>
          <img
            className={styles.avatar}
            src={avatarSrc}
            alt={`Foto profilo di ${displayName}`}
            onError={() => setAvatarFailed(true)}
          />
          <span className={styles.avatarStatus} aria-label="Profilo attivo">
            <CheckCircle2 size={15} aria-hidden="true" />
          </span>
        </div>

        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Identità Motrice</span>
          <h1>{displayName}</h1>
          <p>Nome, foto e bio saranno visibili nei messaggi e negli eventi.</p>
        </div>

        <div className={styles.syncBadge}>
          <MessageCircleMore size={15} aria-hidden="true" />
          Sincronizzato con la chat
        </div>

        <div className={styles.identityTags}>
          <span>
            <MapPin size={14} aria-hidden="true" />
            {form.city || 'Aggiungi città'}
          </span>
          <span>
            <Dumbbell size={14} aria-hidden="true" />
            {LEVEL_LABELS[form.level] || 'Livello'}
          </span>
        </div>
      </section>

      <form className={styles.formCard} onSubmit={saveProfile}>
        <header className={styles.sectionHead}>
          <span className={styles.sectionIcon}>
            <UserRound size={19} aria-hidden="true" />
          </span>
          <div>
            <h2>Profilo pubblico</h2>
            <p>Queste informazioni identificano il tuo account nella community.</p>
          </div>
        </header>

        <div className={styles.fields}>
          <label className={styles.field}>
            <span>Nome visualizzato</span>
            <input
              value={form.display_name}
              onChange={(event) => updateField('display_name', event.target.value)}
              minLength={2}
              maxLength={40}
              autoComplete="name"
              placeholder="Come vuoi farti chiamare?"
              required
            />
            <small>È il nome mostrato sopra ogni tuo messaggio.</small>
          </label>

          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Bio</span>
            <textarea
              value={form.bio}
              onChange={(event) => updateField('bio', event.target.value)}
              maxLength={600}
              rows={5}
              placeholder="Racconta come ti piace allenarti e quali obiettivi vuoi raggiungere"
            />
            <small className={styles.counter}>{form.bio.length}/600</small>
          </label>

          <label className={styles.field}>
            <span>Città</span>
            <input
              value={form.city}
              onChange={(event) => updateField('city', event.target.value)}
              maxLength={80}
              autoComplete="address-level2"
              placeholder="Es. Roma"
            />
          </label>

          <label className={styles.field}>
            <span>Livello di allenamento</span>
            <select value={form.level} onChange={(event) => updateField('level', event.target.value)}>
              <option value="beginner">Principiante</option>
              <option value="intermediate">Intermedio</option>
              <option value="advanced">Avanzato</option>
            </select>
          </label>

          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>Foto profilo</span>
            <input
              type="url"
              value={form.avatar_url}
              onChange={(event) => updateField('avatar_url', event.target.value)}
              inputMode="url"
              autoComplete="url"
              placeholder="https://..."
            />
            <small>Inserisci il link diretto a un’immagine. Se non è disponibile useremo l’avatar Motrice.</small>
          </label>
        </div>

        <aside className={styles.chatPreview} aria-label="Anteprima identità nella chat">
          <div className={styles.previewAvatar}>
            <img src={avatarSrc} alt="" onError={() => setAvatarFailed(true)} />
          </div>
          <div>
            <span>Anteprima nella chat</span>
            <strong>{displayName}</strong>
            <p>{form.bio.trim() || 'La tua bio comparirà nella scheda aperta dalla chat.'}</p>
          </div>
        </aside>

        <div className={styles.saveBar}>
          <p>
            <ShieldCheck size={16} aria-hidden="true" />
            Salvataggio sicuro sul tuo profilo
          </p>
          <Button type="submit" icon={Save} disabled={saving} fullWidth>
            {saving ? 'Salvataggio...' : 'Salva modifiche'}
          </Button>
        </div>
      </form>

      <section className={styles.reliabilityCard}>
        <header className={styles.sectionHead}>
          <span className={styles.sectionIcon}>
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <div>
            <h2>Affidabilità</h2>
            <p>Il punteggio cresce partecipando con costanza agli eventi.</p>
          </div>
        </header>

        <div className={styles.scoreRow}>
          <div
            className={styles.scoreRing}
            style={{ '--profile-score': `${reliability * 3.6}deg` }}
            aria-label={`Affidabilità ${Math.round(reliability)}%`}
          >
            <strong>{Math.round(reliability)}%</strong>
            <span>score</span>
          </div>
          <div className={styles.scoreCopy}>
            <strong>{reliability >= 80 ? 'Profilo molto affidabile' : reliability > 0 ? 'Continua così' : 'Inizia a partecipare'}</strong>
            <p>Presenti / (presenti + no show + cancellati)</p>
          </div>
        </div>

        <div className={styles.stats}>
          <article>
            <span className={styles.statPositive}>{Number(profile.attended || 0)}</span>
            <p>Presenti</p>
          </article>
          <article>
            <span className={styles.statNegative}>{Number(profile.no_show || 0)}</span>
            <p>No show</p>
          </article>
          <article>
            <span>{Number(profile.cancelled || 0)}</span>
            <p>Cancellati</p>
          </article>
        </div>
      </section>
    </main>
  );
}

export default LocalProfilePage;

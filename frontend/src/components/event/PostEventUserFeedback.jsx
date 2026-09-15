import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  UsersRound,
  X
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { isEventFeedbackComplete } from '../../utils/eventFeedback';
import styles from '../../styles/components/event/postEventUserFeedback.module.css';

const EMPTY_RATINGS = {
  punctuality: 0,
  respect: 0,
  collaboration: 0,
  communication: 0,
  organization: 0
};

const RATING_FIELDS = [
  { key: 'punctuality', label: 'Puntualità', hint: 'Ha rispettato gli orari?' },
  { key: 'respect', label: 'Correttezza e rispetto', hint: 'Comportamento appropriato?' },
  { key: 'collaboration', label: 'Collaborazione', hint: 'Ha partecipato positivamente?' },
  { key: 'communication', label: 'Comunicazione', hint: 'È stato chiaro e disponibile?' }
];

const TAGS = [
  { value: 'puntuale', label: 'Puntuale' },
  { value: 'collaborativo', label: 'Collaborativo' },
  { value: 'motivante', label: 'Motivante' },
  { value: 'rispettoso', label: 'Rispettoso' },
  { value: 'comunicazione_chiara', label: 'Comunicazione chiara' },
  { value: 'poco_comunicativo', label: 'Poco comunicativo' },
  { value: 'indicazioni_chiare', label: 'Indicazioni chiare' }
];

function RatingRow({ field, value, onChange }) {
  return (
    <div className={styles.ratingRow}>
      <div>
        <strong>{field.label}</strong>
        <small>{field.hint}</small>
      </div>
      <div className={styles.stars} role="radiogroup" aria-label={field.label}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className={rating <= value ? styles.starActive : undefined}
            onClick={() => onChange(rating)}
            aria-label={`${field.label}: ${rating} ${rating === 1 ? 'stella' : 'stelle'}`}
            aria-pressed={rating === value}
          >
            <Star size={22} fill={rating <= value ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

function getTargetKey(target) {
  return String(target?.auth_user_id || target?.user_id || '');
}

function PostEventUserFeedback({
  eventId,
  enabled = true,
  bonusXp = 25,
  onCompleted,
  onTargetsChange,
  presentation = 'full',
  promptVisible = true
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [loadError, setLoadError] = useState('');
  const [ratings, setRatings] = useState(EMPTY_RATINGS);
  const [selectedTags, setSelectedTags] = useState([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [awardedXp, setAwardedXp] = useState(0);
  const [compactOpen, setCompactOpen] = useState(false);
  const [selectedTargetKey, setSelectedTargetKey] = useState('');
  const compactMode = presentation === 'completionDock';

  useEffect(() => {
    if (!enabled || !eventId) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setLoadError('');
    api.listEventReviewTargets(eventId)
      .then((result) => {
        if (!active) return;
        const nextTargets = Array.isArray(result) ? result : [];
        setTargets(nextTargets);
        onTargetsChange?.(nextTargets);
      })
      .catch((error) => {
        if (!active) return;
        onTargetsChange?.([]);
        setLoadError(error?.message || 'Valutazioni momentaneamente non disponibili');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [enabled, eventId]);

  const pendingTargets = useMemo(
    () => targets.filter((target) => !target.reviewed),
    [targets]
  );
  const currentTarget = pendingTargets.find((target) => getTargetKey(target) === selectedTargetKey)
    || pendingTargets[0]
    || null;
  const completedCount = targets.length - pendingTargets.length;
  const progress = targets.length ? Math.round((completedCount / targets.length) * 100) : 0;
  const fields = currentTarget?.role_key === 'organizer'
    ? [...RATING_FIELDS, { key: 'organization', label: 'Organizzazione evento', hint: 'Luogo e attività erano come descritti?' }]
    : RATING_FIELDS;
  const formComplete = isEventFeedbackComplete(ratings, currentTarget?.role_key === 'organizer');

  function resetForm() {
    setRatings(EMPTY_RATINGS);
    setSelectedTags([]);
    setReportOpen(false);
    setReportNote('');
  }

  function toggleTag(value) {
    setSelectedTags((current) => {
      if (current.includes(value)) return current.filter((tag) => tag !== value);
      if (current.length >= 4) return current;
      return [...current, value];
    });
  }

  async function submit({ skipped = false } = {}) {
    if (!currentTarget || submitting || (!skipped && !formComplete)) return;
    setSubmitting(true);
    try {
      const result = await api.submitEventUserReview({
        eventId,
        targetUserId: currentTarget.user_id,
        targetAuthUserId: currentTarget.auth_user_id,
        ...ratings,
        tags: selectedTags,
        reportNote,
        skipped
      });
      const bonus = Number(result?.bonus_xp || 0);
      if (bonus > 0) setAwardedXp(bonus);
      setTargets((current) => current.map((target) => (
        getTargetKey(target) === getTargetKey(currentTarget)
          ? { ...target, reviewed: true }
          : target
      )));
      resetForm();
      if (compactMode) {
        setCompactOpen(false);
        setSelectedTargetKey('');
      }
      if (result?.all_completed) {
        showToast(bonus > 0 ? `Valutazioni completate · +${bonus} XP` : 'Valutazioni completate', 'success');
        onCompleted?.(result);
      } else {
        showToast(skipped ? 'Persona saltata' : 'Valutazione salvata', 'success');
      }
    } catch (error) {
      showToast(error?.message || 'Impossibile salvare la valutazione', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!enabled || loading) {
    return enabled && !compactMode
      ? <section className={styles.loading} aria-label="Caricamento valutazioni"><span /></section>
      : null;
  }
  if (loadError) return null;
  if (!targets.length) return null;

  if (!currentTarget) {
    if (compactMode) return null;
    return (
      <section className={styles.completed} aria-live="polite">
        <span className={styles.completedIcon}><Check size={24} aria-hidden="true" /></span>
        <div>
          <small>FEEDBACK COMPLETATO</small>
          <h2>Grazie per la valutazione</h2>
          <p>I giudizi verificati contribuiranno all’affidabilità senza mostrare pubblicamente chi li ha inviati.</p>
        </div>
        <strong>{awardedXp > 0 ? `+${awardedXp} XP` : `Bonus ${bonusXp} XP assegnato`}</strong>
      </section>
    );
  }

  if (compactMode && !promptVisible) return null;

  if (compactMode && !compactOpen) {
    const manyParticipants = targets.length > 5;
    if (manyParticipants) {
      return createPortal(
        <aside className={styles.compactActionDock}>
          <button type="button" onClick={() => navigate(`/events/${eventId}/feedback`)}>
            <span aria-hidden="true"><UsersRound size={19} /></span>
            <strong>Valuta i partecipanti</strong>
            <small>+{bonusXp} XP</small>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </aside>,
        document.body
      );
    }
    return createPortal(
      <aside className={styles.compactDock} aria-labelledby="post-workout-feedback-title">
        <div className={styles.compactDockHeading}>
          <span aria-hidden="true"><UsersRound size={18} /></span>
          <div>
            <strong id="post-workout-feedback-title">Valuta chi si è allenato con te</strong>
            <small>Feedback verificato · +{bonusXp} XP complessivi</small>
          </div>
        </div>
        <div
          className={styles.compactPeople}
          style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(5, pendingTargets.length))}, minmax(0, 1fr))` }}
          aria-label="Persone disponibili per la valutazione"
        >
          {pendingTargets.map((target) => {
            const initial = String(target.display_name || 'U').trim().slice(0, 1).toUpperCase();
            return (
              <button
                key={getTargetKey(target)}
                type="button"
                onClick={() => {
                  setSelectedTargetKey(getTargetKey(target));
                  setCompactOpen(true);
                }}
              >
                <span>
                  {target.avatar_url
                    ? <img src={target.avatar_url} alt="" />
                    : initial}
                </span>
                <strong>{target.display_name || 'Utente Motrice'}</strong>
              </button>
            );
          })}
        </div>
      </aside>,
      document.body
    );
  }

  const initial = String(currentTarget.display_name || 'U').trim().slice(0, 1).toUpperCase();

  const feedbackPanel = (
    <section className={styles.panel} aria-labelledby="post-event-feedback-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><ShieldCheck size={15} aria-hidden="true" /> FEEDBACK VERIFICATO</span>
          <h2 id="post-event-feedback-title">Valuta le persone</h2>
          <p>Una persona alla volta. I dati reali dell’evento restano la parte principale dell’affidabilità.</p>
        </div>
        <span className={styles.bonus}><Sparkles size={16} aria-hidden="true" /> +{bonusXp} XP</span>
      </header>

      <div className={styles.progressHeader}>
        <span>{completedCount} di {targets.length} completate</span>
        <strong>{progress}%</strong>
      </div>
      <div className={styles.progress} role="progressbar" aria-label="Valutazioni completate" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className={styles.person}>
        <span className={styles.avatar}>
          {currentTarget.avatar_url
            ? <img src={currentTarget.avatar_url} alt="" />
            : <span aria-hidden="true">{initial || <UserRound size={22} />}</span>}
        </span>
        <div>
          <small>{currentTarget.role_key === 'organizer' ? 'ORGANIZZATORE' : 'PARTECIPANTE VERIFICATO'}</small>
          <strong>{currentTarget.display_name || 'Utente Motrice'}</strong>
        </div>
        <span>{completedCount + 1}/{targets.length}</span>
      </div>

      <div className={styles.ratingList}>
        {fields.map((field) => (
          <RatingRow
            key={field.key}
            field={field}
            value={ratings[field.key]}
            onChange={(value) => setRatings((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
      </div>

      <div className={styles.tags} aria-label="Qualità rapide">
        <span>Qualità osservate <small>massimo 4</small></span>
        <div>
          {TAGS.map((tag) => {
            const selected = selectedTags.includes(tag.value);
            return (
              <button
                key={tag.value}
                type="button"
                className={selected ? styles.tagSelected : undefined}
                aria-pressed={selected}
                onClick={() => toggleTag(tag.value)}
              >
                {selected ? <Check size={14} aria-hidden="true" /> : null}
                {tag.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.reportArea}>
        <button type="button" onClick={() => setReportOpen((open) => !open)} aria-expanded={reportOpen}>
          <AlertTriangle size={16} aria-hidden="true" /> Segnala un problema privato
          <ChevronRight size={16} className={reportOpen ? styles.reportChevronOpen : ''} aria-hidden="true" />
        </button>
        {reportOpen ? (
          <label>
            <span>Nota visibile soltanto al centro di controllo</span>
            <textarea
              rows={3}
              maxLength={500}
              value={reportNote}
              onChange={(event) => setReportNote(event.target.value)}
              placeholder="Descrivi brevemente cosa è successo"
            />
          </label>
        ) : null}
      </div>

      <footer className={styles.actions}>
        <button type="button" className={styles.skipButton} disabled={submitting} onClick={() => submit({ skipped: true })}>
          Non ho interagito abbastanza
        </button>
        <button type="button" className={styles.submitButton} disabled={submitting || !formComplete} onClick={() => submit()}>
          {submitting ? 'Salvataggio…' : pendingTargets.length === 1 ? 'Conferma e termina' : 'Conferma e continua'}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </footer>
      {!formComplete ? <p className={styles.formHint}>Seleziona da 1 a 5 stelle per ogni parametro.</p> : null}
    </section>
  );

  if (compactMode) {
    return createPortal(
      <div className={styles.feedbackSheetBackdrop} onPointerDown={() => setCompactOpen(false)}>
        <div className={styles.feedbackSheet} onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={styles.feedbackSheetClose}
            onClick={() => setCompactOpen(false)}
            aria-label="Chiudi valutazione"
          >
            <X size={21} aria-hidden="true" />
          </button>
          {feedbackPanel}
        </div>
      </div>,
      document.body
    );
  }

  return feedbackPanel;
}

export default PostEventUserFeedback;

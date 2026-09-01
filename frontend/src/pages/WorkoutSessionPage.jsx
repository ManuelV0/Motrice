import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Dumbbell,
  Gauge,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star
} from 'lucide-react';
import { api } from '../services/api';
import { getAuthSession } from '../services/authSession';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import {
  createWorkoutSession,
  normalizeWorkoutExercises,
  saveWorkoutSession
} from '../features/workout/services/workoutSessionStore';
import styles from '../styles/pages/workoutSession.module.css';

const EMPTY_REVIEW = {
  partnerRating: 5,
  organizerPunctuality: 5,
  descriptionAccuracy: 5,
  wouldJoinAgain: true,
  note: ''
};

function formatClock(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function isOrganizerForEvent(event, auth) {
  const identities = [auth.authUserId, auth.userId].filter(Boolean).map(String);
  return Boolean(
    event?.created_by === 'me' ||
    identities.includes(String(event?.organizerId || '')) ||
    identities.includes(String(event?.organizer?.auth_user_id || '')) ||
    event?.organizer?.id === 'me'
  );
}

function RatingRow({ label, value, onChange }) {
  return (
    <div className={styles.ratingRow}>
      <span>{label}</span>
      <div role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className={rating <= value ? styles.starActive : undefined}
            onClick={() => onChange(rating)}
            aria-label={`${rating} stelle`}
          >
            <Star size={20} fill={rating <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkoutSessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [event, setEvent] = useState(null);
  const [participation, setParticipation] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openExerciseId, setOpenExerciseId] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restTimer, setRestTimer] = useState({ exerciseId: '', remaining: 0, running: false });
  const [review, setReview] = useState(EMPTY_REVIEW);
  const auth = useMemo(() => getAuthSession(), []);

  usePageMeta({ title: 'Allenamento live · Motrice', description: 'Sessione allenamento Motrice' });

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const eventResult = await api.getEvent(id);
        if (!active) return;
        const organizer = isOrganizerForEvent(eventResult, auth);
        let progress = null;
        try {
          progress = await api.getEventParticipationProgress(id);
        } catch (progressError) {
          if (!organizer && !eventResult?.is_personal) throw progressError;
        }
        const exercises = normalizeWorkoutExercises(eventResult?.workout_plan?.exercises);
        if (!exercises.length) throw new Error('Questo evento non contiene una scheda allenamento.');
        const checkedParticipants = Math.max(0, Number(eventResult?.participants_checked_in_count || 0));
        const organizerLocationVerified = Boolean(progress?.organizer_present);
        const participantVerified = Boolean(
          eventResult?.is_personal ||
          progress?.checked_in_at ||
          Number(progress?.cashback_percent || eventResult?.user_rsvp?.cashback_percent || 0) >= 60
        );
        if (!participantVerified && !(organizer && (checkedParticipants > 0 || organizerLocationVerified))) {
          throw new Error(organizer
            ? 'Scannerizza il QR di un partecipante oppure conferma la geolocalizzazione.'
            : 'Verifica prima la presenza con QR Code o posizione.');
        }
        const remoteSession = await api.startEventWorkout(id);
        if (!active) return;
        const nextSession = createWorkoutSession(id, exercises, remoteSession);
        setEvent(eventResult);
        setParticipation(progress);
        setSession(nextSession);
        setOpenExerciseId(nextSession.currentExerciseId || exercises[0].id);
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Allenamento non disponibile.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [auth, id]);

  const exercises = useMemo(
    () => normalizeWorkoutExercises(event?.workout_plan?.exercises),
    [event?.workout_plan?.exercises]
  );
  const totals = useMemo(() => {
    const totalSets = exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
    const completedSets = exercises.reduce(
      (sum, exercise) => sum + Math.min(exercise.sets, Number(session?.completedSets?.[exercise.id] || 0)),
      0
    );
    return {
      totalSets,
      completedSets,
      percent: totalSets ? Math.round((completedSets / totalSets) * 100) : 0
    };
  }, [exercises, session?.completedSets]);

  useEffect(() => {
    if (!session?.startedAt || session?.completedAt) return undefined;
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session?.completedAt, session?.startedAt]);

  useEffect(() => {
    if (!restTimer.running || restTimer.remaining <= 0) return undefined;
    const timer = window.setInterval(() => {
      setRestTimer((current) => {
        if (!current.running || current.remaining <= 1) {
          if (current.remaining === 1 && navigator.vibrate) navigator.vibrate([80, 60, 80]);
          return { ...current, remaining: 0, running: false };
        }
        return { ...current, remaining: current.remaining - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restTimer.remaining, restTimer.running]);

  useEffect(() => {
    if (!session || totals.percent < 60 || session.sixtyPercentAwarded) return;
    let active = true;
    api.recordEventWorkoutProgress(id, totals.percent)
      .then((result) => {
        if (!active) return;
        const next = { ...session, sixtyPercentAwarded: true };
        setSession(saveWorkoutSession(id, next));
        if (Number(result?.mot_awarded || 0) > 0) {
          showToast(`60% raggiunto · +${result.mot_awarded} MOT`, 'success');
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [id, session, showToast, totals.percent]);

  function completeSet(exercise) {
    if (!session || session.completedAt) return;
    const current = Math.min(exercise.sets, Number(session.completedSets?.[exercise.id] || 0));
    if (current >= exercise.sets) return;
    const next = {
      ...session,
      currentExerciseId: exercise.id,
      completedSets: { ...session.completedSets, [exercise.id]: current + 1 }
    };
    setSession(saveWorkoutSession(id, next));
    if (exercise.recovery > 0 && current + 1 < exercise.sets) {
      setRestTimer({ exerciseId: exercise.id, remaining: exercise.recovery, running: true });
    }
    if (navigator.vibrate) navigator.vibrate(45);
  }

  function resetRest(exercise) {
    setRestTimer({ exerciseId: exercise.id, remaining: exercise.recovery, running: exercise.recovery > 0 });
  }

  async function finishWorkout() {
    if (!session || totals.percent < 100 || busy) return;
    setBusy(true);
    try {
      await api.recordEventWorkoutProgress(id, 100);
      const result = await api.completeEventWorkout(id);
      const next = {
        ...session,
        completedAt: result?.completed_at || new Date().toISOString(),
        completionAwarded: Boolean(result?.xp_awarded || session.completionAwarded)
      };
      setSession(saveWorkoutSession(id, next));
      showToast(`Allenamento completato · +${Number(result?.xp_awarded || 0)} XP`, 'success');
    } catch (finishError) {
      showToast(finishError?.message || 'Impossibile completare l’allenamento', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(eventSubmit) {
    eventSubmit.preventDefault();
    if (busy || session?.reviewSubmitted) return;
    setBusy(true);
    try {
      const result = await api.submitEventReview({ eventId: id, ...review });
      const next = { ...session, reviewSubmitted: true };
      setSession(saveWorkoutSession(id, next));
      showToast(`Questionario completato · +${Number(result?.bonus_xp || 0)} XP`, 'success');
    } catch (reviewError) {
      showToast(reviewError?.message || 'Questionario non salvato', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <section className={styles.statePage}><div className={styles.loader} /><p>Preparo la tua scheda…</p></section>;
  }

  if (error || !event || !session) {
    return (
      <section className={styles.statePage}>
        <span className={styles.lockIcon}><ShieldCheck size={30} /></span>
        <h1>Allenamento bloccato</h1>
        <p>{error || 'Sessione non disponibile.'}</p>
        <button type="button" onClick={() => navigate(`/events/${id}#verify-presence`)}>Verifica presenza</button>
      </section>
    );
  }

  const organizer = isOrganizerForEvent(event, auth);
  const verificationMode = String(event.verification_mode || 'both');
  const qrVerified = verificationMode !== 'geo' && Boolean(participation?.checked_in_at || organizer);
  const restExercise = exercises.find((exercise) => exercise.id === restTimer.exerciseId);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <button type="button" onClick={() => navigate(`/events/${id}`)} aria-label="Torna al dettaglio evento"><ArrowLeft /></button>
        <div><small>ALLENAMENTO LIVE</small><strong>{event.workout_plan?.title || event.title}</strong></div>
        <time>{formatClock(elapsedSeconds)}</time>
      </header>

      <main className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <span><Dumbbell size={24} /></span>
            <div><small>{event.sport_name || 'Motrice workout'}</small><h1>{event.title || event.workout_plan?.title}</h1></div>
          </div>
          <div className={styles.meta}>
            <span><MapPin size={15} /> {event.location_name || event.city}</span>
            <span><Clock3 size={15} /> {event.workout_plan?.duration || event.duration_minutes || 60} min</span>
            <span><Gauge size={15} /> {event.workout_plan?.level || 'Livello libero'}</span>
          </div>
          <div className={styles.progressHeading}><span>{totals.completedSets}/{totals.totalSets} serie</span><strong>{totals.percent}%</strong></div>
          <div className={styles.progress}><span style={{ width: `${totals.percent}%` }} /></div>
          <div className={styles.rewardLine}>
            <span className={qrVerified ? styles.rewardReached : undefined}>{qrVerified ? <Check /> : null}{qrVerified ? '+5 MOT · +25 XP QR' : '+2 MOT posizione'}</span>
            <span className={session.sixtyPercentAwarded ? styles.rewardReached : undefined}>{session.sixtyPercentAwarded ? <Check /> : null}+3 MOT al 60%</span>
            <span className={session.completionAwarded ? styles.rewardReached : undefined}>{session.completionAwarded ? <Check /> : null}+25 XP fine</span>
          </div>
        </section>

        <section className={styles.exerciseSection}>
          <div className={styles.sectionHeading}><div><small>SCHEDA PREIMPOSTATA</small><h2>Esercizi</h2></div><strong>{exercises.length}</strong></div>
          <div className={styles.exerciseList}>
            {exercises.map((exercise, index) => {
              const completed = Math.min(exercise.sets, Number(session.completedSets?.[exercise.id] || 0));
              const open = openExerciseId === exercise.id;
              return (
                <article key={exercise.id} className={`${styles.exerciseCard} ${completed === exercise.sets ? styles.exerciseComplete : ''}`}>
                  <button type="button" className={styles.exerciseSummary} onClick={() => setOpenExerciseId(open ? '' : exercise.id)}>
                    <span className={styles.exerciseIndex}>{String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{exercise.name}</strong><small>{exercise.sets} × {exercise.reps}{exercise.weight ? ` · ${exercise.weight} kg` : ''}</small></div>
                    <span className={styles.setCounter}>{completed}/{exercise.sets}</span>
                    <ChevronDown className={open ? styles.chevronOpen : ''} />
                  </button>
                  {open ? (
                    <div className={styles.exerciseDetails}>
                      <div className={styles.exerciseMetrics}>
                        <span><small>SERIE</small><strong>{exercise.sets}</strong></span>
                        <span><small>RIP.</small><strong>{exercise.reps}</strong></span>
                        <span><small>CARICO</small><strong>{exercise.weight ? `${exercise.weight} kg` : 'Corpo libero'}</strong></span>
                        <span><small>RIR</small><strong>{exercise.rir}</strong></span>
                        <span><small>RECUPERO</small><strong>{exercise.recovery ? `${exercise.recovery}s` : '—'}</strong></span>
                      </div>
                      <div className={styles.setDots}>
                        {Array.from({ length: exercise.sets }, (_, setIndex) => (
                          <button
                            key={`${exercise.id}-set-${setIndex + 1}`}
                            type="button"
                            className={setIndex < completed ? styles.setDone : undefined}
                            onClick={() => setIndex === completed && completeSet(exercise)}
                            disabled={setIndex > completed || Boolean(session.completedAt)}
                            aria-label={`Serie ${setIndex + 1} ${setIndex < completed ? 'completata' : ''}`}
                          >{setIndex < completed ? <Check size={18} /> : setIndex + 1}</button>
                        ))}
                      </div>
                      {completed < exercise.sets ? (
                        <button type="button" className={styles.completeSetButton} onClick={() => completeSet(exercise)} disabled={Boolean(session.completedAt)}>
                          <CheckCircle2 size={19} /> Completa serie {completed + 1}
                        </button>
                      ) : <p className={styles.exerciseDoneLabel}><CheckCircle2 size={18} /> Esercizio completato</p>}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        {session.completedAt ? (
          <section className={styles.completedCard}>
            <span><Check size={30} /></span>
            <div><small>SESSIONE COMPLETATA</small><h2>Ottimo allenamento</h2><p>+25 XP accreditati. Completa il questionario per altri +25 XP.</p></div>
          </section>
        ) : (
          <button type="button" className={styles.finishButton} disabled={totals.percent < 100 || busy} onClick={finishWorkout}>
            <CheckCircle2 /> {totals.percent < 100 ? `Completa ancora ${totals.totalSets - totals.completedSets} serie` : busy ? 'Salvataggio…' : 'Termina allenamento · +25 XP'}
          </button>
        )}

        {session.completedAt && !organizer && !session.reviewSubmitted ? (
          <form className={styles.reviewCard} onSubmit={submitReview}>
            <div><Sparkles /><span><small>BONUS FINALE</small><h2>Com’è andato l’allenamento?</h2></span><strong>+25 XP</strong></div>
            <RatingRow label="Compagni di allenamento" value={review.partnerRating} onChange={(value) => setReview((current) => ({ ...current, partnerRating: value }))} />
            <RatingRow label="Puntualità organizzatore" value={review.organizerPunctuality} onChange={(value) => setReview((current) => ({ ...current, organizerPunctuality: value }))} />
            <RatingRow label="Evento conforme alla descrizione" value={review.descriptionAccuracy} onChange={(value) => setReview((current) => ({ ...current, descriptionAccuracy: value }))} />
            <button type="submit" disabled={busy}>{busy ? 'Invio…' : 'Invia questionario · +25 XP'}</button>
          </form>
        ) : null}

        {session.reviewSubmitted ? <p className={styles.reviewDone}><Check /> Questionario completato e bonus assegnato</p> : null}
      </main>

      {restExercise && (restTimer.remaining > 0 || restTimer.running) ? (
        <aside className={styles.restDock} aria-live="polite">
          <div><small>RECUPERO · {restExercise.name}</small><strong>{formatClock(restTimer.remaining)}</strong></div>
          <button type="button" onClick={() => setRestTimer((current) => ({ ...current, running: !current.running }))} aria-label={restTimer.running ? 'Pausa timer' : 'Avvia timer'}>
            {restTimer.running ? <Pause /> : <Play />}
          </button>
          <button type="button" onClick={() => resetRest(restExercise)} aria-label="Riavvia recupero"><RotateCcw /></button>
          <button type="button" onClick={() => setRestTimer({ exerciseId: '', remaining: 0, running: false })}>Salta</button>
        </aside>
      ) : null}
    </section>
  );
}

export default WorkoutSessionPage;

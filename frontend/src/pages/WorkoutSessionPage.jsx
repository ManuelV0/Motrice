import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Dumbbell,
  Gauge,
  MapPin,
  Pause,
  Play,
  Save,
  Star,
  Undo2,
  Volume2,
  VolumeX,
  ShieldCheck
} from 'lucide-react';
import { api } from '../services/api';
import { getAuthSession } from '../services/authSession';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import {
  createWorkoutSession,
  normalizeWorkoutExercises,
  recordWorkoutSet,
  removeWorkoutSet,
  saveWorkoutSession
} from '../features/workout/services/workoutSessionStore';
import PostEventUserFeedback from '../components/event/PostEventUserFeedback';
import ContextInfoButton from '../components/ContextInfoButton';
import { getAppSettings, updateAppSettings } from '../services/appSettings';
import {
  cachePersonalWorkoutPlans,
  canSyncPersonalWorkoutPlans,
  listAvailablePersonalWorkoutPlans,
  listCachedPersonalWorkoutPlans,
  upsertPersonalWorkoutPlan
} from '../features/coach/services/personalWorkoutPlansApi';
import {
  applyWorkoutPlanSessionUpdate,
  buildWorkoutPlanUpdatePreview,
  findOwnedLinkedWorkoutPlan
} from '../utils/workoutPlanSessionUpdate';
import styles from '../styles/pages/workoutSession.module.css';

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

function formatPlanChangeValue(field, value) {
  if (field === 'weight') return Number(value) > 0 ? `${Number(value).toLocaleString('it-IT')} kg` : 'Corpo libero';
  if (field === 'recovery') return formatClock(value);
  return String(value);
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
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [undoAction, setUndoAction] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restTimer, setRestTimer] = useState({ exerciseId: '', duration: 0, remaining: 0, running: false, finished: false });
  const [loadDrafts, setLoadDrafts] = useState({});
  const [editingExerciseId, setEditingExerciseId] = useState('');
  const [exerciseDraft, setExerciseDraft] = useState(null);
  const [selfRatingDismissed, setSelfRatingDismissed] = useState(false);
  const [reviewTargetCount, setReviewTargetCount] = useState(0);
  const [linkedWorkoutPlan, setLinkedWorkoutPlan] = useState(null);
  const [planUpdateOpen, setPlanUpdateOpen] = useState(false);
  const [planUpdateBusy, setPlanUpdateBusy] = useState(false);
  const [countdownSoundEnabled, setCountdownSoundEnabled] = useState(() => getAppSettings().workoutCountdownSound);
  const [workoutVibrationEnabled, setWorkoutVibrationEnabled] = useState(() => getAppSettings().workoutVibration);
  const [keepWorkoutScreenAwake, setKeepWorkoutScreenAwake] = useState(() => getAppSettings().keepWorkoutScreenAwake);
  const audioContextRef = useRef(null);
  const wakeLockRef = useRef(null);
  const previousRestRemainingRef = useRef(0);
  const metricPressTimerRef = useRef(null);
  const auth = useMemo(() => getAuthSession(), []);

  usePageMeta({ title: 'Allenamento live · Motrice', description: 'Sessione allenamento Motrice' });

  function vibrate(pattern) {
    if (!workoutVibrationEnabled) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // La vibrazione e un feedback opzionale e non deve interrompere la sessione.
    }
  }

  useEffect(() => {
    function syncWorkoutSettings(event) {
      const next = event?.detail || getAppSettings();
      setCountdownSoundEnabled(next.workoutCountdownSound !== false);
      setWorkoutVibrationEnabled(next.workoutVibration !== false);
      setKeepWorkoutScreenAwake(next.keepWorkoutScreenAwake !== false);
    }

    window.addEventListener('motrice:app-settings-changed', syncWorkoutSettings);
    return () => window.removeEventListener('motrice:app-settings-changed', syncWorkoutSettings);
  }, []);

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
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Allenamento non disponibile.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [auth, id]);

  useEffect(() => {
    const linkedRemoteId = String(event?.scheda_id || event?.workout_plan?.remoteId || '').trim();
    if (!linkedRemoteId) {
      setLinkedWorkoutPlan(null);
      return undefined;
    }

    let active = true;
    listAvailablePersonalWorkoutPlans()
      .then((plans) => {
        if (!active) return;
        setLinkedWorkoutPlan(findOwnedLinkedWorkoutPlan(plans, linkedRemoteId));
      })
      .catch(() => {
        if (active) setLinkedWorkoutPlan(null);
      });
    return () => { active = false; };
  }, [event?.scheda_id, event?.workout_plan?.remoteId]);

  const exercises = useMemo(
    () => normalizeWorkoutExercises(event?.workout_plan?.exercises),
    [event?.workout_plan?.exercises]
  );
  const liveExercises = useMemo(() => exercises.map((exercise) => ({
    ...exercise,
    ...(session?.exerciseOverrides?.[exercise.id] || {})
  })), [exercises, session?.exerciseOverrides]);
  const planUpdatePreview = useMemo(() => buildWorkoutPlanUpdatePreview({
    plan: linkedWorkoutPlan,
    liveExercises,
    exerciseLoads: session?.exerciseLoads
  }), [linkedWorkoutPlan, liveExercises, session?.exerciseLoads]);
  const totals = useMemo(() => {
    const totalSets = liveExercises.reduce((sum, exercise) => sum + exercise.sets, 0);
    const completedSets = liveExercises.reduce(
      (sum, exercise) => sum + Math.min(exercise.sets, Number(session?.completedSets?.[exercise.id] || 0)),
      0
    );
    return {
      totalSets,
      completedSets,
      percent: totalSets ? Math.round((completedSets / totalSets) * 100) : 0
    };
  }, [liveExercises, session?.completedSets]);

  useEffect(() => {
    if (!session?.startedAt) return undefined;
    const startedAtMs = Date.parse(session.startedAt);
    const completedAtMs = session.completedAt ? Date.parse(session.completedAt) : null;
    const tick = () => {
      const endAtMs = Number.isFinite(completedAtMs) ? completedAtMs : Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((endAtMs - startedAtMs) / 1000)));
    };
    tick();
    if (Number.isFinite(completedAtMs)) return undefined;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session?.completedAt, session?.startedAt]);

  useEffect(() => {
    if (!restTimer.running || restTimer.remaining <= 0) return undefined;
    const timer = window.setInterval(() => {
      setRestTimer((current) => {
        if (!current.running || current.remaining <= 1) {
          if (current.remaining === 1) vibrate([80, 60, 80]);
          return { ...current, remaining: 0, running: false, finished: true };
        }
        if (current.remaining === 10) vibrate(40);
        return { ...current, remaining: current.remaining - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restTimer.remaining, restTimer.running, workoutVibrationEnabled]);

  useEffect(() => {
    if (!restTimer.finished) return undefined;
    const timeout = window.setTimeout(() => {
      setRestTimer({ exerciseId: '', duration: 0, remaining: 0, running: false, finished: false });
    }, 2600);
    return () => window.clearTimeout(timeout);
  }, [restTimer.finished]);

  useEffect(() => {
    try {
      updateAppSettings({ workoutCountdownSound: countdownSoundEnabled });
    } catch {
      // Il timer resta utilizzabile anche quando lo storage del browser è indisponibile.
    }
  }, [countdownSoundEnabled]);

  useEffect(() => {
    if (!keepWorkoutScreenAwake || !session?.startedAt || session?.completedAt) return undefined;
    let disposed = false;

    async function acquireWakeLock() {
      if (disposed || document.visibilityState !== 'visible' || !navigator?.wakeLock?.request) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = lock;
        lock.addEventListener?.('release', () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null;
        }, { once: true });
      } catch {
        wakeLockRef.current = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        acquireWakeLock();
      }
    }

    acquireWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      lock?.release?.().catch(() => undefined);
    };
  }, [keepWorkoutScreenAwake, session?.completedAt, session?.startedAt]);

  useEffect(() => () => {
    const context = audioContextRef.current;
    if (context && context.state !== 'closed') context.close().catch(() => undefined);
    if (metricPressTimerRef.current) window.clearTimeout(metricPressTimerRef.current);
  }, []);

  useEffect(() => {
    const previous = previousRestRemainingRef.current;
    const remaining = restTimer.remaining;
    previousRestRemainingRef.current = remaining;

    if (!countdownSoundEnabled || !restTimer.exerciseId) return;
    if (restTimer.running && remaining > 0 && remaining <= 5 && previous !== remaining) {
      playCountdownTone(680 + ((5 - remaining) * 75), false);
    } else if (remaining === 0 && previous === 1) {
      playCountdownTone(1080, true);
    }
  }, [countdownSoundEnabled, restTimer.exerciseId, restTimer.remaining, restTimer.running]);

  useEffect(() => {
    if (!undoAction?.expiresAt) return undefined;
    const timeout = window.setTimeout(
      () => setUndoAction(null),
      Math.max(0, undoAction.expiresAt - Date.now())
    );
    return () => window.clearTimeout(timeout);
  }, [undoAction?.expiresAt]);

  useEffect(() => {
    if (!editingExerciseId) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (keyboardEvent) => {
      if (keyboardEvent.key === 'Escape') closeExerciseEditor();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [editingExerciseId]);

  useEffect(() => {
    if (!planUpdateOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (keyboardEvent) => {
      if (keyboardEvent.key === 'Escape' && !planUpdateBusy) setPlanUpdateOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [planUpdateBusy, planUpdateOpen]);

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

  function getExerciseLoad(exercise) {
    const savedLoad = session?.exerciseLoads?.[exercise.id];
    const parsed = Number(savedLoad ?? exercise.weight ?? 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function updateExerciseLoad(exercise, value) {
    if (!session || session.completedAt) return;
    const parsed = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(parsed)) return;
    const normalized = Math.max(0, Math.min(1000, parsed));
    const next = {
      ...session,
      exerciseLoads: {
        ...(session.exerciseLoads || {}),
        [exercise.id]: normalized
      }
    };
    setSession(saveWorkoutSession(id, next));
    setLoadDrafts((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, exercise.id)) return current;
      const nextDrafts = { ...current };
      delete nextDrafts[exercise.id];
      return nextDrafts;
    });
  }

  function updateExerciseLoadDraft(exercise, value) {
    const nextValue = String(value || '').replace(',', '.');
    if (!/^\d{0,4}(?:\.\d{0,2})?$/.test(nextValue)) return;
    setLoadDrafts((current) => ({ ...current, [exercise.id]: nextValue }));
  }

  function commitExerciseLoadDraft(exercise) {
    if (!Object.prototype.hasOwnProperty.call(loadDrafts, exercise.id)) return;
    const draft = String(loadDrafts[exercise.id] || '').trim();
    if (!draft) {
      setLoadDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[exercise.id];
        return nextDrafts;
      });
      return;
    }
    updateExerciseLoad(exercise, draft);
  }

  function getEditableExerciseLoad(exercise) {
    if (Object.prototype.hasOwnProperty.call(loadDrafts, exercise.id)) {
      return loadDrafts[exercise.id];
    }
    return String(getExerciseLoad(exercise));
  }

  function getLoadAdjustmentBase(exercise) {
    const draft = loadDrafts[exercise.id];
    if (draft !== undefined && String(draft).trim() !== '') {
      const parsedDraft = Number(String(draft).replace(',', '.'));
      if (Number.isFinite(parsedDraft)) return Math.max(0, Math.min(1000, parsedDraft));
    }
    return getExerciseLoad(exercise);
  }

  function adjustExerciseLoad(exercise, delta) {
    updateExerciseLoad(exercise, Math.max(0, getLoadAdjustmentBase(exercise) + delta));
  }

  function ensureCountdownAudio(force = false) {
    if (!force && !countdownSoundEnabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => undefined);
    }
    return audioContextRef.current;
  }

  function playCountdownTone(frequency, completed) {
    const context = ensureCountdownAudio();
    if (!context) return;

    const scheduleTone = (offset, toneFrequency, duration, volume = 0.09) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + offset;
      oscillator.type = completed ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(toneFrequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    };

    scheduleTone(0, frequency, completed ? 0.15 : 0.09, completed ? 0.12 : 0.075);
    if (completed) scheduleTone(0.17, 1360, 0.22, 0.13);
  }

  function toggleCountdownSound() {
    const nextEnabled = !countdownSoundEnabled;
    setCountdownSoundEnabled(nextEnabled);
    if (nextEnabled) ensureCountdownAudio(true);
  }

  function openExerciseEditor(exercise) {
    if (!exercise || session?.completedAt) return;
    if (metricPressTimerRef.current) window.clearTimeout(metricPressTimerRef.current);
    metricPressTimerRef.current = null;
    setEditingExerciseId(exercise.id);
    setExerciseDraft({
      sets: exercise.sets,
      reps: exercise.reps,
      rir: exercise.rir,
      recovery: exercise.recovery
    });
    vibrate(35);
  }

  function startMetricPress(exercise) {
    if (session?.completedAt) return;
    if (metricPressTimerRef.current) window.clearTimeout(metricPressTimerRef.current);
    metricPressTimerRef.current = window.setTimeout(() => openExerciseEditor(exercise), 600);
  }

  function cancelMetricPress() {
    if (metricPressTimerRef.current) window.clearTimeout(metricPressTimerRef.current);
    metricPressTimerRef.current = null;
  }

  function closeExerciseEditor() {
    cancelMetricPress();
    setEditingExerciseId('');
    setExerciseDraft(null);
  }

  function updateExerciseDraft(field, value) {
    setExerciseDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function applyExerciseDraft() {
    if (!session || !exerciseDraft || !editingExerciseId) return;
    const exercise = liveExercises.find((item) => item.id === editingExerciseId);
    if (!exercise) return;
    const completed = Math.max(0, Number(session.completedSets?.[exercise.id] || 0));
    const previousRecovery = exercise.recovery;
    const nextOverride = {
      sets: Math.max(1, completed, Math.min(20, Math.round(Number(exerciseDraft.sets) || exercise.sets))),
      reps: String(exerciseDraft.reps || '').trim().slice(0, 12) || exercise.reps,
      rir: Math.max(0, Math.min(10, Math.round(Number(exerciseDraft.rir) || 0))),
      recovery: Math.max(0, Math.min(900, Math.round(Number(exerciseDraft.recovery) || 0)))
    };
    const nextSession = {
      ...session,
      exerciseOverrides: {
        ...(session.exerciseOverrides || {}),
        [exercise.id]: nextOverride
      }
    };
    setSession(saveWorkoutSession(id, nextSession));
    setRestTimer((current) => {
      if (current.exerciseId !== exercise.id || current.remaining <= 0) return current;
      const recoveryDelta = nextOverride.recovery - previousRecovery;
      const nextRemaining = Math.max(0, Math.min(nextOverride.recovery, current.remaining + recoveryDelta));
      return {
        ...current,
        duration: nextOverride.recovery,
        remaining: nextRemaining,
        running: nextRemaining > 0 && current.running,
        finished: nextRemaining === 0
      };
    });
    closeExerciseEditor();
    showToast('Parametri aggiornati solo per questa sessione', 'success');
  }

  function completeSet(exercise) {
    if (!session || session.completedAt) return;
    ensureCountdownAudio();
    const current = Math.min(exercise.sets, Number(session.completedSets?.[exercise.id] || 0));
    if (current >= exercise.sets) return;
    const completedNow = current + 1;
    const exerciseIndex = liveExercises.findIndex((item) => item.id === exercise.id);
    const nextExercise = liveExercises[exerciseIndex + 1];
    const nextExerciseId = completedNow >= exercise.sets && nextExercise ? nextExercise.id : exercise.id;
    const loadKg = getExerciseLoad(exercise);
    const completedLoads = Array.isArray(session.completedSetLoads?.[exercise.id])
      ? [...session.completedSetLoads[exercise.id]]
      : [];
    completedLoads[current] = loadKg;
    const next = {
      ...session,
      currentExerciseId: nextExerciseId,
      completedSets: { ...session.completedSets, [exercise.id]: completedNow },
      completedSetLoads: {
        ...(session.completedSetLoads || {}),
        [exercise.id]: completedLoads
      }
    };
    setSession(saveWorkoutSession(id, next));
    const recordedSet = recordWorkoutSet({
      eventId: id,
      exercise,
      setNumber: completedNow,
      weightKg: loadKg,
      reps: exercise.reps,
      rir: exercise.rir
    });
    api.recordWorkoutExerciseSet(recordedSet).catch(() => {});
    setUndoAction({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      setNumber: completedNow,
      expiresAt: Date.now() + 7000
    });
    if (exercise.recovery > 0 && (completedNow < exercise.sets || nextExercise)) {
      setRestTimer({
        exerciseId: exercise.id,
        duration: exercise.recovery,
        remaining: exercise.recovery,
        running: true,
        finished: false
      });
    }
    vibrate(45);
  }

  function undoLastSet(action = undoAction) {
    if (!action || !session || session.completedAt) return;
    const exercise = liveExercises.find((item) => item.id === action.exerciseId);
    if (!exercise) return;
    const current = Math.min(exercise.sets, Number(session.completedSets?.[exercise.id] || 0));
    if (current < action.setNumber) {
      setUndoAction(null);
      return;
    }
    const completedLoads = Array.isArray(session.completedSetLoads?.[exercise.id])
      ? session.completedSetLoads[exercise.id].slice(0, Math.max(0, action.setNumber - 1))
      : [];
    const next = {
      ...session,
      currentExerciseId: exercise.id,
      completedSets: {
        ...session.completedSets,
        [exercise.id]: Math.max(0, action.setNumber - 1)
      },
      completedSetLoads: {
        ...(session.completedSetLoads || {}),
        [exercise.id]: completedLoads
      }
    };
    setSession(saveWorkoutSession(id, next));
    removeWorkoutSet({ eventId: id, exerciseId: exercise.id, setNumber: action.setNumber });
    api.removeWorkoutExerciseSet({ eventId: id, exerciseId: exercise.id, setNumber: action.setNumber }).catch(() => {});
    setRestTimer({ exerciseId: '', duration: 0, remaining: 0, running: false, finished: false });
    setUndoAction(null);
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

  function rateCompletedWorkout(rating) {
    if (!session?.completedAt) return;
    const selfRating = Math.max(1, Math.min(5, Math.round(Number(rating) || 1)));
    const next = { ...session, selfRating };
    setSession(saveWorkoutSession(id, next));
    vibrate(35);
    showToast('Autovalutazione allenamento salvata', 'success');
  }

  function cacheUpdatedWorkoutPlan(nextPlan) {
    const cachedPlans = listCachedPersonalWorkoutPlans();
    const matchingIndex = cachedPlans.findIndex((plan) => String(plan?.id) === String(nextPlan?.id));
    cachePersonalWorkoutPlans(
      matchingIndex >= 0
        ? cachedPlans.map((plan, index) => (index === matchingIndex ? nextPlan : plan))
        : [nextPlan, ...cachedPlans]
    );
  }

  async function applyLiveValuesToWorkoutPlan() {
    if (!session?.completedAt || !linkedWorkoutPlan || !planUpdatePreview.length || planUpdateBusy) return;
    setPlanUpdateBusy(true);
    const appliedAt = new Date().toISOString();
    const localPlan = applyWorkoutPlanSessionUpdate(linkedWorkoutPlan, planUpdatePreview, appliedAt);
    let savedPlan = localPlan;
    let synchronized = false;

    cacheUpdatedWorkoutPlan(localPlan);
    try {
      if (canSyncPersonalWorkoutPlans()) {
        savedPlan = await upsertPersonalWorkoutPlan(localPlan);
        cacheUpdatedWorkoutPlan(savedPlan);
        synchronized = true;
      }
      setLinkedWorkoutPlan(savedPlan);
      const nextSession = {
        ...session,
        planUpdateAppliedAt: appliedAt,
        planUpdatePlanId: savedPlan.id
      };
      setSession(saveWorkoutSession(id, nextSession));
      setPlanUpdateOpen(false);
      showToast(
        synchronized
          ? 'Scheda aggiornata e sincronizzata'
          : 'Scheda aggiornata sul dispositivo',
        'success'
      );
    } catch {
      setLinkedWorkoutPlan(localPlan);
      const nextSession = {
        ...session,
        planUpdateAppliedAt: appliedAt,
        planUpdatePlanId: localPlan.id
      };
      setSession(saveWorkoutSession(id, nextSession));
      setPlanUpdateOpen(false);
      showToast('Scheda aggiornata sul dispositivo. La sincronizzazione verrà riprovata.', 'info');
    } finally {
      setPlanUpdateBusy(false);
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
  const restExercise = liveExercises.find((exercise) => exercise.id === restTimer.exerciseId);
  const firstIncompleteExerciseIndex = liveExercises.findIndex((exercise) => (
    Number(session.completedSets?.[exercise.id] || 0) < exercise.sets
  ));
  const currentExerciseIndex = firstIncompleteExerciseIndex >= 0
    ? firstIncompleteExerciseIndex
    : Math.max(0, liveExercises.length - 1);
  const currentExercise = liveExercises[currentExerciseIndex] || liveExercises[0];
  const queuedExercises = liveExercises
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise }) => exercise.id !== currentExercise?.id);
  const nextExercise = firstIncompleteExerciseIndex >= 0
    ? liveExercises[firstIncompleteExerciseIndex + 1] || null
    : null;
  const editingExercise = liveExercises.find((exercise) => exercise.id === editingExerciseId) || null;
  const editingExerciseCompletedSets = editingExercise
    ? Math.max(0, Number(session.completedSets?.[editingExercise.id] || 0))
    : 0;
  const rewardSummary = session.completedAt || session.completionAwarded
    ? 'Tutti i traguardi raggiunti'
    : session.sixtyPercentAwarded
      ? 'Prossimo traguardo: conclusione'
      : 'Prossimo traguardo: 60% della scheda';

  function renderExerciseCard(exercise, index) {
    const completed = Math.min(exercise.sets, Number(session.completedSets?.[exercise.id] || 0));
    const isComplete = completed === exercise.sets;
    const metricPressProps = {
      onPointerDown: () => startMetricPress(exercise),
      onPointerUp: cancelMetricPress,
      onPointerCancel: cancelMetricPress,
      onPointerLeave: cancelMetricPress,
      onContextMenu: (contextEvent) => contextEvent.preventDefault(),
      onClick: (clickEvent) => {
        if (clickEvent.detail === 0) openExerciseEditor(exercise);
      }
    };

    return (
      <article
        key={exercise.id}
        className={`${styles.exerciseCard} ${styles.exerciseCurrent} ${isComplete ? styles.exerciseComplete : ''}`}
      >
        <div
          className={styles.exerciseSummary}
        >
          <span className={styles.exerciseIndex}>{isComplete ? <Check size={18} /> : String(index + 1).padStart(2, '0')}</span>
          <div>
            <small className={styles.exerciseState}>{isComplete ? 'COMPLETATO' : 'IN CORSO'}</small>
            <strong>{exercise.name}</strong>
            <small>{exercise.sets} × {exercise.reps}{getExerciseLoad(exercise) ? ` · ${getExerciseLoad(exercise)} kg` : ' · Corpo libero'}</small>
          </div>
          <span className={styles.setCounter}>{completed}/{exercise.sets}</span>
        </div>
        <div className={styles.exerciseDetails}>
          <div className={styles.exerciseMetrics}>
            <button type="button" {...metricPressProps} aria-label={`Serie: ${exercise.sets}. Tieni premuto per modificare`}><strong>{exercise.sets}</strong><small>serie</small></button>
            <button type="button" {...metricPressProps} aria-label={`Ripetizioni: ${exercise.reps}. Tieni premuto per modificare`}><strong>{exercise.reps}</strong><small>ripetizioni</small></button>
            <button type="button" {...metricPressProps} aria-label={`RIR target: ${exercise.rir}. Tieni premuto per modificare`}><strong>{exercise.rir}</strong><small>RIR target</small></button>
            <button type="button" {...metricPressProps} aria-label={`Recupero: ${formatClock(exercise.recovery)}. Tieni premuto per modificare`}><strong>{exercise.recovery ? formatClock(exercise.recovery) : '—'}</strong><small>recupero</small></button>
          </div>
          <div className={styles.metricEditHint}>
            <span>Tieni premuto un valore per modificarlo</span>
          </div>
          <div className={styles.loadEditor}>
            <span>
              <small>CARICO PROSSIMA SERIE</small>
              <strong>Regolalo prima di confermare</strong>
            </span>
            <span className={styles.loadStepper}>
              <button
                type="button"
                onClick={() => adjustExerciseLoad(exercise, -2.5)}
                disabled={Boolean(session.completedAt) || isComplete || getExerciseLoad(exercise) <= 0}
                aria-label={`Riduci il carico di ${exercise.name}`}
              >
                <span aria-hidden="true">−</span>
              </button>
              <span className={styles.loadInput}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getEditableExerciseLoad(exercise)}
                  onFocus={(focusEvent) => focusEvent.currentTarget.select()}
                  onClick={(clickEvent) => clickEvent.currentTarget.select()}
                  onChange={(eventChange) => updateExerciseLoadDraft(exercise, eventChange.target.value)}
                  onBlur={() => commitExerciseLoadDraft(exercise)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === 'Enter') keyEvent.currentTarget.blur();
                  }}
                  disabled={Boolean(session.completedAt) || isComplete}
                  aria-label={`Carico ${exercise.name} in chilogrammi`}
                />
                <b>kg</b>
              </span>
              <button
                type="button"
                onClick={() => adjustExerciseLoad(exercise, 2.5)}
                disabled={Boolean(session.completedAt) || isComplete}
                aria-label={`Aumenta il carico di ${exercise.name}`}
              >
                <span aria-hidden="true">+</span>
              </button>
            </span>
          </div>
          <div className={styles.setProgressLabel}>
            <span>PROGRESSO SERIE</span>
            <span>
              {completed > 0 && !isComplete ? (
                <button
                  type="button"
                  className={styles.inlineUndoButton}
                  onClick={() => undoLastSet({
                    exerciseId: exercise.id,
                    exerciseName: exercise.name,
                    setNumber: completed
                  })}
                >Annulla ultima serie</button>
              ) : null}
              <strong>{completed} di {exercise.sets}</strong>
            </span>
          </div>
          <div className={styles.setDots} role="list" aria-label={`Progresso serie di ${exercise.name}`}>
            {Array.from({ length: exercise.sets }, (_, setIndex) => (
              <span
                key={`${exercise.id}-set-${setIndex + 1}`}
                className={setIndex < completed ? styles.setDone : undefined}
                role="listitem"
                aria-label={`Serie ${setIndex + 1} ${setIndex < completed ? 'completata' : 'da completare'}`}
              >{setIndex < completed ? <Check size={18} /> : setIndex + 1}</span>
            ))}
          </div>
          {completed < exercise.sets ? (
            <button type="button" className={styles.completeSetButton} onClick={() => completeSet(exercise)} disabled={Boolean(session.completedAt)}>
              <CheckCircle2 size={19} /> Completa serie {completed + 1}
            </button>
          ) : <p className={styles.exerciseDoneLabel}><CheckCircle2 size={18} /> Esercizio completato</p>}
        </div>
      </article>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <button type="button" onClick={() => navigate(`/events/${id}`)} aria-label="Torna al dettaglio evento"><span aria-hidden="true">←</span></button>
        <div><small>ALLENAMENTO LIVE</small><strong>{event.workout_plan?.title || event.title}</strong></div>
        <time className={restExercise && (restTimer.remaining > 0 || restTimer.running || restTimer.finished) ? styles.sessionTimerDimmed : undefined}>
          <small>SESSIONE</small><span>{formatClock(elapsedSeconds)}</span>
        </time>
        {restExercise && (restTimer.remaining > 0 || restTimer.running || restTimer.finished) ? (
          <aside
            className={`${styles.restDock} ${restTimer.remaining > 0 && restTimer.remaining <= 5 ? styles.restDockUrgent : ''} ${restTimer.finished ? styles.restDockFinished : ''}`}
            aria-label={`Recupero ${restExercise.name}`}
          >
            <div className={styles.restDockInfo}>
              <small>RECUPERO · {restExercise.name}</small>
              <strong>{restTimer.finished ? 'Recupero terminato' : formatClock(restTimer.remaining)}</strong>
              <span className={styles.restProgress}><i style={{ width: `${restTimer.duration ? Math.min(100, (restTimer.remaining / restTimer.duration) * 100) : 0}%` }} /></span>
            </div>
            <div className={styles.restDockControls}>
              <button
                type="button"
                onClick={() => setRestTimer((current) => ({ ...current, running: !current.running }))}
                aria-label={restTimer.running ? 'Pausa timer' : 'Avvia timer'}
                disabled={restTimer.finished}
              >
                {restTimer.running ? <Pause size={18} strokeWidth={2.5} aria-hidden="true" /> : <Play size={18} strokeWidth={2.5} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className={styles.soundToggle}
                onClick={toggleCountdownSound}
                aria-label={countdownSoundEnabled ? 'Disattiva suono recupero' : 'Attiva suono recupero'}
                aria-pressed={countdownSoundEnabled}
              >
                {countdownSoundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
              </button>
              <button
                type="button"
                className={styles.addRestButton}
                onClick={() => setRestTimer((current) => ({
                  ...current,
                  duration: current.duration + 30,
                  remaining: current.remaining + 30,
                  running: true,
                  finished: false
                }))}
                aria-label="Aggiungi 30 secondi al recupero"
              >+30</button>
            </div>
            <button
              type="button"
              className={styles.skipRestButton}
              onClick={() => setRestTimer({ exerciseId: '', duration: 0, remaining: 0, running: false, finished: false })}
            >{restTimer.finished ? 'Chiudi' : 'Salta'}</button>
            {restTimer.finished ? <span className={styles.visuallyHidden} aria-live="assertive">Recupero terminato</span> : null}
          </aside>
        ) : null}
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
          <div className={styles.progressPanel}>
            <div className={styles.progressHeading}>
              <div><small>PROGRESSO SESSIONE</small><span>{totals.completedSets} di {totals.totalSets} serie</span></div>
              <span className={styles.progressActions}>
                <ContextInfoButton
                  title="Allenamento e ricompense"
                  description="La scheda registra le serie completate e aggiorna progressione e ricompense durante la sessione."
                  items={[
                    { title: 'Serie', text: 'Conferma ogni serie soltanto dopo averla realmente completata.' },
                    { title: 'Carichi e recupero', text: 'Annota i carichi e rispetta il recupero indicato prima di proseguire.' },
                    { title: 'Ricompense', text: 'Check-in, avanzamento e conclusione vengono registrati in momenti distinti.' }
                  ]}
                  note="Uscire dalla schermata non annulla la sessione: puoi riaprirla dall’evento in corso."
                />
                <strong>{totals.percent}%</strong>
              </span>
            </div>
            <div className={styles.progress}><span style={{ width: `${totals.percent}%` }} /></div>
          </div>
          <button
            type="button"
            className={styles.rewardSummary}
            onClick={() => setRewardsOpen((open) => !open)}
            aria-expanded={rewardsOpen}
          >
            <span><small>RICOMPENSE</small><strong>{rewardSummary}</strong></span>
            <ChevronDown className={rewardsOpen ? styles.chevronOpen : ''} aria-hidden="true" />
          </button>
          {rewardsOpen ? (
            <div className={styles.rewardTimeline} aria-label="Ricompense allenamento">
              <span className={qrVerified ? styles.rewardReached : undefined}>
                <i>{qrVerified ? <Check size={14} /> : '1'}</i><b>Verifica</b><small>{qrVerified ? '+5 MOT · +25 XP' : '+2 MOT posizione'}</small>
              </span>
              <span className={session.sixtyPercentAwarded ? styles.rewardReached : undefined}>
                <i>{session.sixtyPercentAwarded ? <Check size={14} /> : '2'}</i><b>60% scheda</b><small>+3 MOT</small>
              </span>
              <span className={session.completionAwarded ? styles.rewardReached : undefined}>
                <i>{session.completionAwarded ? <Check size={14} /> : '3'}</i><b>Conclusione</b><small>+25 XP</small>
              </span>
            </div>
          ) : null}
        </section>

        <section className={styles.exerciseSection}>
          <div className={styles.sectionHeading}>
            <h2>ESERCIZIO ATTUALE</h2>
            <strong>{Math.min(currentExerciseIndex + 1, liveExercises.length)}/{liveExercises.length}</strong>
          </div>
          <div className={styles.exerciseList}>
            {currentExercise ? renderExerciseCard(currentExercise, currentExerciseIndex) : null}
          </div>
          {queuedExercises.length ? (
            <div className={styles.exerciseQueue}>
              <div className={styles.queuePreview}>
                <div>
                  <small>{nextExercise ? 'PROSSIMO ESERCIZIO' : 'SCHEDA COMPLETATA'}</small>
                  <strong>{nextExercise?.name || 'Tutte le serie completate'}</strong>
                  {nextExercise ? <span>{nextExercise.sets} × {nextExercise.reps} · recupero {formatClock(nextExercise.recovery)}</span> : null}
                </div>
                <button type="button" onClick={() => setQueueOpen((open) => !open)} aria-expanded={queueOpen}>
                  {queueOpen ? 'Nascondi' : 'Vedi scheda'}
                  <ChevronDown className={queueOpen ? styles.chevronOpen : ''} aria-hidden="true" />
                </button>
              </div>
              {queueOpen ? (
                <div className={styles.queueList}>
                  {queuedExercises.map(({ exercise, index }) => {
                    const completed = Number(session.completedSets?.[exercise.id] || 0) >= exercise.sets;
                    return (
                      <article key={exercise.id} className={completed ? styles.queueItemComplete : undefined}>
                        <span>{completed ? <Check size={17} aria-hidden="true" /> : String(index + 1).padStart(2, '0')}</span>
                        <div><strong>{exercise.name}</strong><small>{exercise.sets} × {exercise.reps} · {getExerciseLoad(exercise) ? `${getExerciseLoad(exercise)} kg` : 'Corpo libero'}</small></div>
                        <small>{completed ? 'Fatto' : 'Da fare'}</small>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {session.completedAt ? (
          <>
            <section className={styles.completedCard}>
              <span><Check size={30} /></span>
              <div>
                <small>SESSIONE COMPLETATA</small>
                <h2>Ottimo allenamento</h2>
                <p>
                  +25 XP accreditati.
                  {reviewTargetCount > 0 ? ' Puoi ottenere altri +25 XP valutando chi si è allenato con te.' : ''}
                </p>
                {session.selfRating ? (
                  <span className={styles.savedSelfRating} aria-label={`Autovalutazione ${session.selfRating} su 5`}>
                    <Star size={14} fill="currentColor" aria-hidden="true" /> La tua valutazione: {session.selfRating}/5
                  </span>
                ) : null}
              </div>
            </section>
            {linkedWorkoutPlan && planUpdatePreview.length > 0 && !session.planUpdateAppliedAt ? (
              <section className={styles.planUpdateCard}>
                <span><Save size={21} aria-hidden="true" /></span>
                <div>
                  <small>SCHEDA PERSONALE</small>
                  <strong>Aggiorna con i valori di oggi</strong>
                  <p>{planUpdatePreview.length} {planUpdatePreview.length === 1 ? 'esercizio modificato' : 'esercizi modificati'} durante il live.</p>
                </div>
                <button type="button" onClick={() => setPlanUpdateOpen(true)}>Controlla</button>
              </section>
            ) : null}
            {linkedWorkoutPlan && session.planUpdateAppliedAt ? (
              <p className={styles.planUpdateDone}><CheckCircle2 size={17} aria-hidden="true" /> Scheda aggiornata con i valori di questo allenamento</p>
            ) : null}
          </>
        ) : (
          <button type="button" className={`${styles.finishButton} ${totals.percent >= 100 ? styles.finishButtonReady : ''}`} disabled={totals.percent < 100 || busy} onClick={finishWorkout}>
            <CheckCircle2 /> {totals.percent < 100 ? `Completa ancora ${totals.totalSets - totals.completedSets} serie` : busy ? 'Salvataggio…' : 'Termina allenamento · +25 XP'}
          </button>
        )}

        <PostEventUserFeedback
          eventId={id}
          enabled={Boolean(session.completedAt)}
          bonusXp={Number(event.review_bonus_xp || 25)}
          presentation="completionDock"
          promptVisible={Boolean(session.selfRating || selfRatingDismissed)}
          onTargetsChange={(targets) => setReviewTargetCount(targets.filter((target) => !target.reviewed).length)}
          onCompleted={() => {
            const next = { ...session, reviewSubmitted: true };
            setSession(saveWorkoutSession(id, next));
          }}
        />
      </main>

      {editingExercise && exerciseDraft ? createPortal(
        <div className={styles.liveEditorBackdrop} onPointerDown={closeExerciseEditor}>
          <section
            className={styles.liveEditorSheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-exercise-editor-title"
            onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
          >
            <span className={styles.liveEditorHandle} aria-hidden="true" />
            <header className={styles.liveEditorHeader}>
              <div>
                <small>MODIFICA SESSIONE LIVE</small>
                <h2 id="live-exercise-editor-title">{editingExercise.name}</h2>
              </div>
              <button type="button" onClick={closeExerciseEditor}>Annulla</button>
            </header>

            <div className={styles.liveEditorGrid}>
              <article>
                <span><small>SERIE</small><strong>{exerciseDraft.sets}</strong></span>
                <div className={styles.liveEditorStepper}>
                  <button
                    type="button"
                    onClick={() => updateExerciseDraft('sets', Math.max(1, editingExerciseCompletedSets, Number(exerciseDraft.sets) - 1))}
                    disabled={Number(exerciseDraft.sets) <= Math.max(1, editingExerciseCompletedSets)}
                    aria-label="Riduci serie"
                  >−</button>
                  <button
                    type="button"
                    onClick={() => updateExerciseDraft('sets', Math.min(20, Number(exerciseDraft.sets) + 1))}
                    disabled={Number(exerciseDraft.sets) >= 20}
                    aria-label="Aumenta serie"
                  >+</button>
                </div>
                <small>{editingExerciseCompletedSets ? `${editingExerciseCompletedSets} già completate` : 'Massimo 20'}</small>
              </article>

              <article>
                <label htmlFor="live-reps"><small>RIPETIZIONI</small></label>
                <input
                  id="live-reps"
                  type="text"
                  inputMode="numeric"
                  maxLength="12"
                  value={exerciseDraft.reps}
                  onChange={(changeEvent) => updateExerciseDraft('reps', changeEvent.target.value)}
                  aria-label="Ripetizioni della sessione"
                />
                <small>Numero o intervallo, es. 8-10</small>
              </article>

              <article>
                <span><small>RIR TARGET</small><strong>{exerciseDraft.rir}</strong></span>
                <div className={styles.liveEditorStepper}>
                  <button type="button" onClick={() => updateExerciseDraft('rir', Math.max(0, Number(exerciseDraft.rir) - 1))} disabled={Number(exerciseDraft.rir) <= 0} aria-label="Riduci RIR">−</button>
                  <button type="button" onClick={() => updateExerciseDraft('rir', Math.min(10, Number(exerciseDraft.rir) + 1))} disabled={Number(exerciseDraft.rir) >= 10} aria-label="Aumenta RIR">+</button>
                </div>
                <small>Da 0 a 10</small>
              </article>

              <article>
                <span><small>RECUPERO</small><strong>{formatClock(exerciseDraft.recovery)}</strong></span>
                <div className={styles.liveEditorStepper}>
                  <button type="button" onClick={() => updateExerciseDraft('recovery', Math.max(0, Number(exerciseDraft.recovery) - 30))} disabled={Number(exerciseDraft.recovery) <= 0} aria-label="Riduci recupero di 30 secondi">−30</button>
                  <button type="button" onClick={() => updateExerciseDraft('recovery', Math.min(900, Number(exerciseDraft.recovery) + 30))} disabled={Number(exerciseDraft.recovery) >= 900} aria-label="Aumenta recupero di 30 secondi">+30</button>
                </div>
                <small>Modifica anche il timer attivo</small>
              </article>
            </div>

            <p className={styles.liveEditorNote}>Le modifiche valgono solo per questo allenamento. La scheda originale rimane invariata.</p>
            <button type="button" className={styles.liveEditorApply} onClick={applyExerciseDraft}>Applica alla sessione</button>
          </section>
        </div>,
        document.body
      ) : null}

      {planUpdateOpen && linkedWorkoutPlan && planUpdatePreview.length > 0 ? createPortal(
        <div
          className={styles.liveEditorBackdrop}
          onPointerDown={() => { if (!planUpdateBusy) setPlanUpdateOpen(false); }}
        >
          <section
            className={`${styles.liveEditorSheet} ${styles.planUpdateSheet}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-update-title"
            onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
          >
            <span className={styles.liveEditorHandle} aria-hidden="true" />
            <header className={styles.liveEditorHeader}>
              <div>
                <small>CONFERMA AGGIORNAMENTO</small>
                <h2 id="plan-update-title">{linkedWorkoutPlan.title}</h2>
              </div>
              <button type="button" onClick={() => setPlanUpdateOpen(false)} disabled={planUpdateBusy}>Annulla</button>
            </header>
            <p className={styles.planUpdateIntro}>Controlla le differenze. Nulla viene cambiato finché non confermi.</p>
            <div className={styles.planUpdateList}>
              {planUpdatePreview.map((exercise) => (
                <article key={`${exercise.planExerciseIndex}-${exercise.exerciseId}`}>
                  <strong>{exercise.name}</strong>
                  <div>
                    {exercise.changes.map((change) => (
                      <span key={change.field}>
                        <small>{change.label}</small>
                        <del>{formatPlanChangeValue(change.field, change.before)}</del>
                        <b aria-hidden="true">→</b>
                        <ins>{formatPlanChangeValue(change.field, change.after)}</ins>
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <p className={styles.liveEditorNote}>L’aggiornamento riguarda solo la tua scheda personale. Lo storico dell’allenamento rimane invariato.</p>
            <button
              type="button"
              className={styles.liveEditorApply}
              onClick={applyLiveValuesToWorkoutPlan}
              disabled={planUpdateBusy}
            >{planUpdateBusy ? 'Aggiornamento…' : 'Aggiorna la scheda'}</button>
          </section>
        </div>,
        document.body
      ) : null}

      {undoAction ? createPortal(
        <aside className={styles.undoToast} aria-live="polite">
          <div><small>SERIE REGISTRATA</small><strong>{undoAction.exerciseName} · serie {undoAction.setNumber}</strong></div>
          <button type="button" onClick={() => undoLastSet()}><Undo2 size={17} aria-hidden="true" /> Annulla</button>
        </aside>,
        document.body
      ) : null}

      {session.completedAt && !session.selfRating && !selfRatingDismissed ? createPortal(
        <aside className={styles.selfRatingDock} aria-labelledby="workout-self-rating-title">
          <div className={styles.selfRatingHeading}>
            <span><small>AUTOVALUTAZIONE</small><strong id="workout-self-rating-title">Com’è andato l’allenamento?</strong></span>
            <button type="button" onClick={() => setSelfRatingDismissed(true)}>Più tardi</button>
          </div>
          <div className={styles.selfRatingStars} role="group" aria-label="Valuta il tuo allenamento da una a cinque stelle">
            {['Molto difficile', 'Difficile', 'Nella media', 'Ottimo', 'Eccellente'].map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => rateCompletedWorkout(index + 1)}
                aria-label={`${index + 1} stelle: ${label}`}
                title={label}
              ><Star aria-hidden="true" /></button>
            ))}
          </div>
        </aside>,
        document.body
      ) : null}

    </section>
  );
}

export default WorkoutSessionPage;

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Dumbbell, TimerReset } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ACTIVE_WORKOUT_SESSION_EVENT,
  clearActiveWorkoutSession,
  getActiveWorkoutSession
} from '../features/workout/services/workoutSessionStore';
import { isWorkoutSessionExpired } from '../utils/workoutSessionWindow';
import styles from '../styles/components/activeWorkoutMonitor.module.css';

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ActiveWorkoutMonitor({ enabled }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeWorkout, setActiveWorkout] = useState(() => (
    enabled ? getActiveWorkoutSession() : null
  ));
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setActiveWorkout(enabled ? getActiveWorkoutSession() : null);
    refresh();
    window.addEventListener(ACTIVE_WORKOUT_SESSION_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_SESSION_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [enabled]);

  useEffect(() => {
    if (!activeWorkout) return undefined;
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeWorkout?.eventId]);

  useEffect(() => {
    if (!activeWorkout?.eventId || !isWorkoutSessionExpired(activeWorkout.startedAt, nowMs)) return;
    clearActiveWorkoutSession(activeWorkout.eventId);
    setActiveWorkout(null);
  }, [activeWorkout?.eventId, activeWorkout?.startedAt, nowMs]);

  const presentation = useMemo(() => {
    const session = activeWorkout?.session;
    if (!session?.startedAt || session?.completedAt) return null;
    const startedAtMs = Date.parse(session.startedAt);
    const elapsedSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
      : 0;
    const rest = session.restTimer || {};
    const restRemaining = rest.running && Number.isFinite(Number(rest.endAt))
      ? Math.max(0, Math.ceil((Number(rest.endAt) - nowMs) / 1000))
      : Math.max(0, Math.round(Number(rest.remaining) || 0));
    const restActive = Boolean(rest.exerciseId && restRemaining > 0);
    const exerciseName = String(session.exerciseNames?.[rest.exerciseId || session.currentExerciseId] || 'Esercizio in corso');
    return {
      elapsedSeconds,
      exerciseName,
      restActive,
      restRemaining,
      title: String(session.workoutTitle || activeWorkout.workoutTitle || session.eventTitle || activeWorkout.eventTitle || 'Allenamento in corso')
    };
  }, [activeWorkout, nowMs]);

  const onWorkoutRoute = activeWorkout?.eventId
    && location.pathname === `/events/${activeWorkout.eventId}/workout`;
  if (!enabled || !activeWorkout?.eventId || !presentation || onWorkoutRoute) return null;

  return (
    <button
      type="button"
      className={styles.resumeButton}
      data-rest={presentation.restActive ? 'true' : 'false'}
      onClick={() => navigate(`/events/${activeWorkout.eventId}/workout`)}
      aria-label={`Riprendi allenamento ${presentation.title}`}
    >
      <span className={styles.icon} aria-hidden="true">
        {presentation.restActive ? <TimerReset size={19} /> : <Dumbbell size={19} />}
      </span>
      <span className={styles.copy}>
        <small><i aria-hidden="true" /> {presentation.restActive ? 'RECUPERO' : 'ALLENAMENTO LIVE'}</small>
        <strong>{presentation.restActive ? presentation.exerciseName : presentation.title}</strong>
      </span>
      <time>{formatClock(presentation.restActive ? presentation.restRemaining : presentation.elapsedSeconds)}</time>
      <span className={styles.resumeLabel}>Riprendi</span>
      <ChevronRight className={styles.chevron} size={17} aria-hidden="true" />
    </button>
  );
}

export default ActiveWorkoutMonitor;

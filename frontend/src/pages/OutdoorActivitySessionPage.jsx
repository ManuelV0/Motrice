import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Geolocation } from '@capacitor/geolocation';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Footprints,
  Gauge,
  LocateFixed,
  MapPin,
  Mountain,
  Pause,
  Play,
  Route,
  ShieldCheck,
  Signal,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { api } from '../services/api';
import { getAuthSession } from '../services/authSession';
import {
  getActiveEventLocationTracking,
  getEventActivityMetrics,
  resumeEventLocationTracking,
  setEventActivityPaused,
  startEventLocationTracking,
  stopEventLocationTracking
} from '../services/eventLocationTracking';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import {
  appendOutdoorPosition,
  estimateOutdoorSteps,
  getCurrentPaceSecondsPerKm,
  getOutdoorActivityKind,
  getOutdoorElapsedMs,
  getOutdoorPaceSecondsPerKm
} from '../utils/outdoorActivity';
import {
  createOutdoorSession,
  pauseOutdoorSession,
  resumeOutdoorSession,
  saveOutdoorSession
} from '../features/outdoor/services/outdoorSessionStore';
import PostEventUserFeedback from '../components/event/PostEventUserFeedback';
import ContextInfoButton from '../components/ContextInfoButton';
import styles from '../styles/pages/outdoorActivitySession.module.css';

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatPace(secondsPerKm) {
  const safe = Number(secondsPerKm);
  if (!Number.isFinite(safe) || safe <= 0 || safe > 3600) return '—';
  const minutes = Math.floor(safe / 60);
  const seconds = Math.round(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function buildTracePoints(samples, width = 320, height = 126) {
  const points = (Array.isArray(samples) ? samples : []).filter((item) => (
    Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lng))
  ));
  if (points.length < 2) return '';
  const latitudes = points.map((point) => Number(point.lat));
  const longitudes = points.map((point) => Number(point.lng));
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latSpan = Math.max(0.00001, maxLat - minLat);
  const lngSpan = Math.max(0.00001, maxLng - minLng);
  const padding = 12;
  return points.map((point) => {
    const x = padding + ((Number(point.lng) - minLng) / lngSpan) * (width - padding * 2);
    const y = height - padding - ((Number(point.lat) - minLat) / latSpan) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function OutdoorActivitySessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const auth = useMemo(() => getAuthSession(), []);
  const [event, setEvent] = useState(null);
  const [participation, setParticipation] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gpsMessage, setGpsMessage] = useState('Ricerca del segnale GPS…');
  const [busy, setBusy] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const progressAwardBusyRef = useRef(false);

  usePageMeta({
    title: 'Attività live · Motrice',
    description: 'Statistiche GPS in tempo reale per corsa e trekking.'
  });

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const eventResult = await api.getEvent(id);
        if (!active) return;
        const kind = getOutdoorActivityKind(eventResult);
        if (!kind) throw new Error('Il monitoraggio live è disponibile per Running e Trekking.');

        const organizer = isOrganizerForEvent(eventResult, auth);
        let progress = null;
        try {
          progress = await api.getEventParticipationProgress(id);
        } catch (progressError) {
          if (!organizer && !eventResult?.is_personal) throw progressError;
        }

        const participantVerified = Boolean(
          eventResult?.is_personal ||
          progress?.checked_in_at ||
          Number(progress?.cashback_percent || eventResult?.user_rsvp?.cashback_percent || 0) >= 60
        );
        const organizerVerified = Boolean(
          Number(eventResult?.participants_checked_in_count || 0) > 0 || progress?.organizer_present
        );
        if (!participantVerified && !(organizer && organizerVerified)) {
          throw new Error(organizer
            ? 'Scannerizza un QR oppure conferma prima la geolocalizzazione.'
            : 'Verifica prima la presenza con QR Code o posizione.');
        }

        const remoteSession = await api.startEventWorkout(id);
        if (!active) return;
        setEvent(eventResult);
        setParticipation(progress);
        setSession(createOutdoorSession(id, kind, remoteSession));
        const activeTracking = getActiveEventLocationTracking();
        try {
          if (activeTracking && String(activeTracking.eventId) === String(id)) {
            await resumeEventLocationTracking();
          } else {
            await startEventLocationTracking({
              event: eventResult,
              role: organizer ? 'organizer' : 'participant',
              verificationSource: String(progress?.verification_source || '') === 'gps' ? 'gps' : 'qr'
            });
          }
        } catch (trackingError) {
          setGpsMessage(trackingError?.message || 'Il monitoraggio in background richiede la posizione attiva.');
        }
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Attività live non disponibile.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [auth, id]);

  const kind = getOutdoorActivityKind(event);
  const isPaused = Boolean(session?.pausedAt);
  const isCompleted = Boolean(session?.completedAt);

  useEffect(() => {
    if (!session?.startedAt || isPaused || isCompleted || !kind) return undefined;
    let disposed = false;
    let watchId = null;

    Geolocation.watchPosition({
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 20000,
      minimumUpdateInterval: 2000
    }, (position, watchError) => {
      if (disposed) return;
      if (watchError || !position) {
        setGpsMessage(watchError?.message || 'Segnale GPS momentaneamente non disponibile.');
        return;
      }
      setSession((current) => {
        if (!current || current.pausedAt || current.completedAt) return current;
        const next = appendOutdoorPosition(current, position, kind);
        if (next.gpsState === 'weak') {
          setGpsMessage('Segnale debole: attendi una posizione più precisa.');
        } else if (next.gpsState === 'unstable') {
          setGpsMessage('Sto stabilizzando il segnale GPS…');
        } else {
          setGpsMessage(`GPS attivo · precisione ${Math.round(Number(next.lastAccuracyM || 0))} m`);
        }
        return saveOutdoorSession(id, next);
      });
    })
      .then((idValue) => {
        if (disposed) Geolocation.clearWatch({ id: idValue }).catch(() => undefined);
        else watchId = idValue;
      })
      .catch((watchError) => {
        if (!disposed) setGpsMessage(watchError?.message || 'Autorizza la posizione per registrare l’attività.');
      });

    return () => {
      disposed = true;
      if (watchId != null) Geolocation.clearWatch({ id: watchId }).catch(() => undefined);
    };
  }, [id, isCompleted, isPaused, kind, session?.startedAt]);

  useEffect(() => {
    if (!session?.startedAt || isCompleted || isPaused) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isCompleted, isPaused, session?.startedAt]);

  useEffect(() => {
    if (!session?.startedAt || isCompleted || !kind) return undefined;
    let disposed = false;

    const syncNativeMetrics = async () => {
      const metrics = await getEventActivityMetrics(id);
      if (disposed || !metrics) return;
      setSession((current) => {
        if (!current || current.completedAt) return current;
        const hasCoordinates = metrics.lat != null && metrics.lng != null && metrics.capturedAt != null;
        const alreadyHasPoint = hasCoordinates && Number(current.lastNativeSampleAt || 0) === Number(metrics.capturedAt);
        const nativeSampleIsNewer = hasCoordinates && Number(metrics.capturedAt) > Number(current.lastSample?.capturedAt || 0);
        const nativeSample = hasCoordinates ? {
          lat: metrics.lat,
          lng: metrics.lng,
          altitude: metrics.altitude,
          accuracy: metrics.accuracyM,
          capturedAt: metrics.capturedAt,
          speed: metrics.currentSpeedMps,
          distanceM: metrics.distanceM
        } : null;
        const next = {
          ...current,
          distanceM: Math.max(Number(current.distanceM || 0), metrics.distanceM),
          elevationGainM: Math.max(Number(current.elevationGainM || 0), metrics.elevationGainM),
          currentSpeedMps: current.pausedAt
            ? 0
            : nativeSampleIsNewer ? metrics.currentSpeedMps : current.currentSpeedMps,
          lastAccuracyM: metrics.accuracyM ?? current.lastAccuracyM,
          lastNativeSampleAt: metrics.capturedAt ?? current.lastNativeSampleAt,
          samples: nativeSample && !alreadyHasPoint
            ? [...(current.samples || []), nativeSample].slice(-240)
            : current.samples
        };
        return saveOutdoorSession(id, next);
      });
    };

    syncNativeMetrics();
    const timer = window.setInterval(syncNativeMetrics, 4000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [id, isCompleted, kind, session?.startedAt]);

  const elapsedMs = getOutdoorElapsedMs(session, nowMs);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const durationSeconds = Math.max(60, Number(event?.duration_minutes || 60) * 60);
  const timeProgress = Math.min(100, Math.round((elapsedSeconds / durationSeconds) * 100));
  const distanceKm = Math.max(0, Number(session?.distanceM || 0)) / 1000;
  const routeTargetKm = Number(event?.route_info?.distance_km || 0);
  const routeProgress = routeTargetKm > 0 ? Math.min(100, Math.round((distanceKm / routeTargetKm) * 100)) : null;
  const averagePace = getOutdoorPaceSecondsPerKm(session?.distanceM, elapsedMs);
  const currentPace = getCurrentPaceSecondsPerKm(session?.currentSpeedMps);
  const steps = estimateOutdoorSteps(session?.distanceM, kind);
  const tracePoints = useMemo(() => buildTracePoints(session?.samples), [session?.samples]);
  const organizer = isOrganizerForEvent(event, auth);
  const qrVerified = String(event?.verification_mode || 'both') !== 'geo' && Boolean(participation?.checked_in_at || organizer);
  const paceDelta = currentPace && averagePace ? currentPace - averagePace : 0;
  const paceTrend = Math.abs(paceDelta) < 12 ? 'steady' : paceDelta < 0 ? 'faster' : 'slower';
  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);

  useEffect(() => {
    if (!session || timeProgress < 60 || session.sixtyPercentAwarded || progressAwardBusyRef.current) return;
    progressAwardBusyRef.current = true;
    api.recordEventWorkoutProgress(id, timeProgress)
      .then((result) => {
        setSession((current) => {
          if (!current) return current;
          return saveOutdoorSession(id, {
            ...current,
            sixtyPercentAwarded: true
          });
        });
        if (Number(result?.mot_awarded || 0) > 0) {
          showToast(`60% dell’attività raggiunto · +${result.mot_awarded} MOT`, 'success');
        }
      })
      .catch(() => undefined)
      .finally(() => { progressAwardBusyRef.current = false; });
  }, [id, session, showToast, timeProgress]);

  function togglePause() {
    if (!session || isCompleted) return;
    const next = isPaused
      ? resumeOutdoorSession(id, session)
      : pauseOutdoorSession(id, session);
    setSession(next);
    setNowMs(Date.now());
    setEventActivityPaused(!isPaused).catch(() => undefined);
    if (navigator.vibrate) navigator.vibrate(45);
  }

  async function finishActivity() {
    if (!session || timeProgress < 100 || busy) return;
    if (!confirmFinish) {
      setConfirmFinish(true);
      return;
    }
    setBusy(true);
    try {
      await api.recordEventWorkoutProgress(id, 100);
      const result = await api.completeEventWorkout(id);
      const completedAt = result?.completed_at || new Date().toISOString();
      const next = saveOutdoorSession(id, {
        ...session,
        pausedAt: null,
        completedAt,
        currentSpeedMps: 0,
        completionAwarded: Boolean(result?.xp_awarded || session.completionAwarded)
      });
      setSession(next);
      setConfirmFinish(false);
      await stopEventLocationTracking({ status: 'completed', reason: 'attivita_completata' }).catch(() => undefined);
      const awardedXp = Number(result?.xp_awarded || 0);
      showToast(awardedXp > 0 ? `Attività completata · +${awardedXp} XP` : 'Attività completata', 'success');
    } catch (finishError) {
      showToast(finishError?.message || 'Impossibile completare l’attività', 'error');
    } finally {
      setBusy(false);
    }
  }

  function leaveLiveScreen() {
    showToast('L’attività continua in background. Puoi riaprirla dal pulsante LIVE.', 'info');
    navigate('/agenda');
  }

  if (loading) {
    return <section className={styles.statePage}><div className={styles.loader} /><p>Preparo il monitoraggio live…</p></section>;
  }

  if (error || !event || !session) {
    return (
      <section className={styles.statePage}>
        <span className={styles.lockIcon}><ShieldCheck size={30} /></span>
        <h1>Attività bloccata</h1>
        <p>{error || 'Sessione non disponibile.'}</p>
        <button type="button" onClick={() => navigate(`/agenda?checkIn=${id}`)}>Torna a I miei eventi</button>
      </section>
    );
  }

  return (
    <section className={styles.page} data-paused={isPaused ? 'true' : 'false'}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={leaveLiveScreen} aria-label="Torna indietro senza interrompere l’attività">
          <ArrowLeft size={19} aria-hidden="true" />
          <span>Indietro</span>
        </button>
        <div>
          <small>{kind === 'trekking' ? 'TREKKING LIVE' : 'RUNNING LIVE'}</small>
          <strong>{event.title || event.sport_name}</strong>
        </div>
        <span className={styles.liveBadge} data-active={!isPaused && !isCompleted ? 'true' : 'false'}>
          <i /> {isCompleted ? 'FINE' : isPaused ? 'PAUSA' : 'LIVE'}
        </span>
      </header>

      <main className={styles.content}>
        <section className={styles.timerHero}>
          <div className={styles.timerTop}>
            <span><MapPin size={15} /> {event.location_name || event.city || 'Percorso evento'}</span>
            <span className={styles.gpsStatus}><Signal size={15} /> {gpsMessage}</span>
          </div>
          <small>TEMPO ATTIVITÀ</small>
          <time>{formatClock(elapsedSeconds)}</time>
          <div className={styles.timeProgress}>
            <span style={{ width: `${timeProgress}%` }} />
          </div>
          <div className={styles.timerMeta}>
            <span>{timeProgress}% completato</span>
            <span>{isCompleted ? 'Attività conclusa' : remainingSeconds ? `${formatClock(remainingSeconds)} rimanenti` : 'Puoi terminare l’attività'}</span>
          </div>
        </section>

        <section className={styles.primaryMetrics} aria-label="Statistiche principali">
          <article>
            <small>DISTANZA</small>
            <strong>{distanceKm.toFixed(2)}</strong>
            <span>km</span>
          </article>
          <article>
            <small>PASSO MEDIO</small>
            <strong>{formatPace(averagePace)}</strong>
            <span>min/km</span>
          </article>
        </section>

        <section className={styles.liveGrid}>
          <article>
            <span><Gauge size={19} /></span>
            <small>PASSO ATTUALE</small>
            <strong>{formatPace(currentPace)}</strong>
            <em>min/km</em>
          </article>
          <article>
            <span><Mountain size={19} /></span>
            <small>DISLIVELLO +</small>
            <strong>{Math.round(Number(session.elevationGainM || 0))}</strong>
            <em>metri</em>
          </article>
          <article>
            <span><Footprints size={19} /></span>
            <small>PASSI STIMATI</small>
            <strong>{steps.toLocaleString('it-IT')}</strong>
            <em>in movimento</em>
          </article>
          <article>
            <span>{paceTrend === 'faster' ? <TrendingUp size={19} /> : <TrendingDown size={19} />}</span>
            <small>ANDAMENTO</small>
            <strong>{paceTrend === 'faster' ? 'Più veloce' : paceTrend === 'slower' ? 'Più lento' : 'Regolare'}</strong>
            <em>rispetto alla media</em>
          </article>
        </section>

        <section className={styles.traceCard}>
          <div className={styles.sectionTitle}>
            <div><small>TRACCIA LIVE</small><strong>Il tuo percorso</strong></div>
            <span className={styles.traceActions}>
              <span><LocateFixed size={16} /> ±{Math.round(Number(session.lastAccuracyM || 0)) || '—'} m</span>
              <ContextInfoButton
                title="Monitoraggio attività"
                description="Durante corsa e trekking Motrice elabora i dati ricevuti dal GPS per costruire il riepilogo dell’attività."
                items={[
                  { title: 'Traccia e distanza', text: 'I punti GPS validi vengono collegati per calcolare il percorso e i chilometri.' },
                  { title: 'Passo e dislivello', text: 'Sono stime aggiornate durante il movimento e dipendono dalla qualità del segnale.' },
                  { title: 'Pausa e ripresa', text: 'La pausa interrompe il conteggio attivo senza chiudere definitivamente la sessione.' }
                ]}
                note="Per un monitoraggio continuo consenti la posizione precisa e non interrompere i permessi dell’app."
              />
            </span>
          </div>
          <div className={styles.traceCanvas}>
            <svg viewBox="0 0 320 126" role="img" aria-label="Traccia GPS dell’attività">
              <defs>
                <linearGradient id="routeGradient" x1="0" x2="1">
                  <stop offset="0" stopColor="#7fa500" />
                  <stop offset="1" stopColor="#ccff00" />
                </linearGradient>
              </defs>
              {tracePoints ? <polyline points={tracePoints} fill="none" stroke="url(#routeGradient)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> : null}
            </svg>
            {!tracePoints ? <div><Route size={27} /><span>La traccia apparirà appena inizi a muoverti</span></div> : null}
          </div>
          {routeTargetKm > 0 ? (
            <div className={styles.routeGoal}>
              <span>Obiettivo percorso · {routeTargetKm.toLocaleString('it-IT')} km</span>
              <strong>{routeProgress}%</strong>
            </div>
          ) : null}
        </section>

        <section className={styles.rewardTimeline} aria-label="Ricompense attività">
          <span className={qrVerified || participation?.checked_in_at ? styles.rewardReached : undefined}>
            <i><Check size={14} /></i><b>Check-in</b><small>{qrVerified ? '+5 MOT · +25 XP' : '+2 MOT'}</small>
          </span>
          <span className={session.sixtyPercentAwarded ? styles.rewardReached : undefined}>
            <i>{session.sixtyPercentAwarded ? <Check size={14} /> : '2'}</i><b>60% durata</b><small>+3 MOT</small>
          </span>
          <span className={session.completionAwarded ? styles.rewardReached : undefined}>
            <i>{session.completionAwarded ? <Check size={14} /> : '3'}</i><b>Conclusione</b><small>+25 XP</small>
          </span>
        </section>

        {isCompleted ? (
          <section className={styles.completedCard}>
            <span><CheckCircle2 size={30} /></span>
            <div><small>ATTIVITÀ COMPLETATA</small><strong>Ottimo lavoro</strong><p>{distanceKm.toFixed(2)} km · {formatClock(elapsedSeconds)} · +{Math.round(Number(session.elevationGainM || 0))} m</p></div>
            <button type="button" onClick={() => navigate(`/events/${id}`)}>Riepilogo</button>
          </section>
        ) : (
          <section className={styles.controls}>
            <button type="button" className={styles.pauseButton} onClick={togglePause}>
              {isPaused ? <Play /> : <Pause />}
              {isPaused ? 'Riprendi' : 'Pausa'}
            </button>
            <button
              type="button"
              className={styles.finishButton}
              onClick={finishActivity}
              disabled={timeProgress < 100 || busy}
              data-confirm={confirmFinish ? 'true' : 'false'}
            >
              <CheckCircle2 />
              {busy
                ? 'Salvataggio…'
                : timeProgress < 100
                  ? `Termina tra ${formatClock(remainingSeconds)}`
                  : confirmFinish ? 'Conferma conclusione' : 'Termina attività'}
            </button>
            {confirmFinish ? <button type="button" className={styles.cancelFinish} onClick={() => setConfirmFinish(false)}>Continua attività</button> : null}
          </section>
        )}

        <PostEventUserFeedback
          eventId={id}
          enabled={isCompleted}
          bonusXp={Number(event.review_bonus_xp || 25)}
        />
      </main>
    </section>
  );
}

export default OutdoorActivitySessionPage;

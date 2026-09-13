import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Crown,
  EllipsisVertical,
  Eye,
  LocateFixed,
  QrCode,
  RefreshCw,
  Sparkles,
  Star,
  Users,
  XCircle
} from 'lucide-react';
import { api } from '../../services/api';
import Button from '../Button';
import Card from '../Card';
import Modal from '../Modal';
import styles from '../../styles/components/event/eventParticipationFlow.module.css';
import {
  getEventPhaseLabel,
  getEventTiming,
  getMaximumCheckInGraceMinutes
} from '../../utils/eventLifecycle';
import {
  resolveParticipantOutcome,
  resolveParticipantPresenceStatus
} from '../../utils/eventParticipationState';
import {
  EVENT_LOCATION_TRACKING_STATUS_EVENT,
  getActiveEventLocationTracking,
  startEventLocationTracking,
  stopEventLocationTracking
} from '../../services/eventLocationTracking';
import { validateEventLocationProof } from '../../utils/eventLocationProof';
import { GYM_ENTRY_OPTIONS } from '../../utils/eventVenueAccess';
import { getParticipantRemovalPolicy } from '../../utils/eventManagementRules';

const EMPTY_REVIEW = {
  partnerRating: 5,
  organizerPunctuality: 5,
  descriptionAccuracy: 5,
  wouldJoinAgain: true,
  note: ''
};

const EMPTY_PARTICIPANT_REMOVAL = {
  reasonCode: '',
  note: ''
};

function snapshotsMatch(current, next) {
  if (current === next) return true;
  try {
    return JSON.stringify(current) === JSON.stringify(next);
  } catch {
    return false;
  }
}

function keepStableSnapshot(setter, next) {
  setter((current) => snapshotsMatch(current, next) ? current : next);
}

function formatEventTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function decodeQrPayload(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { token: '', eventId: '' };

  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) candidates.push(decoded);
  } catch {
    // Il valore potrebbe essere gia decodificato.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return {
        token: String(parsed?.token || '').trim(),
        eventId: String(parsed?.eventId || parsed?.event_id || '').trim()
      };
    } catch {
      try {
        const url = new URL(candidate);
        return {
          token: String(url.searchParams.get('token') || '').trim(),
          eventId: String(url.searchParams.get('eventId') || url.searchParams.get('event_id') || '').trim()
        };
      } catch {
        // Prova il prossimo formato prima di trattarlo come token puro.
      }
    }
  }

  return { token: raw, eventId: '' };
}

function scanFeedbackFromError(error) {
  const message = String(error?.message || 'QR non valido');
  const normalized = message.toLowerCase();
  if (normalized.includes('già registrato') || normalized.includes('gia registrato')) {
    return { kind: 'warning', title: 'Partecipante già registrato', detail: message };
  }
  if (normalized.includes('altro evento')) {
    return { kind: 'error', title: 'QR appartenente ad un altro evento', detail: message };
  }
  if (normalized.includes('scadut') || normalized.includes('finestra evento')) {
    return { kind: 'error', title: 'QR scaduto', detail: 'Stato: scaduto' };
  }
  if (
    normalized.includes('fuori dall area') ||
    normalized.includes('fuori dall’area') ||
    normalized.includes('fuori area') ||
    normalized.includes('posizione') ||
    normalized.includes('segnale gps') ||
    normalized.includes('coordinate')
  ) {
    return { kind: 'error', title: 'Posizione non valida', detail: message };
  }
  return { kind: 'error', title: 'QR non valido', detail: message };
}

function playScanFeedback(kind) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'success' ? 55 : [110, 65, 110]);
    }
  } catch {
    // Il feedback aptico non deve bloccare il check-in.
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(kind === 'success' ? 740 : 220, context.currentTime);
    if (kind === 'success') {
      oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.16);
    }
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
    oscillator.addEventListener('ended', () => context.close().catch(() => {}), { once: true });
  } catch {
    // Alcuni browser richiedono policy audio piu restrittive.
  }
}

function requireEventLocationProof(location, event) {
  const proof = validateEventLocationProof({
    location,
    eventLat: event?.lat,
    eventLng: event?.lng,
    radiusM: event?.geofence_radius_m
  });
  if (!proof.valid) throw new Error(proof.message);
  return proof;
}

function ratingField(label, value, onChange) {
  return (
    <label className={styles.reviewField}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {[5, 4, 3, 2, 1].map((stars) => (
          <option key={stars} value={stars}>
            {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
          </option>
        ))}
      </select>
    </label>
  );
}

function EventParticipationFlow({
  event,
  isOrganizer,
  currentUser,
  coords,
  requestingLocation,
  requestLocation,
  showToast,
  onEventRefresh,
  onOpenParticipantProfile,
  managementOnly = false,
  compactEmbedded = false
}) {
  const [progress, setProgress] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [requestDecisionBusy, setRequestDecisionBusy] = useState('');
  const [participantRemovalTarget, setParticipantRemovalTarget] = useState(null);
  const [participantRemoval, setParticipantRemoval] = useState(EMPTY_PARTICIPANT_REMOVAL);
  const [participantRemovalBusy, setParticipantRemovalBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [organizerQrDataUrl, setOrganizerQrDataUrl] = useState('');
  const [organizerQrOpen, setOrganizerQrOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scanFeedback, setScanFeedback] = useState(null);
  const [scannerCycle, setScannerCycle] = useState(0);
  const [manualToken, setManualToken] = useState('');
  const [review, setReview] = useState(EMPTY_REVIEW);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [lastPresence, setLastPresence] = useState(null);
  const [trackingStatus, setTrackingStatus] = useState(() => getActiveEventLocationTracking());
  const [participantVerificationChoice, setParticipantVerificationChoice] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [graceMinutes, setGraceMinutes] = useState(() => Number(event?.checkin_grace_minutes ?? 15));
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scanBusyRef = useRef(false);
  const presenceBusyRef = useRef(false);
  const finalizedRef = useRef(false);
  const lastScanRef = useRef({ fingerprint: '', at: 0 });
  const trackingStartRef = useRef('');

  const canLoad = Boolean(event?.id && (event?.is_going || isOrganizer));
  const verificationMode = event?.verification_mode || 'both';
  const usesQr = verificationMode === 'qr' || verificationMode === 'both';
  const usesGeo = verificationMode === 'geo' || verificationMode === 'both';
  const timing = useMemo(
    () => getEventTiming({ ...event, checkin_grace_minutes: graceMinutes }, nowMs),
    [event, graceMinutes, nowMs]
  );
  const participantRemovalPolicy = useMemo(
    () => getParticipantRemovalPolicy(event, nowMs),
    [event, nowMs]
  );
  const maximumGraceMinutes = getMaximumCheckInGraceMinutes(event);
  const extensionOptions = [15, 20, 30].filter(
    (minutes) => minutes > graceMinutes && minutes <= maximumGraceMinutes
  );
  const progressOutcome = resolveParticipantOutcome(progress);

  useEffect(() => {
    setGraceMinutes(Number(event?.checkin_grace_minutes ?? 15));
  }, [event?.checkin_grace_minutes]);

  const loadFlow = useCallback(async ({ silent = false } = {}) => {
    if (!canLoad) return;
    if (!silent) setLoading(true);
    try {
      const [flowResult, validationResult, requestsResult] = await Promise.allSettled([
        api.getEventParticipationProgress(event.id),
        api.listEventValidationStatus(event.id),
        isOrganizer ? api.listEventJoinRequests(event.id) : Promise.resolve([])
      ]);

      if (flowResult.status === 'fulfilled') {
        keepStableSnapshot(setProgress, flowResult.value);
      }
      if (validationResult.status === 'fulfilled') {
        keepStableSnapshot(setParticipants, Array.isArray(validationResult.value) ? validationResult.value : []);
      }
      if (requestsResult.status === 'fulfilled') {
        keepStableSnapshot(setJoinRequests, Array.isArray(requestsResult.value) ? requestsResult.value : []);
      }

      if (!silent) {
        const failedResult = [flowResult, validationResult, requestsResult]
          .find((result) => result.status === 'rejected');
        if (failedResult) {
          showToast(
            failedResult.reason?.message || 'Alcuni dati della partecipazione non sono disponibili',
            'error'
          );
        }
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [canLoad, event?.id, isOrganizer, showToast]);

  useEffect(() => {
    loadFlow();
  }, [loadFlow]);

  useEffect(() => {
    if (!canLoad) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [canLoad]);

  useEffect(() => {
    if (!canLoad) return undefined;
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === 'visible') loadFlow({ silent: true });
      },
      isOrganizer ? 5000 : 10000
    );
    return () => window.clearInterval(timer);
  }, [canLoad, isOrganizer, loadFlow]);

  useEffect(() => {
    const refreshTrackingStatus = (statusEvent) => {
      const next = statusEvent?.detail ?? getActiveEventLocationTracking();
      setTrackingStatus(
        next && String(next.eventId) === String(event?.id)
          ? next
          : null
      );
    };
    refreshTrackingStatus();
    window.addEventListener(EVENT_LOCATION_TRACKING_STATUS_EVENT, refreshTrackingStatus);
    return () => window.removeEventListener(EVENT_LOCATION_TRACKING_STATUS_EVENT, refreshTrackingStatus);
  }, [event?.id]);

  useEffect(() => {
    let active = true;
    const payload = progress?.qr_payload;
    if (!payload || isOrganizer) {
      setQrDataUrl('');
      return undefined;
    }

    QRCode.toDataURL(JSON.stringify(payload), {
      width: 360,
      margin: 2,
      color: {
        dark: '#0b0d0f',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [isOrganizer, progress?.qr_payload]);

  useEffect(() => {
    let active = true;
    if (!isOrganizer || !organizerQrOpen) return undefined;
    const organizerPayload = {
      version: 1,
      type: 'organizer',
      eventId: event?.id,
      organizerId: currentUser?.id || event?.organizerId || event?.organizer?.auth_user_id || ''
    };
    QRCode.toDataURL(JSON.stringify(organizerPayload), {
      width: 360,
      margin: 2,
      color: { dark: '#0b0d0f', light: '#ffffff' },
      errorCorrectionLevel: 'M'
    })
      .then((url) => {
        if (active) setOrganizerQrDataUrl(url);
      })
      .catch(() => {
        if (active) setOrganizerQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [currentUser?.id, event?.id, event?.organizer?.auth_user_id, event?.organizerId, isOrganizer, organizerQrOpen]);

  const submitScan = useCallback(async (rawToken) => {
    if (scanBusyRef.current) return;
    const decoded = decodeQrPayload(rawToken);
    if (!decoded.token) {
      const feedback = { kind: 'error', title: 'QR non valido', detail: 'Token inesistente' };
      setScanFeedback(feedback);
      playScanFeedback('error');
      return;
    }
    if (decoded.eventId && String(decoded.eventId) !== String(event?.id)) {
      const feedback = {
        kind: 'error',
        title: 'QR appartenente ad un altro evento',
        detail: 'Il codice non può essere usato per questo evento.'
      };
      setScanFeedback(feedback);
      playScanFeedback('error');
      return;
    }
    const fingerprint = `${String(event?.id)}:${decoded.token}`;
    const scanAt = Date.now();
    if (lastScanRef.current.fingerprint === fingerprint && scanAt - lastScanRef.current.at < 2000) {
      return;
    }
    lastScanRef.current = { fingerprint, at: scanAt };
    scanBusyRef.current = true;
    setBusy(true);
    setScannerError('');
    scannerControlsRef.current?.stop?.();
    try {
      const location = usesGeo
        ? await requestLocation({ requireFresh: true, maxAgeMs: 30000 })
        : null;
      if (!location && usesGeo) {
        throw new Error('Attiva la posizione per validare la scansione');
      }
      if (usesGeo) requireEventLocationProof(location, event);
      const result = await api.scanEventParticipantQr({
        eventId: event.id,
        token: decoded.token,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        accuracyM: location?.accuracy ?? null
      });
      const participantName = String(result?.participant_name || result?.display_name || 'Partecipante');
      if (result?.already_checked || result?.alreadyChecked || result?.status === 'already_checked') {
        const feedback = {
          kind: 'warning',
          title: 'Partecipante già registrato',
          participantName,
          detail: result?.checked_in_at
            ? `Check-in delle ${formatEventTime(result.checked_in_at)}`
            : 'Il check-in risulta già registrato.'
        };
        setScanFeedback(feedback);
        playScanFeedback('error');
        return;
      }
      const xpAwarded = Number(result?.xp_awarded ?? result?.xpAwarded?.participant ?? 20);
      const motAwarded = Number(result?.mot_awarded ?? 5);
      setScanFeedback({
        kind: 'success',
        title: 'Check-in valido',
        participantName,
        detail: `+${motAwarded} MOT · +${xpAwarded} XP assegnati`,
        xpAwarded,
        motAwarded
      });
      playScanFeedback('success');
      showToast(`Check-in valido · ${participantName} · +${motAwarded} MOT · +${xpAwarded} XP`, 'success');
      setManualToken('');
      await loadFlow({ silent: true });
      await onEventRefresh?.();
    } catch (error) {
      const feedback = scanFeedbackFromError(error);
      setScanFeedback(feedback);
      playScanFeedback('error');
      showToast(feedback.title, feedback.kind === 'warning' ? 'info' : 'error');
    } finally {
      scanBusyRef.current = false;
      setBusy(false);
    }
  }, [
    event,
    loadFlow,
    onEventRefresh,
    requestLocation,
    showToast,
    usesGeo
  ]);

  useEffect(() => {
    if (!event?.id || !usesGeo || !coords || timing.hasEnded) return undefined;
    const participantReady = !isOrganizer && progressOutcome.id === 'checked_in';
    const organizerReady = isOrganizer && timing.startsAtMs != null && Date.now() >= timing.checkInOpensAtMs;
    if (!participantReady && !organizerReady) return undefined;

    const trackingKey = `${event.id}:${isOrganizer ? 'organizer' : 'participant'}`;
    const activeTracking = getActiveEventLocationTracking();
    if (
      trackingStartRef.current === trackingKey ||
      (activeTracking?.status === 'active' && String(activeTracking.eventId) === String(event.id))
    ) return undefined;

    trackingStartRef.current = trackingKey;
    startEventLocationTracking({
      event,
      role: isOrganizer ? 'organizer' : 'participant',
      verificationSource: String(progress?.verification_source || '') === 'gps' ? 'gps' : 'qr',
      initialCoords: coords
    }).catch((trackingError) => {
      trackingStartRef.current = '';
      setTrackingStatus((current) => ({
        ...(current || {}),
        eventId: String(event.id),
        status: 'interrupted',
        lastError: trackingError?.message || 'Monitoraggio non disponibile'
      }));
    });
    return undefined;
  }, [coords, event, isOrganizer, progress?.verification_source, progressOutcome.id, timing.checkInOpensAtMs, timing.hasEnded, timing.startsAtMs, usesGeo]);

  useEffect(() => {
    const activeTracking = getActiveEventLocationTracking();
    if (!activeTracking || String(activeTracking.eventId) !== String(event?.id)) return;
    const participationCompleted = !isOrganizer && progressOutcome.id === 'completed';
    if (!timing.hasEnded && !participationCompleted) return;
    stopEventLocationTracking({ status: 'completed', reason: timing.hasEnded ? 'fine_evento' : 'presenza_completata' })
      .catch(() => undefined);
  }, [event?.id, isOrganizer, progressOutcome.id, timing.hasEnded]);

  useEffect(() => {
    if (!scannerOpen || !videoRef.current || scanFeedback) return undefined;

    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 350,
      delayBetweenScanSuccess: 1000
    });
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, error, controls) => {
        if (controls) scannerControlsRef.current = controls;
        if (cancelled || !result || scanBusyRef.current) return;
        controls?.stop();
        submitScan(result.getText());
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        scannerControlsRef.current = controls;
      })
      .catch((error) => {
        if (!cancelled) {
          setScannerError(
            error?.message?.toLowerCase().includes('permission')
              ? 'Permesso fotocamera negato. Abilitalo nelle impostazioni del telefono.'
              : 'Fotocamera non disponibile. Usa il codice manuale.'
          );
        }
      });

    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop?.();
      scannerControlsRef.current = null;
      reader.reset?.();
    };
  }, [scanFeedback, scannerCycle, scannerOpen, submitScan]);

  const sendPresence = useCallback(async ({ interactive = false } = {}) => {
    if (!event?.id || presenceBusyRef.current) return;
    presenceBusyRef.current = true;
    setBusy(true);
    try {
      const startsGpsCheckIn = !isOrganizer && usesGeo && !progress?.checked_in_at;
      const needsFreshProof = usesGeo && (interactive || startsGpsCheckIn || isOrganizer);
      const location = needsFreshProof
        ? await requestLocation({ requireFresh: true, maxAgeMs: 30000 })
        : coords;
      if (!location && usesGeo) {
        if (interactive) throw new Error('Posizione non disponibile');
        return;
      }
      if (needsFreshProof) requireEventLocationProof(location, event);
      if (startsGpsCheckIn && !getEventTiming({ ...event, checkin_grace_minutes: graceMinutes }).isCheckInOpen) {
        throw new Error('La finestra di check-in non è aperta');
      }
      const result = startsGpsCheckIn
        ? await api.startEventGpsCheckIn({
          eventId: event.id,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          accuracyM: location?.accuracy ?? null
        })
        : await api.recordEventPresence({
          eventId: event.id,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          accuracyM: location?.accuracy ?? null
        });
      setLastPresence(result);
      await loadFlow({ silent: true });
      if (result?.checked_in_now) {
        showToast(`Presenza GPS verificata · +${Number(result?.mot_awarded || 2)} MOT`, 'success');
        await onEventRefresh?.();
      } else if (result?.completed_now) {
        showToast(`Partecipazione completata: cashback 100% e +${event.completion_xp || 50} PX`, 'success');
        await onEventRefresh?.();
      } else if (interactive) {
        showToast(
          result?.inside_radius
            ? 'Presenza aggiornata dentro l’area evento'
            : `Sei fuori area (${Math.round(Number(result?.distance_m || 0))} m)`,
          result?.inside_radius ? 'success' : 'info'
        );
      }
    } catch (error) {
      if (interactive) showToast(error?.message || 'Posizione non registrata', 'error');
    } finally {
      presenceBusyRef.current = false;
      setBusy(false);
    }
  }, [
    coords,
    event,
    graceMinutes,
    isOrganizer,
    loadFlow,
    onEventRefresh,
    requestLocation,
    showToast,
    usesGeo,
    progress?.checked_in_at
  ]);

  useEffect(() => {
    const shouldMonitorParticipant =
      !isOrganizer &&
      progressOutcome.id === 'checked_in';
    const liveTiming = getEventTiming({ ...event, checkin_grace_minutes: graceMinutes });
    const organizerWindow =
      isOrganizer &&
      liveTiming.startsAtMs != null &&
      Date.now() >= liveTiming.checkInOpensAtMs &&
      Date.now() < liveTiming.endsAtMs;

    if ((usesGeo && !coords) || (!shouldMonitorParticipant && !organizerWindow)) return undefined;
    sendPresence();
    const timer = window.setInterval(() => sendPresence(), 60 * 1000);
    return () => window.clearInterval(timer);
  }, [
    coords,
    event?.duration_minutes,
    event?.event_datetime,
    event?.minimum_presence_minutes,
    event?.status,
    graceMinutes,
    isOrganizer,
    progressOutcome.id,
    sendPresence,
    usesGeo
  ]);

  useEffect(() => {
    if (!isOrganizer || !event?.has_passed || finalizedRef.current) return;
    finalizedRef.current = true;
    api.finalizeEventOutcomes(event.id)
      .then(() => loadFlow({ silent: true }))
      .catch(() => {
        finalizedRef.current = false;
      });
  }, [event?.has_passed, event?.id, isOrganizer, loadFlow]);

  async function submitReview(eventSubmit) {
    eventSubmit.preventDefault();
    setReviewBusy(true);
    try {
      const result = await api.submitEventReview({
        eventId: event.id,
        ...review
      });
      showToast(
        result?.already_submitted
          ? 'Questionario già completato'
          : `Questionario completato: +${result?.bonus_xp || event.review_bonus_xp || 25} PX`,
        result?.already_submitted ? 'info' : 'success'
      );
      await loadFlow({ silent: true });
    } catch (error) {
      showToast(error?.message || 'Questionario non salvato', 'error');
    } finally {
      setReviewBusy(false);
    }
  }

  const progressPercent = Number(progress?.cashback_percent || 0);
  const presenceTarget = Number(progress?.minimum_presence_minutes || event?.minimum_presence_minutes || 45);
  const elapsed = Math.min(presenceTarget, Number(progress?.elapsed_minutes || 0));
  const registeredParticipants = useMemo(() => {
    const organizerIdentity = String(
      currentUser?.id || event?.organizerId || event?.organizer?.auth_user_id || event?.organizer?.id || ''
    );
    return (Array.isArray(participants) ? participants : []).filter((participant) => {
      const participantIdentity = String(participant.auth_user_id || participant.user_id || '');
      const participantStatus = String(participant.participant_status || participant.status || '').toLowerCase();
      return participantStatus !== 'cancelled' && (!organizerIdentity || participantIdentity !== organizerIdentity);
    });
  }, [currentUser?.id, event?.organizer?.auth_user_id, event?.organizer?.id, event?.organizerId, participants]);
  const validationSummary = useMemo(() => {
    const items = registeredParticipants;
    return {
      total: items.filter((item) => !['cancelled'].includes(String(item.participant_status))).length,
      checked: items.filter((item) => ['checked_in', 'completed'].includes(resolveParticipantOutcome(item).id)).length,
      completed: items.filter((item) => resolveParticipantOutcome(item).id === 'completed').length
    };
  }, [registeredParticipants]);
  const qrWindowLabel = timing.checkInOpensAtMs != null && timing.checkInClosesAtMs != null
    ? `${formatEventTime(timing.checkInOpensAtMs)} – ${formatEventTime(timing.checkInClosesAtMs)}`
    : 'Finestra non disponibile';
  const qrCountdown = timing.checkInOpensAtMs != null && timing.checkInClosesAtMs != null
    ? nowMs < timing.checkInOpensAtMs
      ? `Si attiva tra ${formatCountdown(timing.checkInOpensAtMs - nowMs)}`
      : nowMs <= timing.checkInClosesAtMs
        ? `Scade tra ${formatCountdown(timing.checkInClosesAtMs - nowMs)}`
        : 'QR scaduto'
    : '';

  async function extendCheckIn(minutes) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.extendEventCheckInWindow(event.id, minutes);
      const nextMinutes = Number(result?.checkin_grace_minutes ?? minutes);
      setGraceMinutes(nextMinutes);
      showToast(`Check-in prolungato fino alle ${formatEventTime(timing.startsAtMs + nextMinutes * 60000)}`, 'success');
      await onEventRefresh?.();
    } catch (error) {
      showToast(error?.message || 'Impossibile prolungare il check-in', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openScanner() {
    if (!timing.isCheckInOpen) {
      showToast(
        timing.phase === 'scheduled'
          ? 'Il check-in apre 30 minuti prima dell’evento'
          : 'La finestra di check-in è chiusa',
        'info'
      );
      return;
    }
    setScannerError('');
    setScanFeedback(null);
    setManualToken('');
    setScannerOpen(true);
    setScannerCycle((value) => value + 1);
  }

  function scanAnother() {
    setScanFeedback(null);
    setScannerError('');
    setManualToken('');
    setScannerCycle((value) => value + 1);
  }

  function closeScanner() {
    scannerControlsRef.current?.stop?.();
    setScannerOpen(false);
    setScanFeedback(null);
    setScannerError('');
    setManualToken('');
  }

  async function decideJoinRequest(request, decision) {
    const requestUserId = request.auth_user_id || request.user_id;
    const requestKey = String(requestUserId || '');
    if (!requestKey || requestDecisionBusy) return;
    setRequestDecisionBusy(requestKey);
    try {
      if (decision === 'approve') {
        await api.approveEventJoinRequest(event.id, requestUserId);
        showToast(`${request.display_name || 'Partecipante'} approvato`, 'success');
      } else {
        await api.declineEventJoinRequest(event.id, requestUserId);
        showToast('Richiesta rifiutata', 'info');
      }
      setJoinRequests((current) => current.filter((item) => (
        String(item.auth_user_id || item.user_id) !== requestKey
      )));
      await loadFlow({ silent: true });
      await onEventRefresh?.();
    } catch (error) {
      showToast(error?.message || 'Richiesta non aggiornata', 'error');
    } finally {
      setRequestDecisionBusy('');
    }
  }

  function openParticipantRemoval(participant) {
    if (!participantRemovalPolicy.canRemove) {
      showToast(participantRemovalPolicy.blockedReason || 'Non puoi più rimuovere partecipanti', 'info');
      return;
    }
    setParticipantRemovalTarget(participant);
    setParticipantRemoval(EMPTY_PARTICIPANT_REMOVAL);
  }

  function closeParticipantRemoval() {
    if (participantRemovalBusy) return;
    setParticipantRemovalTarget(null);
    setParticipantRemoval(EMPTY_PARTICIPANT_REMOVAL);
  }

  async function confirmParticipantRemoval() {
    const participantUserId = participantRemovalTarget?.auth_user_id || participantRemovalTarget?.user_id;
    if (!participantUserId || !participantRemoval.reasonCode || participantRemovalBusy) return;
    setParticipantRemovalBusy(true);
    try {
      const result = await api.removeEventParticipant(event.id, participantUserId, participantRemoval);
      showToast(
        result?.is_late
          ? 'Partecipante rimosso. Rimozione tardiva registrata e quota restituita.'
          : 'Partecipante rimosso e quota restituita.',
        'success'
      );
      setParticipantRemovalTarget(null);
      setParticipantRemoval(EMPTY_PARTICIPANT_REMOVAL);
      await loadFlow({ silent: true });
      await onEventRefresh?.();
    } catch (error) {
      showToast(error?.message || 'Impossibile rimuovere il partecipante', 'error');
    } finally {
      setParticipantRemovalBusy(false);
    }
  }

  if (!canLoad) return null;

  return (
    <>
      <Card subtle className={`${styles.flowCard} ${isOrganizer ? styles.organizerFlowCard : ''} ${managementOnly ? styles.managementOnlyCard : ''} ${compactEmbedded ? styles.compactEmbeddedCard : ''}`}>
        {!managementOnly ? <div className={styles.lifecycleStatus} data-open={timing.isCheckInOpen ? 'true' : 'false'}>
          <Clock3 size={18} aria-hidden="true" />
          <div>
            <strong>{getEventPhaseLabel(timing)}</strong>
            <span>Check-in {qrWindowLabel} · fine evento {timing.endsAtMs ? formatEventTime(timing.endsAtMs) : '—'}</span>
          </div>
        </div> : null}
        {!isOrganizer ? (
          <>
            <div className={styles.flowHeader}>
              <div>
                <span className={styles.eyebrow}>Partecipazione protetta</span>
                <h2>Il tuo avanzamento</h2>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={RefreshCw}
                onClick={() => loadFlow()}
                disabled={loading}
              >
                Aggiorna
              </Button>
            </div>

            <div className={`${styles.progressBlock} ${progressPercent >= 60 ? styles.progressVerified : ''}`}>
              <div className={styles.progressCopy}>
                <strong>{progressPercent >= 100 ? 'Partecipazione completata' : progressPercent >= 60 ? 'Presenza verificata' : 'Iscrizione confermata'}</strong>
                <span>{progressPercent}% cashback</span>
              </div>
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={progressPercent}
              >
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <div className={styles.progressLegend}>
                <span className={progressPercent >= 60 ? styles.reached : ''}>Check-in 60%</span>
                <span className={progressPercent >= 100 ? styles.reached : ''}>Completato 100%</span>
              </div>
            </div>

            {progressPercent < 60 && !timing.isCheckInOpen ? (
              <div className={styles.checkInUnavailable}>
                <Clock3 size={20} aria-hidden="true" />
                <div>
                  <strong>{timing.phase === 'scheduled' ? 'Check-in non ancora disponibile' : 'Check-in chiuso'}</strong>
                  <span>{timing.phase === 'scheduled' ? 'Torna qui 30 minuti prima dell’inizio.' : 'Non è più possibile registrare una nuova presenza.'}</span>
                </div>
              </div>
            ) : null}

            {progressPercent < 60 && timing.isCheckInOpen && verificationMode === 'both' ? (
              <div className={styles.verificationChoice}>
                <div>
                  <span className={styles.eyebrow}>Scegli come verificarti</span>
                  <h3>Verifica presenza</h3>
                  <p>Il QR assegna il bonus maggiore; la posizione è l’alternativa rapida nell’area evento.</p>
                </div>
                <div className={styles.verificationChoiceButtons}>
                  <Button type="button" icon={QrCode} onClick={() => setParticipantVerificationChoice('qr')} variant={participantVerificationChoice === 'qr' ? 'primary' : 'secondary'}>
                    Mostra il mio QR
                  </Button>
                  <Button type="button" icon={LocateFixed} onClick={() => setParticipantVerificationChoice('geo')} variant={participantVerificationChoice === 'geo' ? 'primary' : 'secondary'}>
                    Verifica posizione
                  </Button>
                </div>
              </div>
            ) : null}

            {progressPercent < 60 && timing.isCheckInOpen && usesQr && qrDataUrl && (verificationMode === 'qr' || participantVerificationChoice === 'qr') ? (
              <div className={styles.participantQr}>
                <div>
                  <span className={styles.eyebrow}>QR personale</span>
                  <h3>Mostralo all’organizzatore</h3>
                  <p>È diverso per ogni partecipante e valido soltanto per questo evento.</p>
                </div>
                <img src={qrDataUrl} alt={`QR personale per ${event.title || event.sport_name}`} />
                <div className={styles.qrDetails}>
                  <p>
                    <span>Token</span>
                    <code>{progress?.qr_token || 'Token non disponibile'}</code>
                  </p>
                  <p>
                    <span>Finestra di validità</span>
                    <strong>{qrWindowLabel}</strong>
                  </p>
                  {qrCountdown ? (
                    <p className={styles.qrCountdown}>
                      <Clock3 size={16} aria-hidden="true" />
                      <strong>{qrCountdown}</strong>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {progressPercent < 60 && timing.isCheckInOpen && (verificationMode === 'geo' || participantVerificationChoice === 'geo') ? (
              <div className={styles.monitorCard}>
                <div className={styles.monitorHead}>
                  <LocateFixed size={20} />
                  <div>
                    <strong>Check-in geolocalizzato</strong>
                    <span>Entra nell’area evento e verifica la tua presenza.</span>
                  </div>
                </div>
                <Button
                  type="button"
                  icon={LocateFixed}
                  onClick={() => sendPresence({ interactive: true })}
                  disabled={busy || requestingLocation}
                  fullWidth
                >
                  {busy || requestingLocation ? 'Verifica posizione...' : 'Verifica presenza GPS'}
                </Button>
              </div>
            ) : null}

            {progressPercent >= 60 && progressPercent < 100 ? (
              <div className={styles.monitorCard}>
                <div className={styles.monitorHead}>
                  <LocateFixed size={20} />
                  <div>
                    <strong>
                      {trackingStatus?.status === 'active'
                        ? 'Monitoraggio presenza attivo'
                        : 'Monitoraggio da ripristinare'}
                    </strong>
                    <span>
                      {trackingStatus?.status === 'active'
                        ? `Continua anche a schermo spento · ${elapsed}/${presenceTarget} minuti`
                        : (trackingStatus?.lastError || 'Riapri il monitoraggio della posizione')}
                    </span>
                  </div>
                  <i className={styles.trackingDot} data-active={trackingStatus?.status === 'active' ? 'true' : 'false'} />
                </div>
                <div className={styles.presenceRail}>
                  <span style={{ width: `${Math.min(100, (elapsed / Math.max(1, presenceTarget)) * 100)}%` }} />
                </div>
                <div className={styles.monitorMeta}>
                  <span>{progress?.organizer_present ? 'Organizzatore presente' : 'In attesa posizione organizzatore'}</span>
                  {lastPresence?.distance_m != null ? <span>Distanza: {Math.round(lastPresence.distance_m)} m</span> : null}
                  {trackingStatus?.lastPingAt ? (
                    <span>Ultimo controllo {new Date(trackingStatus.lastPingAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  icon={LocateFixed}
                  onClick={async () => {
                    try {
                      const location = await requestLocation({ requireFresh: true, maxAgeMs: 30000 });
                      if (!location) return;
                      requireEventLocationProof(location, event);
                      await startEventLocationTracking({
                        event,
                        role: 'participant',
                        verificationSource: String(progress?.verification_source || '') === 'gps' ? 'gps' : 'qr',
                        initialCoords: location
                      });
                      await sendPresence({ interactive: true });
                    } catch (trackingError) {
                      showToast(trackingError?.message || 'Impossibile riprendere il monitoraggio', 'error');
                    }
                  }}
                  disabled={busy || requestingLocation}
                  fullWidth
                >
                  {busy || requestingLocation
                    ? 'Verifica posizione...'
                    : trackingStatus?.status === 'active' ? 'Aggiorna presenza ora' : 'Riprendi monitoraggio'}
                </Button>
              </div>
            ) : null}

            {progressPercent >= 100 ? (
              <div className={styles.completedBox}>
                <Check size={24} />
                <div>
                  <strong>Cashback 100% · deposito restituito</strong>
                  <span>+{event.completion_xp || 50} PX accreditati sul profilo</span>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {!compactEmbedded ? <section className={styles.organizerHero} aria-label="Dashboard organizer">
              <div className={styles.organizerHeroTitle}>
                <div>
                  <h2>{managementOnly ? 'Gestisci partecipanti' : <>Sei<br />l&apos;organizzatore</>}</h2>
                  <p>{managementOnly ? 'Richieste, iscritti e presenze in un unico pannello.' : `Stato: ${event.status === 'completed' ? 'Completato' : 'Attivo'} • Evento ${event.visibility === 'private' ? 'privato' : 'pubblico'}`}</p>
                </div>
                <strong className={styles.organizerCount}>{validationSummary.total}/{event.max_participants || '∞'} partecipanti<br />registrati</strong>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => loadFlow()}
                  disabled={loading}
                >
                  Aggiorna
                </Button>
              </div>
            </section> : null}

            {compactEmbedded ? (
              <div className={styles.compactManagementOverview} aria-label="Riepilogo gestione partecipanti">
                <div className={joinRequests.length > 0 ? styles.compactManagementPending : ''}>
                  <span>Da approvare</span>
                  <strong>{joinRequests.length}</strong>
                </div>
                <div>
                  <span>Posti occupati</span>
                  <strong>{validationSummary.total}/{event.max_participants || '∞'}</strong>
                </div>
              </div>
            ) : null}

            {event.join_policy === 'approval' ? (
              <section className={styles.requestSection} aria-label="Richieste di partecipazione">
                <div className={styles.participantSectionTitle}>
                  <div>
                    <span className={styles.eyebrow}>Accesso su richiesta</span>
                    <h3>Da approvare</h3>
                  </div>
                  <span>{joinRequests.length}</span>
                </div>
                <div className={styles.requestList} aria-live="polite">
                  {joinRequests.length ? joinRequests.map((request) => {
                    const requestKey = String(request.auth_user_id || request.user_id || '');
                    const isDeciding = requestDecisionBusy === requestKey;
                    const gymEntryLabel = GYM_ENTRY_OPTIONS.find((option) => option.value === request.gym_access_choice)?.label;
                    const canOpenProfile = Boolean(requestKey && typeof onOpenParticipantProfile === 'function');
                    return (
                    <article key={request.auth_user_id || request.user_id} className={styles.requestRow}>
                      <button
                        type="button"
                        className={styles.requestProfileButton}
                        onClick={() => onOpenParticipantProfile?.(request)}
                        disabled={!canOpenProfile}
                        aria-label={canOpenProfile ? `Visualizza il profilo di ${request.display_name || 'partecipante'}` : undefined}
                      >
                        <span className={styles.avatar}>
                          {request.avatar_url
                            ? <img src={request.avatar_url} alt="" />
                            : request.display_name?.slice(0, 1)}
                        </span>
                        <span className={styles.requestCopy}>
                          <strong>{request.display_name}</strong>
                          <span>{request.note || `Livello: ${request.skill_level || 'non indicato'}`}</span>
                          {gymEntryLabel ? <small>Ingresso palestra · {gymEntryLabel}</small> : null}
                          {canOpenProfile ? <span className={styles.requestProfileHint}><Eye size={14} aria-hidden="true" /> Vedi profilo</span> : null}
                        </span>
                      </button>
                      <div className={styles.requestActions}>
                        <Button
                          type="button"
                          size="sm"
                          icon={Check}
                          aria-label={`Approva ${request.display_name || 'partecipante'}`}
                          title="Approva richiesta"
                          onClick={() => decideJoinRequest(request, 'approve')}
                          disabled={Boolean(requestDecisionBusy)}
                        >
                          {isDeciding ? 'Attendi' : 'Approva'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={XCircle}
                          aria-label={`Rifiuta ${request.display_name || 'partecipante'}`}
                          title="Rifiuta richiesta"
                          onClick={() => decideJoinRequest(request, 'decline')}
                          disabled={Boolean(requestDecisionBusy)}
                        >
                          Rifiuta
                        </Button>
                      </div>
                    </article>
                    );
                  }) : (
                    <p className={styles.emptyRequests}>Nessuna richiesta in attesa.</p>
                  )}
                </div>
              </section>
            ) : null}

            {!managementOnly && !timing.isCheckInOpen ? (
              <div className={styles.checkInUnavailable}>
                <Clock3 size={20} aria-hidden="true" />
                <div>
                  <strong>{timing.phase === 'scheduled' ? 'Check-in non ancora disponibile' : 'Check-in chiuso'}</strong>
                  <span>
                    {timing.phase === 'scheduled'
                      ? 'La scansione si attiva 30 minuti prima dell’inizio.'
                      : timing.canExtendCheckIn
                        ? 'Puoi aumentare la tolleranza per registrare i ritardatari.'
                        : 'Le nuove presenze non possono più essere registrate.'}
                  </span>
                </div>
                {timing.canExtendCheckIn && extensionOptions.length ? (
                  <div className={styles.extensionActions}>
                    {extensionOptions.map((minutes) => (
                      <button key={minutes} type="button" onClick={() => extendCheckIn(minutes)} disabled={busy}>
                        Estendi a +{minutes}′
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!managementOnly && usesQr ? (
              <Button
                type="button"
                icon={Camera}
                iconSize={28}
                className={styles.organizerScanButton}
                onClick={openScanner}
                disabled={requestingLocation || !timing.isCheckInOpen}
                fullWidth
              >
                {requestingLocation ? 'ATTIVO POSIZIONE...' : 'SCANNERIZZA CHECK-IN'}
              </Button>
            ) : !managementOnly ? (
              <Button
                type="button"
                icon={LocateFixed}
                onClick={() => sendPresence({ interactive: true })}
                disabled={busy || requestingLocation}
                fullWidth
              >
                {busy || requestingLocation ? 'Verifico posizione...' : 'Registra presenza organizzatore'}
              </Button>
            ) : null}

            {!managementOnly && usesQr ? (
              <div className={styles.organizerQrActions}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOrganizerQrOpen(true)}
                >
                  Mostra link QR organizer
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  icon={QrCode}
                  onClick={openScanner}
                  disabled={!timing.isCheckInOpen}
                >
                  Scansiona QR
                </Button>
              </div>
            ) : null}

            <section className={styles.participantSection}>
              <div className={styles.participantSectionTitle}>
                <h3>{managementOnly ? 'Iscritti' : `Presenze live ${validationSummary.checked}/${validationSummary.total}`}</h3>
                <span>{managementOnly ? `${validationSummary.total}/${event.max_participants || '∞'} posti occupati` : `Lista partecipanti ${validationSummary.total}/${event.max_participants || '∞'}`}</span>
              </div>
              <div className={styles.participantList} aria-live="polite">
                {registeredParticipants.length ? registeredParticipants.map((participant) => {
                  const presenceStatus = resolveParticipantPresenceStatus({
                    participant,
                    timing,
                    eventHasPassed: Boolean(event.has_passed)
                  });
                  const isPresent = presenceStatus.id === 'present';
                  const isAbsent = presenceStatus.id === 'absent';
                  const presenceLabel = presenceStatus.id === 'registered' && presenceStatus.checkInOpensAtMs != null
                    ? `✓ Iscritto · check-in dalle ${formatEventTime(presenceStatus.checkInOpensAtMs)}`
                    : presenceStatus.id === 'present'
                      ? `✅ ${presenceStatus.label}`
                      : presenceStatus.id === 'absent'
                        ? `❌ ${presenceStatus.label}`
                        : presenceStatus.id === 'missing_checkin'
                          ? `⚠️ ${presenceStatus.label}`
                          : `⏳ ${presenceStatus.label}`;
                  return (
                    <div key={participant.auth_user_id || participant.user_id} className={styles.participantRow}>
                      <div className={styles.acceptedParticipantIdentity}>
                        <button
                          type="button"
                          className={styles.acceptedParticipantProfile}
                          onClick={() => onOpenParticipantProfile?.(participant)}
                          disabled={!(isOrganizer
                            && (participant.auth_user_id || participant.user_id)
                            && typeof onOpenParticipantProfile === 'function')}
                          aria-label={isOrganizer && typeof onOpenParticipantProfile === 'function'
                            ? 'Visualizza il profilo di ' + (participant.display_name || 'partecipante')
                            : undefined}
                        >
                          <span className={styles.avatar}>
                            {participant.avatar_url ? <img src={participant.avatar_url} alt="" /> : participant.display_name?.slice(0, 1)}
                          </span>
                          <strong>{participant.display_name}</strong>
                        </button>
                        <span className={[
                          styles.acceptedParticipantStatus,
                          isPresent ? styles.present : isAbsent ? styles.absent : styles.waiting
                        ].join(' ')}>
                          {presenceLabel}
                        </span>
                      </div>
                      <div className={styles.participantRowActions}>
                        <time dateTime={participant.checked_in_at || undefined}>
                          {isPresent ? formatEventTime(participant.checked_in_at) : '—'}
                        </time>
                        {isOrganizer && participantRemovalPolicy.canRemove ? (
                          <button
                            type="button"
                            className={styles.participantRemoveButton}
                            onClick={() => openParticipantRemoval(participant)}
                            aria-label={'Rimuovi ' + (participant.display_name || 'partecipante')}
                            title="Gestisci partecipante"
                          >
                            <EllipsisVertical size={20} strokeWidth={3.2} aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                }) : (
                  <div className={styles.emptyParticipants}>
                    <span><Users size={28} aria-hidden="true" /></span>
                    <p>{managementOnly ? 'Nessun iscritto' : 'Nessun partecipante registrato'}</p>
                  </div>
                )}
              </div>
              {!managementOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.organizerQrButton}
                  onClick={() => setOrganizerQrOpen(true)}
                  fullWidth
                >
                  Mostra mio QR organizzatore
                </Button>
              ) : null}
            </section>
          </>
        )}
      </Card>

      {!isOrganizer && progressPercent >= 100 && !progress?.review_submitted ? (
        <Card subtle className={styles.reviewCard}>
          <div className={styles.reviewTitle}>
            <Star size={22} />
            <div>
              <h2>Valuta l’esperienza</h2>
              <p>Completa il questionario e ottieni +{event.review_bonus_xp || 25} PX.</p>
            </div>
          </div>
          <form onSubmit={submitReview}>
            {ratingField('Come valuti i compagni di allenamento?', review.partnerRating, (value) => setReview((prev) => ({ ...prev, partnerRating: value })))}
            {ratingField('L’organizzatore è stato puntuale?', review.organizerPunctuality, (value) => setReview((prev) => ({ ...prev, organizerPunctuality: value })))}
            {ratingField('L’evento corrispondeva alla descrizione?', review.descriptionAccuracy, (value) => setReview((prev) => ({ ...prev, descriptionAccuracy: value })))}
            <label className={styles.reviewField}>
              <span>Parteciperesti di nuovo?</span>
              <select
                value={review.wouldJoinAgain ? 'yes' : 'no'}
                onChange={(eventSelect) => setReview((prev) => ({ ...prev, wouldJoinAgain: eventSelect.target.value === 'yes' }))}
              >
                <option value="yes">Sì</option>
                <option value="no">No</option>
              </select>
            </label>
            <label className={styles.reviewField}>
              <span>Nota facoltativa</span>
              <textarea
                rows="3"
                value={review.note}
                maxLength="500"
                onChange={(eventInput) => setReview((prev) => ({ ...prev, note: eventInput.target.value }))}
              />
            </label>
            <Button type="submit" icon={Sparkles} disabled={reviewBusy} fullWidth>
              {reviewBusy ? 'Salvataggio...' : `Invia e ottieni +${event.review_bonus_xp || 25} PX`}
            </Button>
          </form>
        </Card>
      ) : null}

      <Modal
        open={Boolean(participantRemovalTarget)}
        title="Rimuovi partecipante"
        onClose={closeParticipantRemoval}
        onConfirm={confirmParticipantRemoval}
        confirmText={participantRemovalBusy ? 'Rimozione...' : 'Conferma rimozione'}
        confirmDisabled={!participantRemoval.reasonCode || participantRemovalBusy}
      >
        <div className={styles.participantRemovalModal}>
          <div className={styles.participantRemovalIdentity}>
            <span className={styles.avatar}>
              {participantRemovalTarget?.avatar_url
                ? <img src={participantRemovalTarget.avatar_url} alt="" />
                : participantRemovalTarget?.display_name?.slice(0, 1)}
            </span>
            <div>
              <strong>{participantRemovalTarget?.display_name || 'Partecipante'}</strong>
              <span>La quota impegnata verrà restituita interamente.</span>
            </div>
          </div>

          {participantRemovalPolicy.isLate ? (
            <div className={styles.participantRemovalWarning}>
              <AlertTriangle size={20} aria-hidden="true" />
              <div>
                <strong>Rimozione nelle ultime 12 ore</strong>
                <span>L’operazione è consentita, ma verrà registrata come tardiva.</span>
              </div>
            </div>
          ) : null}

          <label className={styles.participantRemovalField}>
            <span>Motivo</span>
            <select
              value={participantRemoval.reasonCode}
              onChange={(inputEvent) => setParticipantRemoval((current) => ({
                ...current,
                reasonCode: inputEvent.target.value
              }))}
            >
              <option value="">Seleziona un motivo</option>
              <option value="organizer_error">Accettazione per errore</option>
              <option value="requirements_mismatch">Requisiti non compatibili</option>
              <option value="safety">Comportamento o sicurezza</option>
              <option value="organization_issue">Problema organizzativo</option>
              <option value="other">Altro</option>
            </select>
          </label>
          <label className={styles.participantRemovalField}>
            <span>Nota facoltativa</span>
            <textarea
              rows="3"
              maxLength="300"
              value={participantRemoval.note}
              placeholder="Aggiungi una spiegazione breve"
              onChange={(inputEvent) => setParticipantRemoval((current) => ({
                ...current,
                note: inputEvent.target.value
              }))}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={scannerOpen}
        title="Scansiona QR partecipante"
        onClose={closeScanner}
        showConfirm={false}
        closeText="Chiudi"
      >
        <div className={styles.scannerBody}>
          <div className={styles.videoFrame}>
            <video ref={videoRef} muted playsInline aria-label="Fotocamera scansione QR" />
            <span aria-hidden="true" />
          </div>
          <p>Inquadra il QR personale nella cornice. Presenza, orario e posizione vengono registrati insieme.</p>
          {scannerError ? <p className={styles.scannerError}>{scannerError}</p> : null}
          {scanFeedback ? (
            <div className={`${styles.scanResult} ${styles[`scanResult_${scanFeedback.kind}`]}`} role="status">
              {scanFeedback.kind === 'success' ? <CheckCircle2 size={34} aria-hidden="true" /> : scanFeedback.kind === 'warning' ? <AlertTriangle size={34} aria-hidden="true" /> : <XCircle size={34} aria-hidden="true" />}
              <div>
                <strong>{scanFeedback.kind === 'success' ? `✅ ${scanFeedback.title}` : scanFeedback.kind === 'warning' ? `⚠️ ${scanFeedback.title}` : `❌ ${scanFeedback.title}`}</strong>
                {scanFeedback.participantName ? <span>{scanFeedback.participantName}</span> : null}
                <span>{scanFeedback.detail}</span>
              </div>
              <Button type="button" onClick={scanAnother} fullWidth>
                Scansiona un altro
              </Button>
            </div>
          ) : (
            <>
              <label className={styles.manualField}>
                Codice manuale di emergenza
                <input
                  value={manualToken}
                  onChange={(eventInput) => setManualToken(eventInput.target.value)}
                  placeholder="Incolla payload o token"
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                onClick={() => submitScan(manualToken)}
                disabled={!manualToken.trim() || busy}
                fullWidth
              >
                {busy ? 'Verifica...' : 'Verifica codice manuale'}
              </Button>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={organizerQrOpen}
        title="Il mio QR organizer"
        onClose={() => setOrganizerQrOpen(false)}
        showConfirm={false}
        closeText="Chiudi"
      >
        <div className={styles.organizerQrModal}>
          <span className={styles.organizerCrown}><Crown size={24} aria-hidden="true" /></span>
          <div>
            <strong>{event?.organizer?.name || 'Organizer'}</strong>
            <p>{event?.title || event?.sport_name}</p>
          </div>
          {organizerQrDataUrl ? (
            <img src={organizerQrDataUrl} alt={`QR organizer ${event?.organizer?.name || ''}`} />
          ) : (
            <p>Generazione QR...</p>
          )}
          <small>QR identificativo dell&apos;organizer per questo evento.</small>
        </div>
      </Modal>
    </>
  );
}

export default EventParticipationFlow;

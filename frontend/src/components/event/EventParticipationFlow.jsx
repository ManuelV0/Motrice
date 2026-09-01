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

const EMPTY_REVIEW = {
  partnerRating: 5,
  organizerPunctuality: 5,
  descriptionAccuracy: 5,
  wouldJoinAgain: true,
  note: ''
};

function getCheckInWindow(event) {
  const startsAtMs = Date.parse(event?.event_datetime || '');
  if (!Number.isFinite(startsAtMs)) return null;
  const durationMinutes = Math.max(30, Number(event?.duration_minutes || 120));
  return {
    validFromMs: startsAtMs - 30 * 60 * 1000,
    validUntilMs: startsAtMs + (durationMinutes + 30) * 60 * 1000
  };
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
  onEventRefresh
}) {
  const [progress, setProgress] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [requestDecisionBusy, setRequestDecisionBusy] = useState('');
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
  const [participantVerificationChoice, setParticipantVerificationChoice] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scanBusyRef = useRef(false);
  const presenceBusyRef = useRef(false);
  const finalizedRef = useRef(false);
  const lastScanRef = useRef({ fingerprint: '', at: 0 });

  const canLoad = Boolean(event?.id && (event?.is_going || isOrganizer));
  const verificationMode = event?.verification_mode || 'both';
  const usesQr = verificationMode === 'qr' || verificationMode === 'both';
  const usesGeo = verificationMode === 'geo' || verificationMode === 'both';

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
        setProgress(flowResult.value);
      }
      if (validationResult.status === 'fulfilled') {
        setParticipants(Array.isArray(validationResult.value) ? validationResult.value : []);
      }
      if (requestsResult.status === 'fulfilled') {
        setJoinRequests(Array.isArray(requestsResult.value) ? requestsResult.value : []);
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
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [canLoad]);

  useEffect(() => {
    if (!canLoad) return undefined;
    const timer = window.setInterval(
      () => loadFlow({ silent: true }),
      isOrganizer ? 5000 : 10000
    );
    return () => window.clearInterval(timer);
  }, [canLoad, isOrganizer, loadFlow]);

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
      const location = coords || (usesGeo ? await requestLocation() : null);
      if (!location && usesGeo) {
        throw new Error('Attiva la posizione per validare la scansione');
      }
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
    coords,
    event?.id,
    loadFlow,
    onEventRefresh,
    requestLocation,
    showToast,
    usesGeo
  ]);

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
      const location = coords || (usesGeo && interactive ? await requestLocation() : null);
      if (!location && usesGeo) {
        if (interactive) throw new Error('Posizione non disponibile');
        return;
      }
      const startsGpsCheckIn = !isOrganizer && usesGeo && !progress?.checked_in_at;
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
          lng: location?.lng ?? null
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
    event?.completion_xp,
    event?.id,
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
      Boolean(progress?.checked_in_at) &&
      Number(progress?.cashback_percent || 0) < 100;
    const eventStartMs = Date.parse(event?.event_datetime || '');
    const eventEndMs = eventStartMs + Number(event?.duration_minutes || 120) * 60000;
    const organizerWindow =
      isOrganizer &&
      Number.isFinite(eventStartMs) &&
      Date.now() >= eventStartMs - 30 * 60000 &&
      Date.now() <= eventEndMs + 30 * 60000;

    if ((usesGeo && !coords) || (!shouldMonitorParticipant && !organizerWindow)) return undefined;
    sendPresence();
    const timer = window.setInterval(() => sendPresence(), 60 * 1000);
    return () => window.clearInterval(timer);
  }, [
    coords,
    event?.duration_minutes,
    event?.event_datetime,
    isOrganizer,
    progress?.cashback_percent,
    progress?.checked_in_at,
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
      return !organizerIdentity || participantIdentity !== organizerIdentity;
    });
  }, [currentUser?.id, event?.organizer?.auth_user_id, event?.organizer?.id, event?.organizerId, participants]);
  const validationSummary = useMemo(() => {
    const items = registeredParticipants;
    return {
      total: items.filter((item) => !['cancelled'].includes(String(item.participant_status))).length,
      checked: items.filter((item) => Number(item.cashback_percent || 0) >= 60).length,
      completed: items.filter((item) => Number(item.cashback_percent || 0) >= 100).length
    };
  }, [registeredParticipants]);
  const checkInWindow = useMemo(() => getCheckInWindow(event), [event]);
  const qrWindowLabel = checkInWindow
    ? `${formatEventTime(checkInWindow.validFromMs)} – ${formatEventTime(checkInWindow.validUntilMs)}`
    : 'Finestra non disponibile';
  const qrCountdown = checkInWindow
    ? nowMs < checkInWindow.validFromMs
      ? `Si attiva tra ${formatCountdown(checkInWindow.validFromMs - nowMs)}`
      : nowMs <= checkInWindow.validUntilMs
        ? `Scade tra ${formatCountdown(checkInWindow.validUntilMs - nowMs)}`
        : 'QR scaduto'
    : '';

  async function openScanner() {
    setScannerError('');
    setScanFeedback(null);
    setManualToken('');
    const location = coords || (usesGeo ? await requestLocation() : null);
    if (!location && usesGeo) {
      showToast('Attiva la posizione prima di scansionare', 'error');
      return;
    }
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

  if (!canLoad) return null;

  return (
    <>
      <Card subtle className={`${styles.flowCard} ${isOrganizer ? styles.organizerFlowCard : ''}`}>
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

            <div className={styles.progressBlock}>
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

            {progressPercent < 60 && verificationMode === 'both' ? (
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

            {progressPercent < 60 && usesQr && qrDataUrl && (verificationMode === 'qr' || participantVerificationChoice === 'qr') ? (
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

            {progressPercent < 60 && (verificationMode === 'geo' || participantVerificationChoice === 'geo') ? (
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
                    <strong>Monitoraggio presenza attivo</strong>
                    <span>{elapsed}/{presenceTarget} minuti verificati</span>
                  </div>
                </div>
                <div className={styles.presenceRail}>
                  <span style={{ width: `${Math.min(100, (elapsed / Math.max(1, presenceTarget)) * 100)}%` }} />
                </div>
                <div className={styles.monitorMeta}>
                  <span>{progress?.organizer_present ? 'Organizzatore presente' : 'In attesa posizione organizzatore'}</span>
                  {lastPresence?.distance_m != null ? <span>Distanza: {Math.round(lastPresence.distance_m)} m</span> : null}
                </div>
                <Button
                  type="button"
                  icon={LocateFixed}
                  onClick={() => sendPresence({ interactive: true })}
                  disabled={busy || requestingLocation}
                  fullWidth
                >
                  {busy || requestingLocation ? 'Verifica posizione...' : 'Aggiorna presenza ora'}
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
            <section className={styles.organizerHero} aria-label="Dashboard organizer">
              <div className={styles.organizerHeroTitle}>
                <div>
                  <h2>Sei<br />l&apos;organizzatore</h2>
                  <p>Stato: {event.status === 'completed' ? 'Completato' : 'Attivo'} • Evento {event.visibility === 'private' ? 'privato' : 'pubblico'}</p>
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
            </section>

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
                    return (
                    <article key={request.auth_user_id || request.user_id} className={styles.requestRow}>
                      <span className={styles.avatar}>
                        {request.avatar_url
                          ? <img src={request.avatar_url} alt="" />
                          : request.display_name?.slice(0, 1)}
                      </span>
                      <div className={styles.requestCopy}>
                        <strong>{request.display_name}</strong>
                        <span>{request.note || `Livello: ${request.skill_level || 'non indicato'}`}</span>
                      </div>
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

            {usesQr ? (
              <Button
                type="button"
                icon={Camera}
                iconSize={28}
                className={styles.organizerScanButton}
                onClick={openScanner}
                disabled={requestingLocation}
                fullWidth
              >
                {requestingLocation ? 'ATTIVO POSIZIONE...' : 'SCANNERIZZA CHECK-IN'}
              </Button>
            ) : (
              <Button
                type="button"
                icon={LocateFixed}
                onClick={() => sendPresence({ interactive: true })}
                disabled={busy || requestingLocation}
                fullWidth
              >
                {busy || requestingLocation ? 'Verifico posizione...' : 'Registra presenza organizzatore'}
              </Button>
            )}

            {usesQr ? (
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
                >
                  Scansiona QR
                </Button>
              </div>
            ) : null}

            <section className={styles.participantSection}>
              <div className={styles.participantSectionTitle}>
                <h3>Presenze live {validationSummary.checked}/{validationSummary.total}</h3>
                <span>Lista partecipanti {validationSummary.total}/{event.max_participants || '∞'}</span>
              </div>
              <div className={styles.participantList} aria-live="polite">
                {registeredParticipants.length ? registeredParticipants.map((participant) => {
                  const isPresent = Boolean(participant.checked_in_at) || Number(participant.cashback_percent || 0) >= 60;
                  const isAbsent = !isPresent && (
                    String(participant.participant_status || '') === 'no_show' ||
                    (event.has_passed && !['cancelled'].includes(String(participant.participant_status || '')))
                  );
                  return (
                    <div key={participant.auth_user_id || participant.user_id} className={styles.participantRow}>
                      <span className={styles.avatar}>
                        {participant.avatar_url ? <img src={participant.avatar_url} alt="" /> : participant.display_name?.slice(0, 1)}
                      </span>
                      <div>
                        <strong>{participant.display_name}</strong>
                        <span className={isPresent ? styles.present : isAbsent ? styles.absent : styles.waiting}>
                          {isPresent ? '✅ Presente' : isAbsent ? '❌ Assente' : '⏳ In attesa'}
                        </span>
                      </div>
                      <time dateTime={participant.checked_in_at || undefined}>
                        {isPresent ? formatEventTime(participant.checked_in_at) : '—'}
                      </time>
                    </div>
                  );
                }) : (
                  <div className={styles.emptyParticipants}>
                    <span><Users size={28} aria-hidden="true" /></span>
                    <p>Nessun partecipante registrato</p>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                className={styles.organizerQrButton}
                onClick={() => setOrganizerQrOpen(true)}
                fullWidth
              >
                Mostra mio QR organizzatore
              </Button>
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

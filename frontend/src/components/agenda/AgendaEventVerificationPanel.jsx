import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  LocateFixed,
  Play,
  QrCode,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react';
import { api } from '../../services/api';
import { useUserLocation } from '../../hooks/useUserLocation';
import Modal from '../Modal';
import ContextInfoButton from '../ContextInfoButton';
import styles from '../../styles/components/agenda/agendaEventVerificationPanel.module.css';
import {
  getEventPhaseLabel,
  getEventTiming,
  getMaximumCheckInGraceMinutes
} from '../../utils/eventLifecycle';
import { resolveParticipantOutcome } from '../../utils/eventParticipationState';
import { startEventLocationTracking } from '../../services/eventLocationTracking';
import { validateEventLocationProof } from '../../utils/eventLocationProof';
import { isOutdoorTrackedEvent } from '../../utils/outdoorActivity';
import { createQrDataUrl, loadQrScannerRuntime } from '../../services/qrRuntime';

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

function decodeQrPayload(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { token: '', eventId: '' };

  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) candidates.push(decoded);
  } catch {
    // Il QR potrebbe essere gia decodificato.
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
        // Prova il formato successivo.
      }
    }
  }

  return { token: raw, eventId: '' };
}

function feedbackFromError(error) {
  const message = String(error?.message || 'QR non valido');
  const normalized = message.toLowerCase();
  if (normalized.includes('già registrato') || normalized.includes('gia registrato')) {
    return { tone: 'warning', title: 'Partecipante già registrato', detail: message };
  }
  if (normalized.includes('altro evento')) {
    return { tone: 'error', title: 'QR di un altro evento', detail: message };
  }
  if (normalized.includes('scadut') || normalized.includes('finestra evento')) {
    return { tone: 'error', title: 'QR scaduto', detail: 'Il codice non è più nella finestra valida.' };
  }
  return { tone: 'error', title: 'Verifica non riuscita', detail: message };
}

function playFeedback(success) {
  try {
    navigator?.vibrate?.(success ? 55 : [110, 65, 110]);
  } catch {
    // Il feedback aptico non deve bloccare il flusso.
  }
}

function AgendaEventVerificationPanel({
  event,
  isOrganizer,
  onClose,
  onVerified,
  onStartWorkout,
  onStartOutdoor,
  onOpenEvent,
  showToast,
  locationOptional = false
}) {
  const hasWorkout = Boolean(event?.workout_plan);
  const hasOutdoorTracking = isOutdoorTrackedEvent(event);
  const mode = String(event?.verification_mode || 'both').toLowerCase();
  const usesQr = mode === 'qr' || mode === 'both';
  const usesGeo = mode === 'geo' || mode === 'gps' || mode === 'both';
  const [method, setMethod] = useState(mode === 'qr' ? 'qr' : usesQr && usesGeo ? '' : 'geo');
  const [progress, setProgress] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading, setLoading] = useState(!isOrganizer);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [organizerLocationVerified, setOrganizerLocationVerified] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scanFeedback, setScanFeedback] = useState(null);
  const [scannerCycle, setScannerCycle] = useState(0);
  const [manualToken, setManualToken] = useState('');
  const [graceMinutes, setGraceMinutes] = useState(() => Number(event?.checkin_grace_minutes ?? 15));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scanBusyRef = useRef(false);
  const lastScanRef = useRef({ fingerprint: '', at: 0 });
  const verifiedNotifiedRef = useRef(false);
  const trackingStartedRef = useRef(false);
  const { coords, requesting, requestLocation, error: locationError } = useUserLocation();
  const timing = getEventTiming({ ...event, checkin_grace_minutes: graceMinutes }, nowMs);
  const maximumGraceMinutes = getMaximumCheckInGraceMinutes(event);
  const extensionOptions = [15, 20, 30].filter(
    (minutes) => minutes > graceMinutes && minutes <= maximumGraceMinutes
  );

  const activateLocationTracking = useCallback(async (location, source = 'gps') => {
    if (!usesGeo || !location || trackingStartedRef.current || !event?.id) return;
    trackingStartedRef.current = true;
    try {
      await startEventLocationTracking({
        event,
        role: isOrganizer ? 'organizer' : 'participant',
        verificationSource: source,
        initialCoords: location
      });
    } catch (error) {
      trackingStartedRef.current = false;
      showToast(error?.message || 'Monitoraggio presenza non avviato', 'error');
    }
  }, [event, isOrganizer, showToast, usesGeo]);

  useEffect(() => {
    setGraceMinutes(Number(event?.checkin_grace_minutes ?? 15));
  }, [event?.checkin_grace_minutes]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const notifyVerified = useCallback(async () => {
    if (verifiedNotifiedRef.current) return;
    verifiedNotifiedRef.current = true;
    setVerified(true);
    await onVerified?.();
  }, [onVerified]);

  const loadParticipantProgress = useCallback(async ({ silent = false } = {}) => {
    if (isOrganizer || !event?.id) return null;
    if (!silent) setLoading(true);
    try {
      const nextProgress = await api.getEventParticipationProgress(event.id);
      setProgress(nextProgress);
      const progressOutcome = resolveParticipantOutcome(nextProgress);
      const presenceVerified = ['checked_in', 'completed'].includes(progressOutcome.id);
      if (presenceVerified) {
        if (coords) {
          await activateLocationTracking(
            coords,
            String(nextProgress?.verification_source || '') === 'gps' ? 'gps' : 'qr'
          );
        }
        await notifyVerified();
      }
      return nextProgress;
    } catch (error) {
      if (!silent) showToast(error?.message || 'Dati di verifica non disponibili', 'error');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activateLocationTracking, coords, event?.id, isOrganizer, notifyVerified, showToast]);

  useEffect(() => {
    loadParticipantProgress();
  }, [loadParticipantProgress]);

  useEffect(() => {
    if (isOrganizer || verified) return undefined;
    const timer = window.setInterval(() => loadParticipantProgress({ silent: true }), 4000);
    return () => window.clearInterval(timer);
  }, [isOrganizer, loadParticipantProgress, verified]);

  useEffect(() => {
    let active = true;
    if (isOrganizer || !progress?.qr_payload) {
      setQrDataUrl('');
      return undefined;
    }

    createQrDataUrl(JSON.stringify(progress.qr_payload), {
      width: 360,
      margin: 2,
      color: { dark: '#0b0d0f', light: '#ffffff' },
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

  const submitScan = useCallback(async (rawValue) => {
    if (scanBusyRef.current) return;
    const decoded = decodeQrPayload(rawValue);
    if (!decoded.token) {
      setScanFeedback({ tone: 'error', title: 'QR non valido', detail: 'Token inesistente.' });
      playFeedback(false);
      return;
    }
    if (decoded.eventId && String(decoded.eventId) !== String(event?.id)) {
      setScanFeedback({ tone: 'error', title: 'QR di un altro evento', detail: 'Questo codice non appartiene all’evento selezionato.' });
      playFeedback(false);
      return;
    }

    const fingerprint = `${event?.id}:${decoded.token}`;
    const scanAt = Date.now();
    if (lastScanRef.current.fingerprint === fingerprint && scanAt - lastScanRef.current.at < 2000) return;
    lastScanRef.current = { fingerprint, at: scanAt };
    scanBusyRef.current = true;
    setBusy(true);
    setScannerError('');
    scannerControlsRef.current?.stop?.();

    try {
      const location = usesGeo
        ? await requestLocation({ requireFresh: true, maxAgeMs: 30000 })
        : null;
      if (usesGeo && !location) throw new Error('Attiva la posizione per validare la scansione.');
      if (usesGeo) requireEventLocationProof(location, event);
      const result = await api.scanEventParticipantQr({
        eventId: event.id,
        token: decoded.token,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        accuracyM: location?.accuracy ?? null
      });
      const alreadyChecked = Boolean(result?.already_checked || result?.alreadyChecked || result?.status === 'already_checked');
      const participantName = String(result?.participant_name || result?.display_name || 'Partecipante');
      if (alreadyChecked) {
        setScanFeedback({ tone: 'warning', title: 'Partecipante già registrato', detail: participantName });
        playFeedback(false);
        return;
      }

      const mot = Number(result?.mot_awarded || 5);
      const xp = Number(result?.xp_awarded || 25);
      setScanFeedback({ tone: 'success', title: 'Check-in valido', detail: `${participantName} · +${mot} MOT · +${xp} XP` });
      playFeedback(true);
      showToast(`Check-in valido · ${participantName}`, 'success');
      await activateLocationTracking(location, 'qr');
      await notifyVerified();
    } catch (error) {
      const feedback = feedbackFromError(error);
      setScanFeedback(feedback);
      playFeedback(false);
      showToast(feedback.title, feedback.tone === 'warning' ? 'info' : 'error');
    } finally {
      scanBusyRef.current = false;
      setBusy(false);
    }
  }, [activateLocationTracking, event, notifyVerified, requestLocation, showToast, usesGeo]);

  useEffect(() => {
    if (isOrganizer || !verified || !coords) return;
    activateLocationTracking(coords, String(progress?.verification_source || '') === 'gps' ? 'gps' : 'qr');
  }, [activateLocationTracking, coords, isOrganizer, progress?.verification_source, verified]);

  useEffect(() => {
    if (!scannerOpen || !videoRef.current || scanFeedback) return undefined;
    let reader = null;
    let cancelled = false;

    loadQrScannerRuntime()
      .then((BrowserQRCodeReader) => {
        if (cancelled) return null;
        reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 350,
          delayBetweenScanSuccess: 1000
        });
        return reader.decodeFromVideoDevice(undefined, videoRef.current, (result, error, controls) => {
          if (controls) scannerControlsRef.current = controls;
          if (cancelled || !result || scanBusyRef.current) return;
          controls?.stop();
          submitScan(result.getText());
        });
      })
      .then((controls) => {
        if (!controls) return;
        if (cancelled) controls.stop();
        else scannerControlsRef.current = controls;
      })
      .catch((error) => {
        if (cancelled) return;
        setScannerError(
          error?.message?.toLowerCase().includes('permission')
            ? 'Permesso fotocamera negato. Abilitalo nelle impostazioni.'
            : 'Fotocamera non disponibile. Puoi inserire il token manualmente.'
        );
      });

    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop?.();
      scannerControlsRef.current = null;
      reader?.reset?.();
    };
  }, [scanFeedback, scannerCycle, scannerOpen, submitScan]);

  const closeScanner = useCallback(() => {
    scannerControlsRef.current?.stop?.();
    setScannerOpen(false);
    setScannerError('');
    setScanFeedback(null);
  }, []);

  async function verifyGps() {
    if (!event?.id || busy) return;
    setBusy(true);
    setLocationFeedback({ tone: 'loading', message: 'Acquisizione della posizione attuale…' });
    try {
      // La verifica deve usare una rilevazione nuova: la posizione in cache serve
      // alla mappa, ma non e sufficiente per certificare la presenza all evento.
      const location = await requestLocation({ requireFresh: true, maxAgeMs: 30000 });
      if (!location) {
        throw new Error(locationError || 'Attiva la posizione del telefono, autorizza Motrice e riprova.');
      }
      if (!Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) {
        throw new Error('Coordinate non valide. Attiva la posizione precisa e riprova.');
      }
      const locationProof = requireEventLocationProof(location, event);
      const result = isOrganizer
        ? await api.recordEventPresence({
          eventId: event.id,
          lat: location.lat,
          lng: location.lng,
          accuracyM: location.accuracy ?? null
        })
        : await api.startEventGpsCheckIn({
          eventId: event.id,
          lat: location.lat,
          lng: location.lng,
          accuracyM: location.accuracy ?? null
        });

      const distance = Number(result?.distance_m);
      const insideRadius = typeof result?.inside_radius === 'boolean'
        ? result.inside_radius
        : Number.isFinite(distance) && distance + locationProof.accuracyM <= locationProof.radiusM;

      if (!insideRadius) {
        throw new Error(`Sei fuori dall’area dell’evento (${Math.round(distance || locationProof.distanceM)} m, raggio ${Math.round(locationProof.radiusM)} m).`);
      }

      if (isOrganizer) {
        setOrganizerLocationVerified(true);
        setLocationFeedback({
          tone: 'success',
          message: Number.isFinite(distance)
            ? `Posizione confermata: sei a ${Math.round(distance)} m dal punto evento.`
            : 'Posizione confermata nell’area dell’evento.'
        });
        showToast(
          hasWorkout ? 'Geolocalizzazione confermata · allenamento sbloccato' : 'Geolocalizzazione confermata · presenza registrata',
          'success'
        );
        playFeedback(true);
        await activateLocationTracking(location, 'gps');
        await notifyVerified();
        return;
      }

      setProgress((current) => ({
        ...current,
        ...result,
        checked_in_at: result?.checked_in_at || current?.checked_in_at || new Date().toISOString(),
        cashback_percent: Math.max(60, Number(result?.cashback_percent || 0))
      }));
      setLocationFeedback({
        tone: 'success',
        message: Number.isFinite(distance)
          ? `Posizione confermata: sei a ${Math.round(distance)} m dal punto evento.`
          : 'Posizione confermata nell’area dell’evento.'
      });
      showToast(
        `Presenza verificata · +${Number(result?.mot_awarded || 2)} MOT${hasWorkout ? ' · allenamento sbloccato' : ''}`,
        'success'
      );
      playFeedback(true);
      await activateLocationTracking(location, 'gps');
      await notifyVerified();
    } catch (error) {
      const message = error?.message || 'Verifica posizione non riuscita';
      setLocationFeedback({ tone: 'error', message });
      showToast(message, 'error');
      playFeedback(false);
    } finally {
      setBusy(false);
    }
  }

  async function extendCheckIn(minutes) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.extendEventCheckInWindow(event.id, minutes);
      const nextMinutes = Number(result?.checkin_grace_minutes ?? minutes);
      setGraceMinutes(nextMinutes);
      showToast(`Check-in prolungato fino a ${new Date(timing.startsAtMs + nextMinutes * 60000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`, 'success');
      await onVerified?.();
    } catch (error) {
      showToast(error?.message || 'Impossibile prolungare il check-in', 'error');
    } finally {
      setBusy(false);
    }
  }

  function scanAnother() {
    setScanFeedback(null);
    setScannerError('');
    setManualToken('');
    setScannerCycle((cycle) => cycle + 1);
  }

  const progressOutcome = resolveParticipantOutcome(progress);
  const panelVerified = locationOptional || verified || organizerLocationVerified || ['checked_in', 'completed'].includes(progressOutcome.id);

  return (
    <section className={`${styles.panel} ${panelVerified ? styles.panelVerified : ''}`} aria-label="Verifica presenza evento">
      <header className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true"><ShieldCheck size={20} /></span>
        <div>
          <small>{isOrganizer ? 'MODALITÀ ORGANIZER' : 'PRESENZA EVENTO'}</small>
          <h3>{locationOptional ? 'Accesso allenamento abilitato' : panelVerified ? 'Presenza verificata' : isOrganizer ? 'Check-in partecipante' : 'Come vuoi verificarti?'}</h3>
          <p>{panelVerified
            ? locationOptional
              ? 'Per questo account la posizione non è richiesta per aprire la sessione.'
              : hasOutdoorTracking ? 'Il monitoraggio GPS dell’attività è ora sbloccato.' : hasWorkout ? 'La scheda allenamento è ora sbloccata.' : 'La presenza è registrata e la sessione temporale è attiva.'
            : isOrganizer
              ? 'Scannerizza il QR personale mostrato dal partecipante.'
              : 'QR Code offre il bonus maggiore; la posizione è l’alternativa rapida.'}</p>
        </div>
        <span className={styles.headerActions}>
          <ContextInfoButton
            title="Verifica presenza"
            description="Il check-in conferma che l’utente sia realmente presente e sblocca la sessione dell’evento."
            items={[
              { title: 'QR Code', text: isOrganizer ? 'Scannerizza il codice personale mostrato dal partecipante.' : 'Mostra il tuo codice personale all’organizzatore.' },
              { title: 'Geolocalizzazione', text: 'Controlla che il telefono si trovi nell’area impostata per l’evento.' },
              { title: 'Finestra temporale', text: 'Apre 30 minuti prima dell’inizio e include la tolleranza decisa dall’organizzatore.' }
            ]}
            note="La posizione viene richiesta soltanto quando serve alla verifica o al monitoraggio dell’attività."
          />
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Chiudi verifica"><X size={19} /></button>
        </span>
      </header>

      <div className={styles.timingBar} data-open={timing.isCheckInOpen ? 'true' : 'false'}>
        <Clock3 size={18} aria-hidden="true" />
        <div>
          <strong>{getEventPhaseLabel(timing)}</strong>
          <small>
            {timing.checkInOpensAtMs != null && timing.checkInClosesAtMs != null
              ? `${new Date(timing.checkInOpensAtMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}–${new Date(timing.checkInClosesAtMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
              : 'Finestra non disponibile'}
          </small>
        </div>
      </div>

      {!panelVerified && !timing.isCheckInOpen ? (
        <div className={styles.closedTimingState}>
          <strong>{timing.phase === 'scheduled' ? 'Il check-in non è ancora aperto' : 'La finestra di check-in è chiusa'}</strong>
          <small>
            {timing.phase === 'scheduled'
              ? 'Torna qui 30 minuti prima dell’inizio.'
              : isOrganizer && timing.canExtendCheckIn
                ? 'Puoi concedere una tolleranza ai ritardatari.'
                : 'Non è più possibile registrare nuove presenze.'}
          </small>
          {isOrganizer && timing.canExtendCheckIn && extensionOptions.length ? (
            <div className={styles.extensionActions}>
              {extensionOptions.map((minutes) => (
                <button key={minutes} type="button" onClick={() => extendCheckIn(minutes)} disabled={busy}>
                  Fino a +{minutes}′
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : panelVerified ? (
        <div className={styles.verifiedState}>
          <span aria-hidden="true"><CheckCircle2 size={25} /></span>
          <div>
            <strong>{hasOutdoorTracking ? 'Attività live sbloccata' : hasWorkout ? 'Allenamento sbloccato' : 'Sessione attiva'}</strong>
            <small>{locationOptional ? 'Accesso consentito senza verifica GPS; nessuna presenza o ricompensa viene assegnata automaticamente.' : hasOutdoorTracking ? 'Tempo, km, passo, dislivello e passi in tempo reale.' : hasWorkout ? 'Puoi iniziare la scheda preimpostata.' : 'Puoi seguire durata e stato dalla pagina evento.'}</small>
          </div>
          <button type="button" onClick={hasOutdoorTracking ? onStartOutdoor : hasWorkout ? onStartWorkout : onOpenEvent}>
            {hasOutdoorTracking || hasWorkout ? <Play size={18} /> : <ArrowRight size={18} />}
            {hasOutdoorTracking ? 'Avvia attività' : hasWorkout ? 'Avvia allenamento' : 'Apri evento'}
          </button>
        </div>
      ) : isOrganizer ? (
        <div className={styles.organizerActions}>
          {usesQr ? (
            <button type="button" className={styles.primaryAction} onClick={() => setScannerOpen(true)}>
              <Camera size={21} />
              <span><strong>Scannerizza QR Code</strong><small>Inquadra il codice del partecipante</small></span>
            </button>
          ) : null}
          {usesGeo ? (
            <button
              type="button"
              className={styles.locationAction}
              onClick={verifyGps}
              disabled={busy || requesting || organizerLocationVerified}
            >
              {organizerLocationVerified ? <CheckCircle2 size={21} /> : <LocateFixed size={21} />}
              <span>
                <strong>{organizerLocationVerified ? 'Posizione verificata' : 'Conferma geolocalizzazione'}</strong>
                <small>{organizerLocationVerified
                  ? 'La tua presenza nell’area evento è attiva'
                  : 'Verifica la distanza dal punto dell’evento'}</small>
              </span>
            </button>
          ) : null}
          {locationFeedback ? (
            <p className={styles.locationStatus} data-tone={locationFeedback.tone}>{locationFeedback.message}</p>
          ) : null}
          {!usesQr && !usesGeo ? (
            <div className={styles.infoState}><LocateFixed size={20} /><span>Nessun metodo di verifica disponibile.</span></div>
          ) : null}
        </div>
      ) : (
        <>
          {mode === 'both' && !method ? (
            <div className={styles.methodGrid}>
              <button type="button" onClick={() => setMethod('qr')}>
                <QrCode size={24} />
                <strong>Mostra QR Code</strong>
                <small>+5 MOT · +25 XP</small>
              </button>
              <button type="button" onClick={() => {
                setMethod('geo');
                verifyGps();
              }} disabled={busy || requesting}>
                <LocateFixed size={24} />
                <strong>Conferma geolocalizzazione</strong>
                <small>+2 MOT iniziali</small>
              </button>
            </div>
          ) : null}

          {usesQr && method === 'qr' ? (
            <div className={styles.qrState}>
              {loading ? <div className={styles.loader} aria-label="Genero QR" /> : null}
              {!loading && qrDataUrl ? <img src={qrDataUrl} alt={`QR personale ${event?.title || ''}`} /> : null}
              {!loading && !qrDataUrl ? <p>QR non disponibile. Aggiorna e riprova.</p> : null}
              <div><strong>Mostralo all’organizzatore</strong><small>La verifica si aggiorna automaticamente.</small></div>
              <button type="button" className={styles.secondaryAction} onClick={() => loadParticipantProgress()} disabled={loading}>
                <RefreshCw size={16} /> Aggiorna stato
              </button>
            </div>
          ) : null}

          {usesGeo && method === 'geo' ? (
            <div className={styles.gpsState}>
              <span aria-hidden="true"><LocateFixed size={26} /></span>
              <div><strong>Verifica nell’area evento</strong><small>Il telefono controllerà la distanza dal punto dell’attività.</small></div>
              <button type="button" className={styles.primaryAction} onClick={verifyGps} disabled={busy || requesting}>
                <LocateFixed size={19} /> {busy || requesting ? 'Verifica in corso…' : 'Conferma geolocalizzazione'}
              </button>
              {locationFeedback ? (
                <p className={styles.locationStatus} data-tone={locationFeedback.tone}>{locationFeedback.message}</p>
              ) : null}
            </div>
          ) : null}

          {mode === 'both' && method ? (
            <button type="button" className={styles.changeMethod} onClick={() => setMethod('')}>Cambia metodo di verifica</button>
          ) : null}
        </>
      )}

      <Modal open={scannerOpen} title="Scanner QR partecipante" onClose={closeScanner} showConfirm={false} closeText="Chiudi">
        <div className={styles.scannerBody}>
          {!scanFeedback ? (
            <>
              <div className={styles.cameraFrame}>
                <video ref={videoRef} muted playsInline aria-label="Fotocamera scanner Agenda" />
                <span aria-hidden="true" />
              </div>
              <p>Inquadra il QR personale nella cornice.</p>
              {scannerError ? <div className={styles.scannerError}>{scannerError}</div> : null}
              <div className={styles.manualScan}>
                <input value={manualToken} onChange={(inputEvent) => setManualToken(inputEvent.target.value)} placeholder="Token manuale" />
                <button type="button" onClick={() => submitScan(manualToken)} disabled={!manualToken.trim() || busy}>Verifica</button>
              </div>
            </>
          ) : (
            <div className={`${styles.scanResult} ${styles[`scanResult_${scanFeedback.tone}`] || ''}`}>
              <span aria-hidden="true">{scanFeedback.tone === 'success' ? <Check size={28} /> : <X size={28} />}</span>
              <h4>{scanFeedback.title}</h4>
              <p>{scanFeedback.detail}</p>
              {scanFeedback.tone === 'success' ? (
                <button type="button" onClick={closeScanner}>Continua</button>
              ) : (
                <button type="button" onClick={scanAnother}>Scansiona un altro</button>
              )}
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}

export default AgendaEventVerificationPanel;

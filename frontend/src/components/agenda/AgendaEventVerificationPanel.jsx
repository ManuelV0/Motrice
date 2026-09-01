import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import QRCode from 'qrcode';
import {
  Camera,
  Check,
  CheckCircle2,
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
import styles from '../../styles/components/agenda/agendaEventVerificationPanel.module.css';

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
  showToast
}) {
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scanFeedback, setScanFeedback] = useState(null);
  const [scannerCycle, setScannerCycle] = useState(0);
  const [manualToken, setManualToken] = useState('');
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scanBusyRef = useRef(false);
  const lastScanRef = useRef({ fingerprint: '', at: 0 });
  const verifiedNotifiedRef = useRef(false);
  const { coords, requesting, requestLocation, error: locationError } = useUserLocation();

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
      const presenceVerified = Boolean(
        nextProgress?.checked_in_at || Number(nextProgress?.cashback_percent || 0) >= 60
      );
      if (presenceVerified) await notifyVerified();
      return nextProgress;
    } catch (error) {
      if (!silent) showToast(error?.message || 'Dati di verifica non disponibili', 'error');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [event?.id, isOrganizer, notifyVerified, showToast]);

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

    QRCode.toDataURL(JSON.stringify(progress.qr_payload), {
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
      const location = coords || (usesGeo ? await requestLocation() : null);
      if (usesGeo && !location) throw new Error('Attiva la posizione per validare la scansione.');
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
  }, [coords, event?.id, notifyVerified, requestLocation, showToast, usesGeo]);

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
      reader.reset?.();
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
    try {
      const location = coords || await requestLocation();
      if (!location) throw new Error(locationError || 'Posizione non disponibile.');
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

      if (isOrganizer) {
        if (!result?.inside_radius) {
          throw new Error(`Sei fuori dall’area dell’evento (${Math.round(Number(result?.distance_m || 0))} m).`);
        }
        setOrganizerLocationVerified(true);
        showToast('Posizione organizer verificata', 'success');
        playFeedback(true);
        return;
      }

      setProgress((current) => ({ ...current, ...result, cashback_percent: Math.max(60, Number(result?.cashback_percent || 0)) }));
      showToast(`Presenza verificata · +${Number(result?.mot_awarded || 2)} MOT`, 'success');
      playFeedback(true);
      await notifyVerified();
    } catch (error) {
      showToast(error?.message || 'Verifica posizione non riuscita', 'error');
      playFeedback(false);
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

  const panelVerified = verified || Boolean(progress?.checked_in_at) || Number(progress?.cashback_percent || 0) >= 60;

  return (
    <section className={`${styles.panel} ${panelVerified ? styles.panelVerified : ''}`} aria-label="Verifica presenza evento">
      <header className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true"><ShieldCheck size={20} /></span>
        <div>
          <small>{isOrganizer ? 'MODALITÀ ORGANIZER' : 'PRESENZA EVENTO'}</small>
          <h3>{panelVerified ? 'Presenza verificata' : isOrganizer ? 'Check-in partecipante' : 'Come vuoi verificarti?'}</h3>
          <p>{panelVerified
            ? 'La scheda allenamento è ora sbloccata.'
            : isOrganizer
              ? 'Scannerizza il QR personale mostrato dal partecipante.'
              : 'QR Code offre il bonus maggiore; la posizione è l’alternativa rapida.'}</p>
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Chiudi verifica"><X size={19} /></button>
      </header>

      {panelVerified ? (
        <div className={styles.verifiedState}>
          <span aria-hidden="true"><CheckCircle2 size={25} /></span>
          <div><strong>Allenamento sbloccato</strong><small>Puoi iniziare la scheda preimpostata.</small></div>
          <button type="button" onClick={onStartWorkout}><Play size={18} /> Avvia allenamento</button>
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
                <strong>{organizerLocationVerified ? 'Posizione verificata' : 'Utilizza geolocalizzazione'}</strong>
                <small>{organizerLocationVerified
                  ? 'La tua presenza nell’area evento è attiva'
                  : 'Conferma la tua presenza nell’area evento'}</small>
              </span>
            </button>
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
              <button type="button" onClick={() => setMethod('geo')}>
                <LocateFixed size={24} />
                <strong>Verifica posizione</strong>
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
                <LocateFixed size={19} /> {busy || requesting ? 'Verifica in corso…' : 'Verifica posizione'}
              </button>
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

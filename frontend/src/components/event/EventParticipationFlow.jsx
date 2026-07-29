import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import QRCode from 'qrcode';
import {
  Camera,
  Check,
  CircleDollarSign,
  Clock3,
  LocateFixed,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Users
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

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR'
  });
}

function statusLabel(item) {
  const cashback = Number(item?.cashback_percent || 0);
  if (cashback >= 100) return 'Completato';
  if (cashback >= 60) return 'Check-in verificato';
  if (String(item?.participant_status || '') === 'no_show') return 'Assente';
  if (String(item?.participant_status || '') === 'cancelled') return 'Annullato';
  return 'Iscritto';
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
  coords,
  requestingLocation,
  requestLocation,
  showToast,
  onEventRefresh
}) {
  const [progress, setProgress] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [review, setReview] = useState(EMPTY_REVIEW);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [lastPresence, setLastPresence] = useState(null);
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scanBusyRef = useRef(false);
  const presenceBusyRef = useRef(false);
  const finalizedRef = useRef(false);

  const canLoad = Boolean(event?.id && (event?.is_going || isOrganizer));
  const verificationMode = event?.verification_mode || 'both';
  const usesQr = verificationMode === 'qr' || verificationMode === 'both';
  const usesGeo = verificationMode === 'geo' || verificationMode === 'both';

  const loadFlow = useCallback(async ({ silent = false } = {}) => {
    if (!canLoad) return;
    if (!silent) setLoading(true);
    try {
      const [flow, validation] = await Promise.all([
        api.getEventParticipationProgress(event.id),
        api.listEventValidationStatus(event.id)
      ]);
      setProgress(flow);
      setParticipants(Array.isArray(validation) ? validation : []);
    } catch (error) {
      if (!silent) {
        showToast(error?.message || 'Flusso partecipazione non disponibile', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [canLoad, event?.id, showToast]);

  useEffect(() => {
    loadFlow();
  }, [loadFlow]);

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

  const submitScan = useCallback(async (rawToken) => {
    if (scanBusyRef.current) return;
    scanBusyRef.current = true;
    setBusy(true);
    try {
      const location = coords || (usesGeo ? await requestLocation() : null);
      if (!location && usesGeo) {
        throw new Error('Attiva la posizione per validare la scansione');
      }
      const result = await api.scanEventParticipantQr({
        eventId: event.id,
        token: rawToken,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null
      });
      showToast(`Presenza verificata · cashback ${result?.cashback_percent || 60}%`, 'success');
      setManualToken('');
      setScannerOpen(false);
      await loadFlow({ silent: true });
      await onEventRefresh?.();
    } catch (error) {
      setScannerError(error?.message || 'QR non valido');
      showToast(error?.message || 'Scansione non riuscita', 'error');
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
    if (!scannerOpen || !videoRef.current) return undefined;

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
  }, [scannerOpen, submitScan]);

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
      const result = await api.recordEventPresence({
        eventId: event.id,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null
      });
      setLastPresence(result);
      await loadFlow({ silent: true });
      if (result?.checked_in_now) {
        showToast('Presenza GPS verificata · cashback 60%', 'success');
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
    loadFlow,
    onEventRefresh,
    requestLocation,
    showToast,
    usesGeo
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
  const validationSummary = useMemo(() => {
    const items = Array.isArray(participants) ? participants : [];
    return {
      total: items.filter((item) => !['cancelled'].includes(String(item.participant_status))).length,
      checked: items.filter((item) => Number(item.cashback_percent || 0) >= 60).length,
      completed: items.filter((item) => Number(item.cashback_percent || 0) >= 100).length
    };
  }, [participants]);

  if (!canLoad) return null;

  return (
    <>
      <Card subtle className={styles.flowCard}>
        <div className={styles.flowHeader}>
          <div>
            <span className={styles.eyebrow}>Partecipazione protetta</span>
            <h2>{isOrganizer ? 'Validazione partecipanti' : 'Il tuo avanzamento'}</h2>
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

        <div className={styles.ruleGrid}>
          <div><CircleDollarSign size={18} /><span>Deposito</span><strong>{money(event.deposit_cents)}</strong></div>
          <div><Clock3 size={18} /><span>Presenza minima</span><strong>{event.minimum_presence_minutes || 45} min</strong></div>
          <div><ShieldCheck size={18} /><span>Verifica</span><strong>{verificationMode === 'both' ? 'QR + GPS' : verificationMode === 'geo' ? 'GPS' : 'QR'}</strong></div>
          <div><Sparkles size={18} /><span>Ricompensa</span><strong>+{event.completion_xp || 50} PX</strong></div>
        </div>

        {!isOrganizer ? (
          <>
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

            {progressPercent < 60 && usesQr && qrDataUrl ? (
              <div className={styles.participantQr}>
                <div>
                  <span className={styles.eyebrow}>QR personale</span>
                  <h3>Mostralo all’organizzatore</h3>
                  <p>È diverso per ogni partecipante e valido soltanto per questo evento.</p>
                </div>
                <img src={qrDataUrl} alt={`QR personale per ${event.title || event.sport_name}`} />
              </div>
            ) : null}

            {progressPercent < 60 && verificationMode === 'geo' ? (
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
            <div className={styles.organizerStats}>
              <div><Users size={18} /><strong>{validationSummary.total}</strong><span>Iscritti</span></div>
              <div><QrCode size={18} /><strong>{validationSummary.checked}</strong><span>Check-in</span></div>
              <div><Check size={18} /><strong>{validationSummary.completed}</strong><span>Completati</span></div>
            </div>

            {usesQr ? (
              <Button
                type="button"
                icon={Camera}
                onClick={async () => {
                  setScannerError('');
                  const location = coords || (usesGeo ? await requestLocation() : null);
                  if (!location && usesGeo) {
                    showToast('Attiva la posizione prima di scansionare', 'error');
                    return;
                  }
                  setScannerOpen(true);
                }}
                disabled={requestingLocation}
                fullWidth
              >
                {requestingLocation ? 'Attivo posizione...' : 'Scansiona partecipanti'}
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

            <div className={styles.participantList}>
              {participants.map((participant) => (
                <div key={participant.auth_user_id || participant.user_id} className={styles.participantRow}>
                  <span className={styles.avatar}>
                    {participant.avatar_url ? <img src={participant.avatar_url} alt="" /> : participant.display_name?.slice(0, 1)}
                  </span>
                  <div>
                    <strong>{participant.display_name}</strong>
                    <span>{statusLabel(participant)}</span>
                  </div>
                  <b>{Number(participant.cashback_percent || 0)}%</b>
                </div>
              ))}
            </div>
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
        onClose={() => setScannerOpen(false)}
        showConfirm={false}
        closeText="Chiudi"
      >
        <div className={styles.scannerBody}>
          <div className={styles.videoFrame}>
            <video ref={videoRef} muted playsInline aria-label="Fotocamera scansione QR" />
            <span aria-hidden="true" />
          </div>
          <p>Inquadra il QR personale. Presenza, orario e posizione vengono registrati insieme.</p>
          {scannerError ? <p className={styles.scannerError}>{scannerError}</p> : null}
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
        </div>
      </Modal>
    </>
  );
}

export default EventParticipationFlow;

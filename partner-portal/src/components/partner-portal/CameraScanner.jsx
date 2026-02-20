import { useEffect, useRef, useState } from 'react';
import { portalStyles as styles } from './PortalPrimitives';

export default function CameraScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    async function start() {
      setError('');
      if (!navigator?.mediaDevices?.getUserMedia) {
        setError('Fotocamera non disponibile su questo browser/dispositivo.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (!('BarcodeDetector' in window)) {
          setError('Scanner automatico non supportato: incolla codice o URL manualmente.');
          return;
        }

        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (Array.isArray(codes) && codes.length > 0) {
              const value = String(codes[0]?.rawValue || '').trim();
              if (value) {
                onDetected(value);
                onClose();
                return;
              }
            }
          } catch {
            // Ignore single-frame errors.
          }
          rafRef.current = window.requestAnimationFrame(scan);
        };

        rafRef.current = window.requestAnimationFrame(scan);
      } catch (err) {
        setError(err?.message || 'Impossibile avviare la fotocamera.');
      }
    }

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [open, onClose, onDetected]);

  if (!open) return null;

  return (
    <section className={styles.card}>
      <div className={styles.rowBetween}>
        <h3>Scanner fotocamera</h3>
        <button className={`${styles.actionBtn} ${styles.ghostBtn}`} onClick={onClose} type="button">
          Chiudi scanner
        </button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', background: '#0f172a', maxHeight: '20rem', objectFit: 'cover' }}
      />
      {error ? <p className={styles.muted}>{error}</p> : <p className={styles.muted}>Inquadra il QR per compilare il codice.</p>}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import Modal from './Modal';
import styles from '../styles/components/rewarded-video-demo.module.css';

const DEFAULT_DEMO_VIDEO_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

function RewardedVideoDemoModal({ open, onClose, onCompleted }) {
  const videoRef = useRef(null);
  const [completed, setCompleted] = useState(false);
  const [started, setStarted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const videoUrl = import.meta.env.VITE_REWARDED_DEMO_VIDEO_URL || DEFAULT_DEMO_VIDEO_URL;
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (!open) return undefined;
    setCompleted(false);
    setStarted(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadError(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    return undefined;
  }, [open]);

  const progressPct = useMemo(() => {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  function handlePlay() {
    setStarted(true);
  }

  function handleTimeUpdate(event) {
    setCurrentTime(event.currentTarget.currentTime || 0);
  }

  function handleLoadedMetadata(event) {
    setDuration(event.currentTarget.duration || 0);
  }

  function handleEnded() {
    setCompleted(true);
    setCurrentTime(duration || currentTime);
  }

  function handleVideoError() {
    setLoadError(true);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Video sponsor (demo)"
      onConfirm={onCompleted}
      confirmText={completed || (isDev && loadError) ? 'Riscatta sblocco Pro' : 'Guarda il video fino alla fine'}
      confirmDisabled={!(completed || (isDev && loadError))}
    >
      <div className={styles.player}>
        <PlayCircle size={32} aria-hidden="true" />
        <p>Riproduci il video di prova per abilitare lo sblocco.</p>
        <video
          ref={videoRef}
          className={styles.video}
          controls
          preload="metadata"
          playsInline
          onPlay={handlePlay}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onError={handleVideoError}
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      </div>
      <div className={styles.progressTrack} aria-hidden="true">
        <span className={styles.progressFill} style={{ width: `${progressPct}%` }} />
      </div>
      <p className="muted">
        {loadError && isDev
          ? 'Video non disponibile in rete. In sviluppo puoi comunque riscattare lo sblocco.'
          : completed
          ? 'Visione completata. Ora puoi riscattare lo sblocco Pro.'
          : started
            ? 'Continua fino alla fine del video per sbloccare il pulsante.'
            : 'Premi Play e guarda il video fino alla fine.'}
      </p>
    </Modal>
  );
}

export default RewardedVideoDemoModal;

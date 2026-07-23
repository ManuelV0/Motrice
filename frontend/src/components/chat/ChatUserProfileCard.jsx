import { Dumbbell, MapPin, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import avatarPlaceholder from '../../assets/avatar-placeholder.svg';
import styles from '../../styles/components/chat/chatUserProfileCard.module.css';

const LEVEL_LABELS = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzato'
};

function ChatUserProfileCard({ open, loading, profile, error, onClose }) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = String(profile?.avatar_url || '').trim();
  const level = String(profile?.level || '').trim();
  const reliability = Number(profile?.reliability || 0);

  const avatarSrc = useMemo(
    () => (!imageFailed && avatarUrl ? avatarUrl : avatarPlaceholder),
    [avatarUrl, imageFailed]
  );

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={() => onClose?.()}>
      <section
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden="true" />
        <button type="button" className={styles.closeButton} onClick={() => onClose?.()} aria-label="Chiudi scheda profilo">
          <X size={19} aria-hidden="true" />
        </button>

        <div className={styles.identity}>
          <div className={styles.avatarRing}>
            <img
              className={styles.avatar}
              src={avatarSrc}
              alt=""
              onError={() => setImageFailed(true)}
            />
            <span className={styles.onlineDot} aria-hidden="true" />
          </div>
          <div>
            <span className={styles.eyebrow}>Profilo Motrice</span>
            <h2 id="chat-profile-title">{profile?.display_name || 'Partecipante'}</h2>
            <p className={styles.visibleHint}>Identità usata nei messaggi</p>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading} aria-live="polite">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <>
            <div className={styles.bioBox}>
              <span>Bio</span>
              <p>{profile?.bio || 'Questo utente non ha ancora aggiunto una bio.'}</p>
            </div>

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <MapPin size={17} aria-hidden="true" />
                <span>Città</span>
                <strong>{profile?.city || 'Non indicata'}</strong>
              </div>
              <div className={styles.metaItem}>
                <Dumbbell size={17} aria-hidden="true" />
                <span>Livello</span>
                <strong>{LEVEL_LABELS[level] || 'Non indicato'}</strong>
              </div>
              <div className={styles.metaItem}>
                <ShieldCheck size={17} aria-hidden="true" />
                <span>Affidabilità</span>
                <strong>{reliability > 0 ? `${Math.round(reliability)}%` : 'In costruzione'}</strong>
              </div>
            </div>
          </>
        )}

        {error ? <p className={styles.error}>{error}</p> : null}
        <button type="button" className={styles.doneButton} onClick={() => onClose?.()}>
          Chiudi
        </button>
      </section>
    </div>
  );
}

export default ChatUserProfileCard;

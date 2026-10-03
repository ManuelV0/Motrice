import {
  Check,
  Clock3,
  Images,
  LockKeyhole,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  UserRound,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import EmptyState from './EmptyState';
import LoadingSkeleton from './LoadingSkeleton';
import { useToast } from '../context/ToastContext';
import {
  listProfilePhotoChangeRequests,
  reviewProfilePhotoChange
} from '../services/profilePhotoVerification';
import styles from '../styles/pages/adminProfileVerifications.module.css';

const STATUS_COPY = {
  pending: 'Da confrontare',
  approved: 'Approvata',
  rejected: 'Rifiutata',
  cancelled: 'Sostituita'
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function initials(name) {
  return String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

function AdminProfilePhotoReviews() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const loadRequests = useCallback(async (nextFilter = filter) => {
    setLoading(true);
    try {
      const items = await listProfilePhotoChangeRequests(nextFilter);
      setRequests(items);
      setSelectedId((current) => items.some((item) => item.request_id === current)
        ? current
        : items[0]?.request_id || '');
    } catch (error) {
      setRequests([]);
      setSelectedId('');
      showToast(error.message || 'Impossibile caricare le foto profilo', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  useEffect(() => {
    setRejectOpen(false);
    setReason('');
    loadRequests(filter);
  }, [filter, loadRequests]);

  const selected = useMemo(
    () => requests.find((item) => item.request_id === selectedId) || requests[0] || null,
    [requests, selectedId]
  );

  async function review(decision) {
    if (!selected || reviewing) return;
    if (decision === 'rejected' && reason.trim().length < 5) {
      showToast('Inserisci una motivazione chiara', 'info');
      return;
    }

    setReviewing(true);
    try {
      await reviewProfilePhotoChange(selected, decision, reason);
      showToast(
        decision === 'approved'
          ? 'Corrispondenza confermata: il nuovo avatar è pubblico'
          : 'Foto rifiutata: l’avatar precedente resta invariato',
        'success'
      );
      setRejectOpen(false);
      setReason('');
      await loadRequests(filter);
    } catch (error) {
      showToast(error.message || 'Revisione non riuscita', 'error');
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section className={styles.photoReviewSection} aria-label="Confronto foto profilo">
      <div className={styles.photoReviewIntro}>
        <span><ScanFace size={21} /></span>
        <div>
          <strong>Confronto volto 1:1</strong>
          <small>La foto candidata resta privata finché un revisore non conferma che appartiene alla stessa persona.</small>
        </div>
        <button type="button" onClick={() => loadRequests(filter)} disabled={loading} aria-label="Aggiorna foto da confrontare">
          <RefreshCw size={17} />
        </button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Stato foto profilo">
        <button type="button" role="tab" aria-selected={filter === 'pending'} onClick={() => setFilter('pending')}>
          <Clock3 size={16} /> Da confrontare
        </button>
        <button type="button" role="tab" aria-selected={filter === 'reviewed'} onClick={() => setFilter('reviewed')}>
          <Images size={16} /> Revisionate
        </button>
      </div>

      {loading ? <LoadingSkeleton rows={4} variant="detail" /> : requests.length === 0 ? (
        <EmptyState
          icon={filter === 'pending' ? ScanFace : Images}
          title={filter === 'pending' ? 'Nessuna foto da confrontare' : 'Nessuna foto revisionata'}
          description="Le nuove immagini profilo appariranno qui senza sostituire l’avatar corrente."
        />
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.queue} aria-label="Richieste foto profilo">
            <div className={styles.queueHeader}>
              <strong>{filter === 'pending' ? 'Da controllare' : 'Archivio foto'}</strong>
              <span>{requests.length}</span>
            </div>
            <div className={styles.requestList}>
              {requests.map((request) => {
                const active = request.request_id === selected?.request_id;
                return (
                  <button
                    type="button"
                    key={request.request_id}
                    className={`${styles.request} ${active ? styles.requestActive : ''}`}
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(request.request_id);
                      setRejectOpen(false);
                      setReason('');
                    }}
                  >
                    <span className={styles.avatarMini}>
                      {request.current_avatar_url
                        ? <img src={request.current_avatar_url} alt="" />
                        : initials(request.display_name)}
                    </span>
                    <span className={styles.requestCopy}>
                      <strong>{request.display_name}</strong>
                      <small>{formatDate(request.submitted_at)}</small>
                    </span>
                    <span className={`${styles.status} ${styles[`status_${request.status}`] || ''}`}>
                      {STATUS_COPY[request.status] || request.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {selected ? (
            <section className={styles.detail} aria-label={`Confronto volto di ${selected.display_name}`}>
              <div className={styles.detailHeader}>
                <span><strong>{selected.display_name}</strong><small>Confronto limitato allo stesso account</small></span>
                <span className={styles.privatePill}><LockKeyhole size={13} /> Immagini private</span>
              </div>

              <div className={styles.comparisonGuide}>
                <ShieldCheck size={18} />
                <span><strong>Controlla identità e somiglianza</strong><small>Volto, proporzioni e tratti devono essere coerenti. Non sospendere l’account se hai dubbi: rifiuta solo la foto.</small></span>
              </div>

              <div className={styles.photoGrid}>
                <figure>
                  {selected.identity_reference_url
                    ? <img src={selected.identity_reference_url} alt={`Foto identità privata di ${selected.display_name}`} />
                    : <span className={styles.photoFallback}><UserRound size={50} /></span>}
                  <figcaption>Riferimento identità approvato</figcaption>
                </figure>
                <figure>
                  {selected.candidate_url
                    ? <img src={selected.candidate_url} alt={`Nuova foto candidata di ${selected.display_name}`} />
                    : <span className={styles.photoFallback}><Images size={50} /></span>}
                  <figcaption>Nuovo avatar candidato</figcaption>
                </figure>
              </div>

              {selected.status === 'pending' ? (
                rejectOpen ? (
                  <div className={styles.rejectBox}>
                    <label htmlFor="photo-review-reason">Motivazione del rifiuto</label>
                    <textarea id="photo-review-reason" rows={3} maxLength={500} value={reason} placeholder="Esempio: volto non riconoscibile o persona diversa" onChange={(event) => setReason(event.target.value)} />
                    <div>
                      <button type="button" onClick={() => { setRejectOpen(false); setReason(''); }}><X size={16} /> Annulla</button>
                      <button type="button" className={styles.rejectConfirm} disabled={reviewing} onClick={() => review('rejected')}>Conferma rifiuto</button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <button type="button" className={styles.rejectButton} disabled={reviewing} onClick={() => setRejectOpen(true)}><X size={18} /> Non corrisponde</button>
                    <button type="button" className={styles.approveButton} disabled={reviewing} onClick={() => review('approved')}><Check size={19} /> Conferma corrispondenza</button>
                  </div>
                )
              ) : (
                <div className={styles.reviewedState}>
                  <span><ShieldCheck size={20} /> Stato: <strong>{STATUS_COPY[selected.status] || selected.status}</strong></span>
                  {selected.rejection_reason ? <p>{selected.rejection_reason}</p> : null}
                </div>
              )}

              <p className={styles.privacy}><LockKeyhole size={14} /> La foto candidata viene rimossa dallo storage privato dopo l’esito. Non viene usata per cercare altri utenti.</p>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default AdminProfilePhotoReviews;

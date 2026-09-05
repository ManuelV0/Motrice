import {
  BadgeCheck,
  Check,
  Clock3,
  LockKeyhole,
  LockOpen,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import AdminProfilePhotoReviews from '../components/AdminProfilePhotoReviews';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  listProfileVerificationRequests,
  reviewProfileVerification
} from '../services/profileVerification';
import styles from '../styles/pages/adminProfileVerifications.module.css';

const STATUS_COPY = {
  pending: 'In attesa',
  verified: 'Verificato',
  rejected: 'Rifiutato',
  expired: 'Scaduto',
  suspended: 'Sospeso',
  unverified: 'Non verificato'
};

const CHALLENGE_COPY = {
  open_hand: 'Mano aperta vicino al viso',
  thumb_up: 'Pollice in su vicino alla spalla',
  two_fingers: 'Due dita con viso visibile'
};

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
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

function AdminProfileVerificationsPage() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reviewArea, setReviewArea] = useState('identity');

  usePageMeta({
    title: 'Centro verifiche | Motrice',
    description: 'Area amministrativa riservata per la revisione dei profili Motrice.'
  });

  const loadRequests = useCallback(async (nextFilter = filter) => {
    setLoading(true);
    try {
      const items = await listProfileVerificationRequests(nextFilter);
      setRequests(items);
      setSelectedId((current) => {
        if (items.some((item) => item.user_id === current)) return current;
        return items[0]?.user_id || '';
      });
    } catch (error) {
      setRequests([]);
      setSelectedId('');
      showToast(error.message || 'Impossibile caricare le richieste', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  useEffect(() => {
    setRejectOpen(false);
    setUnlockOpen(false);
    setReason('');
    loadRequests(filter);
  }, [filter, loadRequests]);

  const selected = useMemo(
    () => requests.find((item) => item.user_id === selectedId) || requests[0] || null,
    [requests, selectedId]
  );

  async function review(decision) {
    if (!selected || reviewing) return;
    const isUnlockingSuspendedProfile = decision === 'verified' && selected.status === 'suspended';
    if (decision === 'rejected' && reason.trim().length < 5) {
      showToast('Inserisci una motivazione chiara', 'info');
      return;
    }

    setReviewing(true);
    try {
      await reviewProfileVerification(selected.user_id, decision, reason);
      const message = {
        verified: isUnlockingSuspendedProfile
          ? 'Profilo sbloccato: funzioni evento ripristinate'
          : 'Profilo verificato: funzioni evento abilitate',
        rejected: 'Richiesta rifiutata e motivazione salvata',
        suspended: 'Profilo sospeso'
      }[decision];
      showToast(message || 'Verifica aggiornata', 'success');
      setRejectOpen(false);
      setUnlockOpen(false);
      setReason('');
      await loadRequests(filter);
    } catch (error) {
      showToast(error.message || 'Revisione non riuscita', 'error');
    } finally {
      setReviewing(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingCopy}>
          <p><ShieldCheck size={15} /> Identità beta</p>
          <h1>Centro verifiche</h1>
          <span>Accesso riservato all’amministratore Motrice.</span>
        </div>
        <button type="button" className={styles.refresh} onClick={() => loadRequests(filter)} disabled={loading} aria-label="Aggiorna richieste">
          <RefreshCw size={18} />
        </button>
      </header>

      <div className={styles.reviewKinds} role="tablist" aria-label="Tipo di verifica">
        <button type="button" role="tab" aria-selected={reviewArea === 'identity'} onClick={() => setReviewArea('identity')}>
          <ShieldCheck size={17} /> Identità
        </button>
        <button type="button" role="tab" aria-selected={reviewArea === 'photo'} onClick={() => setReviewArea('photo')}>
          <UserRound size={17} /> Foto profilo
        </button>
      </div>

      {reviewArea === 'photo' ? <AdminProfilePhotoReviews /> : (
        <>
      <div className={styles.tabs} role="tablist" aria-label="Stato richieste">
        <button type="button" role="tab" aria-selected={filter === 'pending'} onClick={() => setFilter('pending')}>
          <Clock3 size={16} /> In attesa
        </button>
        <button type="button" role="tab" aria-selected={filter === 'reviewed'} onClick={() => setFilter('reviewed')}>
          <BadgeCheck size={16} /> Revisionate
        </button>
      </div>

      {loading ? <LoadingSkeleton rows={5} variant="detail" /> : requests.length === 0 ? (
        <EmptyState
          icon={filter === 'pending' ? Clock3 : BadgeCheck}
          title={filter === 'pending' ? 'Nessuna richiesta in attesa' : 'Nessuna richiesta revisionata'}
          description="Le richieste appariranno qui quando gli utenti completeranno il flusso di verifica."
        />
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.queue} aria-label="Elenco richieste">
            <div className={styles.queueHeader}>
              <strong>{filter === 'pending' ? 'Da controllare' : 'Archivio verifiche'}</strong>
              <span>{requests.length}</span>
            </div>
            <div className={styles.requestList}>
              {requests.map((request) => {
                const active = request.user_id === selected?.user_id;
                return (
                  <button
                    type="button"
                    key={request.request_id}
                    className={`${styles.request} ${active ? styles.requestActive : ''}`}
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(request.user_id);
                      setRejectOpen(false);
                      setUnlockOpen(false);
                      setReason('');
                    }}
                  >
                    <span className={styles.avatarMini}>
                      {request.profile_photo_url ? <img src={request.profile_photo_url} alt="" /> : initials(request.display_name)}
                    </span>
                    <span className={styles.requestCopy}>
                      <strong>{request.display_name}</strong>
                      <small>{request.city} · {request.primary_sport}</small>
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
            <section className={styles.detail} aria-label={`Revisione di ${selected.display_name}`}>
              <div className={styles.detailHeader}>
                <span>
                  <strong>{selected.display_name}</strong>
                  <small>{selected.city} · {selected.primary_sport}</small>
                </span>
                <span className={styles.privatePill}><LockKeyhole size={13} /> Foto di verifica private</span>
              </div>

              <div className={styles.photoGrid}>
                <figure>
                  {selected.profile_photo_url ? (
                    <img src={selected.profile_photo_url} alt={`Foto profilo di ${selected.display_name}`} />
                  ) : <span className={styles.photoFallback}><UserRound size={50} /></span>}
                  <figcaption>Foto identità privata</figcaption>
                </figure>
                <figure>
                  {selected.challenge_photo_url ? (
                    <img src={selected.challenge_photo_url} alt={`Challenge privata di ${selected.display_name}`} />
                  ) : <span className={styles.photoFallback}><ShieldAlert size={50} /></span>}
                  <figcaption>{CHALLENGE_COPY[selected.challenge_type] || 'Challenge acquisita'}</figcaption>
                </figure>
              </div>

              <div className={styles.dataGrid}>
                <article><small>Data di nascita</small><strong>{formatDate(selected.birth_date)}</strong></article>
                <article><small>Richiesta inviata</small><strong>{formatDate(selected.submitted_at, true)}</strong></article>
                <article><small>Sport</small><strong>{selected.primary_sport}</strong></article>
                <article><small>Livello</small><strong>{selected.sport_level}</strong></article>
              </div>

              {selected.bio ? <p className={styles.bio}><strong>Bio sportiva</strong>{selected.bio}</p> : null}

              {selected.status === 'pending' ? (
                <>
                  {rejectOpen ? (
                    <div className={styles.rejectBox}>
                      <label htmlFor="verification-reason">Motivazione del rifiuto</label>
                      <textarea id="verification-reason" rows={3} maxLength={500} value={reason} placeholder="Esempio: foto poco nitida, ripeti la challenge" onChange={(event) => setReason(event.target.value)} />
                      <div>
                        <button type="button" onClick={() => { setRejectOpen(false); setReason(''); }}><X size={16} /> Annulla</button>
                        <button type="button" className={styles.rejectConfirm} disabled={reviewing} onClick={() => review('rejected')}>Conferma rifiuto</button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.actions}>
                      <button type="button" className={styles.rejectButton} disabled={reviewing} onClick={() => setRejectOpen(true)}><X size={18} /> Rifiuta</button>
                      <button type="button" className={styles.approveButton} disabled={reviewing} onClick={() => review('verified')}><Check size={19} /> Approva profilo</button>
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.reviewedState}>
                  <span><BadgeCheck size={20} /> Stato: <strong>{STATUS_COPY[selected.status] || selected.status}</strong></span>
                  {selected.rejection_reason ? <p>{selected.rejection_reason}</p> : null}
                  {selected.status === 'verified' ? (
                    <button type="button" disabled={reviewing} onClick={() => review('suspended')}><ShieldAlert size={17} /> Sospendi profilo</button>
                  ) : null}
                  {selected.status === 'suspended' ? (
                    unlockOpen ? (
                      <div className={styles.unlockBox} role="alertdialog" aria-labelledby="unlock-profile-title">
                        <span>
                          <LockOpen size={18} />
                          <strong id="unlock-profile-title">Sbloccare {selected.display_name}?</strong>
                        </span>
                        <p>Il profilo tornerà verificato e potrà nuovamente creare e partecipare agli eventi.</p>
                        <div>
                          <button type="button" disabled={reviewing} onClick={() => setUnlockOpen(false)}>
                            <X size={16} /> Annulla
                          </button>
                          <button type="button" className={styles.unlockConfirm} disabled={reviewing} onClick={() => review('verified')}>
                            <ShieldCheck size={17} /> {reviewing ? 'Sblocco…' : 'Conferma sblocco'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className={styles.unlockButton} disabled={reviewing} onClick={() => setUnlockOpen(true)}>
                        <LockOpen size={17} /> Sblocca profilo
                      </button>
                    )
                  ) : null}
                </div>
              )}

              <p className={styles.privacy}><LockKeyhole size={14} /> La challenge non viene mostrata pubblicamente e il link scade dopo cinque minuti.</p>
            </section>
          ) : null}
        </div>
      )}
        </>
      )}
    </main>
  );
}

export default AdminProfileVerificationsPage;

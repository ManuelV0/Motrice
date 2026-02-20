import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, FileBadge2, MessageCircle, Paperclip, Send, Star, Target, UploadCloud, UserRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { coachApi } from '../services/coachApi';
import { api } from '../../../services/api';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useToast } from '../../../context/ToastContext';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import LoadingSkeleton from '../../../components/LoadingSkeleton';
import avatarPlaceholder from '../../../assets/avatar-placeholder.svg';
import { buildChatWelcome } from '../../../utils/chatWelcome';
import styles from '../../../styles/pages/coachMarketplace.module.css';

function BecomeCoachApplyPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [sports, setSports] = useState([]);
  const [loadingSports, setLoadingSports] = useState(true);
  const [application, setApplication] = useState(null);
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({
    contactEmail: '',
    hourlyRate: '',
    bio: '',
    primarySportId: ''
  });
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [personalExpanded, setPersonalExpanded] = useState(false);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [personalError, setPersonalError] = useState('');
  const [personalRequests, setPersonalRequests] = useState([]);
  const [coachPlans, setCoachPlans] = useState([]);
  const [personalChatBookings, setPersonalChatBookings] = useState([]);
  const [chatMessagesByBookingId, setChatMessagesByBookingId] = useState({});
  const [chatLoadingByBookingId, setChatLoadingByBookingId] = useState({});
  const [chatCanSendByBookingId, setChatCanSendByBookingId] = useState({});
  const [chatDraftByBookingId, setChatDraftByBookingId] = useState({});
  const [chatSendingBookingId, setChatSendingBookingId] = useState(null);
  const [chatEndingBookingId, setChatEndingBookingId] = useState(null);
  const [activeChatBooking, setActiveChatBooking] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [sendingRequestId, setSendingRequestId] = useState(null);
  const [localProfile, setLocalProfile] = useState({ display_name: '', bio: '', avatar_url: '' });
  const applyCardRef = useRef(null);

  usePageMeta({
    title: 'Diventa Coach | Motrice',
    description: 'Invia la candidatura coach con certificazione, tipologia, contatto pubblico e tariffa oraria.'
  });

  useEffect(() => {
    let active = true;

    Promise.allSettled([coachApi.listSports(), api.listSports()])
      .then((results) => {
        if (!active) return;
        const coachSports = results[0].status === 'fulfilled' ? results[0].value || [] : [];
        const siteSports = results[1].status === 'fulfilled' ? results[1].value || [] : [];
        const merged = [...coachSports, ...siteSports];
        const uniqueById = new Map();
        merged.forEach((sport) => {
          const numericId = Number(sport?.id ?? sport?.sport_id);
          if (!Number.isFinite(numericId) || numericId <= 0) return;
          const key = String(numericId);
          if (uniqueById.has(key)) return;
          uniqueById.set(key, {
            id: numericId,
            name: sport.name || sport.sport_name || String(sport.slug || 'Sport')
          });
        });
        setSports(Array.from(uniqueById.values()));
      })
      .finally(() => {
        if (active) setLoadingSports(false);
      });

    api.getLocalProfile().then((profile) => {
      if (!active) return;
      const nextBio = profile?.bio || '';
      const nextAvatar = profile?.avatar_url || '';
      const nextDisplayName = profile?.display_name || profile?.name || '';
      setLocalProfile({ display_name: nextDisplayName, bio: nextBio, avatar_url: nextAvatar });
      if (nextBio) {
        setForm((prev) => (prev.bio ? prev : { ...prev, bio: nextBio }));
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    coachApi
      .getMyCoachApplication()
      .then((payload) => {
        if (!active) return;
        if (payload?.has_application) {
          setApplication(payload);
        } else {
          setApplication(null);
        }
      })
      .catch(() => {
        if (!active) return;
        setApplication(null);
      })
      .finally(() => {
        if (active) setLoadingApplication(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function loadPersonalWork() {
    setPersonalLoading(true);
    setPersonalError('');

    try {
      const [requestData, plansData, chatData] = await Promise.all([
        coachApi.listCoachRequests(),
        coachApi.listCoachPlans(),
        api.listCoachChatBookings()
      ]);
      setPersonalRequests(requestData.items || []);
      setCoachPlans(plansData || []);
      setPersonalChatBookings(chatData || []);
    } catch (error) {
      setPersonalRequests([]);
      setCoachPlans([]);
      setPersonalChatBookings([]);
      setPersonalError(error.message || 'Area personale non disponibile al momento.');
    } finally {
      setPersonalLoading(false);
    }
  }

  useEffect(() => {
    if (!personalExpanded) return;
    loadPersonalWork();
  }, [personalExpanded]);

  const pendingRequests = useMemo(
    () => personalRequests.filter((request) => request.status === 'pending'),
    [personalRequests]
  );
  const completedRequests = useMemo(
    () => personalRequests.filter((request) => request.status === 'completed'),
    [personalRequests]
  );
  const currentApplicationStatus = result?.status || application?.status || null;
  const isApproved = currentApplicationStatus === 'approved';
  const canAccessPersonalArea = isApproved;

  const applyCtaTitle =
    currentApplicationStatus === 'rejected'
      ? 'Candidatura rifiutata: aggiorna e riprova'
      : currentApplicationStatus === 'pending'
        ? 'Candidatura in revisione'
        : 'Scopri di piu e candidati';
  const applyCtaSubtitle =
    isApproved
      ? 'Candidatura approvata: area candidatura bloccata'
      : loadingApplication
        ? 'Verifica stato candidatura in corso...'
        : currentApplicationStatus === 'rejected'
          ? 'Puoi correggere i dati e inviare una nuova candidatura'
          : currentApplicationStatus === 'pending'
            ? 'La revisione e in corso, puoi comunque aggiornare la candidatura'
            : 'Apri il form candidatura coach';
  const statusDescription =
    currentApplicationStatus === 'approved'
      ? 'Sei stato approvato. Ora puoi usare Area personale coach.'
      : currentApplicationStatus === 'rejected'
        ? 'La candidatura e stata rifiutata. Aggiorna il profilo e invia nuovamente.'
        : 'Ti aggiorneremo appena la revisione sara completata.';
  const statusCardClassName =
    currentApplicationStatus === 'approved'
      ? `${styles.statusCard} ${styles.statusApproved}`
      : currentApplicationStatus === 'rejected'
        ? `${styles.statusCard} ${styles.statusRejected}`
        : styles.statusCard;
  const formErrors = {
    contactEmail: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.contactEmail || '').trim()),
    primarySportId: !form.primarySportId,
    hourlyRate: Number(form.hourlyRate || 0) <= 0
  };

  useEffect(() => {
    if (isApproved && expanded) {
      setExpanded(false);
    }
  }, [isApproved, expanded]);

  useEffect(() => {
    if (!canAccessPersonalArea && personalExpanded) {
      setPersonalExpanded(false);
    }
  }, [canAccessPersonalArea, personalExpanded]);

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitAttempted(true);

    if (!file) {
      showToast('Carica un documento di certificazione', 'error');
      return;
    }

    if (formErrors.contactEmail || formErrors.primarySportId || formErrors.hourlyRate) {
      showToast('Verifica email, sport principale e tariffa oraria', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await coachApi.applyCoach({
        contactEmail: form.contactEmail,
        hourlyRate: Number(form.hourlyRate),
        bio: form.bio,
        primarySportId: Number(form.primarySportId),
        certificationFile: file
      });

      setResult(response);
      setApplication({ has_application: true, ...response });
      setExpanded(false);
      setSubmitAttempted(false);
      showToast('Candidatura inviata. Stato: pending', 'success');
    } catch (error) {
      showToast(error.message || 'Errore durante invio candidatura', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function deliverPlan(request) {
    const draft = drafts[request.id] || { title: '', content: '', coachNote: '', attachments: [] };
    if (draft.title.trim().length < 4 || draft.content.trim().length < 12) {
      showToast('Titolo minimo 4 caratteri e contenuto minimo 12', 'error');
      return;
    }

    setSendingRequestId(request.id);
    try {
      await coachApi.createPlanWithAttachments(request.id, {
        title: draft.title,
        content: draft.content,
        coachNote: draft.coachNote,
        attachments: draft.attachments
      });
      showToast('Scheda inviata al cliente', 'success');
      setDrafts((prev) => ({ ...prev, [request.id]: { title: '', content: '', coachNote: '', attachments: [] } }));
      await loadPersonalWork();
    } catch (error) {
      showToast(error.message || 'Errore invio scheda', 'error');
    } finally {
      setSendingRequestId(null);
    }
  }

  function chatStatusClass(status) {
    if (status === 'live') return styles.chatStatusLive;
    if (status === 'completed') return styles.chatStatusCompleted;
    if (status === 'rated') return styles.chatStatusRated;
    if (status === 'cancelled') return styles.chatStatusCancelled;
    return styles.chatStatusBooked;
  }

  function chatStatusLabel(status) {
    if (status === 'live') return 'In corso';
    if (status === 'completed') return 'Conclusa';
    if (status === 'rated') return 'Valutata';
    if (status === 'cancelled') return 'Annullata';
    return 'Prenotata';
  }

  async function loadBookingChat(bookingId) {
    const key = String(bookingId);
    setChatLoadingByBookingId((prev) => ({ ...prev, [key]: true }));
    try {
      const payload = await api.listBookingChatMessages(key);
      setChatMessagesByBookingId((prev) => ({ ...prev, [key]: payload.items || [] }));
      setChatCanSendByBookingId((prev) => ({ ...prev, [key]: Boolean(payload.can_send) }));
    } catch (error) {
      showToast(error.message || 'Impossibile caricare chat', 'error');
    } finally {
      setChatLoadingByBookingId((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function openBookingChat(booking) {
    const key = String(booking.id);
    setActiveChatBooking(booking);
    await loadBookingChat(key);
  }

  function closeBookingChat() {
    setActiveChatBooking(null);
  }

  async function terminateCoachChat() {
    if (!activeChatBooking?.id) return;
    const confirmed = window.confirm('Sei sicuro di voler terminare la chat?');
    if (!confirmed) return;

    const key = String(activeChatBooking.id);
    setChatEndingBookingId(key);
    try {
      await api.endCoachChatSession(key);
      showToast('Chat terminata', 'success');
      await loadPersonalWork();
      closeBookingChat();
    } catch (error) {
      showToast(error.message || 'Impossibile terminare chat', 'error');
    } finally {
      setChatEndingBookingId(null);
    }
  }

  async function sendBookingChat(booking) {
    const key = String(booking.id);
    const text = String(chatDraftByBookingId[key] || '').trim();
    if (!text) {
      showToast('Scrivi un messaggio prima di inviare', 'error');
      return;
    }

    setChatSendingBookingId(key);
    try {
      await api.sendBookingChatMessage({
        bookingId: key,
        text
      });
      setChatDraftByBookingId((prev) => ({ ...prev, [key]: '' }));
      await loadBookingChat(key);
    } catch (error) {
      showToast(error.message || 'Invio messaggio non riuscito', 'error');
    } finally {
      setChatSendingBookingId(null);
    }
  }

  function openApplyFlow() {
    if (isApproved || loadingApplication) return;
    setExpanded(true);
    window.setTimeout(() => {
      applyCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function openCoachArea() {
    if (!isApproved) {
      window.alert("Prima registrati e attendi l'approvazione admin.");
      return;
    }
    navigate('/dashboard/coach');
  }

  return (
    <section className={styles.page}>
      <Card className={styles.missionCard}>
        <p className={styles.kicker}>Mission Motrice</p>
        <h1>Alleniamo persone reali, in contesti reali, con coach affidabili.</h1>
        <p className="muted">
          Motrice connette community sportive locali con professionisti verificati. Obiettivo: allenamento accessibile,
          progressivo e coerente con salute, performance e continuita.
        </p>

        <div className={styles.goalGrid}>
          <div className={styles.goalItem}>
            <Target size={16} aria-hidden="true" /> Qualita didattica verificata
          </div>
          <div className={styles.goalItem}>
            <Target size={16} aria-hidden="true" /> Piani individuali con accesso privato
          </div>
          <div className={styles.goalItem}>
            <Target size={16} aria-hidden="true" /> Collaborazioni trasparenti e sostenibili
          </div>
        </div>
      </Card>

      <Card className={styles.accessSplitCard}>
        <div className={styles.accessSplitHead}>
          <h2>Vuoi diventare coach?</h2>
          <p className="muted">Compila i dati professionali e invia la candidatura.</p>
        </div>
        <div className={styles.accessSplitGrid}>
          <article className={styles.accessItem}>
            <h3>Nuova candidatura coach</h3>
            <p className="muted">Compila i dati professionali e invia il form di candidatura.</p>
            <Button type="button" variant="secondary" onClick={openApplyFlow} disabled={isApproved || loadingApplication}>
              Apri candidatura
            </Button>
          </article>
        </div>
      </Card>

      <Card className={styles.coachAreaCard}>
        <h2>Sei gia coach?</h2>
        <p className="muted">Entra direttamente nella tua area personale coach.</p>
        <Button type="button" onClick={openCoachArea}>
          Accedi area coach
        </Button>
      </Card>

      <Card className={styles.profilePreviewCard}>
        <div className={styles.coachTitleBlock}>
          <img
            src={localProfile.avatar_url || avatarPlaceholder}
            alt="Avatar profilo coach"
            className={styles.coachAvatar}
          />
          <div>
            <h2>Anteprima profilo coach</h2>
            <p className="muted">Bio e immagine arrivano dalla sezione Account e puoi aggiornarle in qualsiasi momento.</p>
          </div>
        </div>
        <p className="muted">{form.bio || 'Aggiungi una bio nel tuo Account per completare il profilo coach.'}</p>
      </Card>

      <Card className={styles.discoverCard} ref={applyCardRef}>
        <div className={`${styles.discoverHeaderWrap} ${isApproved ? styles.lockedCard : ''}`}>
          <button
            type="button"
            className={styles.discoverToggle}
            onClick={() => {
              if (isApproved || loadingApplication) return;
              setExpanded((prev) => !prev);
            }}
            aria-expanded={expanded}
            aria-controls="coach-apply-form"
            aria-disabled={isApproved || loadingApplication}
          >
            <span>
              <strong>{applyCtaTitle}</strong>
              <small className="muted">{applyCtaSubtitle}</small>
            </span>
            <ChevronDown size={18} className={expanded ? styles.chevronOpen : ''} aria-hidden="true" />
          </button>

          {isApproved ? (
            <div className={styles.lockOverlay} role="status" aria-live="polite">
              <span className={styles.lockBadge}>Sei gia coach</span>
            </div>
          ) : null}
        </div>

        <div
          id="coach-apply-form"
          aria-hidden={!expanded || isApproved}
          className={`${styles.revealForm} ${expanded && !isApproved ? styles.revealFormOpen : ''}`}
        >
          <fieldset disabled={!expanded || isApproved} className={styles.formFieldset}>
            {loadingSports ? (
              <LoadingSkeleton rows={2} />
            ) : (
              <form className={styles.requestForm} onSubmit={onSubmit}>
                <div className={styles.formSection}>
                  <h3>Dati professionali</h3>
                  <p className={styles.fieldHelp}>Questi dati sono visibili ai clienti quando cercano un coach.</p>

                  <label className={styles.field}>
                    Contact email pubblico
                    <input
                      type="email"
                      value={form.contactEmail}
                      onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                      placeholder="coach@tuodominio.it"
                      aria-invalid={submitAttempted && formErrors.contactEmail}
                      className={submitAttempted && formErrors.contactEmail ? styles.fieldInvalid : ''}
                      aria-describedby="coach-contact-help"
                    />
                    <small id="coach-contact-help" className={styles.fieldHelp}>
                      Usa un contatto dedicato al coaching.
                    </small>
                  </label>

                  <label className={styles.field}>
                    Tipologia coach (sport principale)
                    <select
                      value={form.primarySportId}
                      onChange={(event) => setForm((prev) => ({ ...prev, primarySportId: event.target.value }))}
                      aria-invalid={submitAttempted && formErrors.primarySportId}
                      className={submitAttempted && formErrors.primarySportId ? styles.fieldInvalid : ''}
                    >
                      <option value="">Seleziona sport</option>
                      {sports.map((sport) => (
                        <option key={sport.id} value={sport.id}>
                          {sport.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    Tariffa oraria (EUR)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.hourlyRate}
                      onChange={(event) => setForm((prev) => ({ ...prev, hourlyRate: event.target.value }))}
                      placeholder="45"
                      aria-invalid={submitAttempted && formErrors.hourlyRate}
                      className={submitAttempted && formErrors.hourlyRate ? styles.fieldInvalid : ''}
                    />
                    <small className={styles.fieldHelp}>Inserisci solo numeri interi (es. 45).</small>
                  </label>
                </div>

                <div className={styles.formSection}>
                  <h3>Presentazione</h3>
                  <label className={styles.field}>
                    Bio professionale
                    <textarea
                      rows="4"
                      value={form.bio}
                      onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))}
                      placeholder="Esperienza, specializzazione, metodologia."
                    />
                    <small className={styles.fieldHelp}>Massimo consigliato: 400 caratteri per una lettura rapida.</small>
                  </label>
                </div>

                <label className={styles.uploadField}>
                  <span className={styles.uploadHead}>
                    <UploadCloud size={18} aria-hidden="true" /> Certificazione (PDF/JPG/PNG)
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                  <small className={styles.fieldHelp}>Dimensione massima consigliata: 5MB</small>
                </label>

                <Button type="submit" icon={FileBadge2} disabled={submitting}>
                  {submitting ? 'Invio candidatura...' : 'Invia candidatura coach'}
                </Button>
              </form>
            )}
          </fieldset>
        </div>
      </Card>

      {currentApplicationStatus ? (
        <Card className={statusCardClassName}>
          <h2>Stato candidatura</h2>
          <p>
            <strong>{String(currentApplicationStatus).toUpperCase()}</strong>
          </p>
          <p className="muted">{statusDescription}</p>
        </Card>
      ) : null}

      <Card className={styles.discoverCard}>
        <button
          type="button"
          className={styles.discoverToggle}
          onClick={() => {
            if (!canAccessPersonalArea) {
              showToast('Prima devi diventare coach', 'error');
              return;
            }
            setPersonalExpanded((prev) => !prev);
          }}
          aria-expanded={personalExpanded}
          aria-controls="coach-personal-agenda"
          aria-disabled={!canAccessPersonalArea}
        >
          <span>
            <strong>Area personale coach</strong>
            <small className="muted">
              {canAccessPersonalArea
                ? 'Espandi per vedere agenda richieste e lavoro per il coach'
                : 'Accesso disponibile solo per coach approvati'}
            </small>
          </span>
          <ChevronDown size={18} className={personalExpanded ? styles.chevronOpen : ''} aria-hidden="true" />
        </button>
        {!canAccessPersonalArea ? <p className={styles.lockHintDanger}>Prima devi diventare coach</p> : null}

        <div
          id="coach-personal-agenda"
          aria-hidden={!personalExpanded || !canAccessPersonalArea}
          className={`${styles.revealForm} ${personalExpanded && canAccessPersonalArea ? styles.revealFormOpen : ''}`}
        >
          <fieldset disabled={!personalExpanded || !canAccessPersonalArea} className={styles.formFieldset}>
            {personalLoading ? (
              <LoadingSkeleton rows={3} />
            ) : personalError ? (
              <p className="muted">{personalError}</p>
            ) : (
              <div className={styles.stack}>
                <Card className={styles.requestAgendaBox}>
                  <h3 className={styles.inlineMeta}>
                    <MessageCircle size={16} aria-hidden="true" /> Prenotazioni chat ricevute
                  </h3>
                  <p className="muted">Sessioni clienti ordinate per inizio, con stato operativo e rating finale.</p>
                  {personalChatBookings.length ? (
                    <ul className={styles.list}>
                      {personalChatBookings.map((booking) => (
                        <li key={booking.id} className={styles.chatBookingItem}>
                          <div className={styles.chatBookingMain}>
                            <p className={styles.inlineMeta}>
                              <UserRound size={15} aria-hidden="true" />
                              Cliente #{booking.client_user_id} · Scheda #{booking.plan_id}
                            </p>
                            <p className="muted">
                              {new Date(booking.starts_at).toLocaleString('it-IT', {
                                weekday: 'short',
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}{' '}
                              · {booking.slot_label}
                            </p>
                          </div>
                          <div className={styles.chatBookingMeta}>
                            <span className={`${styles.badgeSoft} ${chatStatusClass(booking.status)}`}>
                              {chatStatusLabel(booking.status)}
                            </span>
                            {Number(booking.rating_stars) > 0 ? (
                              <span className={styles.inlineMeta}>
                                <Star size={14} aria-hidden="true" /> {booking.rating_stars}/5
                              </span>
                            ) : null}
                            <Button type="button" size="sm" variant="ghost" onClick={() => openBookingChat(booking)}>
                              Apri chat
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">Nessuna prenotazione chat ricevuta al momento.</p>
                  )}
                </Card>

                <div className={styles.requestColumns}>
                  <Card className={styles.requestAgendaBox}>
                    <h3 className={styles.inlineMeta}>
                      <CalendarDays size={16} aria-hidden="true" /> Pending ({pendingRequests.length})
                    </h3>
                    <ul className={styles.listCompact}>
                      {pendingRequests.length ? (
                        pendingRequests.map((request) => (
                          <li key={request.id}>
                            {request.client_name} - {request.goal}
                          </li>
                        ))
                      ) : (
                        <li>Nessuna richiesta pending</li>
                      )}
                    </ul>
                  </Card>

                  <Card className={styles.requestAgendaBox}>
                    <h3 className={styles.inlineMeta}>
                      <CalendarDays size={16} aria-hidden="true" /> Completate ({completedRequests.length})
                    </h3>
                    <ul className={styles.listCompact}>
                      {completedRequests.length ? (
                        completedRequests.map((request) => (
                          <li key={request.id}>
                            {request.client_name} - {request.plan_title || 'Scheda consegnata'}
                          </li>
                        ))
                      ) : (
                        <li>Nessuna richiesta completata</li>
                      )}
                    </ul>
                  </Card>
                </div>

                <Card className={styles.requestAgendaBox}>
                  <h3>Lavoro per il coach</h3>
                  <p className="muted">Lista schede clienti con risposta nota + allegati (visibili/scaricabili in Le mie schede).</p>
                </Card>

                {pendingRequests.map((request) => {
                  const draft = drafts[request.id] || { title: '', content: '', coachNote: '', attachments: [] };
                  return (
                    <Card key={request.id} className={styles.requestCard}>
                      <div className={styles.requestHead}>
                        <h3>{request.client_name}</h3>
                        <span className={styles.pending}>Pending</span>
                      </div>

                      <p className="muted">{request.client_email}</p>
                      <p><strong>Obiettivo:</strong> {request.goal}</p>

                      <form className={styles.requestForm} onSubmit={(event) => event.preventDefault()}>
                        <label className={styles.field}>
                          Titolo scheda
                          <input
                            value={draft.title}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [request.id]: { ...draft, title: event.target.value }
                              }))
                            }
                          />
                        </label>

                        <label className={styles.field}>
                          Piano
                          <textarea
                            rows="5"
                            value={draft.content}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [request.id]: { ...draft, content: event.target.value }
                              }))
                            }
                          />
                        </label>

                        <label className={styles.field}>
                          Nota al cliente
                          <textarea
                            rows="3"
                            value={draft.coachNote}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [request.id]: { ...draft, coachNote: event.target.value }
                              }))
                            }
                            placeholder="Messaggio accompagnatorio alla scheda"
                          />
                        </label>

                        <label className={styles.uploadField}>
                          <span className={styles.uploadHead}>
                            <Paperclip size={16} aria-hidden="true" /> Allegati scheda (max 5)
                          </span>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            onChange={(event) => {
                              const files = Array.from(event.target.files || []).slice(0, 5);
                              setDrafts((prev) => ({
                                ...prev,
                                [request.id]: { ...draft, attachments: files }
                              }));
                            }}
                          />
                          <small className="muted">{draft.attachments?.length || 0} allegati selezionati</small>
                        </label>

                        <Button type="button" icon={Send} disabled={sendingRequestId === request.id} onClick={() => deliverPlan(request)}>
                          {sendingRequestId === request.id ? 'Invio...' : 'Invia scheda cliente'}
                        </Button>
                      </form>
                    </Card>
                  );
                })}

                {coachPlans.length > 0 ? (
                  <Card className={styles.requestAgendaBox}>
                    <h3>Schede gia consegnate ({coachPlans.length})</h3>
                    <ul className={styles.listCompact}>
                      {coachPlans.slice(0, 8).map((plan) => (
                        <li key={plan.id}>
                          {plan.client_name} - {plan.title} ({(plan.attachments || []).length} allegati)
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}
              </div>
            )}
          </fieldset>
        </div>
      </Card>

      {activeChatBooking ? (
        <div className={styles.chatFullscreenOverlay} role="dialog" aria-modal="true" aria-label="Chat cliente">
          <div className={styles.chatFullscreenPanel}>
            <header className={styles.chatFullscreenHeader}>
              <div>
                <h3>Chat con cliente #{activeChatBooking.client_user_id}</h3>
                <p className="muted">
                  Scheda #{activeChatBooking.plan_id} · {activeChatBooking.slot_label}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                onClick={terminateCoachChat}
                disabled={chatEndingBookingId === String(activeChatBooking.id)}
              >
                {chatEndingBookingId === String(activeChatBooking.id) ? 'Terminazione...' : 'Termina'}
              </Button>
            </header>

            <div className={styles.chatFullscreenBody}>
              <article className={styles.chatWelcomeCard}>
                <p>{buildChatWelcome(localProfile)}</p>
              </article>
              {chatLoadingByBookingId[String(activeChatBooking.id)] ? (
                <p className="muted">Caricamento messaggi...</p>
              ) : (chatMessagesByBookingId[String(activeChatBooking.id)] || []).length === 0 ? (
                <p className="muted">Nessun messaggio. Puoi avviare la conversazione nella finestra live.</p>
              ) : (
                (chatMessagesByBookingId[String(activeChatBooking.id)] || []).map((msg) => {
                  const mine = Number(msg.sender_user_id) === Number(activeChatBooking.coach_user_id);
                  return (
                    <div key={msg.id} className={`${styles.chatBubble} ${mine ? styles.chatBubbleMine : styles.chatBubbleOther}`}>
                      <p>{msg.text}</p>
                      <small>{new Date(msg.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                  );
                })
              )}
            </div>

            <div className={styles.chatFullscreenComposer}>
              <input
                value={chatDraftByBookingId[String(activeChatBooking.id)] || ''}
                onChange={(event) =>
                  setChatDraftByBookingId((prev) => ({
                    ...prev,
                    [String(activeChatBooking.id)]: event.target.value.slice(0, 1000)
                  }))
                }
                placeholder={
                  chatCanSendByBookingId[String(activeChatBooking.id)]
                    ? 'Scrivi un messaggio al cliente...'
                    : 'Invio disponibile solo durante sessione live'
                }
                disabled={!chatCanSendByBookingId[String(activeChatBooking.id)]}
              />
              <Button
                type="button"
                size="sm"
                icon={Send}
                onClick={() => sendBookingChat(activeChatBooking)}
                disabled={
                  !chatCanSendByBookingId[String(activeChatBooking.id)] ||
                  chatSendingBookingId === String(activeChatBooking.id)
                }
              >
                {chatSendingBookingId === String(activeChatBooking.id) ? 'Invio...' : 'Invia'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default BecomeCoachApplyPage;

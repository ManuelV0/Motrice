import { useEffect, useState } from 'react';
import { ChevronDown, Clock3, Download, Eye, FolderKanban, Lock, MessageCircle, Send, Star, X } from 'lucide-react';
import { coachApi } from '../services/coachApi';
import { api } from '../../../services/api';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useToast } from '../../../context/ToastContext';
import { useBilling } from '../../../context/BillingContext';
import Card from '../../../components/Card';
import EmptyState from '../../../components/EmptyState';
import LoadingSkeleton from '../../../components/LoadingSkeleton';
import Button from '../../../components/Button';
import PaywallModal from '../../../components/PaywallModal';
import { openBlobOnDevice } from '../utils/openBlobOnDevice';
import { buildChatWelcome } from '../../../utils/chatWelcome';
import styles from '../../../styles/pages/coachMarketplace.module.css';

function MyPlansPage() {
  const { showToast } = useToast();
  const { entitlements } = useBilling();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [chatSlotsByPlanId, setChatSlotsByPlanId] = useState({});
  const [chatBookingsByPlanId, setChatBookingsByPlanId] = useState({});
  const [bookingByPlanId, setBookingByPlanId] = useState({});
  const [bookingPlanId, setBookingPlanId] = useState(null);
  const [ratingByPlanId, setRatingByPlanId] = useState({});
  const [ratingPlanId, setRatingPlanId] = useState(null);
  const [cancellingBookingId, setCancellingBookingId] = useState(null);
  const [chatLoadingByBookingId, setChatLoadingByBookingId] = useState({});
  const [chatMessagesByBookingId, setChatMessagesByBookingId] = useState({});
  const [chatCanSendByBookingId, setChatCanSendByBookingId] = useState({});
  const [chatDraftByBookingId, setChatDraftByBookingId] = useState({});
  const [chatSendingBookingId, setChatSendingBookingId] = useState(null);
  const [chatEndingBookingId, setChatEndingBookingId] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [openPlanById, setOpenPlanById] = useState({});
  const [localProfile, setLocalProfile] = useState({ display_name: '', bio: '' });

  usePageMeta({
    title: 'Le mie schede | Motrice',
    description: 'Visualizza tutte le schede individuali ricevute dai coach.'
  });

  function groupBookingsByPlan(bookings) {
    const grouped = {};
    (bookings || []).forEach((booking) => {
      const key = String(booking.plan_id);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(booking);
    });
    return grouped;
  }

  async function refreshChatBookings() {
    const bookings = await api.listMyChatBookings();
    setChatBookingsByPlanId(groupBookingsByPlan(bookings));
  }

  useEffect(() => {
    let active = true;
    api.getLocalProfile()
      .then((profile) => {
        if (!active) return;
        setLocalProfile({
          display_name: String(profile?.display_name || profile?.name || '').trim(),
          bio: String(profile?.bio || '').trim()
        });
      })
      .catch(() => {
        if (!active) return;
        setLocalProfile({ display_name: '', bio: '' });
      });

    coachApi
      .listMyPlans()
      .then(async (items) => {
        if (!active) return;
        setPlans(items);

        const coachDataPairs = await Promise.all(
          (items || []).map(async (plan) => {
            try {
              const coach = await coachApi.getCoach(plan.coach_id);
              const accountProfile = await api.getAccountProfileByUserId(coach.user_id);
              return [
                plan.id,
                {
                  coachUserId: coach.user_id,
                  coachName: coach.name,
                  slots: Array.isArray(accountProfile?.chat_slots) ? accountProfile.chat_slots : []
                }
              ];
            } catch {
              return [plan.id, { coachUserId: null, coachName: plan.coach_name, slots: [] }];
            }
          })
        );
        if (!active) return;
        setChatSlotsByPlanId(Object.fromEntries(coachDataPairs));

        const bookings = await api.listMyChatBookings();
        if (!active) return;
        setChatBookingsByPlanId(groupBookingsByPlan(bookings));
      })
      .catch((error) => {
        if (active) showToast(error.message || 'Impossibile caricare le schede', 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function openAttachment(planId, attachment) {
    try {
      const { blob } = await coachApi.fetchPlanAttachmentBlob(planId, attachment.id, 'inline');
      openBlobOnDevice(blob, {
        fallbackFileName: attachment.file_name || 'allegato-scheda'
      });
    } catch (error) {
      showToast(error.message || 'Impossibile aprire allegato', 'error');
    }
  }

  async function downloadAttachment(planId, attachmentId, fileName) {
    try {
      const { blob } = await coachApi.fetchPlanAttachmentBlob(planId, attachmentId, 'download');
      openBlobOnDevice(blob, {
        fallbackFileName: fileName || 'allegato-scheda',
        forceDownload: true
      });
    } catch (error) {
      showToast(error.message || 'Impossibile scaricare allegato', 'error');
    }
  }

  async function bookChat(plan) {
    const slot = bookingByPlanId[plan.id];
    const chatData = chatSlotsByPlanId[plan.id];

    if (!slot) {
      showToast('Seleziona una fascia oraria chat', 'error');
      return;
    }
    if (!chatData?.coachUserId) {
      showToast('Coach non disponibile per chat al momento', 'error');
      return;
    }

    setBookingPlanId(plan.id);
    try {
      await api.bookCoachChat({
        planId: plan.id,
        coachUserId: chatData.coachUserId,
        coachName: chatData.coachName,
        slotLabel: slot
      });
      showToast(`Chat prenotata (45 min) su fascia: ${slot}`, 'success');
      await refreshChatBookings();
    } catch (error) {
      showToast(error.message || 'Impossibile prenotare chat', 'error');
    } finally {
      setBookingPlanId(null);
    }
  }

  async function submitRating(planId, bookingId) {
    const safeBookingId = String(bookingId || '');
    const stars = Number(ratingByPlanId[planId] || 0);

    if (!safeBookingId) {
      showToast('Nessuna chat prenotata da valutare', 'error');
      return;
    }
    if (!(stars >= 1 && stars <= 5)) {
      showToast('Seleziona un voto da 1 a 5 stelle', 'error');
      return;
    }

    setRatingPlanId(planId);
    try {
      await api.submitCoachRating({
        bookingId: safeBookingId,
        stars
      });
      showToast('Valutazione inviata, grazie!', 'success');
      await refreshChatBookings();
    } catch (error) {
      showToast(error.message || 'Impossibile inviare valutazione', 'error');
    } finally {
      setRatingPlanId(null);
    }
  }

  async function cancelBooking(booking) {
    setCancellingBookingId(booking.id);
    try {
      await api.cancelCoachChat(booking.id);
      showToast('Prenotazione annullata', 'success');
      await refreshChatBookings();
    } catch (error) {
      showToast(error.message || 'Impossibile annullare prenotazione', 'error');
    } finally {
      setCancellingBookingId(null);
    }
  }

  async function loadChatMessages(bookingId) {
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

  async function openFullscreenChat(booking, plan) {
    const key = String(booking.id);
    setActiveChat({
      bookingId: key,
      booking,
      planTitle: plan.title,
      coachName: plan.coach_name,
      coachUserId: chatSlotsByPlanId[plan.id]?.coachUserId || null
    });
    await loadChatMessages(key);
  }

  function closeFullscreenChat() {
    setActiveChat(null);
  }

  async function terminateActiveChat() {
    if (!activeChat?.bookingId) return;
    const confirmed = window.confirm('Sei sicuro di voler terminare la chat?');
    if (!confirmed) return;

    setChatEndingBookingId(String(activeChat.bookingId));
    try {
      await api.endCoachChatSession(activeChat.bookingId);
      showToast('Chat terminata', 'success');
      await refreshChatBookings();
      closeFullscreenChat();
    } catch (error) {
      showToast(error.message || 'Impossibile terminare chat', 'error');
    } finally {
      setChatEndingBookingId(null);
    }
  }

  async function sendChatMessage(booking) {
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
      await loadChatMessages(key);
    } catch (error) {
      showToast(error.message || 'Invio messaggio non riuscito', 'error');
    } finally {
      setChatSendingBookingId(null);
    }
  }

  function togglePlanOpen(planId) {
    setOpenPlanById((prev) => ({ ...prev, [planId]: !prev[planId] }));
  }

  if (loading) return <LoadingSkeleton rows={3} />;

  return (
    <section className={styles.page}>
      <header className={styles.heroCompact}>
        <p className={styles.kicker}>Dashboard Client</p>
        <h1>Le mie schede individuali</h1>
      </header>

      {plans.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          imageSrc="/images/default-sport.svg"
          imageAlt="Schede coach"
          title="Nessuna scheda ricevuta"
          description="Quando un coach consegna il tuo piano, apparira qui in accesso privato."
        />
      ) : (
        <div className={styles.stack}>
          {plans.map((plan) => (
            <Card key={plan.id} className={styles.planCard}>
              {(() => {
                const isOpen = Boolean(openPlanById[plan.id]);
                const planBookings = chatBookingsByPlanId[String(plan.id)] || [];
                const now = Date.now();
                const upcomingBooking =
                  planBookings.find(
                    (booking) => booking.status !== 'cancelled' && Date.parse(booking.ends_at) > now
                  ) || null;
                const rateableBooking = planBookings.find((booking) => booking.can_rate) || null;
                const latestRatedBooking =
                  planBookings.find((booking) => Number(booking.rating_stars) >= 1 && Number(booking.rating_stars) <= 5) || null;
                const bookingForSummary = upcomingBooking || rateableBooking || latestRatedBooking || null;
                const sportLabel = plan.coach_primary_sport_name || plan.request_goal || 'Sport non specificato';
                const deliveredLabel = new Date(plan.delivered_at).toLocaleDateString('it-IT', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                });

                return (
                  <>
                    <button
                      type="button"
                      className={styles.planAccordionToggle}
                      onClick={() => togglePlanOpen(plan.id)}
                      aria-expanded={isOpen}
                      aria-controls={`plan-box-${plan.id}`}
                    >
                      <div className={styles.planAccordionHead}>
                        <h2>Da coach {plan.coach_name}</h2>
                        <span className={`${styles.badgeSoft} ${styles.planSportBadge}`}>{sportLabel}</span>
                      </div>
                      <div className={styles.planAccordionMeta}>
                        <span>{deliveredLabel}</span>
                        <span className={styles.planTitleMini}>{plan.title}</span>
                      </div>
                      <ChevronDown size={18} className={isOpen ? styles.chevronOpen : ''} aria-hidden="true" />
                    </button>

                    <div
                      id={`plan-box-${plan.id}`}
                      className={`${styles.revealForm} ${isOpen ? styles.revealFormOpen : ''}`}
                      aria-hidden={!isOpen}
                    >
                      <div className={styles.planAccordionBody}>
                        <p>
                          <strong>Coach:</strong> {plan.coach_name} · {plan.coach_contact_email}
                        </p>
                        <p className="muted">
                          <strong>Goal richiesta:</strong> {plan.request_goal}
                        </p>

                        {plan.coach_note ? (
                          <p className="muted">
                            <strong>Nota coach:</strong> {plan.coach_note}
                          </p>
                        ) : null}

                        <pre className={styles.planContent}>{plan.content}</pre>

                        <Card subtle className={`${styles.chatBox} ${!entitlements.canUseCoachChat ? styles.chatBoxLocked : ''}`}>
                          <h3 className={styles.inlineMeta}>
                            <MessageCircle size={16} aria-hidden="true" /> Chat con il coach
                          </h3>
                          <p className="muted">
                            Disponibile solo con piano Premium attivo. Sessione massima 45 minuti con booking reale in base alla fascia selezionata.
                          </p>

                      {bookingForSummary ? (
                        <p className="muted">
                          Stato: <strong>{bookingForSummary.status}</strong> · fascia{' '}
                          <strong>{bookingForSummary.slot_label}</strong>
                          {' · '}
                          {new Date(bookingForSummary.starts_at).toLocaleString('it-IT', {
                            weekday: 'short',
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      ) : null}

                      {entitlements.canUseCoachChat ? (
                        <>
                          <label className={styles.field}>
                            Fascia oraria coach
                            <select
                              value={bookingByPlanId[plan.id] || ''}
                              onChange={(event) =>
                                setBookingByPlanId((prev) => ({
                                  ...prev,
                                  [plan.id]: event.target.value
                                }))
                              }
                            >
                              <option value="">Seleziona fascia oraria</option>
                              {(chatSlotsByPlanId[plan.id]?.slots || []).map((slot) => (
                                <option key={slot} value={slot}>
                                  {slot}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="row">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              icon={Clock3}
                              onClick={() => bookChat(plan)}
                              disabled={
                                bookingPlanId === plan.id ||
                                !(chatSlotsByPlanId[plan.id]?.slots || []).length ||
                                Boolean(upcomingBooking)
                              }
                            >
                              {bookingPlanId === plan.id ? 'Prenotazione...' : 'Prenota chat 45 min'}
                            </Button>

                            {upcomingBooking?.can_cancel ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => cancelBooking(upcomingBooking)}
                                disabled={cancellingBookingId === upcomingBooking.id}
                              >
                                {cancellingBookingId === upcomingBooking.id ? 'Annullamento...' : 'Annulla prenotazione'}
                              </Button>
                            ) : null}

                            {bookingForSummary ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => openFullscreenChat(bookingForSummary, plan)}
                              >
                                Apri chat
                              </Button>
                            ) : null}
                          </div>

                          {rateableBooking ? (
                            <div className={styles.chatRatingBox}>
                              <p className="muted">Sessione conclusa. Valuta il coach per il ranking Top Coach.</p>
                              <div className={styles.starRow}>
                                {[1, 2, 3, 4, 5].map((value) => {
                                  const active = Number(ratingByPlanId[plan.id] || 0) >= value;
                                  return (
                                    <button
                                      key={`star-${plan.id}-${value}`}
                                      type="button"
                                      className={`${styles.starButton} ${active ? styles.starButtonActive : ''}`}
                                      onClick={() =>
                                        setRatingByPlanId((prev) => ({
                                          ...prev,
                                          [plan.id]: value
                                        }))
                                      }
                                      aria-label={`Valuta ${value} stelle`}
                                    >
                                      <Star size={16} aria-hidden="true" />
                                    </button>
                                  );
                                })}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => submitRating(plan.id, rateableBooking.id)}
                                disabled={ratingPlanId === plan.id}
                              >
                                {ratingPlanId === plan.id ? 'Invio voto...' : 'Invia valutazione'}
                              </Button>
                            </div>
                          ) : null}

                          {latestRatedBooking ? (
                            <p className="muted">Valutazione inviata: {latestRatedBooking.rating_stars}/5 stelle</p>
                          ) : null}
                        </>
                      ) : (
                        <div className={styles.chatLockedCta}>
                          <p className={styles.chatLockedHint}>
                            <Lock size={15} aria-hidden="true" /> Chat coach disponibile solo con Premium attivo.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className={styles.chatUpgradeButton}
                            onClick={() => setPaywallOpen(true)}
                          >
                            Sblocca Premium per chattare
                          </Button>
                        </div>
                      )}
                        </Card>

                        {(plan.attachments || []).length > 0 ? (
                          <div className={styles.attachmentsWrap}>
                            <h3>Allegati scheda</h3>
                            <ul className={styles.listCompact}>
                              {plan.attachments.map((attachment) => (
                                <li key={attachment.id} className={styles.attachmentItem}>
                                  <span>{attachment.file_name}</span>
                                  <div className="row">
                                    <Button type="button" size="sm" variant="ghost" icon={Eye} onClick={() => openAttachment(plan.id, attachment)}>
                                      Apri
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      icon={Download}
                                      onClick={() => downloadAttachment(plan.id, attachment.id, attachment.file_name)}
                                    >
                                      Scarica
                                    </Button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </>
                );
              })()}
            </Card>
          ))}
        </div>
      )}

      {activeChat ? (
        <div className={styles.chatFullscreenOverlay} role="dialog" aria-modal="true" aria-label="Chat coach">
          <div className={styles.chatFullscreenPanel}>
            <header className={styles.chatFullscreenHeader}>
              <div>
                <h3>Chat con {activeChat.coachName || 'Coach'}</h3>
                <p className="muted">
                  {activeChat.planTitle} · {activeChat.booking?.slot_label}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                onClick={terminateActiveChat}
                disabled={chatEndingBookingId === String(activeChat.bookingId)}
              >
                {chatEndingBookingId === String(activeChat.bookingId) ? 'Terminazione...' : 'Termina'}
              </Button>
            </header>

            <div className={styles.chatFullscreenBody}>
              <article className={styles.chatWelcomeCard}>
                <p>{buildChatWelcome(localProfile)}</p>
              </article>
              {chatLoadingByBookingId[String(activeChat.bookingId)] ? (
                <p className="muted">Caricamento messaggi...</p>
              ) : (chatMessagesByBookingId[String(activeChat.bookingId)] || []).length === 0 ? (
                <p className="muted">Nessun messaggio. Avvia ora la conversazione.</p>
              ) : (
                (chatMessagesByBookingId[String(activeChat.bookingId)] || []).map((msg) => {
                  const mine = Number(msg.sender_user_id) !== Number(activeChat.coachUserId);
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
                value={chatDraftByBookingId[String(activeChat.bookingId)] || ''}
                onChange={(event) =>
                  setChatDraftByBookingId((prev) => ({
                    ...prev,
                    [String(activeChat.bookingId)]: event.target.value.slice(0, 1000)
                  }))
                }
                placeholder={
                  chatCanSendByBookingId[String(activeChat.bookingId)]
                    ? 'Scrivi un messaggio...'
                    : 'Chat disponibile solo durante sessione live'
                }
                disabled={!chatCanSendByBookingId[String(activeChat.bookingId)]}
              />
              <Button
                type="button"
                size="sm"
                icon={Send}
                onClick={() => sendChatMessage(activeChat.booking)}
                disabled={
                  !chatCanSendByBookingId[String(activeChat.bookingId)] ||
                  chatSendingBookingId === String(activeChat.bookingId)
                }
              >
                {chatSendingBookingId === String(activeChat.bookingId) ? 'Invio...' : 'Invia'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} feature="Chatta con il coach (45 min)" />
    </section>
  );
}

export default MyPlansPage;

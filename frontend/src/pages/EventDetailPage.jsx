import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import { CalendarPlus, Share2, ClipboardCopy, UserPlus, UserMinus, Bookmark, BookmarkCheck, MessageCircle, Send, Sparkles, X, QrCode, Timer } from 'lucide-react';
import { api } from '../services/api';
import EventBadge from '../components/EventBadge';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import Card from '../components/Card';
import Button from '../components/Button';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { ensureLeafletIcons } from '../features/coach/utils/leafletIconFix';
import { downloadEventIcs } from '../utils/ics';
import { useBilling } from '../context/BillingContext';
import PaywallModal from '../components/PaywallModal';
import { calculateCompatibility, getCoachProfile } from '../features/coach/services/coach';
import { useUserLocation } from '../hooks/useUserLocation';
import LocationPermissionAlert from '../components/LocationPermissionAlert';
import { getAuthSession } from '../services/authSession';
import { markStepByAction } from '../services/tutorialMode';
import { buildGroupOrganizerWelcome } from '../utils/chatWelcome';
import { ai, getAiSettings } from '../services/ai';
import styles from '../styles/pages/eventDetail.module.css';

function EventDetailPage() {
  ensureLeafletIcons();

  function normalizeName(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower === 'tu') return 'me';
    return lower;
  }

  function normalizeDisplayName(value, fallback = 'Partecipante') {
    const raw = String(value || '').trim();
    if (!raw) return String(fallback || '').trim();
    if (raw.toLowerCase() === 'tu') return 'Me';
    return raw;
  }

  const { id } = useParams();
  const currentUserId = Number(getAuthSession().userId) || 1;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { entitlements } = useBilling();

  const [event, setEvent] = useState(null);
  const [similarEvents, setSimilarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelCountdown, setCancelCountdown] = useState(3);
  const [cancelReady, setCancelReady] = useState(false);
  const [cancelKaboom, setCancelKaboom] = useState(false);
  const [rsvpForm, setRsvpForm] = useState({
    name: '',
    skill_level: 'beginner',
    note: '',
    participation_fee_cents: 500
  });
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [coachProfile, setCoachProfile] = useState(null);
  const [groupChatOpen, setGroupChatOpen] = useState(false);
  const [groupChatLoading, setGroupChatLoading] = useState(false);
  const [groupChatMessages, setGroupChatMessages] = useState([]);
  const [groupChatProfilesByUserId, setGroupChatProfilesByUserId] = useState({});
  const [groupChatCanSend, setGroupChatCanSend] = useState(false);
  const [groupChatDraft, setGroupChatDraft] = useState('');
  const [groupChatSending, setGroupChatSending] = useState(false);
  const [checkedInParticipants, setCheckedInParticipants] = useState([]);
  const [friendRequestBusyById, setFriendRequestBusyById] = useState({});
  const [checkInSession, setCheckInSession] = useState(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInNowMs, setCheckInNowMs] = useState(() => Date.now());
  const [checkInTokenInput, setCheckInTokenInput] = useState('');
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [organizerIntro, setOrganizerIntro] = useState({ name: '', bio: '' });
  const [localProfile, setLocalProfile] = useState({ display_name: '', avatar_url: '' });
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const [groupChatAiLoading, setGroupChatAiLoading] = useState(false);
  const groupChatBodyRef = useRef(null);
  const { hasLocation, permission, error: locationError, requesting, requestLocation, originParams } = useUserLocation();
  const aiEnabled = getAiSettings().enableLocalAI;

  usePageMeta({
    title: event ? `${event.sport_name} a ${event.location_name} | Motrice` : 'Dettaglio Evento | Motrice',
    description: 'Dettaglio evento con RSVP, mappa, organizer e regole.'
  });

  useEffect(() => {
    let active = true;
    api.getLocalProfile()
      .then((profile) => {
        if (!active) return;
        setLocalProfile({
          display_name: String(profile?.display_name || profile?.name || '').trim(),
          avatar_url: String(profile?.avatar_url || '').trim()
        });
      })
      .catch(() => {
        if (!active) return;
        setLocalProfile({ display_name: '', avatar_url: '' });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setCoachProfile(getCoachProfile());
    setLoading(true);

    Promise.all([api.getEvent(id, originParams), api.listEvents({ sortBy: 'popular', ...originParams })])
      .then(([eventData, allEvents]) => {
        setEvent(eventData);
        setSimilarEvents(
          allEvents.filter((item) => item.id !== Number(id) && item.sport_id === eventData.sport_id).slice(0, 3)
        );
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, originParams]);

  useEffect(() => {
    let active = true;
    if (!event?.organizer) return undefined;

    const fallbackName = String(event.organizer?.name || 'Organizzatore').trim();
    const organizerRawId = String(event.organizer?.id || '').trim();
    const organizerId = organizerRawId === 'me'
      ? Number(currentUserId)
      : Number(organizerRawId);
    if (!Number.isFinite(organizerId)) {
      setOrganizerIntro({ name: fallbackName, bio: '' });
      return undefined;
    }

    api.getAccountProfileByUserId(organizerId)
      .then((profile) => {
        if (!active) return;
        setOrganizerIntro({
          name: String(profile?.display_name || fallbackName || 'Organizzatore').trim(),
          bio: String(profile?.bio || '').trim()
        });
      })
      .catch(() => {
        if (!active) return;
        setOrganizerIntro({ name: fallbackName, bio: '' });
      });

    return () => {
      active = false;
    };
  }, [event, currentUserId]);

  async function reload() {
    const fresh = await api.getEvent(id, originParams);
    setEvent(fresh);
  }

  function formatCountdown(ms) {
    const safe = Math.max(0, Number(ms || 0));
    const minutes = Math.floor(safe / 60000);
    const seconds = Math.floor((safe % 60000) / 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function isNearBottom(node) {
    if (!node) return true;
    return (node.scrollHeight - node.scrollTop - node.clientHeight) < 88;
  }

  function scrollChatToBottom() {
    const node = groupChatBodyRef.current;
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    setShowJumpToLatest(false);
    setPendingNewCount(0);
  }

  function applyDeliveryStatus(messages) {
    const list = Array.isArray(messages) ? messages : [];
    let latestOtherMs = -1;
    list.forEach((msg) => {
      if (Number(msg?.sender_user_id) === Number(currentUserId)) return;
      const ts = Date.parse(msg?.created_at || '');
      if (Number.isFinite(ts)) latestOtherMs = Math.max(latestOtherMs, ts);
    });
    return list.map((msg) => {
      if (Number(msg?.sender_user_id) !== Number(currentUserId)) return msg;
      if (String(msg?.local_status || '') === 'sending') {
        return { ...msg, delivery_status: 'sending' };
      }
      const ts = Date.parse(msg?.created_at || '');
      const delivered = Number.isFinite(ts);
      const seen = delivered && latestOtherMs > ts;
      return {
        ...msg,
        delivery_status: seen ? 'seen' : 'delivered'
      };
    });
  }

  async function loadGroupChatMessages({ silent = false, forceStick = false } = {}) {
    if (!silent) setGroupChatLoading(true);
    try {
      const payload = await api.listEventGroupMessages(id);
      const items = payload.items || [];
      const shouldStick = forceStick || isNearBottom(groupChatBodyRef.current);
      let appendedByOthers = 0;
      setGroupChatMessages((prev) => {
        const byId = new Map();
        (Array.isArray(prev) ? prev : []).forEach((msg) => {
          if (!msg?.id) return;
          byId.set(String(msg.id), msg);
        });
        items.forEach((msg) => {
          if (!msg?.id) return;
          const idKey = String(msg.id);
          if (!byId.has(idKey) && Number(msg?.sender_user_id) !== Number(currentUserId)) {
            appendedByOthers += 1;
          }
          byId.set(idKey, {
            ...byId.get(idKey),
            ...msg,
            local_status: 'sent'
          });
        });
        const merged = Array.from(byId.values()).sort((a, b) => {
          const aMs = Date.parse(a?.created_at || '');
          const bMs = Date.parse(b?.created_at || '');
          const safeA = Number.isFinite(aMs) ? aMs : 0;
          const safeB = Number.isFinite(bMs) ? bMs : 0;
          return safeA - safeB;
        });
        return applyDeliveryStatus(merged);
      });
      const uniqueSenderIds = Array.from(
        new Set(
          items
            .map((msg) => Number(msg?.sender_user_id || 0))
            .filter((userId) => Number.isFinite(userId) && userId > 0)
        )
      );
      const missingSenderIds = uniqueSenderIds.filter((userId) => !groupChatProfilesByUserId[userId]);
      if (missingSenderIds.length > 0) {
        const fetched = await Promise.all(
          missingSenderIds.map(async (userId) => {
            try {
              const profile = await api.getAccountProfileByUserId(userId);
              return [
                userId,
                {
                  display_name: String(profile?.display_name || '').trim(),
                  avatar_url: String(profile?.avatar_url || '').trim()
                }
              ];
            } catch {
              return [userId, { display_name: '', avatar_url: '' }];
            }
          })
        );
        setGroupChatProfilesByUserId((prev) => ({
          ...prev,
          ...Object.fromEntries(fetched)
        }));
      }
      setGroupChatCanSend(Boolean(payload.can_send));
      if (shouldStick) {
        scrollChatToBottom();
      } else if (appendedByOthers > 0) {
        setPendingNewCount((prev) => prev + appendedByOthers);
        setShowJumpToLatest(true);
      }
    } catch (err) {
      showToast(err.message || 'Impossibile caricare chat di gruppo', 'error');
    } finally {
      if (!silent) setGroupChatLoading(false);
    }
  }

  async function loadCheckedInParticipants() {
    try {
      const rows = await api.listEventCheckInParticipants(id);
      setCheckedInParticipants(Array.isArray(rows) ? rows : []);
    } catch {
      setCheckedInParticipants([]);
    }
  }

  async function confirmRsvp() {
    if (!rsvpForm.name || rsvpForm.name.length < 2) {
      showToast('Inserisci un nome valido', 'error');
      return;
    }

    try {
      await api.joinEvent(id, rsvpForm);
      await reload();
      showToast('RSVP confermato', 'success');
      markStepByAction('rsvp_confirmed');
      setModalOpen(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function cancelRsvp() {
    if (!cancelReady) return;
    try {
      const result = await api.leaveEvent(id);
      await reload();
      if (result?.penalty_applied) {
        showToast(
          result?.penalty_note || 'Penale applicata: quota congelata fino alla prossima partecipazione.',
          'info'
        );
      } else if (result?.stake_released) {
        showToast(
          result?.stake_release_note || 'Quota rilasciata: cancellazione prima dell inizio evento.',
          'success'
        );
      } else {
        showToast('Partecipazione annullata', 'info');
      }
      setCancelConfirmOpen(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function onAttendance(choice) {
    try {
      await api.confirmAttendance(id, choice);
      await reload();
      showToast(
        choice === 'attended'
          ? 'Presenza confermata: reward salvadanaio accreditato.'
          : 'No-show registrato',
        'success'
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function refreshCheckInSession() {
    try {
      const session = await api.getEventCheckInSession(id);
      setCheckInSession(session);
    } catch (err) {
      showToast(err.message || 'Impossibile caricare sessione check-in', 'error');
    }
  }

  async function startCheckInSession() {
    setCheckInBusy(true);
    try {
      const session = await api.startEventCheckInSession(id);
      setCheckInSession(session);
      showToast('Check-in avviato: mostra il QR ai partecipanti.', 'success');
    } catch (err) {
      showToast(err.message || 'Impossibile avviare check-in', 'error');
    } finally {
      setCheckInBusy(false);
    }
  }

  async function submitParticipantCheckIn() {
    const token = String(checkInTokenInput || '').trim();
    if (!token) {
      showToast('Inserisci o incolla il token check-in', 'error');
      return;
    }

    setCheckInSubmitting(true);
    try {
      const result = await api.checkInToEvent({ eventId: id, token });
      await reload();
      await refreshCheckInSession();
      if (result?.alreadyChecked) {
        showToast('Check-in gia registrato per questo evento.', 'info');
      } else {
        const participantXp = Number(result?.xpAwarded?.participant || 0);
        const organizerXp = Number(result?.xpAwarded?.organizer || 0);
        showToast(
          `Presenza confermata, deposito sbloccato, +${participantXp} XP${organizerXp > 0 ? ` · organizer +${organizerXp} XP` : ''}.`,
          'success'
        );
      }
      setCheckInTokenInput('');
    } catch (err) {
      showToast(err.message || 'Check-in non riuscito', 'error');
    } finally {
      setCheckInSubmitting(false);
    }
  }

  async function copyDetails() {
    const details = `${event.sport_name} | ${event.location_name} | ${new Date(event.event_datetime).toLocaleString('it-IT')}\n${event.description}`;
    try {
      await navigator.clipboard.writeText(details);
      showToast('Dettagli copiati', 'success');
    } catch {
      showToast('Impossibile copiare i dettagli', 'error');
    }
  }

  async function shareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Link copiato', 'success');
    } catch {
      showToast('Impossibile copiare il link', 'error');
    }
  }

  async function toggleSaveAgenda() {
    try {
      if (event.is_saved) {
        await api.unsaveEvent(id);
        showToast('Evento rimosso dall agenda', 'info');
      } else {
        await api.saveEvent(id);
        showToast('Evento salvato in agenda', 'success');
      }
      await reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function sendGroupChatMessage() {
    const text = String(groupChatDraft || '').trim();
    if (!text) return;
    const tempId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const optimistic = {
      id: tempId,
      event_id: Number(id),
      sender_user_id: Number(currentUserId),
      sender_name: normalizeDisplayName(localProfile.display_name || 'Me', 'Me'),
      sender_avatar_url: String(localProfile.avatar_url || '').trim(),
      text,
      created_at: new Date().toISOString(),
      local_status: 'sending'
    };
    setGroupChatMessages((prev) => applyDeliveryStatus([...(Array.isArray(prev) ? prev : []), optimistic]));
    scrollChatToBottom();
    setGroupChatSending(true);
    try {
      const created = await api.sendEventGroupMessage({ eventId: id, text });
      setGroupChatMessages((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        let replaced = false;
        const next = list.map((msg) => {
          if (String(msg?.id || '') !== String(tempId)) return msg;
          replaced = true;
          return { ...created, local_status: 'sent' };
        });
        if (!replaced && !next.some((msg) => String(msg?.id || '') === String(created?.id || ''))) {
          next.push({ ...created, local_status: 'sent' });
        }
        return applyDeliveryStatus(next);
      });
      setGroupChatDraft('');
      await loadGroupChatMessages({ silent: true, forceStick: true });
    } catch (err) {
      setGroupChatMessages((prev) =>
        applyDeliveryStatus((Array.isArray(prev) ? prev : []).filter((msg) => String(msg?.id || '') !== String(tempId)))
      );
      showToast(err.message || 'Invio messaggio non riuscito', 'error');
    } finally {
      setGroupChatSending(false);
    }
  }

  async function suggestGroupChatMessage() {
    if (!aiEnabled || groupChatAiLoading) return;
    setGroupChatAiLoading(true);
    try {
      const prompt = [event?.sport_name, event?.location_name, event?.event_datetime]
        .filter(Boolean)
        .join(' · ');
      const result = await ai.generateText({
        purpose: 'chat_suggestion',
        prompt: prompt || 'Messaggio gruppo evento sportivo',
        maxTokens: 40,
        contextPayload: {
          eventTitle: event?.title || '',
          sportName: event?.sport_name || '',
          locationName: event?.location_name || '',
          eventDateTime: event?.event_datetime || '',
          checkedInCount: checkedInParticipants.length,
          checkedInNames: checkedInParticipants.map((item) => item?.display_name || `Utente ${item?.user_id || ''}`)
        }
      });
      setGroupChatDraft(result.text.slice(0, 1000));
      showToast(`Messaggio suggerito (${result.provider})`, 'success');
    } catch (error) {
      showToast(error.message || 'AI non disponibile ora', 'error');
    } finally {
      setGroupChatAiLoading(false);
    }
  }

  async function requestFriendshipWith(userId) {
    if (!canInviteFriendsFromGroupChat) {
      showToast('Le richieste amicizia si sbloccano a fine sessione.', 'info');
      return;
    }
    const target = Number(userId);
    if (!Number.isInteger(target) || target <= 0) return;
    setFriendRequestBusyById((prev) => ({ ...prev, [String(target)]: true }));
    try {
      const result = await api.requestFriendship(target);
      await loadCheckedInParticipants();
      if (result?.status === 'friends') {
        showToast('Siete gia amici.', 'info');
      } else {
        showToast('Richiesta amicizia inviata.', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Impossibile inviare richiesta amicizia', 'error');
    } finally {
      setFriendRequestBusyById((prev) => ({ ...prev, [String(target)]: false }));
    }
  }

  const canAccessGroupChat =
    Boolean(event?.is_going) &&
    (entitlements.canUseCoachChat || [500, 1000].includes(Number(event?.user_rsvp?.participation_fee_cents || 0)));
  const isOrganizerForEvent = Boolean(
    event &&
    (
      String(event.organizer?.id || '') === 'me' ||
      String(event.organizer?.id || '') === String(currentUserId) ||
      normalizeName(localProfile.display_name || '') === normalizeName(event.organizer?.name || '')
    )
  );
  const sessionStartsMs = Date.parse(checkInSession?.starts_at || '');
  const sessionExpiresMs = Date.parse(checkInSession?.expires_at || '');
  const sessionIsScheduled = Number.isFinite(sessionStartsMs) && checkInNowMs < sessionStartsMs;
  const sessionIsActive =
    Number.isFinite(sessionStartsMs) &&
    Number.isFinite(sessionExpiresMs) &&
    checkInNowMs >= sessionStartsMs &&
    checkInNowMs <= sessionExpiresMs;
  const sessionIsExpired = Number.isFinite(sessionExpiresMs) && checkInNowMs > sessionExpiresMs;
  const eventStartsMs = Date.parse(event?.event_datetime || '');
  const eventDurationMinutes = Number.isFinite(Number(event?.duration_minutes))
    ? Math.max(30, Number(event.duration_minutes))
    : Number.isFinite(Number(event?.duration_hours))
      ? Math.max(1, Number(event.duration_hours)) * 60
      : 120;
  const eventEndedWithoutSession = !checkInSession && Number.isFinite(eventStartsMs)
    ? checkInNowMs > (eventStartsMs + eventDurationMinutes * 60 * 1000)
    : false;
  const canInviteFriendsFromGroupChat = Boolean(sessionIsExpired || eventEndedWithoutSession);
  const sessionStartsInLabel = sessionIsScheduled ? formatCountdown(sessionStartsMs - checkInNowMs) : '00:00';
  const sessionExpiresInLabel = sessionIsActive ? formatCountdown(sessionExpiresMs - checkInNowMs) : '00:00';
  const requestedParticipants = useMemo(
    () => checkedInParticipants.filter((item) => String(item.friendship_status || '') === 'requested'),
    [checkedInParticipants]
  );
  const availableParticipants = useMemo(
    () =>
      checkedInParticipants.filter((item) => {
        const status = String(item.friendship_status || '');
        return status !== 'requested' && status !== 'friends' && status !== 'self';
      }),
    [checkedInParticipants]
  );

  useEffect(() => {
    if (!event) return;
    if (searchParams.get('chat') !== 'group') return;
    if (!canAccessGroupChat) return;
    setGroupChatOpen(true);
    loadGroupChatMessages({ forceStick: true });
    const next = new URLSearchParams(searchParams);
    next.delete('chat');
    setSearchParams(next, { replace: true });
  }, [event, canAccessGroupChat, searchParams, setSearchParams]);

  useEffect(() => {
    if (!groupChatOpen) return undefined;
    const node = groupChatBodyRef.current;
    if (!node) return undefined;
    function onScroll() {
      if (isNearBottom(node)) {
        setShowJumpToLatest(false);
        setPendingNewCount(0);
      } else {
        setShowJumpToLatest(true);
      }
    }
    node.addEventListener('scroll', onScroll);
    return () => node.removeEventListener('scroll', onScroll);
  }, [groupChatOpen]);

  useEffect(() => {
    if (!groupChatOpen) return undefined;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadGroupChatMessages({ silent: true });
        loadCheckedInParticipants();
      }
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [groupChatOpen, id]);

  useEffect(() => {
    if (!groupChatOpen) return;
    const node = groupChatBodyRef.current;
    if (!node) return;
    if (isNearBottom(node)) {
      scrollChatToBottom();
    }
  }, [groupChatOpen, groupChatMessages.length]);

  useEffect(() => {
    if (!checkInSession) return undefined;
    const intervalId = window.setInterval(() => setCheckInNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [checkInSession]);

  useEffect(() => {
    if (!event || (!isOrganizerForEvent && !event?.is_going)) {
      setCheckInSession(null);
      return;
    }
    refreshCheckInSession();
  }, [event?.id, isOrganizerForEvent, event?.is_going]);

  useEffect(() => {
    if (!cancelConfirmOpen) return undefined;
    let timeoutId = null;
    const intervalId = window.setInterval(() => {
      setCancelCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          setCancelReady(true);
          setCancelKaboom(true);
          timeoutId = window.setTimeout(() => setCancelKaboom(false), 900);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [cancelConfirmOpen]);

  function openCancelDialog() {
    setCancelConfirmOpen(true);
    setCancelCountdown(3);
    setCancelReady(false);
    setCancelKaboom(false);
  }

  if (loading) return <LoadingSkeleton rows={2} />;
  if (error)
    return (
      <EmptyState
        title="Evento non disponibile"
        description={error}
        imageSrc="/images/default-sport.svg"
        imageAlt="Icona sport"
        primaryActionLabel="Explore nearby"
        onPrimaryAction={() => navigate('/explore')}
      />
    );

  const coachInsight = calculateCompatibility(event, coachProfile);
  const routePoints = Array.isArray(event?.route_info?.route_points)
    ? event.route_info.route_points
        .filter((pair) => Array.isArray(pair) && pair.length >= 2)
        .map((pair) => [Number(pair[0]), Number(pair[1])])
        .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
    : [];

  return (
    <div className={styles.page}>
      <LocationPermissionAlert
        hasLocation={hasLocation}
        permission={permission}
        error={locationError}
        requesting={requesting}
        onRequest={requestLocation}
      />
      <div className={styles.detailGrid}>
        <Card as="article" className={styles.detailCard}>
          <div className="row">
            <h1>{event.sport_name}</h1>
            <div className={styles.metaRow}>
              <EventBadge label={event.level} type="level" />
              <EventBadge label={`${event.participants_count}/${event.max_participants}`} type="status" />
              {event.is_going && <EventBadge label="You're going" type="status" />}
              {event.creator_plan === 'premium' && <EventBadge label="Premium" type="premium" />}
            </div>
          </div>

          <p>{event.description}</p>
          <p>
            <strong>Quando:</strong> {new Date(event.event_datetime).toLocaleString('it-IT')}
          </p>
          <p>
            <strong>Durata:</strong> {Number(event.duration_minutes || 120)} min
          </p>
          <p>
            <strong>Dove:</strong> {event.location_name}
          </p>
          {event.route_info ? (
            <Card subtle>
              <h2>Informazioni percorso</h2>
              <p>
                <strong>Nome:</strong> {event.route_info.name}
              </p>
              <p>
                <strong>Tratta:</strong> {event.route_info.from_label || 'Via X'} → {event.route_info.to_label || 'Via Y'}
              </p>
              <p>
                <strong>Distanza:</strong> {event.route_info.distance_km} km
              </p>
              {event.route_info.elevation_gain_m ? (
                <p>
                  <strong>Dislivello positivo:</strong> +{event.route_info.elevation_gain_m} m
                </p>
              ) : null}
              {event.route_info.map_url ? (
                <p>
                  <a href={event.route_info.map_url} target="_blank" rel="noreferrer">
                    Apri rotta su mappa
                  </a>
                </p>
              ) : null}
            </Card>
          ) : null}

          <div className={styles.actions}>
            {!event.is_going ? (
              <Button type="button" onClick={() => setModalOpen(true)} icon={UserPlus}>
                Partecipa
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={openCancelDialog} icon={UserMinus}>
                Annulla partecipazione
              </Button>
            )}
            <Button
              type="button"
              variant={event.is_saved ? 'secondary' : 'ghost'}
              onClick={toggleSaveAgenda}
              icon={event.is_saved ? BookmarkCheck : Bookmark}
            >
              {event.is_saved ? 'Salvato in agenda' : 'Salva in agenda'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!entitlements.canExportICS) {
                  setPaywallOpen(true);
                  return;
                }
                downloadEventIcs(event);
              }}
              icon={CalendarPlus}
            >
              Aggiungi a Calendario
            </Button>
            <Button type="button" variant="ghost" onClick={copyDetails} icon={ClipboardCopy}>
              Copia dettagli
            </Button>
            <Button type="button" variant="ghost" onClick={shareLink} icon={Share2}>
              Condividi link
            </Button>
            {canAccessGroupChat ? (
              <Button
                type="button"
                variant="secondary"
                icon={MessageCircle}
                onClick={async () => {
                  setGroupChatOpen(true);
                  await loadGroupChatMessages({ forceStick: true });
                  await loadCheckedInParticipants();
                }}
              >
                Apri chat di gruppo
              </Button>
            ) : null}
          </div>

          {event.is_going && !canAccessGroupChat ? (
            <Card subtle>
              <p className="muted">
                La chat di gruppo si sblocca dopo prenotazione valida: quota 5/10 EUR oppure accesso Premium.
              </p>
            </Card>
          ) : null}

          {event.can_confirm_attendance && (
            <Card subtle>
              <h2>Conferma presenza</h2>
              <div className="row">
                <Button type="button" onClick={() => onAttendance('attended')}>
                  Conferma presenza
                </Button>
                <Button type="button" variant="secondary" onClick={() => onAttendance('no_show')}>
                  Non mi sono presentato
                </Button>
              </div>
            </Card>
          )}

          {isOrganizerForEvent ? (
            <Card subtle className={styles.checkInCard}>
              <div className={styles.checkInHead}>
                <h2>Check-in QR evento</h2>
                <Button type="button" variant="secondary" icon={QrCode} onClick={startCheckInSession} disabled={checkInBusy}>
                  {checkInBusy ? 'Avvio...' : 'Avvia check-in'}
                </Button>
              </div>
              <p className="muted">
                Finestra valida da 15 min prima dell inizio evento fino a fine sessione + 15 min (fallback 90 min).
              </p>

              {!checkInSession ? (
                <p className="muted">Nessuna sessione attiva. Avvia il check-in quando il gruppo e pronto.</p>
              ) : (
                <div className={styles.checkInBody}>
                  <div className={styles.checkInMeta}>
                    <p><strong>Inizio validita:</strong> {new Date(checkInSession.starts_at).toLocaleString('it-IT')}</p>
                    <p><strong>Scadenza:</strong> {new Date(checkInSession.expires_at).toLocaleString('it-IT')}</p>
                    {sessionIsScheduled ? <p><strong>Stato:</strong> programmato · apre tra {sessionStartsInLabel}</p> : null}
                    {sessionIsActive ? (
                      <p className={styles.checkInCountdown}><Timer size={14} aria-hidden="true" /> Attivo · scade tra {sessionExpiresInLabel}</p>
                    ) : null}
                    {sessionIsExpired ? <p><strong>Stato:</strong> scaduto</p> : null}
                    {checkInSession.token ? <p><strong>Token:</strong> <code>{checkInSession.token}</code></p> : null}
                  </div>
                  <img
                    className={styles.checkInQr}
                    src={checkInSession.qr_url}
                    alt={`QR check-in evento ${event.sport_name}`}
                    loading="lazy"
                  />
                </div>
              )}
            </Card>
          ) : null}

          {event.is_going && !isOrganizerForEvent ? (
            <Card subtle className={styles.checkInCard}>
              <div className={styles.checkInHead}>
                <h2>Check-in partecipante</h2>
              </div>
              <p className="muted">
                Scansiona o incolla il token QR mostrato dall organizzatore per confermare presenza e sbloccare deposito.
              </p>

              <div className={styles.checkInBody}>
                <div className={styles.checkInMeta}>
                  {checkInSession ? (
                    <>
                      <p><strong>Inizio validita:</strong> {new Date(checkInSession.starts_at).toLocaleString('it-IT')}</p>
                      <p><strong>Scadenza:</strong> {new Date(checkInSession.expires_at).toLocaleString('it-IT')}</p>
                      {sessionIsScheduled ? <p><strong>Stato:</strong> programmato · apre tra {sessionStartsInLabel}</p> : null}
                      {sessionIsActive ? (
                        <p className={styles.checkInCountdown}><Timer size={14} aria-hidden="true" /> Attivo · scade tra {sessionExpiresInLabel}</p>
                      ) : null}
                      {sessionIsExpired ? <p><strong>Stato:</strong> scaduto</p> : null}
                    </>
                  ) : (
                    <p className="muted">Nessuna sessione attiva al momento. Attendi l organizzatore.</p>
                  )}
                </div>
                <label className={styles.checkInTokenField}>
                  Token check-in
                  <input
                    value={checkInTokenInput}
                    onChange={(eventInput) => setCheckInTokenInput(eventInput.target.value)}
                    placeholder="Incolla token o payload QR"
                    aria-label="Token check-in evento"
                  />
                </label>
                <div className={styles.checkInActions}>
                  <Button type="button" onClick={submitParticipantCheckIn} disabled={checkInSubmitting || !checkInSession}>
                    {checkInSubmitting ? 'Verifica...' : 'Conferma check-in'}
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {event.is_going && String(event?.user_rsvp?.attendance || '') === 'attended' ? (
            <Card subtle className={styles.postWorkoutCard}>
              <h2>Allenamento completato ✅</h2>
              <p className="muted">
                Ora puoi aggiungere i compagni con cui hai completato l allenamento in questo evento.
              </p>
              <div className="row">
                <Button type="button" icon={UserPlus} onClick={() => navigate(`/chat/met-people/${event.id}`)}>
                  Aggiungi compagni
                </Button>
              </div>
            </Card>
          ) : null}

          <Card subtle>
            <h2>Coach insight</h2>
            {!coachProfile ? (
              <EmptyState
                title="Attiva Coach"
                description="Ricevi una valutazione di compatibilita personalizzata per ogni sessione."
                imageSrc="/images/palestra.svg"
                imageAlt="Icona coach"
                primaryActionLabel="Attiva Coach"
                onPrimaryAction={() => navigate('/coach')}
              />
            ) : (
              <>
                <div className={styles.metaRow}>
                  <EventBadge label={`${coachInsight.score}% compatibilita`} type="level" />
                  {coachInsight.recommended && <EventBadge label="Consigliato dal Coach" type="premium" />}
                </div>
                <p className="muted">{coachInsight.explanation}</p>
              </>
            )}
          </Card>

          <Card subtle>
            <h2>Organizer</h2>
            <p>{event.organizer.name}</p>
            <p className="muted">Affidabilita {event.organizer.reliability_score}%</p>
            <Link to={`/profile/${event.organizer.id}`}>Vedi profilo pubblico</Link>
          </Card>

          <Card subtle>
            <h2>Regole della sessione</h2>
            <ul>
              {event.etiquette.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </Card>
        </Card>

        <Card className={styles.mapCard}>
          <h2>Mappa</h2>
          {routePoints.length >= 2 ? (
            <MapContainer center={routePoints[0]} zoom={11} className={styles.mapFrame}>
              <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Polyline positions={routePoints} />
              <Marker position={routePoints[0]}>
                <Popup>Partenza: {event.route_info?.from_label || 'Via X'}</Popup>
              </Marker>
              <Marker position={routePoints[routePoints.length - 1]}>
                <Popup>Arrivo: {event.route_info?.to_label || 'Via Y'}</Popup>
              </Marker>
            </MapContainer>
          ) : event.lat != null && event.lng != null ? (
            <MapContainer center={[event.lat, event.lng]} zoom={12} className={styles.mapFrame}>
              <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[event.lat, event.lng]}>
                <Popup>{event.location_name}</Popup>
              </Marker>
            </MapContainer>
          ) : (
            <Card subtle>
              <p className="muted">Coordinate non disponibili per questo evento.</p>
            </Card>
          )}
        </Card>
      </div>

      <section className={styles.list}>
        <h2>Eventi simili</h2>
        <div className="grid2">
          {similarEvents.map((item) => (
            <Card key={item.id}>
              <h3>{item.location_name}</h3>
              <p className="muted">{new Date(item.event_datetime).toLocaleString('it-IT')}</p>
              <Link to={`/events/${item.id}`}>Apri dettaglio</Link>
            </Card>
          ))}
        </div>
      </section>

      <Modal
        open={modalOpen}
        title="Partecipa alla sessione"
        onClose={() => setModalOpen(false)}
        onConfirm={confirmRsvp}
        confirmText="Conferma RSVP"
      >
        <label>
          Nome
          <input
            value={rsvpForm.name}
            onChange={(event) => setRsvpForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Inserisci il tuo nome"
          />
        </label>
        <label>
          Livello
          <select
            value={rsvpForm.skill_level}
            onChange={(event) => setRsvpForm((prev) => ({ ...prev, skill_level: event.target.value }))}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label>
          Nota (opzionale)
          <textarea
            rows="2"
            value={rsvpForm.note}
            onChange={(event) => setRsvpForm((prev) => ({ ...prev, note: event.target.value }))}
          />
        </label>
        <label>
          Quota partecipazione gruppo
          {entitlements.canUseCoachChat ? (
            <p className="muted">Esente quota con abbonamento Premium attivo.</p>
          ) : (
            <select
              value={rsvpForm.participation_fee_cents}
              onChange={(event) =>
                setRsvpForm((prev) => ({
                  ...prev,
                  participation_fee_cents: Number(event.target.value)
                }))
              }
            >
              <option value={500}>5 EUR</option>
              <option value={1000}>10 EUR</option>
            </select>
          )}
        </label>
      </Modal>

      <Modal
        open={cancelConfirmOpen}
        title="Conferma annullamento"
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={cancelRsvp}
        confirmText={cancelReady ? 'Annulla partecipazione' : `Attendi ${cancelCountdown}s`}
        confirmDisabled={!cancelReady}
      >
        <div className={styles.cancelGuardBox}>
          <p>
            Vuoi davvero abbandonare? Se mancano meno di 30 minuti all inizio evento, scatta la penale:
            quota congelata e sbloccabile al prossimo evento.
          </p>
          <div className={`${styles.cancelCountdown} ${cancelKaboom ? styles.cancelKaboom : ''}`}>
            <strong>{cancelReady ? 'KABOOM' : cancelCountdown}</strong>
            <small>
              {cancelReady
                ? 'Ora puoi confermare annulla partecipazione.'
                : 'Countdown di sicurezza in corso...'}
            </small>
          </div>
        </div>
      </Modal>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} feature="Add to Calendar (ICS)" />

      {groupChatOpen ? (
        <div className={styles.groupChatOverlay} role="dialog" aria-modal="true" aria-label="Chat di gruppo evento">
          <div className={styles.groupChatPanel}>
            <header className={styles.groupChatHeader}>
              <div>
                <h3>Chat di gruppo</h3>
                <p className="muted">{event?.sport_name} · {event?.location_name}</p>
              </div>
              <div className={styles.groupChatHeaderActions}>
                <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/agenda')}>
                  Agenda
                </Button>
                <Button type="button" variant="ghost" size="sm" icon={X} onClick={() => setGroupChatOpen(false)}>
                  Chiudi
                </Button>
              </div>
            </header>

            <section className={styles.groupChatParticipants} aria-label="Partecipanti check-in in chat">
              <div className={styles.groupChatParticipantsHead}>
                <h4>Partecipanti presenti</h4>
                <span>{checkedInParticipants.length}</span>
              </div>

              {checkedInParticipants.length === 0 ? (
                <p className="muted">Nessun check-in registrato al momento.</p>
              ) : (
                <>
                  {requestedParticipants.length > 0 ? (
                    <div className={styles.friendGroup}>
                      <p className={styles.friendGroupLabel}>Richiesta inviata</p>
                      <div className={styles.friendRowWrap}>
                        {requestedParticipants.map((participant) => (
                          <article key={`requested-${participant.user_id}`} className={styles.friendRow}>
                            <div>
                              <strong>{participant.display_name || `Utente ${participant.user_id}`}</strong>
                              <small>
                                Check-in {new Date(participant.checked_in_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                              </small>
                            </div>
                            <span className={styles.friendChip}>Inviata</span>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {availableParticipants.length > 0 ? (
                    <div className={styles.friendGroup}>
                      <p className={styles.friendGroupLabel}>Disponibili</p>
                      {!canInviteFriendsFromGroupChat ? (
                        <p className="muted">Invio richiesta disponibile a fine sessione.</p>
                      ) : null}
                      <div className={styles.friendRowWrap}>
                        {availableParticipants.map((participant) => (
                          <article key={`available-${participant.user_id}`} className={styles.friendRow}>
                            <div>
                              <strong>{participant.display_name || `Utente ${participant.user_id}`}</strong>
                              <small>
                                Check-in {new Date(participant.checked_in_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                              </small>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => requestFriendshipWith(participant.user_id)}
                              disabled={Boolean(friendRequestBusyById[String(participant.user_id)]) || !canInviteFriendsFromGroupChat}
                            >
                              {!canInviteFriendsFromGroupChat
                                ? 'Sbloccato a fine sessione'
                                : friendRequestBusyById[String(participant.user_id)]
                                  ? 'Invio...'
                                  : 'Aggiungi amico'}
                            </Button>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </section>

            <div className={styles.groupChatBody} ref={groupChatBodyRef}>
              <article className={styles.chatWelcomeCard}>
                <p>
                  {buildGroupOrganizerWelcome({
                    organizerName: organizerIntro.name || event?.organizer?.name,
                    organizerBio: organizerIntro.bio,
                    participationFeeStatus: event?.user_rsvp?.participation_fee_status,
                    participationFeeCents: event?.user_rsvp?.participation_fee_cents
                  })}
                </p>
              </article>
              {groupChatLoading ? (
                <p className="muted">Caricamento messaggi...</p>
              ) : groupChatMessages.length === 0 ? (
                <p className="muted">Nessun messaggio. Inizia tu la conversazione del gruppo.</p>
              ) : (
                groupChatMessages.map((msg) => {
                  const senderUserId = Number(msg.sender_user_id || 0);
                  const profile = groupChatProfilesByUserId[senderUserId] || {};
                  const displayName = normalizeDisplayName(
                    profile.display_name || msg.sender_name || '',
                    'Partecipante'
                  );
                  const avatarUrl = String(profile.avatar_url || msg.sender_avatar_url || '').trim();
                  const isOrganizerMessage =
                    (Number.isFinite(Number(event?.organizer?.id)) &&
                      Number(event?.organizer?.id) === senderUserId) ||
                    normalizeName(displayName) === normalizeName(event?.organizer?.name);
                  const initials = String(displayName || 'U').slice(0, 1).toUpperCase();
                  return (
                    <div
                      key={msg.id}
                      className={`${styles.groupChatBubble} ${
                        senderUserId === Number(currentUserId)
                          ? styles.groupChatBubbleMine
                          : styles.groupChatBubbleOther
                      }`}
                    >
                      <div className={styles.groupChatSenderRow}>
                        <span className={styles.groupChatAvatarWrap}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={`Avatar ${displayName}`} className={styles.groupChatAvatar} />
                          ) : (
                            <span className={styles.groupChatAvatarFallback}>{initials}</span>
                          )}
                          {isOrganizerMessage ? <span className={styles.groupChatCrown}>👑</span> : null}
                        </span>
                        <p className={styles.groupChatSenderName}>{displayName}</p>
                      </div>
                      <p>{msg.text}</p>
                      <small>
                        {new Date(msg.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        {senderUserId === Number(currentUserId)
                          ? ` · ${
                            msg.delivery_status === 'seen'
                              ? 'Letto'
                              : msg.delivery_status === 'sending'
                                ? 'Invio...'
                                : 'Consegnato'
                          }`
                          : ''}
                      </small>
                    </div>
                  );
                })
              )}
            </div>
            {showJumpToLatest || pendingNewCount > 0 ? (
              <button
                type="button"
                className={styles.jumpToLatest}
                onClick={scrollChatToBottom}
              >
                {pendingNewCount > 0 ? `Nuovi messaggi (${pendingNewCount}) · Vai in basso` : 'Vai in basso'}
              </button>
            ) : null}

            <div className={styles.groupChatComposer}>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={Sparkles}
                onClick={suggestGroupChatMessage}
                disabled={!groupChatCanSend || !aiEnabled || groupChatAiLoading}
                title={aiEnabled ? 'Suggerisci messaggio con AI' : 'Attiva AI Locale in Account'}
              >
                {groupChatAiLoading ? 'AI...' : 'Suggerisci messaggio'}
              </Button>
              <input
                value={groupChatDraft}
                onChange={(e) => setGroupChatDraft(e.target.value.slice(0, 1000))}
                placeholder={groupChatCanSend ? 'Scrivi nel gruppo...' : 'Chat non disponibile'}
                disabled={!groupChatCanSend}
              />
              <Button
                type="button"
                icon={Send}
                onClick={sendGroupChatMessage}
                disabled={!groupChatCanSend || groupChatSending}
              >
                {groupChatSending ? 'Invio...' : 'Invia'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default EventDetailPage;

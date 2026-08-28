import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Clock3,
  Dumbbell,
  MapPin,
  MessageCircle,
  Navigation,
  Route,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { chatApi } from '../services/chatApi';
import ChatUserProfileCard from '../components/chat/ChatUserProfileCard';
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
import EventParticipationFlow from '../components/event/EventParticipationFlow';
import { saveSharedWorkoutPlanToLibrary } from '../features/coach/services/personalWorkoutPlansApi';
import { resolveEventParticipationState } from '../utils/eventParticipationState';
import styles from '../styles/pages/eventDetail.module.css';

const SPORT_DETAIL_VISUALS = [
  {
    pattern: /palestra|fitness|forza|functional|workout|hiit/i,
    image: '/images/hero-palestra-v2.jpg',
    label: 'Forza'
  },
  {
    pattern: /padel|tennis|racchetta/i,
    image: '/images/hero-padel-v2.jpg',
    label: 'Racchetta'
  },
  {
    pattern: /calcio|calcetto|football|futsal/i,
    image: '/images/hero-calcio-v2.jpg',
    label: 'Squadra'
  },
  {
    pattern: /running|corsa|jogging/i,
    image: '/images/hero-running-v2.jpg',
    label: 'Running'
  },
  {
    pattern: /bici|bike|cycling|ciclismo|mtb/i,
    image: '/images/hero-bici-v2.jpg',
    label: 'Ciclismo'
  },
  {
    pattern: /trekking|trail|hiking|camminata/i,
    image: '/images/hero-trekking-v2.jpg',
    label: 'Outdoor'
  }
];

function getSportDetailVisual(event) {
  const source = `${event?.sport_name || ''} ${event?.title || ''}`;
  return (
    SPORT_DETAIL_VISUALS.find((item) => item.pattern.test(source)) || {
      image: '/images/hero-sport-default-v2.jpg',
      label: String(event?.sport_name || 'Sport')
    }
  );
}

function formatEventDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data da definire';
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  })
    .format(date)
    .replaceAll('.', '')
    .toUpperCase();
}

function formatEventTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatCurrencyFromCents(value) {
  return (Number(value || 0) / 100).toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR'
  });
}

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
  const authSession = getAuthSession();
  const currentUserId = Number(authSession.userId) || 1;
  const currentUser = {
    id: String(authSession.authUserId || authSession.userId || '')
  };
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { entitlements } = useBilling();

  const [event, setEvent] = useState(null);
  const [similarEvents, setSimilarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
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
  const [chatProfileCard, setChatProfileCard] = useState({
    open: false,
    loading: false,
    profile: null,
    error: ''
  });
  const [checkedInParticipants, setCheckedInParticipants] = useState([]);
  const [friendRequestBusyById, setFriendRequestBusyById] = useState({});
  const [personalEventBusy, setPersonalEventBusy] = useState(false);
  const [workoutPlanSaving, setWorkoutPlanSaving] = useState(false);
  const [workoutPlanSaved, setWorkoutPlanSaved] = useState(false);
  const [workoutPlanOpen, setWorkoutPlanOpen] = useState(false);
  const [checkInNowMs, setCheckInNowMs] = useState(() => Date.now());
  const [organizerIntro, setOrganizerIntro] = useState({ name: '', bio: '' });
  const [localProfile, setLocalProfile] = useState({ display_name: '', avatar_url: '' });
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const [groupChatAiLoading, setGroupChatAiLoading] = useState(false);
  const groupChatBodyRef = useRef(null);
  const participationFlowRef = useRef(null);
  const lastParticipationStateRef = useRef('');
  const {
    coords,
    hasLocation,
    permission,
    error: locationError,
    requesting,
    requestLocation,
    originParams
  } = useUserLocation();
  const aiEnabled = getAiSettings().enableLocalAI;

  useEffect(() => {
    setWorkoutPlanOpen(false);
  }, [event?.id]);

  async function openChatParticipantProfile(identity) {
    const fallback = {
      userId: identity?.userId || null,
      authUserId: identity?.authUserId || '',
      display_name: identity?.displayName || 'Partecipante',
      avatar_url: identity?.avatarUrl || '',
      bio: '',
      city: '',
      level: '',
      reliability: 0
    };
    setChatProfileCard({ open: true, loading: true, profile: fallback, error: '' });
    try {
      const profile = await chatApi.getParticipantProfile(identity);
      setChatProfileCard({ open: true, loading: false, profile, error: '' });
    } catch (profileError) {
      setChatProfileCard({
        open: true,
        loading: false,
        profile: fallback,
        error: profileError?.message || 'Profilo non disponibile'
      });
    }
  }

  usePageMeta({
    title: event ? `${event.sport_name} a ${event.location_name} | Motrice` : 'Dettaglio Evento | Motrice',
    description: 'Dettaglio evento con RSVP, mappa, organizer e regole.'
  });

  useEffect(() => {
    let active = true;
    api.getLocalProfile()
      .then((profile) => {
        if (!active) return;
        const displayName = String(profile?.display_name || profile?.name || '').trim();
        setLocalProfile({
          display_name: displayName,
          avatar_url: String(profile?.avatar_url || '').trim()
        });
        if (displayName.length >= 2) {
          setRsvpForm((current) => ({
            ...current,
            name: displayName
          }));
        }
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
          allEvents.filter((item) => String(item.id) !== String(id) && item.sport_id === eventData.sport_id).slice(0, 3)
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
    if (rsvpSubmitting) return;
    const participantName = String(rsvpForm.name || localProfile.display_name || '').trim();
    if (participantName.length < 2) {
      showToast('Completa il nome utente nel profilo prima di partecipare', 'error');
      return;
    }

    setRsvpSubmitting(true);
    try {
      const result = await api.joinEvent(id, {
        ...rsvpForm,
        name: participantName
      });
      if (result?.pending) {
        setEvent((current) => current ? {
          ...current,
          is_join_pending: true,
          join_request_status: 'pending'
        } : current);
        setModalOpen(false);
        showToast('Richiesta inviata all organizer', 'success');
      } else {
        setEvent((current) => current ? {
          ...current,
          is_going: true,
          user_rsvp: result?.rsvp || current.user_rsvp
        } : current);
        setModalOpen(false);
        showToast('RSVP confermato', 'success');
        markStepByAction('rsvp_confirmed');
      }
      reload().catch(() => {
        // La conferma ricevuta dal backend resta valida anche se il refresh tarda.
      });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRsvpSubmitting(false);
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

  async function completePersonalEvent() {
    setPersonalEventBusy(true);
    try {
      const result = await api.completePersonalEvent(id);
      await reload();
      showToast(
        result?.already_completed
          ? 'Allenamento gia registrato'
          : `Allenamento registrato · +${result?.xp_awarded || event?.completion_xp || 5} PX`,
        result?.already_completed ? 'info' : 'success'
      );
    } catch (err) {
      showToast(err.message || 'Impossibile completare il promemoria', 'error');
    } finally {
      setPersonalEventBusy(false);
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
        showToast('Evento rimosso dai tuoi eventi', 'info');
      } else {
        await api.saveEvent(id);
        showToast('Evento salvato nei tuoi eventi', 'success');
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
      event_id: id,
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

  const isOrganizer = Boolean(event && currentUser?.id === String(event.organizerId || ''));
  const isOrganizerForEvent = Boolean(
    isOrganizer ||
    event &&
    (
      String(event.organizer?.id || '') === 'me' ||
      String(event.organizer?.id || '') === String(currentUserId) ||
      normalizeName(localProfile.display_name || '') === normalizeName(event.organizer?.name || '')
    )
  );
  const participationIsFull = Number(event?.max_participants || 0) > 0 &&
    Number(event?.participants_count || 0) >= Number(event?.max_participants || 0);
  const participationState = resolveEventParticipationState({
    event,
    isOrganizer: isOrganizerForEvent,
    isFull: participationIsFull
  });
  const canAccessGroupChat = Boolean(participationState.canAccessChat || isOrganizerForEvent);
  const eventStartsMs = Date.parse(event?.event_datetime || '');
  const eventDurationMinutes = Number.isFinite(Number(event?.duration_minutes))
    ? Math.max(30, Number(event.duration_minutes))
    : Number.isFinite(Number(event?.duration_hours))
      ? Math.max(1, Number(event.duration_hours)) * 60
      : 120;
  const eventHasEnded = Number.isFinite(eventStartsMs)
    ? checkInNowMs > (eventStartsMs + eventDurationMinutes * 60 * 1000)
    : false;
  const canInviteFriendsFromGroupChat = Boolean(
    eventHasEnded ||
    Number(event?.user_rsvp?.cashback_percent || 0) >= 100 ||
    String(event?.user_rsvp?.attendance || '') === 'attended'
  );
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
    navigate(`/chat/event_${event.id}`, { replace: true });
  }, [event, canAccessGroupChat, navigate, searchParams]);

  useEffect(() => {
    if (!event?.id || !participationState.shouldPoll || isOrganizerForEvent) return undefined;
    let active = true;

    async function refreshParticipationState() {
      try {
        const fresh = await api.getEvent(id, originParams);
        if (!active) return;
        const nextIsFull = Number(fresh?.max_participants || 0) > 0 &&
          Number(fresh?.participants_count || 0) >= Number(fresh?.max_participants || 0);
        const nextState = resolveEventParticipationState({ event: fresh, isFull: nextIsFull });
        const previousStateId = lastParticipationStateRef.current || participationState.id;

        setEvent(fresh);
        lastParticipationStateRef.current = nextState.id;

        if (previousStateId === 'pending' && nextState.id === 'confirmed') {
          showToast('Richiesta approvata: il posto è confermato e il QR è pronto.', 'success');
          markStepByAction('rsvp_confirmed');
        } else if (previousStateId === 'pending' && nextState.id === 'declined') {
          showToast('La richiesta non è stata approvata.', 'info');
        } else if (previousStateId === 'confirmed' && nextState.id === 'checked_in') {
          showToast('Check-in verificato: presenza registrata.', 'success');
        } else if (previousStateId === 'checked_in' && nextState.id === 'completed') {
          showToast('Partecipazione completata: deposito e ricompense aggiornati.', 'success');
        }
      } catch {
        // Il polling è silenzioso: la richiesta resta valida e verrà ritentata.
      }
    }

    lastParticipationStateRef.current = participationState.id;
    const firstRefreshId = window.setTimeout(refreshParticipationState, 1500);
    const intervalId = window.setInterval(refreshParticipationState, 5000);
    return () => {
      active = false;
      window.clearTimeout(firstRefreshId);
      window.clearInterval(intervalId);
    };
  }, [event?.id, id, isOrganizerForEvent, originParams, participationState.id, participationState.shouldPoll, showToast]);

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
    if (!event) return undefined;
    const intervalId = window.setInterval(() => setCheckInNowMs(Date.now()), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [event]);

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

  async function saveAttachedWorkoutPlan() {
    if (!event?.workout_plan || workoutPlanSaving || workoutPlanSaved) return;
    setWorkoutPlanSaving(true);
    try {
      await saveSharedWorkoutPlanToLibrary(event.workout_plan);
      setWorkoutPlanSaved(true);
      showToast('Scheda salvata nelle tue Schede personali', 'success');
    } catch (saveError) {
      showToast(saveError.message || 'Impossibile salvare la scheda', 'error');
    } finally {
      setWorkoutPlanSaving(false);
    }
  }

  if (loading) return <LoadingSkeleton rows={2} />;
  if (error)
    return (
      <EmptyState
        title="Evento non disponibile"
        description={error}
        imageSrc="/images/default-sport.svg"
        imageAlt="Icona sport"
        primaryActionLabel="Apri la mappa"
        onPrimaryAction={() => navigate('/map')}
      />
    );

  const coachInsight = calculateCompatibility(event, coachProfile);
  const routePoints = Array.isArray(event?.route_info?.route_points)
    ? event.route_info.route_points
        .filter((pair) => Array.isArray(pair) && pair.length >= 2)
        .map((pair) => [Number(pair[0]), Number(pair[1])])
        .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
    : [];
  const sportVisual = getSportDetailVisual(event);
  const eventTitle = String(event.title || event.sport_name || 'Evento');
  const durationMinutes = Number(event.duration_minutes || 120);
  const minimumPresenceMinutes = Number(event.minimum_presence_minutes || 45);
  const completionXp = Number(event.completion_xp || (event.is_personal ? 5 : 50));
  const reviewBonusXp = event.is_personal ? 0 : Number(event.review_bonus_xp || 0);
  const totalAvailableXp = completionXp + reviewBonusXp;
  const routeDistance = Number(event.route_info?.distance_km);
  const hasRouteDistance = Number.isFinite(routeDistance) && routeDistance > 0;
  const participantsCount = Number(event.participants_count || 0);
  const maxParticipants = Number(event.max_participants || 0);
  const isFull = maxParticipants > 0 && participantsCount >= maxParticipants;
  const rewardProgressTotal = Math.max(1, maxParticipants || participantsCount || 1);
  const rewardProgressCurrent = Math.min(rewardProgressTotal, Math.max(0, participantsCount));
  const rewardProgressPercent = Math.min(100, (rewardProgressCurrent / rewardProgressTotal) * 100);
  const organizerReliability = Number(event.organizer?.reliability_score || 100);
  const organizerName = String(event.organizer?.name || 'Organizer');
  const organizerInitial = organizerName.slice(0, 1).toUpperCase();
  const audienceLabel = event.audience === 'male' ? 'Maschile' : event.audience === 'female' ? 'Femminile' : 'Misto';
  const mapParams = new URLSearchParams({
    eventId: String(event.id),
    focus: String(event.location_name || event.city || '')
  });
  if (event.lat != null) mapParams.set('lat', String(event.lat));
  if (event.lng != null) mapParams.set('lng', String(event.lng));
  const mapPath = `/map?${mapParams.toString()}`;
  const directionsDestination =
    event.lat != null && event.lng != null
      ? `${event.lat},${event.lng}`
      : String(event.location_name || event.city || '');
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directionsDestination)}`;

  return (
    <div className={styles.page}>
      <LocationPermissionAlert
        hasLocation={hasLocation}
        permission={permission}
        error={locationError}
        requesting={requesting}
        onRequest={requestLocation}
      />
      <main className={styles.eventShell}>
        <article className={styles.detailCard}>
          <header
            className={styles.eventHero}
            style={{ '--event-hero-image': `url("${sportVisual.image}")` }}
          >
            <div className={styles.heroControls}>
              <button type="button" className={`${styles.heroIconButton} ${styles.heroBackButton}`} onClick={() => navigate(-1)} aria-label="Torna indietro">
                <ArrowLeft size={22} aria-hidden="true" />
              </button>
              <div className={styles.heroControlsRight}>
                <button
                  type="button"
                  className={`${styles.heroIconButton} ${event.is_saved ? styles.heroIconButtonActive : ''}`}
                  onClick={toggleSaveAgenda}
                  aria-label={event.is_saved ? 'Rimuovi dai tuoi eventi' : 'Salva nei tuoi eventi'}
                >
                  {event.is_saved ? <BookmarkCheck size={21} aria-hidden="true" /> : <Bookmark size={21} aria-hidden="true" />}
                </button>
                <button type="button" className={`${styles.heroIconButton} ${styles.heroShareButton}`} onClick={shareLink} aria-label="Condividi evento">
                  <Share2 size={21} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className={styles.heroContent}>
              <div className={styles.heroBadges}>
                <span className={styles.heroCategory}>{sportVisual.label}</span>
                {!event.is_personal ? (
                  <span className={styles.heroAttendance}>
                    <Users size={18} aria-hidden="true" />
                    {participantsCount}/{maxParticipants || '∞'} {isFull ? 'FULL' : 'ISCRITTI'}
                  </span>
                ) : null}
              </div>
              <div className={styles.heroText}>
                <div className={styles.heroOrganizer}>
                  <span aria-hidden="true">{organizerInitial}</span>
                  <p>Organizzato da <strong>{organizerName}</strong></p>
                </div>
                <h1>{eventTitle}</h1>
                <p className={styles.heroDescription}>{event.description}</p>
                <div className={styles.heroDate}>
                  <span className={styles.heroDateIcon}><CalendarDays size={21} aria-hidden="true" /></span>
                  <span className={styles.heroDateCopy}>
                    <small>Data evento</small>
                    <strong>{formatEventDay(event.event_datetime)} · {formatEventTime(event.event_datetime)}</strong>
                  </span>
                  <small className={styles.heroDateSport}>• {event.sport_name}</small>
                </div>
              </div>
            </div>
          </header>

          <section className={styles.statGrid} aria-label="Riepilogo evento">
            <div className={styles.statCard}>
              <Clock3 size={22} aria-hidden="true" />
              <strong>{durationMinutes} min</strong>
              <span>Durata</span>
            </div>
            <div className={styles.statCard}>
              {hasRouteDistance ? <Route size={22} aria-hidden="true" /> : <ShieldCheck size={22} aria-hidden="true" />}
              <strong>{hasRouteDistance ? `${routeDistance.toLocaleString('it-IT')} km` : `${minimumPresenceMinutes} min`}</strong>
              <span>{hasRouteDistance ? 'Percorso' : 'Presenza minima'}</span>
            </div>
            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <Trophy size={22} aria-hidden="true" />
              <strong>{totalAvailableXp} PX</strong>
              <span>Ricompensa massima</span>
            </div>
          </section>

          <Card as="section" className={styles.locationCard}>
            <div className={styles.mapStage}>
              {routePoints.length >= 2 ? (
                <MapContainer center={routePoints[0]} zoom={11} className={styles.mapFrame}>
                  <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Polyline positions={routePoints} />
                  <Marker position={routePoints[0]}>
                    <Popup>Partenza: {event.route_info?.from_label || 'Punto di partenza'}</Popup>
                  </Marker>
                  <Marker position={routePoints[routePoints.length - 1]}>
                    <Popup>Arrivo: {event.route_info?.to_label || 'Punto di arrivo'}</Popup>
                  </Marker>
                </MapContainer>
              ) : event.lat != null && event.lng != null ? (
                <MapContainer center={[event.lat, event.lng]} zoom={13} className={styles.mapFrame}>
                  <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[event.lat, event.lng]}>
                    <Popup>{event.location_name}</Popup>
                  </Marker>
                </MapContainer>
              ) : (
                <div className={styles.mapFallback}>
                  <MapPin size={34} aria-hidden="true" />
                  <span>Coordinate non disponibili</span>
                </div>
              )}
            </div>
            <div className={styles.locationBody}>
              <div className={styles.locationHeading}>
                <span className={styles.locationIcon}><MapPin size={20} aria-hidden="true" /></span>
                <div>
                  <h2>{event.location_name || 'Luogo da definire'}</h2>
                  <p>{event.distance_km != null ? `${Number(event.distance_km).toLocaleString('it-IT')} km da te` : event.city || 'Posizione evento'}</p>
                </div>
              </div>
              <div className={styles.locationActions}>
                <Link to={mapPath} className={styles.locationButton}>
                  <MapPin size={18} aria-hidden="true" />
                  Mostra sulla mappa
                </Link>
                <a href={directionsHref} target="_blank" rel="noreferrer" className={`${styles.locationButton} ${styles.locationButtonPrimary}`}>
                  <Navigation size={18} aria-hidden="true" />
                  Portami lì
                </a>
              </div>
            </div>
          </Card>

          {event.workout_plan ? (
            <Card as="section" className={`${styles.workoutPlanCard} ${workoutPlanOpen ? styles.workoutPlanCardOpen : ''}`}>
              <button
                type="button"
                className={styles.workoutPlanToggle}
                aria-expanded={workoutPlanOpen}
                aria-controls={`event-workout-plan-${event.id}`}
                onClick={() => setWorkoutPlanOpen((open) => !open)}
              >
                <span className={styles.workoutPlanIcon}><Dumbbell size={23} aria-hidden="true" /></span>
                <span className={styles.workoutPlanHeading}>
                  <span className={styles.workoutPlanEyebrow}>Scheda allenamento</span>
                  <strong>{event.workout_plan.title}</strong>
                  <small>{event.workout_plan.exercises?.length || 0} esercizi · {event.workout_plan.duration || 60} min</small>
                </span>
                <span className={styles.workoutPlanToggleAction}>
                  <span>{workoutPlanOpen ? 'Nascondi dettagli' : 'Visualizza dettagli'}</span>
                  <ChevronDown
                    size={20}
                    className={workoutPlanOpen ? styles.workoutPlanChevronOpen : ''}
                    aria-hidden="true"
                  />
                </span>
              </button>
              {workoutPlanOpen ? (
                <div id={`event-workout-plan-${event.id}`} className={styles.workoutPlanDetails}>
                  <div className={styles.workoutPlanExercises}>
                    {(event.workout_plan.exercises || []).map((exercise, index) => (
                      <article key={exercise.instanceId || `${exercise.name}-${index}`}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <strong>{exercise.name}</strong>
                          <small>{exercise.sets || 1} serie × {exercise.reps || '10'} ripetizioni</small>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!isOrganizerForEvent && event.is_going ? (
                    <Button
                      type="button"
                      fullWidth
                      icon={workoutPlanSaved ? CheckCircle2 : Bookmark}
                      onClick={saveAttachedWorkoutPlan}
                      disabled={workoutPlanSaving || workoutPlanSaved}
                    >
                      {workoutPlanSaved
                        ? 'Salvata nelle Schede personali'
                        : workoutPlanSaving
                          ? 'Salvataggio...'
                          : 'Salva nelle mie schede'}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ) : null}

          {event.route_info ? (
            <Card subtle className={styles.routeCard}>
              <div className={styles.sectionTitleRow}>
                <span className={styles.sectionIcon}><Route size={20} aria-hidden="true" /></span>
                <div>
                  <p>Percorso</p>
                  <h2>{event.route_info.name || 'Tracciato evento'}</h2>
                </div>
              </div>
              <div className={styles.routeFacts}>
                <span><small>Partenza</small><strong>{event.route_info.from_label || event.location_name}</strong></span>
                <span><small>Arrivo</small><strong>{event.route_info.to_label || event.location_name}</strong></span>
                {hasRouteDistance ? <span><small>Distanza</small><strong>{routeDistance.toLocaleString('it-IT')} km</strong></span> : null}
                {event.route_info.elevation_gain_m ? <span><small>Dislivello</small><strong>+{event.route_info.elevation_gain_m} m</strong></span> : null}
              </div>
            </Card>
          ) : null}

          <Card as="section" className={styles.rewardCard}>
            <div className={styles.rewardHeading}>
              <div>
                <h2>Fino a {totalAvailableXp} PX</h2>
                <p>Ricompensa massima</p>
              </div>
            </div>
            <p className={styles.rewardBreakdown}>
              {event.is_personal
                ? `+${completionXp} PX al completamento del promemoria personale.`
                : reviewBonusXp > 0
                  ? `+${completionXp} PX completamento + ${reviewBonusXp} PX recensione.`
                  : `+${completionXp} PX al completamento della partecipazione.`}
            </p>
            <div className={styles.rewardProgress} aria-label={`${rewardProgressCurrent} di ${rewardProgressTotal} partecipanti registrati`}>
              <span className={styles.rewardProgressTrack}>
                <i style={{ width: `${rewardProgressPercent}%` }} aria-hidden="true" />
              </span>
              <strong>{rewardProgressCurrent} di {rewardProgressTotal} check-in</strong>
              <span>+{completionXp} completamento{reviewBonusXp > 0 ? ` · +${reviewBonusXp} verifica` : ''}</span>
            </div>
            <div className={styles.rewardDeposit}>
              <span>Deposito</span>
              <strong>
                {event.is_personal || event.participation_protection === false
                  ? 'Nessun deposito richiesto'
                  : `${formatCurrencyFromCents(event.deposit_cents)} · protetto`}
              </strong>
            </div>
          </Card>

          <div className={styles.summaryGrid}>
            <Card subtle className={styles.infoCard}>
              <dl className={styles.detailList}>
                <div><dt>Livello</dt><dd>{event.level || 'Aperto'}</dd></div>
                <div><dt>Categoria</dt><dd>{audienceLabel}</dd></div>
                <div><dt>Visibilità</dt><dd>{event.visibility === 'private' ? 'Privato' : 'Pubblico'}</dd></div>
                {!event.is_personal ? <div><dt>Accesso</dt><dd>{event.join_policy === 'approval' ? 'Su richiesta' : 'Aperto a tutti'}</dd></div> : null}
                {!event.is_personal ? <div><dt>Verifica</dt><dd>{event.verification_mode === 'qr' ? 'QR Code' : event.verification_mode === 'gps' ? 'GPS' : 'QR + GPS'}</dd></div> : null}
                <div><dt>Organizer</dt><dd>Affidabilità {organizerReliability}%</dd></div>
              </dl>
            </Card>

            <Card subtle className={styles.organizerCard}>
              <span className={styles.organizerAvatar} aria-hidden="true">{organizerInitial}</span>
              <div className={styles.organizerIdentity}>
                <h2>{organizerName}</h2>
                <div>
                  <i aria-hidden="true" />
                  <span>Affidabilità {organizerReliability}%</span>
                </div>
              </div>
              <Link
                to={`/profile/${event.organizer?.auth_user_id || event.organizer?.id}?event=${event.id}`}
                state={{
                  publicProfile: {
                    id: event.organizer?.auth_user_id || event.organizer?.id,
                    display_name: organizerName,
                    name: organizerName,
                    city: event.city || '',
                    reliability_score: organizerReliability
                  }
                }}
              >
                Vedi profilo pubblico
              </Link>
            </Card>
          </div>

          <Card subtle className={styles.actionCard}>
            <h2 className={styles.actionTitle}>Gestisci la partecipazione</h2>
            {!event.is_personal ? (
              <section
                className={`${styles.participationStateBox} ${styles[`participationState_${participationState.tone}`] || ''}`}
                aria-live="polite"
              >
                <div className={styles.participationStateHeader}>
                  <span className={styles.participationStateIcon} aria-hidden="true">
                    {participationState.id === 'pending' ? <Clock3 size={21} /> :
                      participationState.tone === 'danger' ? <X size={21} /> :
                        participationState.id === 'joinable' ? <UserPlus size={21} /> :
                          <CheckCircle2 size={21} />}
                  </span>
                  <div>
                    <strong>{participationState.title}</strong>
                    <p>{participationState.description}</p>
                  </div>
                  <span className={styles.participationStateBadge}>{participationState.badge}</span>
                </div>

                <ol className={styles.participationSteps} aria-label="Avanzamento partecipazione">
                  {[
                    event.join_policy === 'approval' ? 'Richiesta' : 'Iscrizione',
                    'Confermata',
                    'Check-in',
                    'Completata'
                  ].map((label, index) => {
                    const stepNumber = index + 1;
                    const isReached = stepNumber <= participationState.stepIndex;
                    const isCurrent = stepNumber === participationState.stepIndex;
                    return (
                      <li
                        key={label}
                        className={`${isReached ? styles.participationStepReached : ''} ${isCurrent ? styles.participationStepCurrent : ''}`}
                        aria-current={isCurrent ? 'step' : undefined}
                      >
                        <i aria-hidden="true">{isReached ? '✓' : stepNumber}</i>
                        <span>{label}</span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}
            <div className={styles.primaryParticipationAction}>
              {isOrganizerForEvent && event.is_personal ? (
                <Button
                  type="button"
                  onClick={completePersonalEvent}
                  icon={CheckCircle2}
                  disabled={personalEventBusy || !event.has_passed || event.status === 'completed'}
                >
                  {event.status === 'completed'
                    ? 'Allenamento completato'
                    : personalEventBusy
                      ? 'Registrazione...'
                      : event.has_passed
                        ? `Completa e ottieni +${event.completion_xp || 5} PX`
                        : 'Disponibile al termine'}
                </Button>
              ) : null}
              {!event.is_personal ? (
                <Button
                  type="button"
                  fullWidth
                  variant={participationState.action === 'cancel' || participationState.action === 'none' ? 'secondary' : 'primary'}
                  icon={participationState.action === 'join' ? UserPlus : participationState.action === 'cancel' ? UserMinus : participationState.id === 'pending' ? Clock3 : ShieldCheck}
                  disabled={participationState.action === 'none'}
                  onClick={() => {
                    if (participationState.action === 'join') {
                      setModalOpen(true);
                    } else if (participationState.action === 'cancel') {
                      openCancelDialog();
                    } else if (participationState.action === 'progress') {
                      participationFlowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                >
                  {participationState.actionLabel || participationState.badge}
                </Button>
              ) : null}
            </div>
            <div className={styles.actions}>
              <Button
                type="button"
                variant={event.is_saved ? 'secondary' : 'ghost'}
                onClick={toggleSaveAgenda}
                icon={event.is_saved ? BookmarkCheck : Bookmark}
              >
                {event.is_saved ? 'Salvato nei tuoi eventi' : 'Salva nei tuoi eventi'}
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
              <Button type="button" variant="ghost" onClick={copyDetails} icon={ClipboardCopy}>Copia dettagli</Button>
              <Button type="button" variant="ghost" onClick={shareLink} icon={Share2}>Condividi link</Button>
              {canAccessGroupChat ? (
                <Button type="button" variant="secondary" icon={MessageCircle} onClick={() => navigate(`/chat/event_${event.id}`)}>
                  Apri chat evento
                </Button>
              ) : <span className={styles.disabledAction}><MessageCircle size={23} aria-hidden="true" />Apri chat evento</span>}
              <Link
                className={styles.actionProfileLink}
                to={`/profile/${event.organizer?.auth_user_id || event.organizer?.id}?event=${event.id}`}
                state={{
                  publicProfile: {
                    id: event.organizer?.auth_user_id || event.organizer?.id,
                    display_name: organizerName,
                    name: organizerName,
                    city: event.city || '',
                    reliability_score: organizerReliability
                  }
                }}
              >
                <UserRound size={23} aria-hidden="true" />
                Vedi profilo pubblico
              </Link>
            </div>
          </Card>

          {event.can_confirm_attendance && (
            <Card subtle>
              <h2>Conferma presenza</h2>
              <div className="row">
                <Button type="button" onClick={() => onAttendance('attended')}>Conferma presenza</Button>
                <Button type="button" variant="secondary" onClick={() => onAttendance('no_show')}>Non mi sono presentato</Button>
              </div>
            </Card>
          )}

          {!event.is_personal ? (
            <div ref={participationFlowRef} className={styles.participationFlowAnchor}>
              <EventParticipationFlow
                event={event}
                isOrganizer={isOrganizerForEvent}
                currentUser={currentUser}
                coords={coords}
                requestingLocation={requesting}
                requestLocation={requestLocation}
                showToast={showToast}
                onEventRefresh={reload}
              />
            </div>
          ) : null}

          {event.is_going && String(event?.user_rsvp?.attendance || '') === 'attended' ? (
            <Card subtle className={styles.postWorkoutCard}>
              <h2>Allenamento completato ✅</h2>
              <p className="muted">Ora puoi aggiungere i compagni con cui hai completato l allenamento in questo evento.</p>
              <div className="row">
                <Button type="button" icon={UserPlus} onClick={() => navigate(`/chat/met-people/${event.id}`)}>Aggiungi compagni</Button>
              </div>
            </Card>
          ) : null}

          <Card subtle className={styles.coachCtaCard}>
            {!coachProfile ? (
              <>
                <div className={styles.coachCtaCopy}>
                  <p>Ricevi una valutazione di compatibilità personalizzata per ogni sessione</p>
                  <Button type="button" size="sm" onClick={() => navigate('/coach')}>Attiva Coach</Button>
                </div>
                <span className={styles.coachCtaIcon}><Sparkles size={35} aria-hidden="true" /></span>
              </>
            ) : (
              <div className={styles.coachInsightActive}>
                <div className={styles.metaRow}>
                  <EventBadge label={`${coachInsight.score}% compatibilita`} type="level" />
                  {coachInsight.recommended && <EventBadge label="Consigliato dal Coach" type="premium" />}
                </div>
                <p className="muted">{coachInsight.explanation}</p>
              </div>
            )}
          </Card>

          <Card subtle className={styles.rulesCard}>
            <div className={styles.sectionTitleRow}>
              <span className={styles.sectionIcon}><ShieldCheck size={20} aria-hidden="true" /></span>
              <div>
                <p>Community</p>
                <h2>Regole della sessione</h2>
              </div>
            </div>
            <ul>
              {(event.etiquette || []).map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
          </Card>
        </article>

        {similarEvents.length > 0 ? (
          <section className={styles.list}>
            <div className={styles.listHeading}>
              <p>Continua a muoverti</p>
              <h2>Eventi simili</h2>
            </div>
            <div className={styles.similarGrid}>
              {similarEvents.map((item) => (
                <Card key={item.id} hover className={styles.similarCard}>
                  <span>{item.sport_name}</span>
                  <h3>{item.title || item.location_name}</h3>
                  <p>{item.location_name}</p>
                  <p className="muted">{new Date(item.event_datetime).toLocaleString('it-IT')}</p>
                  <Link to={`/events/${item.id}`}>Apri dettaglio</Link>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <Modal
        open={modalOpen}
        title={event?.join_policy === 'approval' ? 'Richiedi di partecipare' : 'Partecipa alla sessione'}
        onClose={() => {
          if (!rsvpSubmitting) setModalOpen(false);
        }}
        onConfirm={confirmRsvp}
        confirmText={rsvpSubmitting
          ? 'Invio in corso...'
          : event?.join_policy === 'approval'
            ? 'Invia richiesta'
            : 'Blocca deposito e partecipa'}
        confirmDisabled={rsvpSubmitting}
      >
        <label>
          Nome dal profilo
          <input
            value={rsvpForm.name || localProfile.display_name}
            readOnly
            placeholder="Completa il nome nel profilo"
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
        <Card subtle>
          <p>
            <strong>Deposito deciso dall’organizzatore:</strong>{' '}
            {(Number(event?.deposit_cents || 0) / 100).toLocaleString('it-IT', {
              style: 'currency',
              currency: 'EUR'
            })}
          </p>
          <p className="muted">
            {event?.join_policy === 'approval'
              ? `Il deposito verra bloccato soltanto dopo l approvazione. Riceverai quindi il QR personale.`
              : `Viene bloccato nel wallet, non addebitato. Il cashback passa al 60% con il QR e al 100% dopo ${Number(event?.minimum_presence_minutes || 45)} minuti verificati.`}
          </p>
        </Card>
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
                  Eventi
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
                  const isMine = senderUserId === Number(currentUserId);
                  const isOrganizerMessage =
                    (Number.isFinite(Number(event?.organizer?.id)) &&
                      Number(event?.organizer?.id) === senderUserId) ||
                    normalizeName(displayName) === normalizeName(event?.organizer?.name);
                  const initials = String(displayName || 'U').slice(0, 1).toUpperCase();
                  return (
                    <div
                      key={msg.id}
                      className={`${styles.groupChatBubble} ${
                        isMine
                          ? styles.groupChatBubbleMine
                          : styles.groupChatBubbleOther
                      }`}
                    >
                      <button
                        type="button"
                        className={styles.groupChatSenderRow}
                        onClick={
                          isMine
                            ? undefined
                            : () =>
                                openChatParticipantProfile({
                                  userId: senderUserId,
                                  authUserId: msg.sender_auth_user_id || '',
                                  displayName,
                                  avatarUrl
                                })
                        }
                        disabled={isMine}
                        aria-label={!isMine ? `Apri profilo di ${displayName}` : undefined}
                      >
                        <span className={styles.groupChatAvatarWrap}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={`Avatar ${displayName}`} className={styles.groupChatAvatar} />
                          ) : (
                            <span className={styles.groupChatAvatarFallback}>{initials}</span>
                          )}
                          {isOrganizerMessage ? <span className={styles.groupChatCrown}>👑</span> : null}
                        </span>
                        <p className={styles.groupChatSenderName}>{displayName}</p>
                      </button>
                      <p>{msg.text}</p>
                      <small>
                        {new Date(msg.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        {isMine
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
      <ChatUserProfileCard
        open={chatProfileCard.open}
        loading={chatProfileCard.loading}
        profile={chatProfileCard.profile}
        error={chatProfileCard.error}
        onClose={() => setChatProfileCard((current) => ({ ...current, open: false }))}
      />
    </div>
  );
}

export default EventDetailPage;

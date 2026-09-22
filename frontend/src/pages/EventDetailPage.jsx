import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCopy,
  Clock3,
  Dumbbell,
  LockKeyhole,
  MapPin,
  Megaphone,
  MessageCircle,
  Navigation,
  PencilLine,
  Play,
  Route,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Trash2,
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
import EventCard from '../components/EventCard';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { downloadEventIcs } from '../utils/ics';
import { getEventPhaseLabel, getEventTiming } from '../utils/eventLifecycle';
import { useBilling } from '../context/BillingContext';
import PaywallModal from '../components/PaywallModal';
import { calculateCompatibility, getCoachProfile } from '../features/coach/services/coach';
import { useUserLocation } from '../hooks/useUserLocation';
import { getAuthSession } from '../services/authSession';
import { markStepByAction } from '../services/tutorialMode';
import { buildGroupOrganizerWelcome } from '../utils/chatWelcome';
import { ai, getAiSettings } from '../services/ai';
import EventParticipationFlow from '../components/event/EventParticipationFlow';
import PostEventUserFeedback from '../components/event/PostEventUserFeedback';
import ContextInfoButton from '../components/ContextInfoButton';
import { saveSharedWorkoutPlanToLibrary } from '../features/coach/services/personalWorkoutPlansApi';
import {
  resolveEventParticipationState,
  resolveEventPrimaryAction,
  resolveParticipantOutcome
} from '../utils/eventParticipationState';
import {
  EVENT_CAPACITY_MAX_EXTENSION,
  EVENT_DURATION_MAX_EXTENSION_MINUTES,
  canDeleteOwnedEvent,
  getCapacityExtensionOptions,
  getDurationExtensionOptions,
  getEventManagementPolicy
} from '../utils/eventManagementRules';
import { isOutdoorTrackedEvent } from '../utils/outdoorActivity';
import {
  GYM_ENTRY_DAY_PASS,
  GYM_ENTRY_MEMBER,
  GYM_ENTRY_OPTIONS,
  GYM_ENTRY_TRIAL,
  getGymAccessPresentation,
  isGymEvent,
  resolveGymViewerAccess
} from '../utils/eventVenueAccess';
import { getAutomaticMinimumPresenceMinutes } from '../utils/eventCreationRules';
import {
  resolveEventPostSummary,
  resolvePersonalVerificationProgress
} from '../utils/eventPostSummary';
import { getMyProfileVerification } from '../services/profileVerification';
import styles from '../styles/pages/eventDetail.module.css';

const LazyEventMapPreview = lazy(() => import('../components/EventMapPreview'));

function DeferredEventMapPreview(props) {
  const placeholderRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return undefined;
    const placeholder = placeholderRef.current;
    if (!placeholder || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: '480px 0px', threshold: 0.01 }
    );
    observer.observe(placeholder);
    return () => observer.disconnect();
  }, [shouldLoad]);

  const placeholder = (
    <div
      ref={placeholderRef}
      className={`${props.className || ''} ${styles.mapDeferred}`}
      role="status"
      aria-label="Caricamento mappa evento"
    >
      <span>Preparo la mappa…</span>
    </div>
  );

  if (!shouldLoad) return placeholder;

  return (
    <Suspense fallback={placeholder}>
      <LazyEventMapPreview {...props} />
    </Suspense>
  );
}

const RSVP_SKILL_LEVELS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzato' }
];

const EVENT_LEVEL_OPTIONS = [
  { value: 'all', label: 'Aperto a tutti' },
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzato' }
];

const SPORT_DETAIL_VISUALS = [
  {
    pattern: /palestra|fitness|forza|functional|workout|hiit/i,
    image: '/images/hero-palestra-v2.webp',
    label: 'Forza'
  },
  {
    pattern: /padel|tennis|racchetta/i,
    image: '/images/hero-padel-v2.webp',
    label: 'Racchetta'
  },
  {
    pattern: /calcio|calcetto|football|futsal/i,
    image: '/images/hero-calcio-v2.webp',
    label: 'Squadra'
  },
  {
    pattern: /running|corsa|jogging/i,
    image: '/images/hero-running-v2.webp',
    label: 'Running'
  },
  {
    pattern: /bici|bike|cycling|ciclismo|mtb/i,
    image: '/images/hero-bici-v2.webp',
    label: 'Ciclismo'
  },
  {
    pattern: /trekking|trail|hiking|camminata/i,
    image: '/images/hero-trekking-v2.webp',
    label: 'Outdoor'
  }
];

const EVENT_CANCELLATION_REASONS = [
  { value: 'personal', label: 'Motivi personali' },
  { value: 'weather', label: 'Condizioni meteo' },
  { value: 'venue_unavailable', label: 'Luogo non disponibile' },
  { value: 'insufficient_participants', label: 'Partecipanti insufficienti' },
  { value: 'emergency', label: 'Emergenza' },
  { value: 'other', label: 'Altro motivo' }
];

function getCancellationReasonLabel(value) {
  return EVENT_CANCELLATION_REASONS.find((reason) => reason.value === value)?.label || 'Motivo non specificato';
}

function getSportDetailVisual(event) {
  const source = `${event?.sport_name || ''} ${event?.title || ''}`;
  return (
    SPORT_DETAIL_VISUALS.find((item) => item.pattern.test(source)) || {
      image: '/images/hero-sport-default-v2.webp',
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

function formatLifecycleDeadline(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 'orario non disponibile';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date).replaceAll('.', '');
}

function formatLifecycleTimeLeft(deadlineMs, referenceTime = Date.now()) {
  const remainingMinutes = Math.max(0, Math.ceil((Number(deadlineMs) - Number(referenceTime)) / 60000));
  if (!Number.isFinite(remainingMinutes) || remainingMinutes <= 0) return 'scaduta';
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  if (hours >= 24) return `${Math.ceil(hours / 24)} giorni`;
  if (hours > 0) return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${minutes} min`;
}

function formatCurrencyFromCents(value) {
  return (Number(value || 0) / 100).toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR'
  });
}

function hasMeaningfulDescription(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return (text.match(/[\p{L}\p{N}]/gu) || []).length >= 3;
}

function eventSnapshotsMatch(current, next) {
  if (current === next) return true;
  if (!current || !next) return false;
  try {
    return JSON.stringify(current) === JSON.stringify(next);
  } catch {
    return false;
  }
}

function getPrimaryActionIcon(action) {
  if (action?.target === 'join') return UserPlus;
  if (action?.target === 'verify') return ShieldCheck;
  if (action?.target === 'workout' || action?.target === 'outdoor') return Play;
  if (action?.target === 'manage') return Users;
  if (action?.target === 'feedback') return Trophy;
  if (action?.id === 'summary' || action?.id === 'cancelled_summary') return CheckCircle2;
  return ArrowRight;
}

function EventDetailPage() {

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
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { entitlements } = useBilling();

  const [event, setEvent] = useState(null);
  const [similarEvents, setSimilarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpNoteOpen, setRsvpNoteOpen] = useState(false);
  const [creditBlockedOpen, setCreditBlockedOpen] = useState(false);
  const [creditBlockedLoading, setCreditBlockedLoading] = useState(false);
  const [creditBlockedWallet, setCreditBlockedWallet] = useState(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelCountdown, setCancelCountdown] = useState(3);
  const [cancelReady, setCancelReady] = useState(false);
  const [cancelKaboom, setCancelKaboom] = useState(false);
  const [organizerCancelOpen, setOrganizerCancelOpen] = useState(false);
  const [organizerCancelSubmitting, setOrganizerCancelSubmitting] = useState(false);
  const [organizerCancelForm, setOrganizerCancelForm] = useState({ reasonCode: '', note: '', scope: 'single' });
  const [organizerEditOpen, setOrganizerEditOpen] = useState(false);
  const [organizerEditSubmitting, setOrganizerEditSubmitting] = useState(false);
  const [organizerDangerOpen, setOrganizerDangerOpen] = useState(false);
  const [organizerEditForm, setOrganizerEditForm] = useState({
    description: '',
    duration_minutes: 120,
    checkin_grace_minutes: 15,
    max_participants: 2,
    required_level: 'all',
    organizer_notes: '',
    organizer_alert: ''
  });
  const [rsvpForm, setRsvpForm] = useState({
    name: '',
    skill_level: 'beginner',
    note: '',
    gym_access_choice: '',
    participation_fee_cents: 1000
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
  const [participantListOpen, setParticipantListOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [moneyDisputeOpen, setMoneyDisputeOpen] = useState(false);
  const [moneyDisputeSubmitting, setMoneyDisputeSubmitting] = useState(false);
  const [moneyDisputeReason, setMoneyDisputeReason] = useState('');
  const [checkInNowMs, setCheckInNowMs] = useState(() => Date.now());
  const [reviewTargetCount, setReviewTargetCount] = useState(null);
  const [organizerIntro, setOrganizerIntro] = useState({ name: '', bio: '', avatar_url: '' });
  const [localProfile, setLocalProfile] = useState({
    display_name: '',
    avatar_url: '',
    reliability: null,
    sport_profiles: []
  });
  const [profileVerificationStatus, setProfileVerificationStatus] = useState('unverified');
  const [gymViewerAccess, setGymViewerAccess] = useState(null);
  const [gymViewerAccessLoading, setGymViewerAccessLoading] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const [groupChatAiLoading, setGroupChatAiLoading] = useState(false);
  const groupChatBodyRef = useRef(null);
  const participationFlowRef = useRef(null);
  const lastParticipationStateRef = useRef('');
  const {
    coords,
    requesting,
    requestLocation,
    error: locationError,
    originParams
  } = useUserLocation();
  const aiEnabled = getAiSettings().enableLocalAI;

  useEffect(() => {
    setWorkoutPlanOpen(false);
    setParticipantListOpen(false);
    setPeopleOpen(false);
    setActionsOpen(false);
    setRulesOpen(false);
    setReviewTargetCount(null);
    setMoneyDisputeOpen(false);
    setMoneyDisputeReason('');
    setOrganizerCancelOpen(false);
    setOrganizerCancelForm({ reasonCode: '', note: '' });
    setOrganizerEditOpen(false);
    setOrganizerDangerOpen(false);
    setRsvpNoteOpen(false);
    setRsvpForm((current) => ({ ...current, gym_access_choice: '' }));
  }, [event?.id]);

  useEffect(() => {
    if (!event?.id || searchParams.get('manage') !== '1') return;
    const organizerOwned = Boolean(
      event.created_by === 'me' ||
      String(event.organizer?.id || '') === 'me' ||
      String(event.organizer?.id || '') === String(currentUserId) ||
      normalizeName(localProfile.display_name || '') === normalizeName(event.organizer?.name || '')
    );
    if (!organizerOwned) return;
    setOrganizerEditForm({
      description: String(event.description || ''),
      duration_minutes: Number(event.duration_minutes || 120),
      checkin_grace_minutes: Number(event.checkin_grace_minutes || 15),
      max_participants: Number(event.max_participants || 2),
      required_level: String(event.level || 'all'),
      organizer_notes: String(event.organizer_notes || ''),
      organizer_alert: String(event.organizer_alert || '')
    });
    setOrganizerDangerOpen(false);
    setOrganizerEditOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('manage');
    navigate(
      { pathname: location.pathname, search: nextParams.toString(), hash: location.hash },
      { replace: true }
    );
  }, [event, currentUserId, localProfile.display_name, location.hash, location.pathname, navigate, searchParams]);

  useEffect(() => {
    if (!event?.id || !event?.workout_plan || location.hash !== '#workout-plan') return undefined;
    setWorkoutPlanOpen(true);
    const timer = window.setTimeout(() => {
      document.getElementById('workout-plan')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [event?.id, event?.workout_plan, location.hash]);

  useEffect(() => {
    if (!event?.id || location.hash !== '#verify-presence') return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById('verify-presence')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [event?.id, location.hash]);

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

  function openJoinRequestProfile(request) {
    const profileId = String(request?.auth_user_id || request?.user_id || '').trim();
    if (!profileId) {
      showToast('Profilo del partecipante non disponibile', 'error');
      return;
    }

    const displayName = String(request?.display_name || 'Partecipante').trim();
    navigate(`/profile/${profileId}?event=${event?.id || id}`, {
      state: {
        publicProfile: {
          id: profileId,
          auth_user_id: request?.auth_user_id || '',
          user_id: request?.user_id || null,
          display_name: displayName,
          name: displayName,
          avatar_url: String(request?.avatar_url || '').trim(),
          bio: String(request?.bio || '').trim(),
          city: String(request?.city || event?.city || '').trim(),
          reliability_score: Number(request?.reliability_score ?? request?.reliability ?? 0),
          sport_profiles: request?.skill_level
            ? [{ sport_id: event?.sport_id, sport_name: event?.sport_name, level: request.skill_level }]
            : []
        }
      }
    });
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
          avatar_url: String(profile?.avatar_url || '').trim(),
          reliability: Number.isFinite(Number(profile?.reliability ?? profile?.reliability_score))
            ? Number(profile?.reliability ?? profile?.reliability_score)
            : null,
          sport_profiles: Array.isArray(profile?.sport_profiles) ? profile.sport_profiles : []
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
        setLocalProfile({ display_name: '', avatar_url: '', reliability: null, sport_profiles: [] });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getMyProfileVerification()
      .then((summary) => {
        if (active) setProfileVerificationStatus(String(summary?.status || 'unverified'));
      })
      .catch(() => {
        if (active) setProfileVerificationStatus('unverified');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const eventSportId = String(event?.sport_id || '');
    const eventSportName = normalizeName(event?.sport_name || '');
    const matchingSport = localProfile.sport_profiles.find((sport) => (
      (eventSportId && String(sport?.sport_id || sport?.id || '') === eventSportId) ||
      normalizeName(sport?.sport_name || sport?.name || '') === eventSportName
    ));
    const preferredLevel = String(matchingSport?.level || event?.level || 'beginner').toLowerCase();
    const normalizedLevel = RSVP_SKILL_LEVELS.some((item) => item.value === preferredLevel)
      ? preferredLevel
      : 'beginner';
    setRsvpForm((current) => ({
      ...current,
      name: String(localProfile.display_name || current.name || '').trim(),
      skill_level: normalizedLevel
    }));
  }, [event?.level, event?.sport_id, event?.sport_name, localProfile.display_name, localProfile.sport_profiles, modalOpen]);

  useEffect(() => {
    let active = true;
    setCoachProfile(getCoachProfile());
    setLoading(true);
    setError('');
    setSimilarEvents([]);

    api.getEvent(id, originParams)
      .then((eventData) => {
        if (!active) return;
        setEvent(eventData);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, originParams]);

  useEffect(() => {
    if (!event?.id || String(event.id) !== String(id) || event.sport_id == null) return undefined;
    const viewerOwnsEvent = Boolean(
      event.created_by === 'me' ||
      String(event.organizer?.id || '') === 'me' ||
      String(event.organizer?.id || '') === String(currentUserId) ||
      normalizeName(localProfile.display_name || '') === normalizeName(event.organizer?.name || '')
    );
    if (viewerOwnsEvent) {
      setSimilarEvents([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      api.listEvents({
        sortBy: 'popular',
        sport: event.sport_id,
        activeOnly: true,
        limit: 12,
        ...originParams
      })
        .then((allEvents) => {
          if (!active) return;
          setSimilarEvents(
            allEvents
              .filter((item) => {
                if (String(item.id) === String(id)) return false;
                const timing = getEventTiming(item);
                return timing.isMapVisible && timing.canJoin;
              })
              .slice(0, 3)
          );
        })
        .catch(() => {
          if (active) setSimilarEvents([]);
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [currentUserId, event, id, localProfile.display_name, originParams]);

  useEffect(() => {
    let active = true;
    if (!event?.organizer) return undefined;

    const fallbackName = String(event.organizer?.name || 'Organizzatore').trim();
    const organizerRawId = String(event.organizer?.id || '').trim();
    const organizerId = organizerRawId === 'me'
      ? Number(currentUserId)
      : Number(organizerRawId);
    if (!Number.isFinite(organizerId)) {
      setOrganizerIntro({
        name: fallbackName,
        bio: String(event.organizer?.bio || '').trim(),
        avatar_url: String(event.organizer?.avatar_url || '').trim()
      });
      return undefined;
    }

    api.getAccountProfileByUserId(organizerId)
      .then((profile) => {
        if (!active) return;
        setOrganizerIntro({
          name: String(profile?.display_name || fallbackName || 'Organizzatore').trim(),
          bio: String(profile?.bio || event.organizer?.bio || '').trim(),
          avatar_url: String(profile?.avatar_url || event.organizer?.avatar_url || '').trim()
        });
      })
      .catch(() => {
        if (!active) return;
        setOrganizerIntro({
          name: fallbackName,
          bio: String(event.organizer?.bio || '').trim(),
          avatar_url: String(event.organizer?.avatar_url || '').trim()
        });
      });

    return () => {
      active = false;
    };
  }, [
    currentUserId,
    event?.organizer?.avatar_url,
    event?.organizer?.bio,
    event?.organizer?.id,
    event?.organizer?.name
  ]);

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
    if (isGymEvent(event) && !rsvpForm.gym_access_choice) {
      showToast('Scegli come accederai alla palestra', 'error');
      return;
    }
    if (isGymEvent(event) && rsvpForm.gym_access_choice === GYM_ENTRY_TRIAL && gymViewerAccess?.trial_used) {
      showToast('La prima entrata gratuita in questa palestra risulta già utilizzata', 'error');
      return;
    }
    const profileDisplayName = String(localProfile.display_name || '').trim();
    const participantName = String(rsvpForm.name || profileDisplayName || '').trim().slice(0, 40);
    if (participantName.length < 2) {
      showToast('Inserisci il tuo nome per completare il profilo', 'error');
      return;
    }

    setRsvpSubmitting(true);
    try {
      if (profileDisplayName.length < 2) {
        const savedProfile = await api.updateLocalProfile({ display_name: participantName });
        const savedDisplayName = String(savedProfile?.display_name || participantName).trim();
        setLocalProfile((current) => ({
          ...current,
          display_name: savedDisplayName
        }));
        setRsvpForm((current) => ({
          ...current,
          name: savedDisplayName
        }));
      }

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
      if (err?.code === 'PROFILE_VERIFICATION_REQUIRED' || String(err?.message || '').includes('PROFILE_VERIFICATION_REQUIRED')) {
        setModalOpen(false);
        showToast('Verifica il profilo prima di partecipare', 'info');
        navigate('/verify-profile');
        return;
      }
      if (String(err?.message || '').includes('DEPOSIT_REQUIRED')) {
        setModalOpen(false);
        setCreditBlockedOpen(true);
        setCreditBlockedLoading(true);
        setCreditBlockedWallet(null);
        try {
          const wallet = await api.getMoneyWallet();
          const availableCents = Math.max(0, Number(wallet?.available_cents || 0));
          const lockedCents = Math.max(0, Number(wallet?.locked_cents || 0));
          const pendingCents = Math.max(0, Number(wallet?.pending_cents || 0));
          const withdrawableCents = Math.max(0, Number(wallet?.withdrawable_cents || 0));
          setCreditBlockedWallet({
            availableCents,
            lockedCents,
            pendingCents,
            withdrawableCents,
            totalCents: availableCents + lockedCents + pendingCents + withdrawableCents,
            requiredCents: Math.max(0, Number(event?.deposit_cents || 1000))
          });
        } catch {
          // L'errore principale resta quello del deposito; il riepilogo può essere ricaricato dal wallet.
        } finally {
          setCreditBlockedLoading(false);
        }
        return;
      }
      showToast(err.message, 'error');
    } finally {
      setRsvpSubmitting(false);
    }
  }

  async function cancelRsvp() {
    if (!cancelReady) return;
    try {
      const stakeCents = Number(event?.user_rsvp?.stake_cents ?? event?.deposit_cents ?? 0);
      const hasDeposit = event?.participation_protection !== false && stakeCents > 0;
      const result = await api.leaveEvent(id);
      await reload();
      if (!hasDeposit) {
        showToast('Partecipazione annullata. Nessun deposito previsto.', 'success');
      } else if (result?.penalty_applied) {
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

  async function cancelOrganizedEvent() {
    if (!organizerCancelForm.reasonCode || organizerCancelSubmitting) return;
    setOrganizerCancelSubmitting(true);
    try {
      const result = await api.cancelEvent(id, organizerCancelForm);
      await reload();
      setOrganizerCancelOpen(false);
      setActionsOpen(false);
      setGroupChatCanSend(false);
      const refundedCents = Number(result?.refunded_cents || 0);
      const refundedParticipants = Number(result?.refunded_participants || 0);
      showToast(
        event.is_personal
          ? result?.scope === 'series'
            ? `Ricorrenza eliminata · ${Number(result?.cancelled_occurrences || 0)} eventi futuri rimossi.`
            : 'Evento personale eliminato.'
          : refundedCents > 0
          ? `Evento annullato · ${refundedParticipants} ${refundedParticipants === 1 ? 'rimborso eseguito' : 'rimborsi eseguiti'}`
          : 'Evento annullato. I partecipanti sono stati avvisati.',
        'success'
      );
    } catch (cancelError) {
      showToast(cancelError.message || 'Impossibile annullare l evento', 'error');
    } finally {
      setOrganizerCancelSubmitting(false);
    }
  }

  function openOrganizerEditDialog() {
    if (!event) return;
    setOrganizerEditForm({
      description: String(event.description || ''),
      duration_minutes: Number(event.duration_minutes || 120),
      checkin_grace_minutes: Number(event.checkin_grace_minutes || 15),
      max_participants: Number(event.max_participants || 2),
      required_level: String(event.level || 'all'),
      organizer_notes: String(event.organizer_notes || ''),
      organizer_alert: String(event.organizer_alert || '')
    });
    setOrganizerDangerOpen(false);
    setOrganizerEditOpen(true);
  }

  async function saveOrganizerEventChanges() {
    if (!event || organizerEditSubmitting) return;
    const policy = getEventManagementPolicy(event);
    const description = String(organizerEditForm.description || '').trim();
    const durationMinutes = Number(organizerEditForm.duration_minutes);
    const graceMinutes = Number(organizerEditForm.checkin_grace_minutes);
    const maxParticipants = Number(organizerEditForm.max_participants);
    const requiredLevel = String(organizerEditForm.required_level || 'all');
    const organizerNotes = String(organizerEditForm.organizer_notes || '').trim();
    const organizerAlert = String(organizerEditForm.organizer_alert || '').trim();
    const currentDuration = Number(event.duration_minutes || 120);
    const currentGrace = Number(event.checkin_grace_minutes || 15);
    const currentCapacity = Number(event.max_participants || 2);
    const descriptionChanged = description !== String(event.description || '').trim();
    const durationChanged = durationMinutes !== currentDuration;
    const graceChanged = !event.is_personal && graceMinutes !== currentGrace;
    const capacityChanged = maxParticipants !== currentCapacity;
    const levelChanged = requiredLevel !== String(event.level || 'all');
    const notesChanged = organizerNotes !== String(event.organizer_notes || '').trim();
    const alertChanged = organizerAlert !== String(event.organizer_alert || '').trim();

    if (description.length > 0 && description.length < 20) {
      showToast('La descrizione deve avere almeno 20 caratteri oppure restare vuota', 'error');
      return;
    }
    if (descriptionChanged && !policy.canEditDescription) {
      showToast('La descrizione non è più modificabile', 'error');
      return;
    }
    if (durationChanged && !policy.canEditDuration) {
      showToast('La durata è modificabile fino a 2 ore prima', 'error');
      return;
    }
    if (
      durationChanged &&
      (
        durationMinutes < currentDuration ||
        durationMinutes > currentDuration + EVENT_DURATION_MAX_EXTENSION_MINUTES ||
        (durationMinutes - currentDuration) % 15 !== 0
      )
    ) {
      showToast(`Puoi soltanto prolungare l’allenamento fino a ${currentDuration + EVENT_DURATION_MAX_EXTENSION_MINUTES} minuti`, 'error');
      return;
    }
    if (graceChanged && !policy.canEditTolerance) {
      showToast('La tolleranza ritardi non è più modificabile', 'error');
      return;
    }
    if (graceChanged && graceMinutes < currentGrace) {
      showToast('La tolleranza ritardi può essere soltanto ampliata', 'error');
      return;
    }
    if ((capacityChanged || levelChanged) && !policy.canEditParticipantSettings) {
      showToast('Partecipanti e livello sono modificabili fino a 2 ore prima', 'error');
      return;
    }
    if (notesChanged && !policy.canEditDescription) {
      showToast('Le indicazioni sono modificabili fino all’inizio', 'error');
      return;
    }
    if (alertChanged && !policy.canSendOrganizerAlert) {
      showToast('Non puoi più inviare aggiornamenti per questo evento', 'error');
      return;
    }
    if (
      !Number.isInteger(maxParticipants) ||
      maxParticipants < currentCapacity ||
      maxParticipants > currentCapacity + EVENT_CAPACITY_MAX_EXTENSION
    ) {
      showToast(`Puoi soltanto ampliare i posti fino a ${currentCapacity + EVENT_CAPACITY_MAX_EXTENSION}`, 'error');
      return;
    }
    if (organizerNotes.length > 800 || organizerAlert.length > 280) {
      showToast('Riduci il testo prima di salvare', 'error');
      return;
    }

    setOrganizerEditSubmitting(true);
    try {
      const result = await api.updateManagedEvent(event.id, {
        description,
        duration_minutes: durationMinutes,
        checkin_grace_minutes: event.is_personal ? 0 : graceMinutes,
        max_participants: maxParticipants,
        required_level: requiredLevel,
        organizer_notes: organizerNotes,
        organizer_alert: organizerAlert,
        cover_image_url: String(event.cover_image_url || ''),
        scheda_id: event.scheda_id || null,
        workout_plan: event.workout_plan || null
      });
      if (result?.event) setEvent(result.event);
      else await reload();
      setOrganizerEditOpen(false);
      showToast(
        (result?.changes || []).length > 0
          ? event.is_personal
            ? 'Evento personale aggiornato.'
            : 'Evento aggiornato. I partecipanti sono stati avvisati.'
          : 'Nessuna modifica da salvare.',
        'success'
      );
    } catch (editError) {
      showToast(editError.message || 'Impossibile aggiornare l evento', 'error');
    } finally {
      setOrganizerEditSubmitting(false);
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
  const isParticipantView = Boolean(event && !event.is_personal && !isOrganizerForEvent);

  useEffect(() => {
    let active = true;
    setGymViewerAccess(null);
    if (!event?.id || !isGymEvent(event) || isOrganizerForEvent) {
      setGymViewerAccessLoading(false);
      return undefined;
    }

    setGymViewerAccessLoading(true);
    api.getMyGymAccess(event.id)
      .then((access) => {
        if (!active) return;
        setGymViewerAccess(access || null);
        if (access?.selected_choice) {
          setRsvpForm((current) => ({
            ...current,
            gym_access_choice: current.gym_access_choice || access.selected_choice
          }));
        }
      })
      .catch(() => {
        if (active) setGymViewerAccess(null);
      })
      .finally(() => {
        if (active) setGymViewerAccessLoading(false);
      });

    return () => {
      active = false;
    };
  }, [event?.id, event?.venue_type, isOrganizerForEvent]);

  useEffect(() => {
    if (!event?.id) return;
    setPeopleOpen(isOrganizerForEvent);
  }, [event?.id, isOrganizerForEvent]);

  const participationIsFull = Number(event?.max_participants || 0) > 0 &&
    Number(event?.participants_count || 0) >= Number(event?.max_participants || 0);
  const participationState = resolveEventParticipationState({
    event,
    isOrganizer: isOrganizerForEvent,
    isFull: participationIsFull
  });
  const canAccessGroupChat = Boolean(participationState.canAccessChat || isOrganizerForEvent);
  const eventStartsMs = Date.parse(event?.event_datetime || '');
  const eventTiming = getEventTiming(event || {}, checkInNowMs);
  const eventHasEnded = eventTiming.hasEnded;
  const participantOutcome = resolveParticipantOutcome(event);
  const hasOutdoorTracking = isOutdoorTrackedEvent(event);
  const baseEventPrimaryAction = resolveEventPrimaryAction({
    event,
    isOrganizer: isOrganizerForEvent,
    isFull: participationIsFull,
    referenceTime: checkInNowMs
  });
  const participantGymAccessState = isParticipantView && isGymEvent(event)
    ? resolveGymViewerAccess(
        event,
        gymViewerAccess?.membership_verified ? { status: 'active' } : null,
        Boolean(gymViewerAccess?.trial_used),
        rsvpForm.gym_access_choice || gymViewerAccess?.selected_choice
      )
    : gymViewerAccess;
  const participantGymAccess = getGymAccessPresentation(event, participantGymAccessState);
  const eventPrimaryAction = baseEventPrimaryAction.target === 'feedback' && !(reviewTargetCount > 0)
    ? {
        id: 'summary',
        label: 'Vedi riepilogo',
        target: 'event',
        disabled: false,
        tone: 'neutral'
      }
    : baseEventPrimaryAction;
  const EventPrimaryActionIcon = getPrimaryActionIcon(eventPrimaryAction);
  const canInviteFriendsFromGroupChat = Boolean(
    participantOutcome.id === 'completed'
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

        setEvent((current) => eventSnapshotsMatch(current, fresh) ? current : fresh);
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
    const refreshIntervalMs = participationState.id === 'pending' ? 5000 : 10000;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshParticipationState();
    }, refreshIntervalMs);
    return () => {
      active = false;
      window.clearTimeout(firstRefreshId);
      window.clearInterval(intervalId);
    };
  }, [event?.id, id, isOrganizerForEvent, originParams, participationState.id, participationState.shouldPoll, showToast]);

  useEffect(() => {
    if (!event?.id || searchParams.get('action') !== 'join' || eventPrimaryAction.target !== 'join') return;
    setModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('action');
    navigate(
      { pathname: location.pathname, search: nextParams.toString(), hash: location.hash },
      { replace: true }
    );
  }, [event?.id, eventPrimaryAction.target, location.hash, location.pathname, navigate, searchParams]);

  useEffect(() => {
    if (!event?.id || !['#organizer-controls', '#post-event-feedback', '#event-summary'].includes(location.hash)) return undefined;
    const targetId = location.hash.slice(1);
    if (targetId === 'organizer-controls') setPeopleOpen(true);
    const timer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [event?.id, location.hash]);

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

  function handlePrimaryEventAction() {
    if (!event?.id || eventPrimaryAction.disabled) return;
    switch (eventPrimaryAction.target) {
      case 'join':
        setModalOpen(true);
        return;
      case 'verify':
        navigate(`/agenda?verifyEvent=${encodeURIComponent(String(event.id))}`);
        return;
      case 'workout':
        navigate(`/events/${event.id}/workout`);
        return;
      case 'outdoor':
        navigate(`/events/${event.id}/activity`);
        return;
      case 'manage':
        setPeopleOpen(true);
        window.setTimeout(() => {
          document.getElementById('organizer-controls')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
        return;
      case 'feedback':
        document.getElementById('post-event-feedback')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      case 'event':
      default: {
        const summary = document.getElementById('event-summary');
        if (summary) summary.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
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

  async function submitMoneyDispute() {
    const reason = String(moneyDisputeReason || '').trim();
    if (reason.length < 5 || moneyDisputeSubmitting) return;
    setMoneyDisputeSubmitting(true);
    try {
      const dispute = await api.openEventMoneyDispute(event.id, reason);
      setEvent((current) => current ? {
        ...current,
        money_dispute: dispute,
        money_settlement: current.money_settlement ? {
          ...current.money_settlement,
          status: 'disputed'
        } : current.money_settlement
      } : current);
      setMoneyDisputeOpen(false);
      setMoneyDisputeReason('');
      showToast('Contestazione inviata al centro di controllo', 'success');
    } catch (disputeError) {
      showToast(disputeError.message || 'Impossibile inviare la contestazione', 'error');
    } finally {
      setMoneyDisputeSubmitting(false);
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
  const storedRoutePoints = Array.isArray(event?.route_info?.route_points)
    ? event.route_info.route_points
        .filter((pair) => Array.isArray(pair) && pair.length >= 2)
        .map((pair) => [Number(pair[0]), Number(pair[1])])
        .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
    : [];
  const routeEndpointPoints = [
    [event?.route_info?.from_lat, event?.route_info?.from_lng],
    [event?.route_info?.to_lat, event?.route_info?.to_lng]
  ]
    .filter((pair) => pair.every((value) => value != null && value !== '' && Number.isFinite(Number(value))))
    .map((pair) => pair.map(Number));
  const routePoints = storedRoutePoints.length >= 2 ? storedRoutePoints : routeEndpointPoints;
  const sportVisual = getSportDetailVisual(event);
  const eventTitle = String(event.title || event.sport_name || 'Evento');
  const gymAccess = getGymAccessPresentation(event, isParticipantView ? participantGymAccessState : null);
  const eventDescription = String(event.description || '').trim();
  const showHeroDescription = hasMeaningfulDescription(eventDescription);
  const showHeroDateSport = normalizeName(eventTitle) !== normalizeName(event.sport_name);
  const durationMinutes = Number(event.duration_minutes || 120);
  const eventManagementPolicy = getEventManagementPolicy(event, checkInNowMs);
  const organizerEditDescription = String(organizerEditForm.description || '').trim();
  const organizerEditDescriptionValid = organizerEditDescription.length === 0 || organizerEditDescription.length >= 20;
  const organizerDurationOptions = getDurationExtensionOptions(durationMinutes);
  const organizerEditCapacityMinimum = Number(event.max_participants || 2);
  const organizerCapacityOptions = getCapacityExtensionOptions(organizerEditCapacityMinimum);
  const organizerEditCapacityValid = Number.isInteger(Number(organizerEditForm.max_participants)) &&
    Number(organizerEditForm.max_participants) >= organizerEditCapacityMinimum &&
    Number(organizerEditForm.max_participants) <= organizerEditCapacityMinimum + EVENT_CAPACITY_MAX_EXTENSION;
  const organizerEditHasChanges = Boolean(
    organizerEditDescription !== String(event.description || '').trim() ||
    Number(organizerEditForm.duration_minutes) !== durationMinutes ||
    (!event.is_personal && Number(organizerEditForm.checkin_grace_minutes) !== Number(event.checkin_grace_minutes)) ||
    Number(organizerEditForm.max_participants) !== Number(event.max_participants) ||
    String(organizerEditForm.required_level || '') !== String(event.level || 'all') ||
    String(organizerEditForm.organizer_notes || '').trim() !== String(event.organizer_notes || '').trim() ||
    String(organizerEditForm.organizer_alert || '').trim() !== String(event.organizer_alert || '').trim()
  );
  const minimumPresenceMinutes = Number(event.minimum_presence_minutes || 45);
  const organizerEditMinimumPresenceMinutes = getAutomaticMinimumPresenceMinutes(
    organizerEditForm.duration_minutes,
    { isPersonal: Boolean(event.is_personal) }
  );
  const organizerEditChangeItems = [];
  if (organizerEditDescription !== String(event.description || '').trim()) {
    organizerEditChangeItems.push({ label: 'Descrizione', before: 'Attuale', after: 'Aggiornata' });
  }
  if (String(organizerEditForm.organizer_notes || '').trim() !== String(event.organizer_notes || '').trim()) {
    organizerEditChangeItems.push({ label: 'Indicazioni', before: 'Attuali', after: 'Aggiornate' });
  }
  if (Number(organizerEditForm.duration_minutes) !== durationMinutes) {
    organizerEditChangeItems.push({
      label: 'Durata',
      before: `${durationMinutes} min`,
      after: `${organizerEditForm.duration_minutes} min`
    });
  }
  if (!event.is_personal && Number(organizerEditForm.checkin_grace_minutes) !== Number(event.checkin_grace_minutes)) {
    organizerEditChangeItems.push({
      label: 'Tolleranza',
      before: `${event.checkin_grace_minutes} min`,
      after: `${organizerEditForm.checkin_grace_minutes} min`
    });
  }
  if (Number(organizerEditForm.max_participants) !== Number(event.max_participants)) {
    organizerEditChangeItems.push({
      label: 'Posti',
      before: String(event.max_participants),
      after: String(organizerEditForm.max_participants)
    });
  }
  if (String(organizerEditForm.required_level || '') !== String(event.level || 'all')) {
    organizerEditChangeItems.push({
      label: 'Livello',
      before: EVENT_LEVEL_OPTIONS.find((option) => option.value === String(event.level || 'all'))?.label || 'Attuale',
      after: EVENT_LEVEL_OPTIONS.find((option) => option.value === organizerEditForm.required_level)?.label || 'Aggiornato'
    });
  }
  if (String(organizerEditForm.organizer_alert || '').trim() !== String(event.organizer_alert || '').trim()) {
    organizerEditChangeItems.push({ label: 'Avviso urgente', before: 'Attuale', after: 'Aggiornato' });
  }
  const completionXp = Number(event.completion_xp || (event.is_personal ? 5 : 50));
  const reviewBonusXp = event.is_personal ? 0 : Number(event.review_bonus_xp || 0);
  const totalAvailableXp = completionXp + reviewBonusXp;
  const routeDistance = Number(event.route_info?.distance_km);
  const hasRouteDistance = Number.isFinite(routeDistance) && routeDistance > 0;
  const routeElevation = Number(event.route_info?.elevation_gain_m);
  const hasRouteElevation = Number.isFinite(routeElevation) && routeElevation > 0;
  const participantsCount = Number(event.participants_count || 0);
  const maxParticipants = Number(event.max_participants || 0);
  const rewardProgress = resolvePersonalVerificationProgress(event);
  const organizerReliability = Number(event.organizer?.reliability_score || 100);
  const organizerName = String(organizerIntro.name || event.organizer?.name || 'Organizer');
  const organizerInitial = organizerName.slice(0, 1).toUpperCase();
  const organizerAvatarUrl = String(organizerIntro.avatar_url || event.organizer?.avatar_url || '').trim();
  const organizerBio = String(organizerIntro.bio || event.organizer?.bio || '').trim();
  const organizerProfileId = event.organizer?.auth_user_id || event.organizer?.id;
  const organizerProfileState = {
    publicProfile: {
      id: organizerProfileId,
      display_name: organizerName,
      name: organizerName,
      bio: organizerBio,
      avatar_url: organizerAvatarUrl,
      city: event.city || '',
      reliability_score: organizerReliability
    }
  };
  const audienceLabel = event.audience === 'male' ? 'Maschile' : event.audience === 'female' ? 'Femminile' : 'Misto';
  const mapParams = new URLSearchParams({
    eventId: String(event.id),
    focus: String(event.location_name || event.city || '')
  });
  if (event.lat != null) mapParams.set('lat', String(event.lat));
  if (event.lng != null) mapParams.set('lng', String(event.lng));
  const mapPath = `/map?${mapParams.toString()}`;
  const isMappedOutdoorRoute = hasOutdoorTracking && routePoints.length >= 2;
  const runningPaceMinutes = isMappedOutdoorRoute && /running|corsa|jogging/i.test(String(event.sport_name || '')) && hasRouteDistance
    ? durationMinutes / routeDistance
    : null;
  const runningPaceSeconds = Number.isFinite(runningPaceMinutes) ? Math.round(runningPaceMinutes * 60) : null;
  const runningPaceLabel = Number.isFinite(runningPaceSeconds)
    ? `${Math.floor(runningPaceSeconds / 60)}'${String(runningPaceSeconds % 60).padStart(2, '0')}\"/km`
    : null;
  const trekkingDifficulty = isMappedOutdoorRoute
    && (hasRouteDistance || hasRouteElevation)
    && /trekking|trail|hiking|camminata/i.test(String(event.sport_name || ''))
    ? (routeDistance > 12 || routeElevation > 650 ? 'Impegnativo' : routeDistance > 6 || routeElevation > 250 ? 'Intermedio' : 'Facile')
    : null;
  const routeMapSummary = isMappedOutdoorRoute
    ? [
        hasRouteDistance ? { label: 'Distanza', value: `${routeDistance.toLocaleString('it-IT')} km` } : null,
        hasRouteElevation
          ? { label: 'Dislivello', value: `+${routeElevation.toLocaleString('it-IT')} m` }
          : runningPaceLabel
            ? { label: 'Passo', value: runningPaceLabel }
            : trekkingDifficulty
              ? { label: 'Difficoltà', value: trekkingDifficulty }
              : null,
        { label: 'Durata', value: `${durationMinutes} min` }
      ].filter(Boolean)
    : [];
  const routeMapHref = isMappedOutdoorRoute && /^https?:\/\//i.test(String(event.route_info?.map_url || ''))
    ? String(event.route_info.map_url)
    : mapPath;
  const routeMapIsExternal = /^https?:\/\//i.test(routeMapHref);
  const routeStart = isMappedOutdoorRoute ? routePoints[0] : null;
  const directionsDestination =
    routeStart
      ? `${routeStart[0]},${routeStart[1]}`
      : event.lat != null && event.lng != null
      ? `${event.lat},${event.lng}`
      : String(event.location_name || event.city || '');
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directionsDestination)}`;
  const participantPreview = Array.from(
    new Set(
      (Array.isArray(event.participants_preview) ? event.participants_preview : [])
        .map((name) => String(name || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 5);
  const eventIsCancelled = event.status === 'cancelled';
  const isClosedEvent = Boolean(!eventIsCancelled && (event.status === 'completed' || event.has_passed || eventHasEnded));
  const isArchivedEvent = eventTiming.lifecycleState === 'archived';
  const moneySettlementStatus = String(event.money_settlement?.status || '').toLowerCase();
  const moneyDisputeStatus = String(event.money_dispute?.status || '').toLowerCase();
  const moneyDisputePending = Boolean(moneyDisputeStatus === 'open' || moneySettlementStatus === 'disputed');
  const hasSettlementReady = Boolean(event.money_settlement?.id);
  const canOpenMoneyDispute = Boolean(
    isClosedEvent &&
    !event.is_personal &&
    !moneyDisputePending &&
    hasSettlementReady &&
    moneySettlementStatus === 'pending' &&
    eventTiming.isFinancialReviewOpen &&
    (isOrganizerForEvent || event.user_rsvp)
  );
  const postEventStateLabel = moneyDisputePending
    ? 'Contestazione inviata · regolamento sospeso'
    : eventTiming.isPostEventReadOnly
      ? 'Chiusura definitiva · sola lettura'
      : isArchivedEvent
        ? `Archiviato · verifica economica ancora aperta per ${formatLifecycleTimeLeft(eventTiming.financialReviewEndsAtMs, checkInNowMs)}`
        : `Azioni post-evento disponibili per ${formatLifecycleTimeLeft(eventTiming.archiveAtMs, checkInNowMs)}`;
  const canCancelOrganizedEvent = canDeleteOwnedEvent(event, {
    isOwner: isOrganizerForEvent,
    referenceTime: checkInNowMs
  });
  const cancellationIsLatePreview = Boolean(
    Number.isFinite(eventStartsMs) && eventStartsMs < Date.now() + 24 * 60 * 60 * 1000
  );
  const refundableParticipantsCount = Math.max(0, Number(event.refundable_participants_count || 0));
  const refundableDepositCents = Math.max(0, Number(event.refundable_deposit_cents || 0));
  const participantWasPresent = participantOutcome.id === 'completed';
  const participantWasNoShow = participantOutcome.id === 'no_show';
  const hasClosedViewerParticipation = Boolean(event.user_rsvp);
  const recordedPresenceMinutes = Number(
    event.user_rsvp?.elapsed_minutes ?? event.user_rsvp?.presence_minutes
  );
  const closedPresenceMinutes = Number.isFinite(recordedPresenceMinutes)
    ? Math.max(0, Math.min(durationMinutes, Math.round(recordedPresenceMinutes)))
    : participantWasPresent
      ? minimumPresenceMinutes
      : 0;
  const closedEarnedXp = Number(
    event.user_rsvp?.earned_xp ??
      event.user_rsvp?.xp_earned ??
      event.user_rsvp?.awarded_xp ??
      (participantWasPresent
        ? completionXp + (event.user_rsvp?.review_bonus_awarded ? reviewBonusXp : 0)
        : 0)
  );
  const postEventSummary = resolveEventPostSummary(event);
  const closedPresentCount = postEventSummary.presentCount;
  const closedNoShowCount = postEventSummary.noShowCount;
  const closedTotalCount = postEventSummary.totalCount;
  const closedAttendanceLabel = participantWasPresent
    ? 'Presente'
    : participantWasNoShow
      ? 'No-show'
      : participantOutcome.id === 'requested'
        ? 'Richiesta non accettata'
        : participantOutcome.id === 'none'
          ? 'Non iscritto'
          : 'Presenza non verificata';
  const reliabilityImpactLabel = participantWasPresent
    ? 'Positivo'
    : participantWasNoShow
      ? 'Negativo'
      : 'Neutro';
  const checkInWindowLabel = eventTiming.checkInOpensAtMs != null && eventTiming.checkInClosesAtMs != null
    ? `${formatEventTime(eventTiming.checkInOpensAtMs)} – ${formatEventTime(eventTiming.checkInClosesAtMs)}`
    : 'Orario non disponibile';
  const checkInStatusLabel = getEventPhaseLabel(eventTiming);
  const canOpenAgendaCheckIn = Boolean(
    isOrganizerForEvent ||
    ['confirmed', 'checked_in', 'completed'].includes(participationState.id)
  );
  const showParticipantStickyAction = Boolean(
    isParticipantView &&
    !eventIsCancelled &&
    eventPrimaryAction.target !== 'event'
  );

  return (
    <div className={`${styles.page} ${isParticipantView ? styles.participantPage : ''}`}>
      <main className={styles.eventShell}>
        <article className={styles.detailCard}>
          <header
            className={styles.eventHero}
            style={{ '--event-hero-image': `url("${event.cover_image_url || sportVisual.image}")` }}
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
              </div>
              <div className={styles.heroText}>
                <div className={styles.heroOrganizer}>
                  <span aria-hidden="true">{organizerInitial}</span>
                  <p>Organizzato da <strong>{organizerName}</strong></p>
                </div>
                <h1>{eventTitle}</h1>
                {showHeroDescription ? <p className={styles.heroDescription}>{eventDescription}</p> : null}
                <div className={styles.heroDate}>
                  <span className={styles.heroDateIcon}><CalendarDays size={21} aria-hidden="true" /></span>
                  <span className={styles.heroDateCopy}>
                    <small>Data evento</small>
                    <strong>{formatEventDay(event.event_datetime)} · {formatEventTime(event.event_datetime)}</strong>
                  </span>
                  {showHeroDateSport ? <small className={styles.heroDateSport}>• {event.sport_name}</small> : null}
                </div>
              </div>
            </div>
          </header>

          {eventIsCancelled ? (
            <Card as="section" className={styles.cancelledEventBanner}>
              <span className={styles.cancelledEventIcon}><Ban size={23} aria-hidden="true" /></span>
              <div>
                <p>Evento annullato</p>
                <h2>{getCancellationReasonLabel(event.cancellation_reason)}</h2>
                <span>
                  {event.cancellation_note || 'Le iscrizioni sono chiuse, i QR sono stati disattivati e la chat resta in sola lettura.'}
                </span>
              </div>
              <strong>{event.cancelled_at ? new Date(event.cancelled_at).toLocaleDateString('it-IT') : 'Annullato'}</strong>
            </Card>
          ) : null}

          {!eventIsCancelled && event.organizer_alert ? (
            <Card as="section" className={styles.organizerAlertBanner}>
              <span><Megaphone size={20} aria-hidden="true" /></span>
              <div>
                <small>Aggiornamento organizzatore</small>
                <strong>{event.organizer_alert}</strong>
              </div>
            </Card>
          ) : null}

          {!eventIsCancelled && event.organizer_notes ? (
            <Card as="section" className={styles.organizerNotesBanner}>
              <span><MapPin size={19} aria-hidden="true" /></span>
              <div>
                <small>Indicazioni pratiche</small>
                <p>{event.organizer_notes}</p>
              </div>
            </Card>
          ) : null}

          <Card as="section" className={styles.locationCard}>
            <div className={styles.mapStage}>
              {(routePoints.length >= 2 || (event.lat != null && event.lng != null)) ? (
                <DeferredEventMapPreview
                  event={event}
                  routePoints={routePoints}
                  routeSummary={routeMapSummary}
                  expandable={isMappedOutdoorRoute}
                  className={`${styles.mapFrame} ${isMappedOutdoorRoute ? styles.mapFrameRoute : ''}`}
                />
              ) : (
                <div className={styles.mapFallback}>
                  <MapPin size={34} aria-hidden="true" />
                  <span>Coordinate non disponibili</span>
                </div>
              )}
              <div className={styles.locationActions}>
                {routeMapIsExternal ? (
                  <a href={routeMapHref} target="_blank" rel="noreferrer" className={styles.locationButton}>
                    <Route size={18} aria-hidden="true" />
                    Mappa completa
                  </a>
                ) : (
                  <Link to={routeMapHref} className={styles.locationButton}>
                    {isMappedOutdoorRoute ? <Route size={18} aria-hidden="true" /> : <MapPin size={18} aria-hidden="true" />}
                    {isMappedOutdoorRoute ? 'Mappa completa' : 'Apri mappa'}
                  </Link>
                )}
                <a href={directionsHref} target="_blank" rel="noreferrer" className={`${styles.locationButton} ${styles.locationButtonPrimary}`}>
                  <Navigation size={18} aria-hidden="true" />
                  {isMappedOutdoorRoute ? 'Alla partenza' : 'Indicazioni'}
                </a>
              </div>
            </div>
            <div className={`${styles.locationBody} ${gymAccess ? styles.locationBodyCompact : ''}`}>
              {!gymAccess ? (
                <div className={styles.locationHeading}>
                  <span className={styles.locationIcon}><MapPin size={20} aria-hidden="true" /></span>
                  <div>
                    <h2>{event.location_name || 'Luogo da definire'}</h2>
                    <p>{event.distance_km != null ? `${Number(event.distance_km).toLocaleString('it-IT')} km da te` : event.city || 'Posizione evento'}</p>
                  </div>
                </div>
              ) : null}
              {gymAccess ? (
                <div className={`${styles.gymAccessNotice} ${styles[`gymAccessNotice_${gymAccess.tone || 'neutral'}`] || ''}`} role="note">
                  <span><LockKeyhole size={19} aria-hidden="true" /></span>
                  <div>
                    <small>ACCESSO · {event.location_name || 'PALESTRA'}</small>
                    <strong>{gymViewerAccessLoading && isParticipantView ? 'Verifica accesso…' : gymAccess.label}</strong>
                    <p>{gymViewerAccessLoading && isParticipantView ? 'Controlliamo automaticamente il tuo abbonamento con questa struttura.' : gymAccess.description}</p>
                  </div>
                </div>
              ) : null}
              {event.route_info ? (
                <div className={styles.routeInlineFacts} aria-label="Riepilogo percorso">
                  <span><small>Partenza</small><strong>{event.route_info.from_label || event.location_name}</strong></span>
                  <span><small>Arrivo</small><strong>{event.route_info.to_label || event.location_name}</strong></span>
                  {!isMappedOutdoorRoute && hasRouteDistance ? <span><small>Distanza</small><strong>{routeDistance.toLocaleString('it-IT')} km</strong></span> : null}
                  {!isMappedOutdoorRoute && hasRouteElevation ? <span><small>Dislivello</small><strong>+{routeElevation.toLocaleString('it-IT')} m</strong></span> : null}
                </div>
              ) : null}
            </div>
          </Card>

          <section className={styles.statGrid} aria-label="Riepilogo evento">
            <div className={styles.statCard}>
              <Clock3 size={22} aria-hidden="true" />
              <strong>{durationMinutes} min</strong>
              <span>Durata</span>
            </div>
            <div className={styles.statCard}>
              <ShieldCheck size={22} aria-hidden="true" />
              <strong>{minimumPresenceMinutes} min</strong>
              <span>Presenza minima</span>
            </div>
            <div className={styles.statCard}>
              <CircleDollarSign size={22} aria-hidden="true" />
              <strong>
                {event.is_personal || event.participation_protection === false
                  ? '0 €'
                  : formatCurrencyFromCents(event.deposit_cents)}
              </strong>
              <span>Deposito</span>
            </div>
            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <Trophy size={22} aria-hidden="true" />
              <strong>{totalAvailableXp} PX</strong>
              <span>Ricompensa</span>
            </div>
          </section>

          {isParticipantView ? (
            <Card subtle className={`${styles.actionCard} ${styles.participantPriorityCard}`}>
              <div className={styles.participantPriorityHeading}>
                <h2>La tua partecipazione</h2>
                <span className={styles.participationStateBadge}>{participationState.badge}</span>
              </div>
              <div className={styles.participantDecisionSummary} aria-label="Condizioni principali">
                <span>
                  <Users size={16} aria-hidden="true" />
                  {participantsCount}/{maxParticipants || '∞'} iscritti
                </span>
                <span>
                  <CircleDollarSign size={16} aria-hidden="true" />
                  {event.participation_protection === false ? 'Nessun deposito' : `${formatCurrencyFromCents(event.deposit_cents)} protetti`}
                </span>
                <span>
                  <Trophy size={16} aria-hidden="true" />
                  Fino a {totalAvailableXp} PX
                </span>
              </div>
              <section
                className={`${styles.participationStateBox} ${styles.participantStateCompact} ${styles[`participationState_${participationState.tone}`] || ''}`}
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
              {eventPrimaryAction.target !== 'event' ? (
                <div className={styles.primaryParticipationAction}>
                  <Button
                    type="button"
                    fullWidth
                    variant={eventPrimaryAction.tone === 'primary' ? 'primary' : 'secondary'}
                    icon={EventPrimaryActionIcon}
                    disabled={eventPrimaryAction.disabled}
                    onClick={handlePrimaryEventAction}
                  >
                    {eventPrimaryAction.label}
                  </Button>
                </div>
              ) : null}
              {gymAccess ? (
                <p className={`${styles.participantAccessReminder} ${gymAccess.canParticipate === false ? styles.participantAccessReminderBlocked : ''}`}>
                  {gymAccess.tone === 'success' ? <ShieldCheck size={15} aria-hidden="true" /> : <LockKeyhole size={15} aria-hidden="true" />}
                  {gymViewerAccessLoading
                    ? 'Verifica automatica dell’accesso alla palestra…'
                    : gymAccess.canParticipate === false
                      ? `${gymAccess.label}. Chiedi alla palestra di verificare il tuo abbonamento.`
                      : `${gymAccess.label}. La caparra Motrice resta separata dall’ingresso.`}
                </p>
              ) : null}
            </Card>
          ) : null}

          {!event.is_personal ? (
            <Card
              id={isOrganizerForEvent ? 'organizer-controls' : undefined}
              as="section"
              className={`${styles.peopleOverviewCard} ${peopleOpen ? styles.peopleOverviewCardOpen : ''} ${isOrganizerForEvent ? styles.peopleOverviewCardOrganizer : ''}`}
            >
              <button
                type="button"
                className={styles.peopleOverviewToggle}
                aria-expanded={peopleOpen}
                aria-controls={`event-people-${event.id}`}
                onClick={() => setPeopleOpen((open) => !open)}
              >
                <span className={styles.peopleOverviewIcon}><UserRound size={21} aria-hidden="true" /></span>
                <span className={styles.peopleOverviewHeading}>
                  <strong>Organizzatore e partecipanti</strong>
                  <small>
                    {isOrganizerForEvent && !eventIsCancelled
                      ? 'Richieste e iscritti in un unico pannello'
                      : `${organizerName} · ${organizerReliability}% affidabilità · ${participantsCount}/${maxParticipants || '∞'} iscritti`}
                  </small>
                </span>
                <ChevronDown
                  className={peopleOpen ? styles.peopleOverviewChevronOpen : ''}
                  size={20}
                  aria-hidden="true"
                />
              </button>

              {peopleOpen ? (
                <div id={`event-people-${event.id}`} className={styles.peopleOverviewBody}>
                  <Link
                    className={styles.peopleOrganizerRow}
                    to={`/profile/${organizerProfileId}?event=${event.id}`}
                    state={organizerProfileState}
                  >
                    <span className={styles.peopleOrganizerAvatar} aria-hidden="true">
                      {organizerAvatarUrl ? <img src={organizerAvatarUrl} alt="" /> : organizerInitial}
                    </span>
                    <span className={styles.peopleOrganizerIdentity}>
                      <small>{isOrganizerForEvent ? 'Il tuo profilo organizzatore' : 'Organizzatore verificato'}</small>
                      <strong>{organizerName}</strong>
                      <span><MapPin size={14} aria-hidden="true" /> {event.city || event.location_name || 'Località evento'}</span>
                    </span>
                    <span className={styles.peopleOrganizerReliability}>
                      <small>Affidabilità</small>
                      <strong>{organizerReliability}%</strong>
                    </span>
                    <ArrowRight size={19} aria-hidden="true" />
                  </Link>

                  {isOrganizerForEvent && !eventIsCancelled ? (
                    <div className={styles.peopleManagementEmbedded}>
                      <EventParticipationFlow
                        event={event}
                        isOrganizer
                        currentUser={currentUser}
                        coords={coords}
                        requestingLocation={requesting}
                        requestLocation={requestLocation}
                        locationError={locationError}
                        showToast={showToast}
                        onEventRefresh={reload}
                        onOpenParticipantProfile={openJoinRequestProfile}
                        managementOnly
                        compactEmbedded
                      />
                    </div>
                  ) : (
                    <>
                      <div className={styles.peopleParticipantsRow}>
                        <span className={styles.peopleParticipantsCopy}>
                          <small>Partecipanti</small>
                          <strong>{participantsCount}/{maxParticipants || '∞'} iscritti</strong>
                        </span>
                        <span className={styles.participantAvatarStack} aria-label={participantPreview.length ? participantPreview.join(', ') : 'Nessun iscritto'}>
                          {participantPreview.length ? participantPreview.map((name, index) => (
                            <span key={`${name}-${index}`} title={name}>
                              {name.slice(0, 1).toUpperCase()}
                            </span>
                          )) : <span className={styles.participantAvatarEmpty}><Users size={17} aria-hidden="true" /></span>}
                        </span>
                        <button
                          type="button"
                          className={styles.participantPreviewAction}
                          aria-expanded={participantListOpen}
                          aria-controls={`event-participant-preview-${event.id}`}
                          onClick={() => setParticipantListOpen((open) => !open)}
                        >
                          {participantListOpen ? 'Nascondi' : 'Vedi tutti'}
                          <ChevronDown className={participantListOpen ? styles.participantPreviewChevronOpen : ''} size={17} aria-hidden="true" />
                        </button>
                      </div>

                      {participantListOpen ? (
                        <div id={`event-participant-preview-${event.id}`} className={styles.participantPreviewList}>
                          {participantPreview.length ? participantPreview.map((name, index) => (
                            <div key={`${name}-detail-${index}`}>
                              <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                              <strong>{name}</strong>
                              <small>{normalizeName(name) === normalizeName(organizerName) ? 'Organizer' : 'Iscritto'}</small>
                            </div>
                          )) : <p>Nessun partecipante registrato.</p>}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </Card>
          ) : null}

          {isClosedEvent && !event.is_personal ? (
            <Card id="event-summary" as="section" className={styles.closedSummaryCard}>
              <div className={styles.closedSummaryHeading}>
                <span><CheckCircle2 size={19} aria-hidden="true" /></span>
                <div>
                  <p>{isArchivedEvent ? 'Evento archiviato' : 'Evento concluso'}</p>
                  <h2>{eventTiming.isPostEventReadOnly ? 'Riepilogo definitivo' : 'Riepilogo verificato'}</h2>
                </div>
                <strong>{closedPresentCount}/{closedTotalCount} presenti</strong>
              </div>
              <div className={styles.closedSummaryGrid}>
                {isOrganizerForEvent || !hasClosedViewerParticipation ? (
                  <>
                    <div><span>Stato</span><strong>Svolto</strong></div>
                    <div><span>Presenti</span><strong>{closedPresentCount}</strong></div>
                    <div><span>Assenti</span><strong>{closedNoShowCount}</strong></div>
                    <div><span>Durata</span><strong>{durationMinutes} min</strong></div>
                  </>
                ) : (
                  <>
                    <div><span>Stato</span><strong>{closedAttendanceLabel}</strong></div>
                    <div><span>PX ottenuti</span><strong>{closedEarnedXp}</strong></div>
                    <div><span>Allenamento</span><strong>{closedPresenceMinutes} min</strong></div>
                    <div><span>Affidabilità</span><strong>{reliabilityImpactLabel}</strong></div>
                  </>
                )}
              </div>
              <div
                className={`${styles.postEventLifecycle} ${eventTiming.isPostEventReadOnly ? styles.postEventLifecycleReadOnly : ''}`}
                data-disputed={moneyDisputePending ? 'true' : 'false'}
              >
                <span className={styles.postEventLifecycleIcon} aria-hidden="true">
                  {eventTiming.isPostEventReadOnly ? <LockKeyhole size={18} /> : <Clock3 size={18} />}
                </span>
                <div>
                  <strong>{postEventStateLabel}</strong>
                  <small>
                    {moneyDisputePending
                      ? 'Il credito resta sospeso fino alla verifica amministrativa.'
                      : eventTiming.isPostEventReadOnly
                        ? 'Valutazioni e regolamento economico sono chiusi. I dettagli restano consultabili.'
                        : eventTiming.isPostEventWindow
                          ? `Valutazioni entro ${formatLifecycleDeadline(eventTiming.archiveAtMs)} · contestazioni entro ${formatLifecycleDeadline(eventTiming.financialReviewEndsAtMs)}`
                          : hasSettlementReady
                            ? `Contestazioni disponibili fino al ${formatLifecycleDeadline(eventTiming.financialReviewEndsAtMs)}`
                            : 'Il regolamento economico è in elaborazione e sarà disponibile a breve.'}
                  </small>
                </div>
                {canOpenMoneyDispute ? (
                  <button type="button" onClick={() => setMoneyDisputeOpen(true)}>
                    Contesta
                  </button>
                ) : null}
              </div>
            </Card>
          ) : null}

          <div id="post-event-feedback">
            <PostEventUserFeedback
              eventId={event.id}
              enabled={Boolean(
                isClosedEvent &&
                eventTiming.isPostEventWindow &&
                !event.is_personal &&
                (isOrganizerForEvent || participantWasPresent)
              )}
              bonusXp={reviewBonusXp || 25}
              onTargetsChange={(targets) => {
                setReviewTargetCount(targets.filter((target) => !target.reviewed).length);
              }}
              onCompleted={() => {
                setReviewTargetCount(0);
                setEvent((current) => current ? {
                  ...current,
                  feedback_completed: true,
                  organizer_feedback_completed: isOrganizerForEvent || current.organizer_feedback_completed,
                  user_rsvp: current.user_rsvp ? {
                    ...current.user_rsvp,
                    review_submitted: !isOrganizerForEvent || current.user_rsvp.review_submitted
                  } : current.user_rsvp
                } : current);
              }}
            />
          </div>

          {!event.is_personal && !eventIsCancelled && !isClosedEvent && canOpenAgendaCheckIn ? (
            <Card
              id="verify-presence"
              ref={participationFlowRef}
              as="section"
              className={styles.checkInBridgeCard}
              data-open={eventTiming.isCheckInOpen ? 'true' : 'false'}
            >
              <div className={styles.checkInBridgeIcon} aria-hidden="true">
                <ShieldCheck size={23} />
              </div>
              <div className={styles.checkInBridgeCopy}>
                <span>Check-in da I miei eventi</span>
                <h2>{checkInStatusLabel} · {checkInWindowLabel}</h2>
                <small>
                  <Clock3 size={14} aria-hidden="true" />
                  {canOpenAgendaCheckIn
                    ? 'QR e geolocalizzazione disponibili nella tua agenda'
                    : 'Disponibile dopo la conferma della partecipazione'}
                </small>
              </div>
            </Card>
          ) : null}

          {event.workout_plan ? (
            <Card id="workout-plan" as="section" className={`${styles.workoutPlanCard} ${workoutPlanOpen ? styles.workoutPlanCardOpen : ''}`}>
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
                  {(event.is_personal || ['checked_in', 'completed'].includes(participantOutcome.id) || (isOrganizerForEvent && Number(event?.participants_checked_in_count || 0) > 0)) ? (
                    <Button
                      type="button"
                      fullWidth
                      icon={Play}
                      onClick={() => navigate(`/events/${event.id}/workout`)}
                    >
                      Avvia allenamento
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ) : null}

          {hasOutdoorTracking && (
            event.is_personal ||
            ['checked_in', 'completed'].includes(participantOutcome.id) ||
            (isOrganizerForEvent && Number(event?.participants_checked_in_count || 0) > 0)
          ) ? (
            <Card as="section" className={styles.outdoorLiveCard}>
              <span className={styles.outdoorLiveIcon}><Route size={24} aria-hidden="true" /></span>
              <div>
                <small>ATTIVITÀ GPS LIVE</small>
                <strong>{participantOutcome.id === 'completed' ? 'Consulta la tua attività' : 'Inizia il monitoraggio'}</strong>
                <p>Tempo, distanza, passo, dislivello e passi in un’unica schermata.</p>
              </div>
              <Button
                type="button"
                icon={Play}
                onClick={() => navigate(`/events/${event.id}/activity`)}
              >
                {participantOutcome.id === 'completed' ? 'Apri attività' : 'Avvia attività'}
              </Button>
            </Card>
          ) : null}

          {event.is_personal || (!isOrganizerForEvent && canOpenAgendaCheckIn) ? (
            <Card as="section" className={styles.rewardCard}>
              <div className={styles.rewardHeading}>
                <div>
                  <h2>Come ottieni fino a {totalAvailableXp} PX</h2>
                  <p>Ricompensa verificata</p>
                </div>
              </div>
              <p className={styles.rewardBreakdown}>
                {event.is_personal
                  ? `+${completionXp} PX al completamento del promemoria personale.`
                  : reviewBonusXp > 0
                    ? `+${completionXp} PX completamento + ${reviewBonusXp} PX recensione.`
                    : `+${completionXp} PX al completamento della partecipazione.`}
              </p>
              <div className={styles.rewardProgress} aria-label={`${rewardProgress.current} di ${rewardProgress.total} check-in verificati`}>
                <span className={styles.rewardProgressTrack}>
                  <i style={{ width: `${rewardProgress.percent}%` }} aria-hidden="true" />
                </span>
                <strong>{rewardProgress.current} di {rewardProgress.total} check-in</strong>
                <span>+{completionXp} completamento{reviewBonusXp > 0 ? ` · +${reviewBonusXp} verifica` : ''}</span>
              </div>
            </Card>
          ) : null}

          <div className={styles.summaryGrid}>
            <Card subtle className={`${styles.infoCard} ${styles.compactDetailsCard}`}>
              <button
                type="button"
                className={styles.compactDetailsToggle}
                aria-expanded={rulesOpen}
                aria-controls={`event-details-${event.id}`}
                onClick={() => setRulesOpen((open) => !open)}
              >
                <span className={styles.sectionTitleRow}>
                  <span className={styles.sectionIcon}><ShieldCheck size={20} aria-hidden="true" /></span>
                  <span>
                    <small>Informazioni</small>
                    <strong>Dettagli e regole</strong>
                  </span>
                </span>
                <span className={styles.rulesToggleAction}>
                  {rulesOpen ? 'Nascondi' : 'Visualizza'}
                  <ChevronDown className={rulesOpen ? styles.rulesChevronOpen : ''} size={20} aria-hidden="true" />
                </span>
              </button>
              {rulesOpen ? (
                <div id={`event-details-${event.id}`} className={styles.compactDetailsBody}>
                  <dl className={styles.detailList}>
                    <div><dt>Livello</dt><dd>{event.level || 'Aperto'}</dd></div>
                    <div><dt>Categoria</dt><dd>{audienceLabel}</dd></div>
                    <div><dt>Età</dt><dd>{Number(event.min_age || 18)}–{Number(event.max_age || 99)} anni</dd></div>
                    <div><dt>Visibilità</dt><dd>{event.visibility === 'private' ? 'Privato' : 'Pubblico'}</dd></div>
                    {!event.is_personal ? <div><dt>Accesso</dt><dd>{event.join_policy === 'approval' ? 'Su richiesta' : 'Aperto a tutti'}</dd></div> : null}
                    {gymAccess ? <div><dt>Ingresso palestra</dt><dd>{gymAccess.label}</dd></div> : null}
                    {!event.is_personal ? <div><dt>Verifica</dt><dd>{event.verification_mode === 'qr' ? 'QR Code' : event.verification_mode === 'gps' ? 'GPS' : 'QR + GPS'}</dd></div> : null}
                  </dl>
                  {(event.etiquette || []).length ? (
                    <div className={styles.inlineRules}>
                      <span>Regole della sessione</span>
                      <ul>
                        {(event.etiquette || []).map((rule) => <li key={rule}>{rule}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>

          </div>

          <Card subtle className={styles.actionCard}>
            <h2 className={styles.actionTitle}>
              {eventIsCancelled ? 'Evento annullato' : isOrganizerForEvent ? 'Azioni evento' : 'Altre opzioni'}
            </h2>
            <div className={styles.primaryParticipationAction}>
              {isOrganizerForEvent && event.is_personal && !eventIsCancelled && !isClosedEvent ? (
                <Button
                  type="button"
                  fullWidth
                  variant="secondary"
                  icon={PencilLine}
                  onClick={openOrganizerEditDialog}
                >
                  Modifica evento
                </Button>
              ) : null}
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
              {isOrganizerForEvent && !event.is_personal && eventPrimaryAction.target !== 'manage' ? (
                <Button
                  type="button"
                  fullWidth
                  variant={eventPrimaryAction.tone === 'primary' ? 'primary' : 'secondary'}
                  icon={EventPrimaryActionIcon}
                  disabled={eventPrimaryAction.disabled}
                  onClick={handlePrimaryEventAction}
                >
                  {eventPrimaryAction.label}
                </Button>
              ) : null}
            </div>
            {!eventIsCancelled ? <button
              type="button"
              className={styles.secondaryActionsToggle}
              aria-expanded={actionsOpen}
              aria-controls={`event-secondary-actions-${event.id}`}
              onClick={() => setActionsOpen((open) => !open)}
            >
              <span>
                <strong>Altre azioni</strong>
                <small>Salva, calendario, copia, condividi e chat</small>
              </span>
              <ChevronDown className={actionsOpen ? styles.secondaryActionsChevronOpen : ''} size={20} aria-hidden="true" />
            </button> : null}
            {actionsOpen ? (
            <div id={`event-secondary-actions-${event.id}`} className={styles.actions}>
              {isOrganizerForEvent && !event.is_personal && !eventIsCancelled && !isClosedEvent ? (
                <Button type="button" variant="secondary" icon={PencilLine} onClick={openOrganizerEditDialog}>
                  Modifica evento
                </Button>
              ) : null}
              {!isOrganizerForEvent && participationState.canCancel ? (
                <Button type="button" variant="secondary" icon={UserMinus} onClick={openCancelDialog}>
                  Annulla partecipazione
                </Button>
              ) : null}
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
            </div>
            ) : null}
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

          {event.is_going && String(event?.user_rsvp?.attendance || '') === 'attended' ? (
            <Card subtle className={styles.postWorkoutCard}>
              <h2>Allenamento completato ✅</h2>
              <p className="muted">Ora puoi aggiungere i compagni con cui hai completato l allenamento in questo evento.</p>
              <div className="row">
                <Button type="button" icon={UserPlus} onClick={() => navigate(`/chat/met-people/${event.id}`)}>Aggiungi compagni</Button>
              </div>
            </Card>
          ) : null}

          {coachProfile ? (
            <Card subtle className={styles.coachCtaCard}>
              <div className={styles.coachInsightActive}>
                <div className={styles.metaRow}>
                  <EventBadge label={`${coachInsight.score}% compatibilita`} type="level" />
                  {coachInsight.recommended && <EventBadge label="Consigliato dal Coach" type="premium" />}
                </div>
                <p className="muted">{coachInsight.explanation}</p>
              </div>
            </Card>
          ) : null}

        </article>

        {!isOrganizerForEvent && similarEvents.length > 0 ? (
          <section className={styles.list}>
            <div className={styles.listHeading}>
              <p>Continua a muoverti</p>
              <h2>Eventi simili</h2>
            </div>
            <div className={styles.similarGrid} role="list" aria-label="Eventi simili">
              {similarEvents.map((item) => (
                <EventCard
                  key={item.id}
                  event={item}
                  variant="featured"
                  context="similar"
                  showProgress={false}
                  detailsLabel="Apri dettaglio"
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {showParticipantStickyAction ? (
        <div className={styles.participantStickyAction} aria-label="Azione principale partecipazione">
          <Button
            type="button"
            fullWidth
            variant={eventPrimaryAction.tone === 'primary' ? 'primary' : 'secondary'}
            icon={EventPrimaryActionIcon}
            disabled={eventPrimaryAction.disabled}
            onClick={handlePrimaryEventAction}
          >
            {eventPrimaryAction.label}
          </Button>
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        title={event?.join_policy === 'approval' ? 'Richiedi di partecipare' : 'Partecipa alla sessione'}
        onClose={() => {
          if (!rsvpSubmitting) {
            setModalOpen(false);
            setRsvpNoteOpen(false);
          }
        }}
        onConfirm={confirmRsvp}
        confirmText={rsvpSubmitting
          ? 'Invio in corso...'
          : event?.join_policy === 'approval'
            ? 'Invia richiesta'
            : 'Blocca deposito e partecipa'}
        confirmDisabled={
          rsvpSubmitting ||
          gymViewerAccessLoading ||
          (isGymEvent(event) && !rsvpForm.gym_access_choice) ||
          (isGymEvent(event) && rsvpForm.gym_access_choice === GYM_ENTRY_TRIAL && gymViewerAccess?.trial_used) ||
          String(localProfile.display_name || '').trim().length < 2
        }
        showCloseAction={false}
        showHeaderClose
      >
        <div className={styles.joinRequestForm}>
          <p className={styles.joinRequestIntro}>
            {event?.join_policy === 'approval'
              ? 'L’organizzatore riceverà la richiesta e potrà approvarla.'
              : 'Conferma i tuoi dati per riservare il posto.'}
          </p>

          <div className={styles.joinIdentity} aria-label="Identità utilizzata per la richiesta">
            <div className={styles.joinIdentityAvatar} aria-hidden="true">
              {localProfile.avatar_url ? (
                <img src={localProfile.avatar_url} alt="" />
              ) : (
                <span>{String(localProfile.display_name || 'M').slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className={styles.joinIdentityCopy}>
              <strong>{localProfile.display_name || 'Profilo incompleto'}</strong>
              <small>
                {profileVerificationStatus === 'verified' ? (
                  <><ShieldCheck size={14} aria-hidden="true" /> Profilo verificato</>
                ) : (
                  'Identità dal profilo Motrice'
                )}
                {localProfile.reliability != null
                  ? ` · ${Math.round(localProfile.reliability)}% affidabilità`
                  : ''}
              </small>
            </div>
            {String(localProfile.display_name || '').trim().length < 2 ? (
              <Link className={styles.joinCompleteProfileLink} to="/account">
                Completa
              </Link>
            ) : null}
          </div>

          <fieldset className={styles.joinLevelFieldset}>
            <legend>Il tuo livello per questo evento</legend>
            <div className={styles.joinLevelChoices}>
              {RSVP_SKILL_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  className={rsvpForm.skill_level === level.value ? styles.joinLevelChoiceActive : ''}
                  aria-pressed={rsvpForm.skill_level === level.value}
                  onClick={() => setRsvpForm((current) => ({ ...current, skill_level: level.value }))}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className={styles.joinNoteSection}>
            <button
              type="button"
              className={styles.joinNoteToggle}
              aria-expanded={rsvpNoteOpen}
              onClick={() => setRsvpNoteOpen((current) => !current)}
            >
              <span>{rsvpNoteOpen ? 'Nota per l’organizzatore' : '+ Aggiungi una nota all’organizzatore'}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {rsvpNoteOpen ? (
              <label className={styles.joinNoteField}>
                <textarea
                  rows="3"
                  maxLength="240"
                  aria-label="Nota facoltativa per l’organizzatore"
                  placeholder="Nota facoltativa per l’organizzatore"
                  value={rsvpForm.note}
                  onChange={(event) => setRsvpForm((current) => ({ ...current, note: event.target.value }))}
                />
                <small>{String(rsvpForm.note || '').length}/240</small>
              </label>
            ) : null}
          </div>

          {isGymEvent(event) ? (
            <fieldset className={styles.joinGymChoiceFieldset}>
              <legend>Come accederai alla palestra?</legend>
              <div className={styles.joinGymChoices}>
                {GYM_ENTRY_OPTIONS.map((option) => {
                  const selected = rsvpForm.gym_access_choice === option.value;
                  const trialUnavailable = option.value === GYM_ENTRY_TRIAL && Boolean(gymViewerAccess?.trial_used);
                  const Icon = option.value === GYM_ENTRY_MEMBER
                    ? ShieldCheck
                    : option.value === GYM_ENTRY_TRIAL
                      ? Sparkles
                      : CircleDollarSign;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={selected ? styles.joinGymChoiceActive : ''}
                      aria-pressed={selected}
                      disabled={trialUnavailable}
                      onClick={() => setRsvpForm((current) => ({ ...current, gym_access_choice: option.value }))}
                    >
                      <span className={styles.joinGymChoiceIcon}><Icon size={18} aria-hidden="true" /></span>
                      <span>
                        <strong>{option.label}</strong>
                        <small>
                          {trialUnavailable
                            ? 'Già utilizzata in questa palestra'
                            : option.value === GYM_ENTRY_MEMBER && gymViewerAccess?.membership_verified
                              ? 'Abbonamento già verificato'
                              : option.description}
                        </small>
                      </span>
                      <i aria-hidden="true">{selected ? <CheckCircle2 size={15} /> : null}</i>
                    </button>
                  );
                })}
              </div>
              {rsvpForm.gym_access_choice === GYM_ENTRY_DAY_PASS ? (
                <p>Il pagamento dell’ingresso palestra è separato dal deposito Motrice.</p>
              ) : null}
            </fieldset>
          ) : null}

          {gymAccess && rsvpForm.gym_access_choice ? (
            <div className={`${styles.joinGymAccessSummary} ${styles[`joinGymAccessSummary_${gymAccess.tone || 'neutral'}`] || ''}`}>
              {gymAccess.tone === 'success'
                ? <ShieldCheck size={22} aria-hidden="true" />
                : <LockKeyhole size={22} aria-hidden="true" />}
              <div>
                <span>Ingresso palestra selezionato</span>
                <strong>{gymAccess.label}</strong>
                <small>{gymAccess.description}</small>
              </div>
            </div>
          ) : null}

          <div className={styles.joinDepositSummary}>
            <CircleDollarSign size={22} aria-hidden="true" />
            <div>
              <strong>{formatCurrencyFromCents(event?.deposit_cents)} di deposito</strong>
              <small>
                {event?.join_policy === 'approval'
                  ? 'Riservati all’invio e liberati se la richiesta non viene accettata'
                  : `Restituiti dopo almeno ${Number(event?.minimum_presence_minutes || 45)} min verificati`}
              </small>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={creditBlockedOpen}
        title="Credito impegnato"
        onClose={() => setCreditBlockedOpen(false)}
        onConfirm={() => {
          setCreditBlockedOpen(false);
          navigate('/wallet/credit');
        }}
        confirmText="Vedi impegni"
        closeText="Chiudi"
      >
        <div className={styles.creditBlockedDialog}>
          {creditBlockedLoading ? (
            <div className={styles.creditBlockedLead}>
              <span className={styles.creditBlockedIcon} aria-hidden="true">
                <LockKeyhole size={20} />
              </span>
              <div>
                <span>Saldo disponibile</span>
                <strong>Controllo in corso…</strong>
              </div>
            </div>
          ) : creditBlockedWallet ? (
            <>
              <div className={styles.creditBlockedLead}>
                <span className={styles.creditBlockedIcon} aria-hidden="true">
                  <LockKeyhole size={20} />
                </span>
                <div>
                  <span>Servono per partecipare</span>
                  <strong>{formatCurrencyFromCents(creditBlockedWallet.requiredCents)} disponibili</strong>
                </div>
                <small>Totale {formatCurrencyFromCents(creditBlockedWallet.totalCents)}</small>
              </div>
              <div className={styles.creditBlockedBreakdown} aria-label="Riepilogo credito">
                <div>
                  <span>Disponibili</span>
                  <strong>{formatCurrencyFromCents(creditBlockedWallet.availableCents)}</strong>
                </div>
                <div>
                  <span>Bloccati negli eventi</span>
                  <strong>{formatCurrencyFromCents(creditBlockedWallet.lockedCents)}</strong>
                </div>
              </div>
              {creditBlockedWallet.lockedCents > 0 ? (
                <p>Il credito bloccato è già usato da altri eventi o richieste.</p>
              ) : null}
            </>
          ) : (
            <div className={styles.creditBlockedLead}>
              <span className={styles.creditBlockedIcon} aria-hidden="true">
                <LockKeyhole size={20} />
              </span>
              <div>
                <span>Saldo disponibile</span>
                <strong>Credito insufficiente</strong>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={moneyDisputeOpen}
        title="Contesta regolamento"
        onClose={() => {
          if (!moneyDisputeSubmitting) setMoneyDisputeOpen(false);
        }}
        onConfirm={submitMoneyDispute}
        confirmText={moneyDisputeSubmitting ? 'Invio...' : 'Invia contestazione'}
        confirmDisabled={moneyDisputeSubmitting || String(moneyDisputeReason || '').trim().length < 5}
        closeText="Annulla"
      >
        <div className={styles.moneyDisputeDialog}>
          <div>
            <AlertTriangle size={20} aria-hidden="true" />
            <p>
              Segnala soltanto problemi relativi a presenza, deposito o ripartizione del credito.
              Il regolamento resterà sospeso durante la verifica.
            </p>
          </div>
          <label>
            <span>Descrivi cosa non risulta corretto</span>
            <textarea
              rows="4"
              minLength="5"
              maxLength="500"
              value={moneyDisputeReason}
              onChange={(changeEvent) => setMoneyDisputeReason(changeEvent.target.value)}
              placeholder="Esempio: la mia presenza è stata registrata come no-show"
            />
            <small>{String(moneyDisputeReason || '').length}/500</small>
          </label>
        </div>
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

      <Modal
        open={organizerEditOpen}
        title={event.is_personal ? 'Modifica evento personale' : 'Modifica evento'}
        onClose={() => {
          if (!organizerEditSubmitting) setOrganizerEditOpen(false);
        }}
        onConfirm={saveOrganizerEventChanges}
        confirmText={organizerEditSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
        confirmDisabled={
          organizerEditSubmitting ||
          !organizerEditHasChanges ||
          !organizerEditDescriptionValid ||
          !organizerEditCapacityValid ||
          String(organizerEditForm.organizer_notes || '').length > 800 ||
          String(organizerEditForm.organizer_alert || '').length > 280 ||
          !eventManagementPolicy.canEditAnything
        }
        closeText="Chiudi"
        showConfirm={eventManagementPolicy.canEditAnything}
      >
        <div className={styles.organizerEditModal}>
          <div className={styles.organizerEditIntro}>
            <PencilLine size={21} aria-hidden="true" />
            <div>
              <strong>{event.is_personal ? 'Aggiorna il tuo allenamento' : 'Modifiche protette per tutti'}</strong>
              <p>
                {event.is_personal
                  ? 'Puoi aggiornare descrizione, indicazioni e durata rispettando le stesse finestre di sicurezza.'
                  : 'Ogni campo segue una finestra precisa. Le variazioni salvate vengono comunicate ai partecipanti.'}
              </p>
            </div>
          </div>

          <section className={styles.organizerEditContentGroup}>
            <div className={styles.organizerEditGroupHead}>
              <span>01</span>
              <div>
                <strong>Informazioni</strong>
                <p>Testi utili per prepararsi e raggiungere il punto d’incontro.</p>
              </div>
            </div>

          <label className={styles.organizerEditField} data-disabled={!eventManagementPolicy.canEditDescription}>
            <span className={styles.organizerEditFieldHead}>
              <strong>Descrizione</strong>
              <small>{eventManagementPolicy.canEditDescription ? 'Fino all’inizio' : 'Chiusa dopo l’inizio'}</small>
            </span>
            <textarea
              className={styles.organizerEditTextArea}
              rows="3"
              maxLength="2000"
              value={organizerEditForm.description}
              onChange={(changeEvent) => setOrganizerEditForm((current) => ({
                ...current,
                description: changeEvent.target.value
              }))}
              placeholder="Aggiungi indicazioni utili per i partecipanti..."
              disabled={!eventManagementPolicy.canEditDescription || organizerEditSubmitting}
            />
            <span className={styles.organizerEditFieldFoot}>
              <small>{organizerEditDescription.length > 0 && organizerEditDescription.length < 20 ? 'Minimo 20 caratteri' : 'Può anche restare vuota'}</small>
              <small>{organizerEditForm.description.length}/2000</small>
            </span>
          </label>

          <label className={styles.organizerEditField} data-disabled={!eventManagementPolicy.canEditDescription}>
            <span className={styles.organizerEditFieldHead}>
              <strong>Indicazioni pratiche</strong>
              <small>{eventManagementPolicy.canEditDescription ? 'Fino all’inizio' : 'Chiuse dopo l’inizio'}</small>
            </span>
            <textarea
              className={styles.organizerEditTextArea}
              rows="2"
              maxLength="800"
              value={organizerEditForm.organizer_notes}
              onChange={(changeEvent) => setOrganizerEditForm((current) => ({
                ...current,
                organizer_notes: changeEvent.target.value
              }))}
              placeholder="Ingresso, attrezzatura, punto di ritrovo o indicazioni utili..."
              disabled={!eventManagementPolicy.canEditDescription || organizerEditSubmitting}
            />
            <span className={styles.organizerEditFieldFoot}>
              <small>Informazioni operative, senza cambiare l’accordo dell’evento.</small>
              <small>{organizerEditForm.organizer_notes.length}/800</small>
            </span>
          </label>
          </section>

          <section className={styles.organizerEditAdjustments}>
            <div className={styles.organizerEditAdjustmentsHead}>
              <span>02</span>
              <div>
                <strong>Impostazioni adattabili</strong>
                <p>Puoi soltanto ampliare i valori concordati, mai ridurli.</p>
              </div>
              <ShieldCheck size={19} aria-hidden="true" />
            </div>

          <fieldset className={styles.organizerEditField} data-disabled={!eventManagementPolicy.canEditDuration}>
            <legend className={styles.organizerEditFieldHead}>
              <strong>Tempo di allenamento</strong>
              <small>{eventManagementPolicy.canEditDuration ? `Massimo +${EVENT_DURATION_MAX_EXTENSION_MINUTES} min` : 'Finestra chiusa · T-2h'}</small>
            </legend>
            <div className={styles.organizerExtensionOptions}>
              {organizerDurationOptions.map((minutes) => {
                const selected = Number(organizerEditForm.duration_minutes) === minutes;
                const isCurrent = minutes === durationMinutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    className={`${isCurrent ? styles.organizerExtensionCurrent : ''} ${selected && !isCurrent ? styles.organizerExtensionSelected : ''}`}
                    aria-pressed={selected}
                    disabled={!eventManagementPolicy.canEditDuration || organizerEditSubmitting}
                    onClick={() => setOrganizerEditForm((current) => ({
                      ...current,
                      duration_minutes: minutes
                    }))}
                  >
                    <strong>{minutes}</strong>
                    <span>{isCurrent ? 'attuale' : `+${minutes - durationMinutes} min`}</span>
                  </button>
                );
              })}
            </div>
            <small className={styles.organizerPresenceImpact}>
              Presenza minima: {minimumPresenceMinutes} min
              {organizerEditMinimumPresenceMinutes !== minimumPresenceMinutes
                ? ` → ${organizerEditMinimumPresenceMinutes} min`
                : ''}
            </small>
          </fieldset>

          {!event.is_personal ? (
            <fieldset className={styles.organizerEditField} data-disabled={!eventManagementPolicy.canEditTolerance}>
              <legend className={styles.organizerEditFieldHead}>
                <strong>Tolleranza ritardi</strong>
                <small>
                  {eventManagementPolicy.canEditTolerance
                    ? 'Solo estensione'
                    : eventManagementPolicy.currentTolerance >= 30
                      ? 'Massimo raggiunto'
                      : 'Finestra chiusa'}
                </small>
              </legend>
              <div className={styles.organizerExtensionOptions}>
                {eventManagementPolicy.toleranceOptions.map((minutes) => {
                  const selected = Number(organizerEditForm.checkin_grace_minutes) === minutes;
                  const isCurrent = minutes === eventManagementPolicy.currentTolerance;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      className={`${isCurrent ? styles.organizerExtensionCurrent : ''} ${selected && !isCurrent ? styles.organizerExtensionSelected : ''}`}
                      aria-pressed={selected}
                      disabled={!eventManagementPolicy.canEditTolerance || organizerEditSubmitting}
                      onClick={() => setOrganizerEditForm((current) => ({
                        ...current,
                        checkin_grace_minutes: minutes
                      }))}
                    >
                      <strong>{minutes}</strong>
                      <span>{isCurrent ? 'attuale' : 'minuti'}</span>
                    </button>
                  );
                })}
              </div>
              <small>Non può essere ridotta, così nessun partecipante perde la finestra promessa.</small>
            </fieldset>
          ) : null}

          {!event.is_personal ? (
            <fieldset className={styles.organizerEditField} data-disabled={!eventManagementPolicy.canEditParticipantSettings}>
              <legend className={styles.organizerEditFieldHead}>
                <strong>Posti disponibili</strong>
                <small>Massimo +{EVENT_CAPACITY_MAX_EXTENSION}</small>
              </legend>
              <div className={styles.organizerExtensionOptions}>
                {organizerCapacityOptions.map((capacity) => {
                  const selected = Number(organizerEditForm.max_participants) === capacity;
                  const isCurrent = capacity === organizerEditCapacityMinimum;
                  return (
                    <button
                      key={capacity}
                      type="button"
                      className={`${isCurrent ? styles.organizerExtensionCurrent : ''} ${selected && !isCurrent ? styles.organizerExtensionSelected : ''}`}
                      aria-pressed={selected}
                      disabled={!eventManagementPolicy.canEditParticipantSettings || organizerEditSubmitting}
                      onClick={() => setOrganizerEditForm((current) => ({
                        ...current,
                        max_participants: capacity
                      }))}
                    >
                      <strong>{capacity}</strong>
                      <span>{isCurrent ? 'attuali' : `+${capacity - organizerEditCapacityMinimum}`}</span>
                    </button>
                  );
                })}
              </div>
              <small>I posti possono soltanto aumentare, senza cambiare il gruppo già confermato.</small>
            </fieldset>
          ) : null}

          {!event.is_personal ? (
            <label
              className={styles.organizerEditField}
              data-disabled={!eventManagementPolicy.canEditParticipantSettings}
              data-changed={String(organizerEditForm.required_level || '') !== String(event.level || 'all')}
            >
            <span className={styles.organizerEditFieldHead}>
              <strong>Livello richiesto</strong>
              <small>Fino a 2 ore prima</small>
            </span>
            <select
              value={organizerEditForm.required_level}
              onChange={(changeEvent) => setOrganizerEditForm((current) => ({
                ...current,
                required_level: changeEvent.target.value
              }))}
              disabled={!eventManagementPolicy.canEditParticipantSettings || organizerEditSubmitting}
            >
              {EVENT_LEVEL_OPTIONS.map((level) => (
                <option
                  key={level.value}
                  value={level.value}
                  disabled={
                    Number(event.participants_count || 0) > 1 &&
                    level.value !== 'all' &&
                    level.value !== String(event.level || 'all')
                  }
                >
                  {level.label}
                </option>
              ))}
            </select>
            <small>Con iscritti presenti puoi soltanto mantenere il livello o aprire a tutti.</small>
          </label>
          ) : null}
          </section>

          {!event.is_personal ? <section className={styles.organizerUrgentSection}>
            <div className={styles.organizerEditGroupHead}>
              <span>03</span>
              <div>
                <strong>Comunicazione urgente</strong>
                <p>Un messaggio operativo evidenziato nella notifica ai partecipanti.</p>
              </div>
              <Megaphone size={19} aria-hidden="true" />
            </div>

          <label className={styles.organizerEditField} data-disabled={!eventManagementPolicy.canSendOrganizerAlert}>
            <span className={styles.organizerEditFieldHead}>
              <strong>Aggiornamento urgente</strong>
              <small>{eventManagementPolicy.canSendOrganizerAlert ? 'Fino alla fine' : 'Chiuso a fine evento'}</small>
            </span>
            <div className={styles.organizerAlertLabel}>
              <textarea
                rows="2"
                maxLength="280"
                value={organizerEditForm.organizer_alert}
                onChange={(changeEvent) => setOrganizerEditForm((current) => ({
                  ...current,
                  organizer_alert: changeEvent.target.value
                }))}
                placeholder="Es. Ci troviamo all’ingresso laterale."
                disabled={!eventManagementPolicy.canSendOrganizerAlert || organizerEditSubmitting}
              />
            </div>
            <span className={styles.organizerEditFieldFoot}>
              <small>Se cambia, viene evidenziato nella notifica ai partecipanti.</small>
              <small>{organizerEditForm.organizer_alert.length}/280</small>
            </span>
          </label>
          </section> : null}

          <div className={styles.organizerProtectedChanges}>
            <ShieldCheck size={19} aria-hidden="true" />
            <div>
              <strong>Informazioni protette</strong>
              <p>
                {event.is_personal
                  ? 'Sport, data, orario, luogo, immagine e scheda restano quelli definiti alla creazione.'
                  : 'Sport, data, orario, luogo, immagine, scheda, accesso e deposito restano quelli definiti alla pubblicazione.'}
              </p>
            </div>
          </div>

          {!eventManagementPolicy.canEditAnything ? (
            <p className={styles.organizerEditClosed}>
              <Clock3 size={18} aria-hidden="true" /> Le finestre di modifica sono terminate. L’evento resta consultabile senza variazioni.
            </p>
          ) : organizerEditHasChanges ? (
            <section className={styles.organizerEditSummary} aria-label="Riepilogo modifiche">
              <div className={styles.organizerEditSummaryHead}>
                <CheckCircle2 size={18} aria-hidden="true" />
                <div>
                  <strong>Prima di salvare</strong>
                  <small>Controlla cosa cambierà per i partecipanti.</small>
                </div>
              </div>
              <div className={styles.organizerEditSummaryList}>
                {organizerEditChangeItems.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <small>{item.before}</small>
                    <ArrowRight size={13} aria-hidden="true" />
                    <strong>{item.after}</strong>
                  </div>
                ))}
              </div>
              <p>
                {event.is_personal
                  ? 'Le modifiche saranno subito visibili nella tua agenda.'
                  : Number(event.participants_count || 0) > 0
                  ? `${event.participants_count} ${Number(event.participants_count) === 1 ? 'partecipante riceverà' : 'partecipanti riceveranno'} una notifica.`
                  : 'Le modifiche saranno già visibili alle prossime richieste.'}
              </p>
            </section>
          ) : null}

          {canCancelOrganizedEvent ? (
            <section className={styles.organizerDangerDisclosure} data-open={organizerDangerOpen}>
              <button
                type="button"
                className={styles.organizerDangerToggle}
                aria-expanded={organizerDangerOpen}
                onClick={() => setOrganizerDangerOpen((current) => !current)}
              >
                <span>
                  <strong>Elimina evento</strong>
                  <small>Azione permanente</small>
                </span>
                <ChevronDown size={17} aria-hidden="true" />
              </button>
              {organizerDangerOpen ? (
                <div className={styles.organizerDangerZone}>
                  <p>
                    {event.is_personal
                      ? 'Rimuove l’attività dalla tua agenda. Dopo la conferma non potrà essere ripristinata.'
                      : 'Chiude iscrizioni e QR, avvisa tutti e restituisce le quote secondo le regole Motrice.'}
                  </p>
                  <button
                type="button"
                onClick={() => {
                  setOrganizerCancelForm(event.is_personal
                    ? { reasonCode: 'personal', note: '', scope: 'single' }
                    : { reasonCode: '', note: '', scope: 'single' });
                  setOrganizerEditOpen(false);
                  setOrganizerCancelOpen(true);
                }}
                disabled={organizerEditSubmitting}
              >
                <Trash2 size={17} aria-hidden="true" /> Elimina evento
              </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={organizerCancelOpen}
        title={event?.is_personal && event?.personal_series_id ? 'Elimina evento ricorrente' : 'Elimina evento'}
        onClose={() => {
          if (!organizerCancelSubmitting) setOrganizerCancelOpen(false);
        }}
        onConfirm={cancelOrganizedEvent}
        confirmText={organizerCancelSubmitting
          ? 'Eliminazione in corso...'
          : organizerCancelForm.scope === 'series'
            ? 'Elimina ricorrenza'
            : 'Elimina evento'}
        confirmDisabled={!organizerCancelForm.reasonCode || organizerCancelSubmitting}
        confirmClassName={styles.organizerCancelConfirm}
        closeText="Mantieni evento"
      >
        <div className={styles.organizerCancelModal}>
          <div className={styles.organizerCancelWarning}>
            <AlertTriangle size={22} aria-hidden="true" />
            <div>
              <strong>Azione permanente</strong>
              <p>
                {event.is_personal
                  ? organizerCancelForm.scope === 'series'
                    ? 'Le sessioni future della ricorrenza verranno rimosse. Gli allenamenti già svolti resteranno nello storico.'
                    : 'Solo questo evento personale verrà rimosso e non potrà essere recuperato.'
                  : 'Le iscrizioni verranno chiuse, i QR disattivati e tutti gli utenti riceveranno una notifica.'}
              </p>
            </div>
            {!event.is_personal ? <ContextInfoButton
              title="Eliminazione evento"
              description="L’eliminazione rimuove l’attività dalle sezioni attive e informa tutte le persone coinvolte."
              items={[
                { title: 'Partecipanti', text: 'Le iscrizioni vengono chiuse e ogni partecipante riceve una notifica.' },
                { title: 'Depositi', text: 'Le quote interessate vengono restituite secondo le regole mostrate nel riepilogo.' },
                { title: 'Eliminazione tardiva', text: 'Se mancano meno di 24 ore, l’operazione viene registrata come tardiva.' }
              ]}
              note="Dopo la conferma l’evento non può essere riattivato."
            /> : null}
          </div>

          {event.is_personal && event.personal_series_id ? (
            <fieldset className={styles.organizerCancelScope}>
              <legend>Cosa vuoi eliminare?</legend>
              <button
                type="button"
                className={organizerCancelForm.scope === 'single' ? styles.organizerCancelScopeSelected : ''}
                aria-pressed={organizerCancelForm.scope === 'single'}
                onClick={() => setOrganizerCancelForm((current) => ({ ...current, scope: 'single' }))}
                disabled={organizerCancelSubmitting}
              >
                <Trash2 size={18} aria-hidden="true" />
                <span>
                  <strong>Solo questo evento</strong>
                  <small>Le altre date restano programmate</small>
                </span>
              </button>
              <button
                type="button"
                className={organizerCancelForm.scope === 'series' ? styles.organizerCancelScopeSelected : ''}
                aria-pressed={organizerCancelForm.scope === 'series'}
                onClick={() => setOrganizerCancelForm((current) => ({ ...current, scope: 'series' }))}
                disabled={organizerCancelSubmitting}
              >
                <CalendarDays size={18} aria-hidden="true" />
                <span>
                  <strong>Tutta la ricorrenza</strong>
                  <small>Rimuove questa e tutte le date future</small>
                </span>
              </button>
            </fieldset>
          ) : null}

          <div className={styles.organizerCancelSummary}>
            <div><span>Evento</span><strong>{event?.title || event?.sport_name}</strong></div>
            {!event.is_personal ? <>
              <div><span>Partecipanti da rimborsare</span><strong>{refundableParticipantsCount}</strong></div>
              <div><span>Depositi restituiti</span><strong>{formatCurrencyFromCents(refundableDepositCents)}</strong></div>
            </> : null}
          </div>

          {!event.is_personal && cancellationIsLatePreview ? (
            <p className={styles.organizerLateWarning}>
              <AlertTriangle size={17} aria-hidden="true" /> Mancano meno di 24 ore: la cancellazione sarà registrata come tardiva.
            </p>
          ) : null}

          {!event.is_personal ? <label className={styles.organizerCancelField}>
            Motivo <span>obbligatorio</span>
            <select
              value={organizerCancelForm.reasonCode}
              onChange={(changeEvent) => setOrganizerCancelForm((current) => ({
                ...current,
                reasonCode: changeEvent.target.value
              }))}
              disabled={organizerCancelSubmitting}
            >
              <option value="">Seleziona un motivo</option>
              {EVENT_CANCELLATION_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>{reason.label}</option>
              ))}
            </select>
          </label> : null}

          {!event.is_personal ? <label className={styles.organizerCancelField}>
            Messaggio ai partecipanti <span>facoltativo</span>
            <textarea
              rows="3"
              maxLength="500"
              value={organizerCancelForm.note}
              onChange={(changeEvent) => setOrganizerCancelForm((current) => ({
                ...current,
                note: changeEvent.target.value
              }))}
              placeholder="Aggiungi una breve spiegazione..."
              disabled={organizerCancelSubmitting}
            />
            <small>{organizerCancelForm.note.length}/500</small>
          </label> : null}
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellRing,
  CalendarRange,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  Eye,
  Globe2,
  LockKeyhole,
  MapPin,
  MapPinned,
  Minus,
  Plus,
  Repeat2,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Undo2,
  UserRound,
  UserRoundCheck,
  Users,
  UsersRound,
  WalletCards,
  X
} from 'lucide-react';
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { useUserLocation } from '../hooks/useUserLocation';
import { useToast } from '../context/ToastContext';
import { useBilling } from '../context/BillingContext';
import { PREMIUM_FEATURES_FREE } from '../services/entitlements';
import PaywallModal from '../components/PaywallModal';
import Modal from '../components/Modal';
import Button from '../components/Button';
import ContextInfoButton from '../components/ContextInfoButton';
import { ensureLeafletIcons } from '../features/coach/utils/leafletIconFix';
import { markStepByAction } from '../services/tutorialMode';
import { ai, getAiSettings } from '../services/ai';
import { geocodeEventLocation, reverseGeocodeCoordinates, searchLocations } from '../services/geocoding';
import { downloadEventIcs } from '../utils/ics';
import { getHighDefinitionRasterTiles } from '../utils/mapRendering';
import {
  getSystemEventRules,
  GROUP_CHECK_IN_GRACE_MINUTES
} from '../utils/eventCreationRules';
import {
  GYM_ACCESS_PARTICIPANT_CHOICE,
  VENUE_TYPE_GYM,
  VENUE_TYPE_STANDARD,
  getGymAccessPresentation,
  normalizeGymVenueKey
} from '../utils/eventVenueAccess';
import {
  ensurePersonalWorkoutPlanRemote,
  listAvailablePersonalWorkoutPlans
} from '../features/coach/services/personalWorkoutPlansApi';
import {
  PERSONAL_RECURRENCE_DAYS,
  PERSONAL_RECURRENCE_WEEKS,
  buildPersonalRecurrencePreview,
  createPersonalWeeklySchedule,
  getEnabledPersonalRecurrenceDays,
  getPersonalRecurrenceDayId,
  serializePersonalWeeklySchedule
} from '../utils/personalEventRecurrence';
import styles from '../styles/pages/createEvent.module.css';

const initialGroupRules = getSystemEventRules({ durationMinutes: 120 });
const CREATE_EVENT_MAP_TILES = getHighDefinitionRasterTiles('light');

const initialState = {
  title: '',
  city: '',
  sport_id: '',
  level: 'beginner',
  event_datetime: '',
  duration_minutes: 120,
  deposit_cents: 1000,
  minimum_presence_minutes: initialGroupRules.minimumPresenceMinutes,
  verification_mode: initialGroupRules.verificationMode,
  geofence_radius_m: initialGroupRules.geofenceRadiusM,
  checkin_grace_minutes: initialGroupRules.checkInGraceMinutes,
  completion_xp: initialGroupRules.completionXp,
  review_bonus_xp: initialGroupRules.reviewBonusXp,
  max_participants: 8,
  audience: 'mixed',
  min_age: 18,
  max_age: 99,
  participation_protection: true,
  visibility: 'public',
  join_policy: 'open',
  add_to_calendar: true,
  is_personal: false,
  location_name: '',
  lat: '',
  lng: '',
  venue_type: VENUE_TYPE_STANDARD,
  gym_access_policy: null,
  gym_venue_key: null,
  description: '',
  scheda_id: null,
  has_route: false,
  route_name: '',
  route_from: '',
  route_to: '',
  route_from_lat: '',
  route_from_lng: '',
  route_to_lat: '',
  route_to_lng: '',
  route_distance_km: '',
  route_elevation_gain_m: '',
  route_map_url: '',
  route_points: []
};

const ROUTE_SPORT_SLUGS = new Set(['running', 'bici', 'trekking', 'ciclismo', 'cycling', 'trail']);

const WIZARD_STEPS = [
  { id: 1, label: 'Info base', description: 'Sport, livello e orario' },
  { id: 2, label: 'Luogo', description: 'Posizione e percorso' },
  { id: 3, label: 'Regole', description: 'Accesso, deposito e contenuti' },
  { id: 4, label: 'Riepilogo', description: 'Controlla e conferma il tuo evento' }
];

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzato' },
  { value: 'all', label: 'Open' }
];

const DURATION_PRESETS = [60, 90, 120];
const CHECK_IN_GRACE_PRESETS = GROUP_CHECK_IN_GRACE_MINUTES;
const TIME_QUICK_OPTIONS = ['07:00', '12:30', '18:00', '18:30', '19:00', '20:00'];

const AUDIENCE_OPTIONS = [
  { value: 'mixed', label: 'Misto', copy: 'Aperto a tutti, senza distinzioni.', icon: UsersRound },
  { value: 'male', label: 'Maschile', copy: 'Categoria maschile.', icon: UserRound },
  { value: 'female', label: 'Femminile', copy: 'Categoria femminile.', icon: UserRoundCheck }
];

const SPORT_VISUALS = {
  'palestra-outdoor': {
    emoji: '🌳',
    cardImage: '/images/hero-palestra-outdoor-v2.webp',
    subtitle: 'Corpo libero · Calisthenics'
  },
  running: { emoji: '🏃', cardImage: '/images/hero-running-v2.webp', subtitle: 'Gruppi corsa' },
  padel: { emoji: '🎾', cardImage: '/images/hero-padel-v2.webp', subtitle: 'Doppio · Singolo' },
  calcio: { emoji: '⚽', cardImage: '/images/hero-calcio-v2.webp', subtitle: '5vs5 · 11vs11' },
  palestra: { emoji: '🏋️', cardImage: '/images/hero-palestra-v2.webp', subtitle: 'Forza · Fitness' },
  bici: { emoji: '🚴', cardImage: '/images/hero-bici-v2.webp', subtitle: 'Strada · Gravel' },
  trekking: { emoji: '🥾', cardImage: '/images/hero-trekking-v2.webp', subtitle: 'Sentieri · Gruppi' }
};

const CREATE_SPORT_ORDER = [
  'palestra-outdoor',
  'palestra',
  'running',
  'trekking',
  'calcio',
  'padel'
];

const STEP_ERROR_FIELDS = {
  1: ['title', 'sport_id', 'event_datetime', 'duration_minutes', 'max_participants', 'audience', 'min_age', 'max_age'],
  2: [
    'city',
    'location_name',
    'coordinates',
    'route_name',
    'route_from',
    'route_to',
    'route_distance_km',
    'route_elevation_gain_m',
    'route_map_url'
  ],
  3: [
    'deposit_cents',
    'checkin_grace_minutes',
    'visibility',
    'join_policy',
    'description',
    'recurrence_days',
    'recurrence_times',
    'recurrence_plans'
  ],
  4: []
};

function getStepErrorFields(stepId, isPersonal) {
  const fields = STEP_ERROR_FIELDS[stepId] || [];
  if (!isPersonal) return fields;
  if (stepId === 1) {
    return fields.filter((field) => !['title', 'event_datetime', 'duration_minutes'].includes(field));
  }
  if (stepId === 3) {
    return [...fields, 'event_datetime', 'duration_minutes'];
  }
  return fields;
}

function getWorkoutPlanValue(plan) {
  return String(plan?.remoteId || plan?.id || '');
}

const NON_KEYBOARD_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'file',
  'hidden',
  'month',
  'radio',
  'range',
  'reset',
  'submit',
  'time',
  'week'
]);

function isKeyboardInput(target) {
  const tagName = String(target?.tagName || '').toLowerCase();
  if (tagName === 'textarea') return true;
  if (target?.isContentEditable) return true;
  if (tagName !== 'input') return false;
  return !NON_KEYBOARD_INPUT_TYPES.has(String(target?.type || 'text').toLowerCase());
}

function getTimeParts(value = '') {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value));
  if (!match) return { hour: '', minute: '' };
  return { hour: match[1], minute: match[2] };
}

function toLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value = '') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEventDateLabel(value = '') {
  const date = parseLocalDate(value);
  if (!date) return 'Scegli data';
  const label = new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1).replace(/\.$/, '');
}

function getDateValueWithOffset(offsetDays) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return toLocalDateInputValue(date);
}

function getWeekendDateValue() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const daysUntilSaturday = (6 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  return toLocalDateInputValue(date);
}

function getEventEndTime(startTime = '', durationMinutes = 0) {
  const { hour, minute } = getTimeParts(startTime);
  const duration = Number(durationMinutes);
  if (!hour || !minute || !Number.isFinite(duration) || duration <= 0) return '';
  const totalMinutes = Number(hour) * 60 + Number(minute) + duration;
  const endHour = Math.floor((totalMinutes % 1440) / 60);
  const endMinute = totalMinutes % 60;
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

function useKeyboardVisibility() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    const compactViewport = window.matchMedia('(max-width: 47.99rem), (pointer: coarse)');
    let expandedViewportHeight = Math.max(window.innerHeight, visualViewport?.height || 0);
    let focusTimer = null;

    const isCompactViewport = () => compactViewport.matches || window.innerWidth < 768;

    const syncKeyboardVisibility = () => {
      const viewportHeight = visualViewport?.height || window.innerHeight;
      const hasKeyboardInputFocus = isKeyboardInput(document.activeElement);

      if (!hasKeyboardInputFocus) {
        expandedViewportHeight = Math.max(expandedViewportHeight, viewportHeight, window.innerHeight);
        setKeyboardVisible(false);
        return;
      }

      const viewportReduction = expandedViewportHeight - viewportHeight;
      setKeyboardVisible(isCompactViewport() && (viewportReduction > 120 || !visualViewport));
    };

    const queueSync = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(syncKeyboardVisibility, 100);
    };

    const handleFocusIn = (event) => {
      if (!isCompactViewport() || !isKeyboardInput(event.target)) return;
      if (!visualViewport) setKeyboardVisible(true);
      queueSync();
    };

    const handleViewportChange = () => {
      if (!isKeyboardInput(document.activeElement)) {
        expandedViewportHeight = Math.max(
          expandedViewportHeight,
          visualViewport?.height || window.innerHeight,
          window.innerHeight
        );
      }
      syncKeyboardVisibility();
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', queueSync);
    window.addEventListener('resize', handleViewportChange);
    compactViewport.addEventListener?.('change', handleViewportChange);
    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', queueSync);
      window.removeEventListener('resize', handleViewportChange);
      compactViewport.removeEventListener?.('change', handleViewportChange);
      visualViewport?.removeEventListener('resize', handleViewportChange);
      visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  return keyboardVisible;
}

function getSportKey(sport) {
  return String(sport?.slug || sport?.name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function getSportVisual(sport) {
  const key = getSportKey(sport);
  return SPORT_VISUALS[key] || { emoji: '🏅', subtitle: 'Allenamento di gruppo' };
}

function getEventDisplayTitle(form, sport) {
  const customTitle = String(form?.title || '').trim();
  if (customTitle) return customTitle;

  const sportName = String(sport?.name || 'Evento sportivo').trim();
  const location = String(form?.location_name || form?.city || '').trim();
  return [sportName, location].filter(Boolean).join(' · ').slice(0, 100);
}

function isValidRoutePoint(point) {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1]))
  );
}

function calculateRouteDistanceKm(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  const earthRadiusKm = 6371;
  const toRadians = (value) => (Number(value) * Math.PI) / 180;

  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    const lat1 = toRadians(previous[0]);
    const lat2 = toRadians(point[0]);
    const deltaLat = lat2 - lat1;
    const deltaLng = toRadians(point[1]) - toRadians(previous[1]);
    const haversine =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    const segmentKm = earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return total + segmentKm;
  }, 0);
}

function calculateDistanceMeters(from, to) {
  const fromLat = Number(from?.lat);
  const fromLng = Number(from?.lng);
  const toLat = Number(to?.lat);
  const toLng = Number(to?.lng);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return null;

  const earthRadiusM = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return earthRadiusM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function formatDistanceMeters(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance)) return '';
  if (distance < 1000) return `${Math.max(1, Math.round(distance))} m da te`;
  return `${(distance / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} km da te`;
}

function RouteMapTapHandler({ active, onAddPoint }) {
  useMapEvents({
    click(event) {
      if (!active) return;
      onAddPoint([event.latlng.lat, event.latlng.lng]);
    }
  });
  return null;
}

function LocationMapCenterHandler({ onMoveStart, onSelect }) {
  const lastCenterRef = useRef(null);
  const resolveTimerRef = useRef(null);
  const map = useMapEvents({
    dragstart() {
      onMoveStart?.();
    },
    moveend() {
      const center = map.getCenter();
      const previous = lastCenterRef.current;
      lastCenterRef.current = { lat: center.lat, lng: center.lng };
      if (
        previous &&
        Math.abs(previous.lat - center.lat) < 0.000001 &&
        Math.abs(previous.lng - center.lng) < 0.000001
      ) {
        return;
      }
      window.clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = window.setTimeout(() => {
        onSelect({ lat: center.lat, lng: center.lng });
      }, 360);
    }
  });

  useEffect(() => {
    const center = map.getCenter();
    lastCenterRef.current = { lat: center.lat, lng: center.lng };
    return () => window.clearTimeout(resolveTimerRef.current);
  }, [map]);

  return null;
}

function LocationRadiusPreview({ radius }) {
  const [center, setCenter] = useState(null);
  const map = useMapEvents({
    move() {
      const nextCenter = map.getCenter();
      setCenter([nextCenter.lat, nextCenter.lng]);
    }
  });

  useEffect(() => {
    const nextCenter = map.getCenter();
    setCenter([nextCenter.lat, nextCenter.lng]);
  }, [map]);

  if (!center) return null;

  return (
    <Circle
      center={center}
      radius={radius}
      interactive={false}
      pathOptions={{
        color: '#a8f000',
        fillColor: '#a8f000',
        fillOpacity: 0.16,
        opacity: 0.9,
        weight: 2.5
      }}
    />
  );
}

function CreateEventPage() {
  ensureLeafletIcons();
  const { entitlements } = useBilling();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [sports, setSports] = useState([]);
  const [form, setForm] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [creationStats, setCreationStats] = useState({ created_this_month: 0, month: '' });
  const [moneyWallet, setMoneyWallet] = useState(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [routePicking, setRoutePicking] = useState(false);
  const [manualRouteSelection, setManualRouteSelection] = useState(false);
  const [locationResolving, setLocationResolving] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSearchResults, setLocationSearchResults] = useState([]);
  const [locationMapRevision, setLocationMapRevision] = useState(0);
  const [locationSelectionMessage, setLocationSelectionMessage] = useState('');
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [stepDirection, setStepDirection] = useState('forward');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [activeWhenPanel, setActiveWhenPanel] = useState(null);
  const [workoutPlans, setWorkoutPlans] = useState([]);
  const [workoutPlansLoading, setWorkoutPlansLoading] = useState(false);
  const [workoutPlanPickerOpen, setWorkoutPlanPickerOpen] = useState(false);
  const [workoutPlanPreviewOpen, setWorkoutPlanPreviewOpen] = useState(false);
  const [workoutPlanQuery, setWorkoutPlanQuery] = useState('');
  const [selectedWorkoutPlan, setSelectedWorkoutPlan] = useState(null);
  const [pendingWorkoutPlan, setPendingWorkoutPlan] = useState(null);
  const [recurrenceMode, setRecurrenceMode] = useState('once');
  const [weeklySchedule, setWeeklySchedule] = useState(() => createPersonalWeeklySchedule());
  const [submitting, setSubmitting] = useState(false);
  const creationLimit = PREMIUM_FEATURES_FREE || creationStats.is_unlimited
    ? Number.POSITIVE_INFINITY
    : Number.isFinite(Number(creationStats.max_events_per_month))
      ? Number(creationStats.max_events_per_month)
      : entitlements.maxEventsPerMonth;
  const keyboardVisible = useKeyboardVisibility();
  const groupSettingsRef = useRef(null);
  const recurrencePlansLoadedRef = useRef(false);
  const recurrenceScheduleTouchedRef = useRef(false);
  const locationRequestRef = useRef(null);
  const autoLocationAttemptedRef = useRef(false);
  const {
    coords: userLocationCoords,
    permission: locationPermission,
    error: userLocationError,
    requesting: locationRequesting,
    requestLocation
  } = useUserLocation();
  const aiEnabled = getAiSettings().enableLocalAI;
  const eventEndTime = useMemo(
    () => getEventEndTime(eventTime, form.duration_minutes),
    [eventTime, form.duration_minutes]
  );
  const todayDateValue = toLocalDateInputValue();
  const fixedLocationLabel = form.is_personal ? 'Punto d’allenamento' : 'Punto d’incontro';
  const fixedLocationLabelLower = form.is_personal ? 'punto d’allenamento' : 'punto d’incontro';

  const refreshCreationStats = useCallback(async () => {
    const nextStats = await api.getEventCreationStats();
    setCreationStats(nextStats);
    return nextStats;
  }, []);

  function toggleWhenPanel(panel) {
    if (panel === 'time' && !eventDate) {
      setActiveWhenPanel('date');
      showToast('Scegli prima la data', 'info');
      return;
    }
    if (panel === 'duration' && !eventTime) {
      setActiveWhenPanel(eventDate ? 'time' : 'date');
      showToast(eventDate ? 'Scegli prima l’orario' : 'Scegli prima data e orario', 'info');
      return;
    }
    setActiveWhenPanel((current) => current === panel ? null : panel);
  }

  function selectEventDate(value) {
    if (!value) return;
    setEventDate(value);
    syncUntouchedPersonalRecurrence(value, eventTime);
    if (value === todayDateValue && eventTime) {
      const selectedDateTime = new Date(`${value}T${eventTime}`);
      if (selectedDateTime.getTime() <= Date.now()) setEventTime('');
    }
    setActiveWhenPanel('time');
  }

  function selectEventTime(value) {
    if (!value) return;
    const selectedDate = eventDate || todayDateValue;
    const selectedDateTime = new Date(`${selectedDate}T${value}`);
    if (selectedDate === todayDateValue && selectedDateTime.getTime() <= Date.now()) {
      showToast('Scegli un orario successivo a quello attuale', 'error');
      return;
    }
    setEventTime(value);
    syncUntouchedPersonalRecurrence(eventDate || todayDateValue, value);
    setActiveWhenPanel('duration');
  }

  function syncUntouchedPersonalRecurrence(dateValue, timeValue) {
    if (
      !form.is_personal ||
      recurrenceMode !== 'weekly' ||
      recurrenceScheduleTouchedRef.current
    ) return;

    const preferredDay = getPersonalRecurrenceDayId(dateValue);
    if (!preferredDay) return;
    setWeeklySchedule((current) => {
      const previouslyEnabled = getEnabledPersonalRecurrenceDays(current)[0];
      const previousConfiguration = previouslyEnabled ? current[previouslyEnabled.id] : null;
      const next = createPersonalWeeklySchedule(timeValue || previousConfiguration?.time || '18:00');
      next[preferredDay] = {
        enabled: true,
        time: timeValue || previousConfiguration?.time || '18:00',
        planId: previousConfiguration?.planId || getWorkoutPlanValue(selectedWorkoutPlan)
      };
      return next;
    });
  }

  function selectEventDuration(minutes) {
    setField('duration_minutes', minutes);
    setActiveWhenPanel(null);
  }

  const filteredWorkoutPlans = useMemo(() => {
    const query = String(workoutPlanQuery || '').trim().toLowerCase();
    if (!query) return workoutPlans;
    return workoutPlans.filter((plan) =>
      `${plan.title || ''} ${plan.type || ''}`.toLowerCase().includes(query)
    );
  }, [workoutPlanQuery, workoutPlans]);
  const recurringDays = useMemo(
    () => getEnabledPersonalRecurrenceDays(weeklySchedule),
    [weeklySchedule]
  );
  const recurrencePreview = useMemo(
    () => buildPersonalRecurrencePreview({
      startDate: eventDate,
      schedule: weeklySchedule,
      weeks: PERSONAL_RECURRENCE_WEEKS
    }),
    [eventDate, weeklySchedule]
  );
  const workoutPlansById = useMemo(
    () => new Map(workoutPlans.map((plan) => [getWorkoutPlanValue(plan), plan])),
    [workoutPlans]
  );

  usePageMeta({
    title: 'Crea Sessione | Motrice',
    description: 'Pubblica una nuova sessione sportiva e connetti atleti nella tua area.'
  });

  useEffect(() => {
    api.listSports().then(setSports);
    refreshCreationStats().catch(() => {});
    api.getMoneyWallet?.().then(setMoneyWallet).catch(() => {
      // La migrazione può non essere ancora presente nelle installazioni precedenti.
    });

    function onAuthChanged() {
      refreshCreationStats().catch(() => {});
    }

    window.addEventListener('motrice-auth-changed', onAuthChanged);
    return () => window.removeEventListener('motrice-auth-changed', onAuthChanged);
  }, [refreshCreationStats]);

  useEffect(() => () => locationRequestRef.current?.abort(), []);

  async function openWorkoutPlanPicker() {
    setWorkoutPlanPickerOpen(true);
    setPendingWorkoutPlan(selectedWorkoutPlan);
    setWorkoutPlansLoading(true);
    try {
      setWorkoutPlans(await listAvailablePersonalWorkoutPlans());
    } catch (error) {
      showToast(error.message || 'Schede personali non disponibili', 'error');
    } finally {
      setWorkoutPlansLoading(false);
    }
  }

  useEffect(() => {
    if (
      activeStep !== 3 ||
      !form.is_personal ||
      recurrenceMode !== 'weekly' ||
      recurrencePlansLoadedRef.current
    ) return undefined;

    let active = true;
    recurrencePlansLoadedRef.current = true;
    setWorkoutPlansLoading(true);
    listAvailablePersonalWorkoutPlans()
      .then((plans) => {
        if (active) setWorkoutPlans(plans);
      })
      .catch((error) => {
        recurrencePlansLoadedRef.current = false;
        if (active) showToast(error.message || 'Schede personali non disponibili', 'error');
      })
      .finally(() => {
        if (active) setWorkoutPlansLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeStep, form.is_personal, recurrenceMode, showToast]);

  function attachPendingWorkoutPlan() {
    setSelectedWorkoutPlan(pendingWorkoutPlan);
    setForm((current) => ({
      ...current,
      scheda_id: pendingWorkoutPlan?.remoteId || pendingWorkoutPlan?.id || null
    }));
    setWorkoutPlanPickerOpen(false);
    if (pendingWorkoutPlan) showToast('Scheda allegata all’evento', 'success');
  }

  function removeWorkoutPlan() {
    setSelectedWorkoutPlan(null);
    setPendingWorkoutPlan(null);
    setForm((current) => ({ ...current, scheda_id: null }));
    setWorkoutPlanPreviewOpen(false);
  }

  useEffect(() => {
    const eventDateTime = eventDate && eventTime ? `${eventDate}T${eventTime}` : '';
    setForm((prev) => (prev.event_datetime === eventDateTime ? prev : { ...prev, event_datetime: eventDateTime }));
    if (eventDateTime) {
      setErrors((prev) => {
        if (!prev.event_datetime) return prev;
        const next = { ...prev };
        delete next.event_datetime;
        return next;
      });
    }
  }, [eventDate, eventTime]);

  const selectedSport = useMemo(
    () => sports.find((item) => String(item.id) === String(form.sport_id)) || null,
    [sports, form.sport_id]
  );

  const orderedSports = useMemo(() => {
    const rankBySlug = new Map(CREATE_SPORT_ORDER.map((slug, index) => [slug, index]));
    return sports
      .filter((sport) => rankBySlug.has(getSportKey(sport)))
      .sort((left, right) => rankBySlug.get(getSportKey(left)) - rankBySlug.get(getSportKey(right)));
  }, [sports]);

  const selectedSportHasRoute = useMemo(() => {
    const slug = String(selectedSport?.slug || '').toLowerCase();
    return ROUTE_SPORT_SLUGS.has(slug);
  }, [selectedSport]);

  const locationPreview = useMemo(() => {
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!form.lat || !form.lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }, [form.lat, form.lng]);

  const routePoints = useMemo(
    () => (Array.isArray(form.route_points) ? form.route_points.filter(isValidRoutePoint) : []),
    [form.route_points]
  );

  const routeMapCenter = useMemo(() => {
    if (routePoints.length) return routePoints[0];
    if (locationPreview) return [locationPreview.lat, locationPreview.lng];
    return [41.8719, 12.5674];
  }, [locationPreview, routePoints]);

  const routeEstimatedMinutes = useMemo(() => {
    const distance = Number(form.route_distance_km);
    if (!Number.isFinite(distance) || distance <= 0) return 0;
    const slug = String(selectedSport?.slug || '').toLowerCase();
    const minutesPerKm = ['trekking', 'trail'].includes(slug) ? 15 : ['bici', 'ciclismo', 'cycling'].includes(slug) ? 4 : 7;
    return Math.max(1, Math.round(distance * minutesPerKm));
  }, [form.route_distance_km, selectedSport]);

  const locationMapCenter = useMemo(
    () => (locationPreview ? [locationPreview.lat, locationPreview.lng] : [41.8719, 12.5674]),
    [locationPreview]
  );

  const geofenceRadius = useMemo(
    () => Math.min(1000, Math.max(50, Number(form.geofence_radius_m) || 250)),
    [form.geofence_radius_m]
  );

  const checkInWindowPreview = useMemo(() => {
    const startsAt = new Date(form.event_datetime || '');
    if (Number.isNaN(startsAt.getTime())) {
      return 'Il check-in apre 30 minuti prima dell’orario dell’evento.';
    }
    const opensAt = new Date(startsAt.getTime() - 30 * 60 * 1000);
    const closesAt = new Date(
      startsAt.getTime() + Number(form.checkin_grace_minutes || 0) * 60 * 1000
    );
    const formatTime = (value) => value.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `Check-in disponibile dalle ${formatTime(opensAt)} alle ${formatTime(closesAt)}.`;
  }, [form.checkin_grace_minutes, form.event_datetime]);

  const locationMapZoom = useMemo(() => {
    if (!locationPreview) return 6;
    if (geofenceRadius >= 750) return 13;
    if (geofenceRadius >= 400) return 14;
    if (geofenceRadius >= 200) return 15;
    return 16;
  }, [geofenceRadius, locationPreview]);

  const locationDistanceFromUser = useMemo(
    () => calculateDistanceMeters(userLocationCoords, locationPreview),
    [locationPreview, userLocationCoords]
  );

  const locationAccuracyLabel = useMemo(() => {
    const accuracy = Number(userLocationCoords?.accuracy);
    if (!Number.isFinite(accuracy) || accuracy <= 0) return '';
    return `±${Math.max(1, Math.round(accuracy))} m`;
  }, [userLocationCoords]);

  useEffect(() => {
    if (activeStep !== 2 || locationPreview || autoLocationAttemptedRef.current) return;

    autoLocationAttemptedRef.current = true;
    setLocationSelectionMessage('Cerco la tua area e centro la mappa...');

    void (async () => {
      const coords = userLocationCoords || (await requestLocation());
      if (!coords) {
        setLocationSelectionMessage('Posizione non disponibile. Attiva il GPS per centrare la mappa nella tua area.');
        return;
      }
      await resolveSelectedCoordinates(coords, { source: 'device' });
    })();
  }, [activeStep, locationPreview, requestLocation, userLocationCoords]);

  useEffect(() => {
    if (activeStep !== 2 || !form.has_route || routePoints.length >= 2) return;
    setManualRouteSelection(true);
    setRoutePicking(true);
  }, [activeStep, form.has_route, routePoints.length]);

  function setField(key, value) {
    setForm((prev) => {
      if (key !== 'duration_minutes') return { ...prev, [key]: value };
      const rules = getSystemEventRules({
        durationMinutes: value,
        isPersonal: prev.is_personal,
        checkInGraceMinutes: prev.checkin_grace_minutes
      });
      return {
        ...prev,
        [key]: value,
        minimum_presence_minutes: rules.minimumPresenceMinutes,
        verification_mode: rules.verificationMode,
        geofence_radius_m: rules.geofenceRadiusM,
        checkin_grace_minutes: rules.checkInGraceMinutes,
        completion_xp: rules.completionXp,
        review_bonus_xp: rules.reviewBonusXp
      };
    });
    if (['city', 'location_name', 'lat', 'lng'].includes(key)) setLocationConfirmed(false);
    setErrors((prev) => {
      const errorKey = key === 'lat' || key === 'lng' ? 'coordinates' : key;
      const linkedAgeField = key === 'min_age' ? 'max_age' : key === 'max_age' ? 'min_age' : '';
      if (!prev[errorKey] && (!linkedAgeField || !prev[linkedAgeField])) return prev;
      const next = { ...prev };
      delete next[errorKey];
      if (linkedAgeField) delete next[linkedAgeField];
      return next;
    });
  }

  function onSportChange(value) {
    setForm((prev) => ({
      ...prev,
      sport_id: value,
      has_route:
        (() => {
          const sport = sports.find((item) => String(item.id) === String(value));
          const slug = String(sport?.slug || '').toLowerCase();
          if (!slug) return prev.has_route;
          return ROUTE_SPORT_SLUGS.has(slug);
        })()
    }));
    setErrors((prev) => {
      if (!prev.sport_id) return prev;
      const next = { ...prev };
      delete next.sport_id;
      return next;
    });
  }

  function changeParticipantCount(delta) {
    const current = Number(form.max_participants || 2);
    const minimum = form.is_personal ? 1 : 2;
    setField('max_participants', Math.min(500, Math.max(minimum, current + delta)));
  }

  function setVisibility(value) {
    if (form.is_personal) return;
    setForm((prev) => ({
      ...prev,
      visibility: value,
      join_policy: value === 'private' ? 'open' : prev.join_policy
    }));
    setErrors((prev) => {
      if (!prev.visibility && !prev.join_policy) return prev;
      const next = { ...prev };
      delete next.visibility;
      delete next.join_policy;
      return next;
    });
  }

  function togglePersonalEvent(enabled) {
    if (Boolean(enabled) === Boolean(form.is_personal)) return;

    if (enabled) {
      groupSettingsRef.current = {
        title: form.title,
        description: form.description,
        visibility: form.visibility,
        join_policy: form.join_policy,
        max_participants: form.max_participants,
        deposit_cents: form.deposit_cents,
        checkin_grace_minutes: form.checkin_grace_minutes,
        participation_protection: form.participation_protection
      };
      setForm((prev) => {
        const rules = getSystemEventRules({ durationMinutes: prev.duration_minutes, isPersonal: true });
        return {
          ...prev,
          title: '',
          description: '',
          is_personal: true,
          participation_protection: false,
          visibility: 'private',
          join_policy: 'open',
          max_participants: 1,
          deposit_cents: 0,
          minimum_presence_minutes: rules.minimumPresenceMinutes,
          verification_mode: rules.verificationMode,
          geofence_radius_m: rules.geofenceRadiusM,
          checkin_grace_minutes: rules.checkInGraceMinutes,
          completion_xp: rules.completionXp,
          review_bonus_xp: rules.reviewBonusXp
        };
      });
      return;
    }

    setRecurrenceMode('once');
    recurrenceScheduleTouchedRef.current = false;
    const previous = groupSettingsRef.current || {};
    setForm((prev) => {
      const rules = getSystemEventRules({
        durationMinutes: prev.duration_minutes,
        checkInGraceMinutes: previous.checkin_grace_minutes ?? 15
      });
      return {
        ...prev,
        title: previous.title || '',
        description: previous.description || '',
        is_personal: false,
        participation_protection: previous.participation_protection ?? true,
        visibility: previous.visibility || 'public',
        join_policy: previous.join_policy || 'open',
        max_participants: Math.max(2, Number(previous.max_participants || 8)),
        deposit_cents: 1000,
        minimum_presence_minutes: rules.minimumPresenceMinutes,
        verification_mode: rules.verificationMode,
        geofence_radius_m: rules.geofenceRadiusM,
        checkin_grace_minutes: rules.checkInGraceMinutes,
        completion_xp: rules.completionXp,
        review_bonus_xp: rules.reviewBonusXp
      };
    });
  }

  function selectRecurrenceMode(mode) {
    const nextMode = mode === 'weekly' ? 'weekly' : 'once';
    setRecurrenceMode(nextMode);
    recurrenceScheduleTouchedRef.current = false;
    if (nextMode !== 'weekly') return;

    if (!eventTime) setEventTime('18:00');

    setWeeklySchedule((current) => {
      if (getEnabledPersonalRecurrenceDays(current).length > 0) return current;
      const preferredDay = getPersonalRecurrenceDayId(eventDate) || 'monday';
      return {
        ...current,
        [preferredDay]: {
          ...current[preferredDay],
          enabled: true,
          time: eventTime || current[preferredDay]?.time || '18:00',
          planId: getWorkoutPlanValue(selectedWorkoutPlan)
        }
      };
    });
  }

  function toggleRecurringDay(dayId) {
    recurrenceScheduleTouchedRef.current = true;
    setWeeklySchedule((current) => ({
      ...current,
      [dayId]: {
        ...current[dayId],
        enabled: !current[dayId]?.enabled,
        time: current[dayId]?.time || eventTime || '18:00',
        planId: current[dayId]?.planId || ''
      }
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next.recurrence_days;
      return next;
    });
  }

  function updateRecurringDay(dayId, field, value) {
    recurrenceScheduleTouchedRef.current = true;
    setWeeklySchedule((current) => ({
      ...current,
      [dayId]: {
        ...current[dayId],
        [field]: value
      }
    }));
    setErrors((current) => {
      const next = { ...current };
      if (field === 'time') delete next.recurrence_times;
      if (field === 'planId') delete next.recurrence_plans;
      return next;
    });
  }

  function clearRouteFieldErrors() {
    setErrors((prev) => {
      const next = { ...prev };
      ['route_name', 'route_from', 'route_to', 'route_distance_km'].forEach((field) => delete next[field]);
      return next;
    });
  }

  async function addRoutePoint(point) {
    if (!isValidRoutePoint(point)) return;
    if (routePoints.length >= 30) {
      showToast('Puoi inserire al massimo 30 punti per percorso', 'error');
      return;
    }

    const normalizedPoint = [Number(point[0]), Number(point[1])];
    const pointIndex = routePoints.length;
    setForm((prev) => {
      const currentPoints = Array.isArray(prev.route_points) ? prev.route_points.filter(isValidRoutePoint) : [];
      const nextPoints = [...currentPoints, normalizedPoint];
      const firstPoint = nextPoints[0];
      const lastPoint = nextPoints[nextPoints.length - 1];
      const distanceKm = calculateRouteDistanceKm(nextPoints);

      return {
        ...prev,
        has_route: true,
        lat: nextPoints.length === 1 ? String(firstPoint[0]) : prev.lat || String(firstPoint[0]),
        lng: nextPoints.length === 1 ? String(firstPoint[1]) : prev.lng || String(firstPoint[1]),
        route_name: prev.route_name || 'Percorso selezionato sulla mappa',
        route_from: prev.route_from || 'Partenza selezionata',
        route_to: nextPoints.length >= 2 ? prev.route_to || 'Arrivo selezionato' : prev.route_to,
        route_from_lat: String(firstPoint[0]),
        route_from_lng: String(firstPoint[1]),
        route_to_lat: nextPoints.length >= 2 ? String(lastPoint[0]) : '',
        route_to_lng: nextPoints.length >= 2 ? String(lastPoint[1]) : '',
        route_distance_km: nextPoints.length >= 2 ? distanceKm.toFixed(1) : '',
        route_points: nextPoints
      };
    });
    clearRouteFieldErrors();

    try {
      const result = await reverseGeocodeCoordinates(normalizedPoint[0], normalizedPoint[1]);
      const pointLabel = result.locationName || result.label || `${normalizedPoint[0].toFixed(5)}, ${normalizedPoint[1].toFixed(5)}`;
      setForm((prev) => ({
        ...prev,
        city: pointIndex === 0 ? result.city || prev.city : prev.city,
        location_name: pointIndex === 0 ? pointLabel : prev.location_name,
        route_name:
          prev.route_name === 'Percorso selezionato sulla mappa' || !prev.route_name
            ? `${selectedSport?.name || 'Percorso'} ${result.city || pointLabel}`
            : prev.route_name,
        route_from: pointIndex === 0 ? pointLabel : prev.route_from,
        route_to: pointIndex > 0 ? pointLabel : prev.route_to
      }));
      setErrors((prev) => {
        const next = { ...prev };
        ['city', 'location_name', 'route_name', 'route_from', 'route_to'].forEach((field) => delete next[field]);
        return next;
      });
    } catch {
      // Le coordinate restano valide anche quando il servizio indirizzi non risponde.
    }
  }

  function setLocationMode(hasRoute) {
    setForm((prev) => ({
      ...prev,
      has_route: hasRoute,
      venue_type: hasRoute ? VENUE_TYPE_STANDARD : prev.venue_type,
      gym_access_policy: hasRoute ? null : prev.gym_access_policy,
      gym_venue_key: hasRoute ? null : prev.gym_venue_key
    }));
    setLocationConfirmed(false);
    setLocationSearchResults([]);
    clearRouteFieldErrors();
    if (hasRoute) {
      setLocationSelectionMessage('Tocca la mappa per impostare partenza, tappe e arrivo.');
      setManualRouteSelection(true);
      setRoutePicking(routePoints.length < 2);
      return;
    }
    setLocationSelectionMessage(
      locationPreview
        ? `Controlla il pin centrale e conferma il ${fixedLocationLabelLower}.`
        : 'Cerca un luogo oppure centra la mappa sulla tua posizione.'
    );
    setRoutePicking(false);
    setManualRouteSelection(false);
  }

  async function useCurrentLocationForMode() {
    const coords = (await requestLocation()) || userLocationCoords;
    if (!coords) {
      showToast('Attiva la geolocalizzazione per usare la tua posizione', 'error');
      return;
    }
    if (form.has_route) {
      await addRoutePoint([coords.lat, coords.lng]);
      setRoutePicking(true);
      return;
    }
    await resolveSelectedCoordinates(coords, { source: 'device' });
  }

  async function searchLocationForMode() {
    const query = String(locationSearchQuery || '').trim();
    if (!query) {
      showToast('Inserisci un luogo da cercare', 'error');
      return;
    }

    setLocationResolving(true);
    setLocationSearchResults([]);
    setLocationSelectionMessage('Cerco il nome della palestra, centri sportivi e indirizzi vicini...');
    try {
      const searchQuery = form.city && !query.includes(',')
        ? `${query}, ${form.city}`
        : query;
      const results = await searchLocations(searchQuery, {
        center: userLocationCoords || locationPreview,
        limit: 6,
        radiusKm: 30
      });
      if (!results.length) throw new Error(`Nessun luogo trovato per “${query}”`);
      setLocationSearchResults(results);
      setLocationSelectionMessage(
        `${results.length} ${results.length === 1 ? 'risultato trovato' : 'risultati trovati'}. Seleziona il luogo corretto.`
      );
    } catch (error) {
      const message = error.message || 'Luogo non trovato';
      setLocationSelectionMessage(message);
      showToast(message, 'error');
    } finally {
      setLocationResolving(false);
    }
  }

  async function selectLocationSearchResult(result) {
    if (!result) return;
    const placeName = result.locationName || String(result.label || '').split(',')[0] || locationSearchQuery;
    setLocationSearchQuery(placeName);
    setLocationSearchResults([]);
    setLocationConfirmed(false);

    if (form.has_route) {
      setForm((prev) => ({
        ...prev,
        has_route: true,
        venue_type: VENUE_TYPE_STANDARD,
        gym_access_policy: null,
        gym_venue_key: null,
        lat: String(result.lat),
        lng: String(result.lng),
        city: result.city || prev.city,
        location_name: placeName,
        route_name: prev.route_name || `${selectedSport?.name || 'Percorso'} ${result.city || placeName}`,
        route_from: placeName,
        route_to: '',
        route_from_lat: String(result.lat),
        route_from_lng: String(result.lng),
        route_to_lat: '',
        route_to_lng: '',
        route_distance_km: '',
        route_points: [[result.lat, result.lng]]
      }));
      setManualRouteSelection(true);
      setRoutePicking(true);
      setLocationMapRevision((revision) => revision + 1);
      setLocationSelectionMessage(`${placeName} impostato come partenza. Tocca la mappa per scegliere l’arrivo.`);
      showToast('Luogo di partenza selezionato', 'success');
      return;
    }

    await resolveSelectedCoordinates(result, { source: 'search' });
    setForm((prev) => ({
      ...prev,
      city: result.city || prev.city,
      location_name: placeName,
      venue_type: result.isSportFacility ? VENUE_TYPE_GYM : VENUE_TYPE_STANDARD,
      gym_access_policy: result.isSportFacility ? GYM_ACCESS_PARTICIPANT_CHOICE : null,
      gym_venue_key: result.isSportFacility
        ? normalizeGymVenueKey(result.venueKey, `${placeName}-${result.city || prev.city}`)
        : null
    }));
    setLocationSelectionMessage(
      result.isSportFacility
        ? `${placeName} riconosciuta come struttura sportiva. Ogni partecipante sceglierà il proprio tipo di ingresso.`
        : `${placeName} selezionato. Controlla il pin e conferma il punto.`
    );
  }

  function startRoutePointSelection() {
    if (routePicking) {
      if (routePoints.length < 2) {
        showToast('Aggiungi almeno partenza e arrivo', 'error');
        return;
      }
      setRoutePicking(false);
      showToast(`Percorso salvato con ${routePoints.length} punti`, 'success');
      return;
    }

    if (!manualRouteSelection && routePoints.length) {
      setForm((prev) => ({
        ...prev,
        route_from_lat: '',
        route_from_lng: '',
        route_to_lat: '',
        route_to_lng: '',
        route_distance_km: '',
        route_points: []
      }));
      showToast('Tocca la mappa per creare un nuovo percorso manuale', 'info');
    }
    setManualRouteSelection(true);
    setRoutePicking(true);
  }

  function undoLastRoutePoint() {
    setForm((prev) => {
      const currentPoints = Array.isArray(prev.route_points) ? prev.route_points.filter(isValidRoutePoint) : [];
      const nextPoints = currentPoints.slice(0, -1);
      const firstPoint = nextPoints[0];
      const lastPoint = nextPoints[nextPoints.length - 1];
      const distanceKm = calculateRouteDistanceKm(nextPoints);

      return {
        ...prev,
        route_from: !nextPoints.length && prev.route_from === 'Partenza selezionata' ? '' : prev.route_from,
        route_to: nextPoints.length < 2 && prev.route_to === 'Arrivo selezionato' ? '' : prev.route_to,
        route_from_lat: firstPoint ? String(firstPoint[0]) : '',
        route_from_lng: firstPoint ? String(firstPoint[1]) : '',
        route_to_lat: nextPoints.length >= 2 ? String(lastPoint[0]) : '',
        route_to_lng: nextPoints.length >= 2 ? String(lastPoint[1]) : '',
        route_distance_km: nextPoints.length >= 2 ? distanceKm.toFixed(1) : '',
        route_points: nextPoints
      };
    });
    setRoutePicking(true);
  }

  function clearRoutePoints() {
    setForm((prev) => ({
      ...prev,
      route_name: prev.route_name === 'Percorso selezionato sulla mappa' ? '' : prev.route_name,
      route_from: prev.route_from === 'Partenza selezionata' ? '' : prev.route_from,
      route_to: prev.route_to === 'Arrivo selezionato' ? '' : prev.route_to,
      route_from_lat: '',
      route_from_lng: '',
      route_to_lat: '',
      route_to_lng: '',
      route_distance_km: '',
      route_points: []
    }));
    setRoutePicking(true);
    showToast('Punti del percorso cancellati', 'info');
  }

  function closeRouteLoop() {
    if (!routePoints.length) {
      showToast('Imposta prima il punto di partenza', 'error');
      return;
    }
    if (routePoints.length === 1) {
      showToast('Aggiungi almeno una tappa prima di chiudere l’anello', 'error');
      return;
    }
    const firstPoint = routePoints[0];
    const nextPoints = [...routePoints, firstPoint];
    setForm((prev) => ({
      ...prev,
      route_to: prev.route_from || 'Ritorno alla partenza',
      route_to_lat: String(firstPoint[0]),
      route_to_lng: String(firstPoint[1]),
      route_distance_km: calculateRouteDistanceKm(nextPoints).toFixed(1),
      route_points: nextPoints
    }));
    setRoutePicking(false);
    clearRouteFieldErrors();
    showToast('Percorso ad anello pronto', 'success');
  }

  function invalidClass(name) {
    return errors[name] ? styles.invalid : '';
  }

  async function resolveLocationOnline({ silent = false } = {}) {
    if (!String(form.location_name || '').trim() || !String(form.city || '').trim()) {
      const message = 'Inserisci nome location e città prima di cercare';
      setErrors((prev) => ({ ...prev, coordinates: message }));
      if (!silent) showToast(message, 'error');
      return null;
    }

    setLocationResolving(true);
    setLocationSelectionMessage('Ricerca del luogo in corso...');
    try {
      const result = await geocodeEventLocation(form);
      setForm((prev) => ({ ...prev, lat: String(result.lat), lng: String(result.lng) }));
      setLocationMapRevision((revision) => revision + 1);
      setErrors((prev) => ({ ...prev, coordinates: undefined }));
      setLocationSelectionMessage('Luogo trovato. Sposta la mappa per regolare il pin con precisione.');
      if (!silent) showToast('Luogo trovato e collegato alla mappa', 'success');
      return result;
    } catch (error) {
      const message = error.message || 'Impossibile trovare il luogo sulla mappa';
      setErrors((prev) => ({ ...prev, coordinates: message }));
      setLocationSelectionMessage(message);
      if (!silent) showToast(message, 'error');
      return null;
    } finally {
      setLocationResolving(false);
    }
  }

  async function resolveSelectedCoordinates(coords, { source = 'map' } = {}) {
    const lat = Number(coords?.lat);
    const lng = Number(coords?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    locationRequestRef.current?.abort();
    const controller = new AbortController();
    locationRequestRef.current = controller;
    setLocationResolving(true);
    setLocationConfirmed(false);
    setLocationSelectionMessage('Pin centrato. Sto recuperando l’indirizzo...');
    setForm((prev) => ({
      ...prev,
      lat: String(lat),
      lng: String(lng),
      venue_type: source === 'search' ? prev.venue_type : VENUE_TYPE_STANDARD,
      gym_access_policy: source === 'search' ? prev.gym_access_policy : null,
      gym_venue_key: source === 'search' ? prev.gym_venue_key : null
    }));
    if (source !== 'map') {
      setLocationMapRevision((revision) => revision + 1);
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next.coordinates;
      return next;
    });

    try {
      const result = await reverseGeocodeCoordinates(lat, lng, { signal: controller.signal });
      if (controller.signal.aborted) return null;
      setForm((prev) => ({
        ...prev,
        lat: String(result.lat),
        lng: String(result.lng),
        city: result.city || prev.city,
        location_name: result.locationName || prev.location_name
      }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next.city;
        delete next.location_name;
        delete next.coordinates;
        return next;
      });
      setLocationSelectionMessage(`${fixedLocationLabel} aggiornato automaticamente.`);
      if (source !== 'map') showToast('Punto e indirizzo aggiornati', 'success');
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      setLocationSelectionMessage('Punto salvato. Completa manualmente nome location e città.');
      showToast('Coordinate salvate, ma non ho trovato l’indirizzo', 'info');
      return null;
    } finally {
      if (locationRequestRef.current === controller) {
        locationRequestRef.current = null;
        setLocationResolving(false);
      }
    }
  }

  function handleLocationMapMoveStart() {
    locationRequestRef.current?.abort();
    setLocationConfirmed(false);
    setLocationSelectionMessage('Sposta la mappa: il pin resta fisso al centro.');
  }

  function confirmSelectedLocation() {
    if (!locationPreview) {
      showToast('Scegli prima un punto sulla mappa', 'error');
      return;
    }
    setLocationConfirmed(true);
    setLocationSelectionMessage(`${fixedLocationLabel} confermato. Puoi continuare.`);
    showToast(`${fixedLocationLabel} confermato`, 'success');
  }

  function collectValidationErrors() {
    const nextErrors = {};

    if (!form.sport_id) nextErrors.sport_id = 'Seleziona uno sport';
    if (!form.is_personal && form.title.trim() && form.title.trim().length < 4) {
      nextErrors.title = 'Inserisci almeno 4 caratteri oppure lascia il campo vuoto';
    }
    if (!form.city || form.city.length < 2) nextErrors.city = 'Citta richiesta';
    if (!form.location_name || form.location_name.length < 3) nextErrors.location_name = 'Location troppo corta';
    if (!form.event_datetime) nextErrors.event_datetime = 'Data/ora richiesta';
    if (Number(form.duration_minutes) < 15 || Number(form.duration_minutes) > 360) {
      nextErrors.duration_minutes = 'Durata tra 15 e 360 minuti';
    }
    if (
      !form.is_personal &&
      !CHECK_IN_GRACE_PRESETS.includes(Number(form.checkin_grace_minutes))
    ) {
      nextErrors.checkin_grace_minutes = 'Scegli una tolleranza di 15, 20 o 30 minuti';
    }
    if (!form.is_personal && Number(form.deposit_cents) !== 1000) {
      nextErrors.deposit_cents = 'Il deposito Motrice è fisso a 10 EUR';
    }
    if (!['mixed', 'male', 'female'].includes(form.audience)) {
      nextErrors.audience = 'Scegli la categoria dell evento';
    }
    const minAge = Number(form.min_age);
    const maxAge = Number(form.max_age);
    if (!Number.isInteger(minAge) || minAge < 18 || minAge > 99) {
      nextErrors.min_age = 'Età minima tra 18 e 99 anni';
    }
    if (!Number.isInteger(maxAge) || maxAge < 18 || maxAge > 99) {
      nextErrors.max_age = 'Età massima tra 18 e 99 anni';
    } else if (Number.isInteger(minAge) && minAge > maxAge) {
      nextErrors.max_age = 'L’età massima deve essere uguale o superiore alla minima';
    }
    if (!['public', 'private'].includes(form.visibility)) {
      nextErrors.visibility = 'Scegli la visibilita dell evento';
    }
    if (!['open', 'approval'].includes(form.join_policy)) {
      nextErrors.join_policy = 'Scegli la modalita di accesso';
    }
    if (form.visibility === 'private' && form.join_policy !== 'open') {
      nextErrors.join_policy = 'Gli eventi privati sono accessibili tramite link';
    }
    if (form.is_personal && (form.visibility !== 'private' || Number(form.max_participants) !== 1)) {
      nextErrors.visibility = 'Il promemoria personale deve restare privato';
    }
    if (form.is_personal && recurrenceMode === 'weekly') {
      const enabledDays = getEnabledPersonalRecurrenceDays(weeklySchedule);
      if (!enabledDays.length) {
        nextErrors.recurrence_days = 'Seleziona almeno un giorno di allenamento';
      }
      if (enabledDays.some((day) => !String(weeklySchedule[day.id]?.time || '').trim())) {
        nextErrors.recurrence_times = 'Indica da che ora è disponibile ogni allenamento';
      }
      if (enabledDays.some((day) => !String(weeklySchedule[day.id]?.planId || '').trim())) {
        nextErrors.recurrence_plans = 'Associa una scheda a ogni giorno';
      }
    }
    if (Number(form.max_participants) < (form.is_personal ? 1 : 2)) {
      nextErrors.max_participants = form.is_personal ? 'Partecipanti non validi' : 'Minimo 2 partecipanti';
    }
    if (!form.is_personal && (!form.description || form.description.trim().length < 20)) {
      nextErrors.description = 'Inserisci almeno 20 caratteri';
    }

    if ((form.lat && !form.lng) || (!form.lat && form.lng)) {
      nextErrors.coordinates = 'Inserisci entrambe le coordinate o nessuna';
    }
    if (form.lat && (Number(form.lat) < -90 || Number(form.lat) > 90)) {
      nextErrors.coordinates = 'Latitudine non valida';
    }
    if (form.lng && (Number(form.lng) < -180 || Number(form.lng) > 180)) {
      nextErrors.coordinates = 'Longitudine non valida';
    }

    if (form.has_route) {
      if (!form.route_name || form.route_name.length < 3) {
        nextErrors.route_name = 'Nome percorso troppo corto';
      }
      if (!form.route_from || form.route_from.length < 2) {
        nextErrors.route_from = 'Inserisci via di partenza (X)';
      }
      if (!form.route_to || form.route_to.length < 2) {
        nextErrors.route_to = 'Inserisci via di arrivo (Y)';
      }
      const routeDistance = Number(form.route_distance_km);
      if (!Number.isFinite(routeDistance) || routeDistance <= 0) {
        nextErrors.route_distance_km = 'Distanza percorso non valida';
      }
      if (form.route_elevation_gain_m !== '') {
        const elevationGain = Number(form.route_elevation_gain_m);
        if (!Number.isFinite(elevationGain) || elevationGain < 0) {
          nextErrors.route_elevation_gain_m = 'Dislivello non valido';
        }
      }
      if (form.route_map_url && !/^https?:\/\//i.test(form.route_map_url)) {
        nextErrors.route_map_url = 'Inserisci un URL valido (http/https)';
      }
    }

    return nextErrors;
  }

  function validate() {
    const nextErrors = collectValidationErrors();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const firstInvalidStep = WIZARD_STEPS.find((step) =>
        getStepErrorFields(step.id, form.is_personal).some((field) => nextErrors[field])
      );
      if (firstInvalidStep) {
        setStepDirection(firstInvalidStep.id < activeStep ? 'backward' : 'forward');
        setActiveStep(firstInvalidStep.id);
      }
      return false;
    }
    return true;
  }

  function goToNextStep() {
    const nextErrors = collectValidationErrors();
    const fields = getStepErrorFields(activeStep, form.is_personal);
    const currentStepErrors = Object.fromEntries(
      Object.entries(nextErrors).filter(([field]) => fields.includes(field))
    );

    setErrors((prev) => {
      const next = { ...prev };
      fields.forEach((field) => delete next[field]);
      return { ...next, ...currentStepErrors };
    });

    if (Object.keys(currentStepErrors).length) {
      if (activeStep === 1 || (activeStep === 3 && form.is_personal)) {
        if (currentStepErrors.event_datetime) {
          setActiveWhenPanel(eventDate ? 'time' : 'date');
        } else if (currentStepErrors.duration_minutes) {
          setActiveWhenPanel('duration');
        }
      }
      showToast('Completa i campi evidenziati prima di continuare', 'error');
      return;
    }
    setStepDirection('forward');
    setActiveStep((step) => Math.min(WIZARD_STEPS.length, step + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToPreviousStep() {
    setStepDirection('backward');
    setActiveStep((step) => Math.max(1, step - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editReviewStep(step) {
    setStepDirection(step < activeStep ? 'backward' : 'forward');
    setActiveStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onWizardSubmit(event) {
    event.preventDefault();
    if (activeStep < WIZARD_STEPS.length) {
      goToNextStep();
    }
  }

  async function publishEvent() {
    if (submitting || !validate()) return;

    setSubmitting(true);
    try {
      let latestCreationStats;
      try {
        latestCreationStats = await refreshCreationStats();
      } catch {
        showToast('Impossibile verificare il piano. Controlla la connessione e riprova.', 'error');
        return;
      }

      const latestCreationLimit = PREMIUM_FEATURES_FREE || latestCreationStats.is_unlimited
        ? Number.POSITIVE_INFINITY
        : Number.isFinite(Number(latestCreationStats.max_events_per_month))
          ? Number(latestCreationStats.max_events_per_month)
          : entitlements.maxEventsPerMonth;

      if (latestCreationStats.created_this_month >= latestCreationLimit) {
        setPaywallOpen(true);
        return;
      }

      let attachedWorkoutPlan = selectedWorkoutPlan;
      if (attachedWorkoutPlan && !attachedWorkoutPlan.remoteId) {
        attachedWorkoutPlan = await ensurePersonalWorkoutPlanRemote(attachedWorkoutPlan);
        setSelectedWorkoutPlan(attachedWorkoutPlan);
      }

      let syncedWorkoutPlans = workoutPlans;
      let syncedWeeklySchedule = serializePersonalWeeklySchedule(weeklySchedule);
      if (form.is_personal && recurrenceMode === 'weekly') {
        const planUpdates = new Map();
        for (const day of getEnabledPersonalRecurrenceDays(syncedWeeklySchedule)) {
          const selectedPlanId = String(syncedWeeklySchedule[day.id]?.planId || '');
          const plan = workoutPlansById.get(selectedPlanId);
          if (!plan) throw new Error(`Scheda non disponibile per ${day.label}`);
          const syncedPlan = plan.remoteId ? plan : await ensurePersonalWorkoutPlanRemote(plan);
          planUpdates.set(String(plan.id), syncedPlan);
          planUpdates.set(String(plan.remoteId || ''), syncedPlan);
          syncedWeeklySchedule = {
            ...syncedWeeklySchedule,
            [day.id]: {
              ...syncedWeeklySchedule[day.id],
              planId: String(syncedPlan.remoteId || syncedPlan.id)
            }
          };
        }
        syncedWorkoutPlans = workoutPlans.map((plan) => planUpdates.get(String(plan.id)) || plan);
        setWorkoutPlans(syncedWorkoutPlans);
        setWeeklySchedule(syncedWeeklySchedule);
      }

      let resolvedLat = form.lat === '' ? null : Number(form.lat);
      let resolvedLng = form.lng === '' ? null : Number(form.lng);
      if (resolvedLat == null || resolvedLng == null) {
        const resolved = await resolveLocationOnline({ silent: true });
        if (!resolved) {
          showToast('Trova il luogo sulla mappa prima di pubblicare', 'error');
          return;
        }
        resolvedLat = resolved.lat;
        resolvedLng = resolved.lng;
      }

      const systemRules = getSystemEventRules({
        durationMinutes: form.duration_minutes,
        isPersonal: form.is_personal,
        checkInGraceMinutes: form.checkin_grace_minutes
      });

      const routeInfo = form.has_route
        ? {
            name: String(form.route_name || '').trim(),
            from_label: String(form.route_from || '').trim(),
            to_label: String(form.route_to || '').trim(),
            from_lat: form.route_from_lat === '' ? null : Number(form.route_from_lat),
            from_lng: form.route_from_lng === '' ? null : Number(form.route_from_lng),
            to_lat: form.route_to_lat === '' ? null : Number(form.route_to_lat),
            to_lng: form.route_to_lng === '' ? null : Number(form.route_to_lng),
            distance_km: Number(form.route_distance_km),
            elevation_gain_m:
              form.route_elevation_gain_m === '' ? null : Number(form.route_elevation_gain_m),
            map_url: String(form.route_map_url || '').trim(),
            route_points: Array.isArray(form.route_points) ? form.route_points : []
          }
        : null;

      if (form.is_personal && recurrenceMode === 'weekly') {
        const program = await api.createPersonalEventSeries({
          start_date: eventDate,
          weeks: PERSONAL_RECURRENCE_WEEKS,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome',
          weekly_schedule: syncedWeeklySchedule,
          workout_plans: syncedWorkoutPlans,
          event: {
            ...form,
            title: getEventDisplayTitle(form, selectedSport),
            description: `Allenamento personale di ${selectedSport?.name || 'fitness'}`,
            sport_id: Number(form.sport_id),
            duration_minutes: Number(form.duration_minutes),
            lat: resolvedLat,
            lng: resolvedLng,
            route_info: routeInfo
          }
        });
        const createdCount = Number(program?.occurrences_created || recurrencePreview.length);
        showToast(`Programma creato · ${createdCount} allenamenti pronti`, 'success');
        markStepByAction('event_created');
        api.getEventCreationStats().then(setCreationStats).catch(() => {});
        navigate('/agenda');
        return;
      }

      const created = await api.createEvent({
        ...form,
        title: getEventDisplayTitle(form, selectedSport),
        description: form.is_personal
          ? `Allenamento personale di ${selectedSport?.name || 'fitness'}`
          : form.description,
        sport_id: Number(form.sport_id),
        duration_minutes: Number(form.duration_minutes),
        deposit_cents: form.is_personal ? 0 : 1000,
        minimum_presence_minutes: systemRules.minimumPresenceMinutes,
        verification_mode: systemRules.verificationMode,
        geofence_radius_m: systemRules.geofenceRadiusM,
        checkin_grace_minutes: systemRules.checkInGraceMinutes,
        completion_xp: systemRules.completionXp,
        review_bonus_xp: systemRules.reviewBonusXp,
        max_participants: Number(form.max_participants),
        audience: form.audience,
        min_age: Number(form.min_age),
        max_age: Number(form.max_age),
        participation_protection: !form.is_personal,
        visibility: form.visibility,
        join_policy: form.join_policy,
        is_personal: Boolean(form.is_personal),
        lat: resolvedLat,
        lng: resolvedLng,
        scheda_id: attachedWorkoutPlan?.remoteId || null,
        workout_plan: attachedWorkoutPlan || null,
        route_info: routeInfo
      });

      if (form.add_to_calendar) {
        try {
          downloadEventIcs(created);
        } catch {
          showToast('Evento creato, ma il calendario non e stato aperto', 'info');
        }
      }

      showToast(form.is_personal ? 'Promemoria creato con successo' : 'Evento creato con successo', 'success');
      markStepByAction('event_created');
      api.getEventCreationStats().then(setCreationStats).catch(() => {});
      navigate(`/events/${created.id}`);
    } catch (submitError) {
      const message = String(submitError?.message || '').trim();
      if (message.includes('DEPOSIT_REQUIRED')) {
        showToast('Credito insufficiente. L’amministratore può aumentarlo dal Centro operativo.', 'info');
        navigate('/wallet/credit');
        return;
      }
      showToast(
        message || (selectedWorkoutPlan ? 'Impossibile pubblicare l’evento con la scheda allegata' : 'Impossibile pubblicare l’evento'),
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function suggestDescriptionWithAi() {
    if (!aiEnabled || aiLoading) return;
    setAiLoading(true);
    try {
      const displayTitle = getEventDisplayTitle(form, selectedSport);
      const context = [displayTitle, form.sport_id ? `Sport: ${selectedSport?.name || form.sport_id}` : '', form.city, form.location_name]
        .filter(Boolean)
        .join(' · ');
      const result = await ai.generateText({
        purpose: 'event_description',
        prompt: context || 'Sessione sportiva locale',
        maxTokens: 50,
        contextPayload: {
          title: displayTitle,
          sportName: selectedSport?.name || '',
          level: form.level,
          city: form.city,
          locationName: form.location_name
        }
      });
      setField('description', result.text);
      showToast(`Descrizione suggerita (${result.provider})`, 'success');
    } catch (error) {
      showToast(error.message || 'AI non disponibile ora', 'error');
    } finally {
      setAiLoading(false);
    }
  }

  const currentWizardStep = WIZARD_STEPS[activeStep - 1];
  const currentWizardLabel = activeStep === 3 && form.is_personal
    ? 'Programma'
    : currentWizardStep.label;
  const currentWizardDescription = form.is_personal
    ? activeStep === 1
      ? 'Sport e frequenza'
      : activeStep === 2
        ? 'Punto d’allenamento e percorso'
        : activeStep === 3
          ? (recurrenceMode === 'weekly' ? 'Giorni, disponibilità e schede' : 'Data, ora e scheda')
          : currentWizardStep.description
    : currentWizardStep.description;

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.pageEyebrow}>Nuova sessione</span>
          <h1>Crea il tuo evento</h1>
        </div>
        {!Number.isFinite(creationLimit) ? null : (
          <span className={styles.planBadge}>
            {creationStats.created_this_month}/{creationLimit} questo mese
          </span>
        )}
      </header>

      <form className={styles.formCard} onSubmit={onWizardSubmit} noValidate>
        <div className={styles.stepProgress} aria-label={`Passaggio ${activeStep} di ${WIZARD_STEPS.length}`}>
          {WIZARD_STEPS.map((step) => (
            <span
              key={step.id}
              className={step.id <= activeStep ? styles.stepProgressActive : ''}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className={styles.stepIntro}>
          <div>
            <span>{currentWizardLabel}</span>
            <h2>{currentWizardDescription}</h2>
          </div>
          <strong>{activeStep}/{WIZARD_STEPS.length}</strong>
        </div>

        {activeStep === 1 ? (
          <fieldset className={`${styles.wizardStep} ${stepDirection === 'backward' ? styles.wizardStepBackward : styles.wizardStepForward}`} aria-label="Informazioni base">

            <section className={styles.eventKindCard} aria-label="Tipo di evento">
              <div className={styles.sectionLabelRow}>
                <span>Tipo di evento</span>
                <small>{form.is_personal ? 'Solo per te' : 'Con partecipanti'}</small>
              </div>
              <div className={styles.eventKindOptions} role="group" aria-label="Scegli il tipo di evento">
                <button
                  type="button"
                  className={!form.is_personal ? styles.eventKindSelected : ''}
                  aria-pressed={!form.is_personal}
                  onClick={() => togglePersonalEvent(false)}
                >
                  <Users size={21} aria-hidden="true" />
                  <span><strong>Di gruppo</strong><small>Invita o incontra altri atleti</small></span>
                </button>
                <button
                  type="button"
                  className={form.is_personal ? styles.eventKindSelected : ''}
                  aria-pressed={form.is_personal}
                  onClick={() => togglePersonalEvent(true)}
                >
                  <UserRoundCheck size={21} aria-hidden="true" />
                  <span><strong>Personale</strong><small>Allenamento privato e progressi</small></span>
                </button>
              </div>

              {form.is_personal ? (
                <div className={styles.recurrenceModePicker}>
                  <span>Frequenza</span>
                  <div role="group" aria-label="Frequenza evento personale">
                    <button
                      type="button"
                      className={recurrenceMode === 'once' ? styles.recurrenceModeSelected : ''}
                      aria-pressed={recurrenceMode === 'once'}
                      onClick={() => selectRecurrenceMode('once')}
                    >
                      <CalendarDays size={18} aria-hidden="true" /> Una volta
                    </button>
                    <button
                      type="button"
                      className={recurrenceMode === 'weekly' ? styles.recurrenceModeSelected : ''}
                      aria-pressed={recurrenceMode === 'weekly'}
                      onClick={() => selectRecurrenceMode('weekly')}
                    >
                      <Repeat2 size={18} aria-hidden="true" /> Ricorrente
                    </button>
                  </div>
                  <small>
                    {recurrenceMode === 'weekly'
                      ? 'Configurerai giorni, disponibilità e schede nella terza pagina.'
                      : 'Creerai un singolo allenamento personale.'}
                  </small>
                </div>
              ) : null}
            </section>

            {!form.is_personal ? <label className={styles.field}>
              <span className={styles.fieldLabel}>Nome personalizzato</span>
              <input
                className={invalidClass('title')}
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Es. Allenamento serale al parco (facoltativo)"
                maxLength="100"
              />
              {errors.title && <span className="error">{errors.title}</span>}
            </label> : null}

            <div className={styles.choiceSection}>
              <div className={styles.sectionLabelRow}>
                <span>Che sport?</span>
                <small>{selectedSport ? selectedSport.name : 'Seleziona uno'}</small>
              </div>
              <div className={styles.sportGrid} role="group" aria-label="Scegli lo sport">
                {orderedSports.map((sport) => {
                  const visual = getSportVisual(sport);
                  const selected = String(form.sport_id) === String(sport.id);
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      className={`${styles.sportCard} ${visual.cardImage ? styles.sportCardWithImage : ''} ${selected ? styles.sportCardSelected : ''}`}
                      aria-pressed={selected}
                      onClick={() => onSportChange(sport.id)}
                    >
                      {visual.cardImage ? (
                        <span className={styles.sportImageWrap} aria-hidden="true">
                          <img
                            className={styles.sportImage}
                            src={visual.cardImage}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        </span>
                      ) : (
                        <span className={styles.sportEmoji} aria-hidden="true">{visual.emoji}</span>
                      )}
                      <strong>{sport.name}</strong>
                      <small>{visual.subtitle}</small>
                      {selected ? <span className={styles.sportCheck}><Check size={17} /></span> : null}
                    </button>
                  );
                })}
              </div>
              {errors.sport_id && <span className="error">{errors.sport_id}</span>}
            </div>

            {!form.is_personal ? <div className={styles.choiceSection}>
              <div className={styles.sectionLabelRow}><span>Livello richiesto</span></div>
              <div className={styles.levelGrid} role="group" aria-label="Livello richiesto">
                {LEVEL_OPTIONS.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    className={form.level === level.value ? styles.levelSelected : ''}
                    aria-pressed={form.level === level.value}
                    onClick={() => setField('level', level.value)}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div> : null}

            {!form.is_personal ? <><div className={styles.whenSection}>
              <div className={styles.sectionLabelRow}>
                <span>Data e ora</span>
                <small>Completa in ordine</small>
              </div>
              <div className={`${styles.whenAccordion} ${errors.event_datetime || errors.duration_minutes ? styles.invalidCard : ''}`}>
                <div className={`${styles.whenItem} ${activeWhenPanel === 'date' ? styles.whenItemOpen : ''} ${eventDate ? styles.whenItemComplete : ''}`}>
                  <button
                    type="button"
                    className={styles.whenHeader}
                    onClick={() => toggleWhenPanel('date')}
                    aria-expanded={activeWhenPanel === 'date'}
                    aria-controls="event-date-panel"
                  >
                    <span className={styles.whenIcon}><CalendarDays size={20} /></span>
                    <span className={styles.whenSummary}>
                      <strong>{eventDate ? formatEventDateLabel(eventDate) : 'Scegli data'}</strong>
                    </span>
                    <span className={`${styles.whenState} ${activeWhenPanel === 'date' ? styles.whenStateOpen : ''}`} aria-hidden="true">
                      {eventDate && activeWhenPanel !== 'date' ? <Check size={18} /> : <ChevronDown size={19} />}
                    </span>
                  </button>
                  {activeWhenPanel === 'date' ? (
                    <div className={styles.whenBody} id="event-date-panel">
                      <p>Scegli una data rapida oppure apri il calendario.</p>
                      <div className={styles.dateQuickOptions} role="group" aria-label="Date rapide">
                        {[
                          { label: 'Oggi', value: getDateValueWithOffset(0) },
                          { label: 'Domani', value: getDateValueWithOffset(1) },
                          { label: 'Weekend', value: getWeekendDateValue() }
                        ].map((option) => (
                          <button
                            type="button"
                            key={`${option.label}-${option.value}`}
                            className={eventDate === option.value ? styles.pickerOptionSelected : ''}
                            onClick={() => selectEventDate(option.value)}
                          >
                            <strong>{option.label}</strong>
                            <small>{formatEventDateLabel(option.value)}</small>
                          </button>
                        ))}
                      </div>
                      <label className={styles.nativePickerField}>
                        <CalendarDays size={21} aria-hidden="true" />
                        <span>
                          <small>Altra data</small>
                          <input
                            type="date"
                            min={todayDateValue}
                            value={eventDate}
                            onChange={(event) => selectEventDate(event.target.value)}
                          />
                        </span>
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className={`${styles.whenItem} ${activeWhenPanel === 'time' ? styles.whenItemOpen : ''} ${eventTime ? styles.whenItemComplete : ''}`}>
                  <button
                    type="button"
                    className={styles.whenHeader}
                    onClick={() => toggleWhenPanel('time')}
                    aria-expanded={activeWhenPanel === 'time'}
                    aria-controls="event-time-panel"
                  >
                    <span className={styles.whenIcon}><Clock3 size={20} /></span>
                    <span className={styles.whenSummary}>
                      <strong>{eventTime || 'Scegli ora'}</strong>
                    </span>
                    <span className={`${styles.whenState} ${activeWhenPanel === 'time' ? styles.whenStateOpen : ''}`} aria-hidden="true">
                      {eventTime && activeWhenPanel !== 'time' ? <Check size={18} /> : <ChevronDown size={19} />}
                    </span>
                  </button>
                  {activeWhenPanel === 'time' ? (
                    <div className={styles.whenBody} id="event-time-panel">
                      <p>Formato 24 ore, con precisione di 5 minuti.</p>
                      <label className={styles.nativePickerField}>
                        <Clock3 size={21} aria-hidden="true" />
                        <span>
                          <small>Ora di inizio</small>
                          <input
                            type="time"
                            step="300"
                            value={eventTime}
                            onChange={(event) => selectEventTime(event.target.value)}
                          />
                        </span>
                        <b>24H</b>
                      </label>
                      <div className={styles.timeQuickOptions} role="group" aria-label="Orari rapidi">
                        {TIME_QUICK_OPTIONS.map((time) => (
                          <button
                            type="button"
                            key={time}
                            className={eventTime === time ? styles.pickerOptionSelected : ''}
                            onClick={() => selectEventTime(time)}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={`${styles.whenItem} ${activeWhenPanel === 'duration' ? styles.whenItemOpen : ''} ${eventTime && Number(form.duration_minutes) >= 15 ? styles.whenItemComplete : ''}`}>
                  <button
                    type="button"
                    className={styles.whenHeader}
                    onClick={() => toggleWhenPanel('duration')}
                    aria-expanded={activeWhenPanel === 'duration'}
                    aria-controls="event-duration-panel"
                  >
                    <span className={styles.whenIcon}><Timer size={20} /></span>
                    <span className={styles.whenSummary}>
                      <strong>{eventTime ? `${Number(form.duration_minutes) || 0} minuti` : 'Durata'}</strong>
                    </span>
                    <span className={`${styles.whenState} ${activeWhenPanel === 'duration' ? styles.whenStateOpen : ''}`} aria-hidden="true">
                      {eventTime && Number(form.duration_minutes) >= 15 && activeWhenPanel !== 'duration' ? <Check size={18} /> : <ChevronDown size={19} />}
                    </span>
                  </button>
                  {activeWhenPanel === 'duration' ? (
                    <div className={styles.whenBody} id="event-duration-panel">
                      <p>Scegli una durata rapida oppure inseriscila in minuti.</p>
                      <div className={styles.presetRow} role="group" aria-label="Durata evento">
                        {DURATION_PRESETS.map((minutes) => (
                          <button
                            key={minutes}
                            type="button"
                            className={Number(form.duration_minutes) === minutes ? styles.presetSelected : ''}
                            onClick={() => selectEventDuration(minutes)}
                          >
                            {minutes}′
                          </button>
                        ))}
                      </div>
                      <label className={styles.compactNumber}>
                        Durata personalizzata
                        <input
                          type="number"
                          min="15"
                          max="360"
                          step="15"
                          value={form.duration_minutes}
                          onChange={(event) => setField('duration_minutes', event.target.value)}
                          onBlur={() => {
                            if (Number(form.duration_minutes) >= 15) setActiveWhenPanel(null);
                          }}
                          aria-label="Durata personalizzata in minuti"
                        />
                      </label>
                      {eventEndTime ? (
                        <small className={styles.endTimePreview} aria-live="polite">
                          {formatEventDateLabel(eventDate)} · {eventTime}
                          <strong>Fine {eventEndTime}</strong>
                        </small>
                      ) : null}
                      {errors.duration_minutes && <span className="error">{errors.duration_minutes}</span>}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {errors.event_datetime && <span className="error">{errors.event_datetime}</span>}
            </> : null}

            {!form.is_personal ? <>
            <div className={styles.controlGrid}>
              <div className={`${styles.controlCard} ${styles.participantsCard} ${errors.max_participants ? styles.invalidCard : ''}`}>
                <span className={styles.controlTitle}><Users size={18} />Partecipanti</span>
                <div className={styles.stepper}>
                  <button type="button" onClick={() => changeParticipantCount(-1)} aria-label="Riduci partecipanti">
                    <Minus size={20} />
                  </button>
                  <input
                    type="number"
                    min={form.is_personal ? 1 : 2}
                    max="500"
                    value={form.max_participants}
                    onChange={(e) => setField('max_participants', e.target.value)}
                    aria-label="Numero massimo partecipanti"
                  />
                  <button type="button" onClick={() => changeParticipantCount(1)} aria-label="Aumenta partecipanti">
                    <Plus size={20} />
                  </button>
                </div>
                {errors.max_participants && <span className="error">{errors.max_participants}</span>}
              </div>
            </div>

            <div className={styles.choiceSection}>
              <div className={styles.sectionLabelRow}>
                <span>Categoria</span>
                <small>{AUDIENCE_OPTIONS.find((option) => option.value === form.audience)?.label}</small>
              </div>
              <div className={styles.audienceGrid} role="group" aria-label="Categoria partecipanti">
                {AUDIENCE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = form.audience === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={selected ? styles.audienceSelected : ''}
                      aria-pressed={selected}
                      onClick={() => setField('audience', option.value)}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <strong>{option.label}</strong>
                    </button>
                  );
                })}
              </div>
              <p className={styles.choiceHelper}>
                {AUDIENCE_OPTIONS.find((option) => option.value === form.audience)?.copy}
              </p>
              {errors.audience && <span className="error">{errors.audience}</span>}
            </div>

            <div className={styles.ageSection}>
              <div className={styles.sectionLabelRow}>
                <span>Età partecipanti</span>
              </div>
              <div
                className={`${styles.ageRange} ${errors.min_age || errors.max_age ? styles.invalidCard : ''}`}
                style={{
                  '--age-min-position': `${((Number(form.min_age) - 18) / 81) * 100}%`,
                  '--age-max-position': `${((Number(form.max_age) - 18) / 81) * 100}%`
                }}
              >
                <div className={styles.ageRangeValues} aria-live="polite">
                  <span>Da <strong>{form.min_age}</strong> anni</span>
                  <span>A <strong>{form.max_age}</strong> anni</span>
                </div>
                <div className={styles.ageSlider}>
                  <span className={styles.ageSliderTrack} aria-hidden="true"><i /></span>
                  <input
                    className={Number(form.min_age) >= Number(form.max_age) - 4 ? styles.ageSliderFront : ''}
                    type="range"
                    min="18"
                    max="99"
                    step="1"
                    value={form.min_age}
                    onChange={(event) => {
                      const nextMinimum = Math.min(Number(event.target.value), Number(form.max_age));
                      setField('min_age', nextMinimum);
                    }}
                    aria-label="Età minima dei partecipanti"
                    aria-valuetext={`${form.min_age} anni`}
                  />
                  <input
                    type="range"
                    min="18"
                    max="99"
                    step="1"
                    value={form.max_age}
                    onChange={(event) => {
                      const nextMaximum = Math.max(Number(event.target.value), Number(form.min_age));
                      setField('max_age', nextMaximum);
                    }}
                    aria-label="Età massima dei partecipanti"
                    aria-valuetext={`${form.max_age} anni`}
                  />
                </div>
              </div>
              {errors.min_age && <span className="error">{errors.min_age}</span>}
              {errors.max_age && <span className="error">{errors.max_age}</span>}
            </div>
            </> : (
              <div className={styles.personalFirstStepHint}>
                <UserRoundCheck size={21} aria-hidden="true" />
                <span>Nessun partecipante, deposito o filtro pubblico. L’allenamento sarà visibile soltanto a te.</span>
              </div>
            )}
          </fieldset>
        ) : null}

        {activeStep === 2 ? (
          <fieldset className={`${styles.wizardStep} ${stepDirection === 'backward' ? styles.wizardStepBackward : styles.wizardStepForward}`} aria-label="Luogo e percorso">
            <div className={styles.sectionHero}>
              <span><MapPin size={22} /></span>
              <div>
                <strong>Dove si svolge l’attività?</strong>
                <small>Scegli un punto fisso oppure costruisci il percorso direttamente sulla mappa.</small>
              </div>
            </div>

            <div className={styles.locationModeSelector} role="group" aria-label="Tipo di luogo">
              <button
                type="button"
                className={!form.has_route ? styles.locationModeSelected : ''}
                aria-pressed={!form.has_route}
                onClick={() => setLocationMode(false)}
              >
                <MapPin size={22} aria-hidden="true" />
                <span>
                  <strong>{fixedLocationLabel}</strong>
                  <small>Un solo luogo</small>
                </span>
                {!form.has_route ? <Check size={18} aria-hidden="true" /> : null}
              </button>
              <button
                type="button"
                className={form.has_route ? styles.locationModeSelected : ''}
                aria-pressed={Boolean(form.has_route)}
                onClick={() => setLocationMode(true)}
              >
                <Route size={22} aria-hidden="true" />
                <span>
                  <strong>Percorso</strong>
                  <small>{selectedSportHasRoute ? 'Consigliato per questo sport' : 'Partenza, tappe e arrivo'}</small>
                </span>
                {form.has_route ? <Check size={18} aria-hidden="true" /> : null}
              </button>
            </div>

            <div className={styles.locationSearchBar}>
              <Search size={19} aria-hidden="true" />
              <input
                value={locationSearchQuery}
                onChange={(event) => {
                  setLocationSearchQuery(event.target.value);
                  setLocationSearchResults([]);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void searchLocationForMode();
                  }
                }}
                placeholder={form.has_route ? 'Cerca il luogo di partenza' : 'Nome palestra, centro sportivo o indirizzo'}
                aria-label={form.has_route ? 'Cerca il luogo di partenza' : `Cerca il ${fixedLocationLabelLower}`}
              />
              <button type="button" disabled={locationResolving} onClick={() => void searchLocationForMode()}>
                Cerca
              </button>
            </div>

            {locationSearchResults.length ? (
              <div className={styles.locationSearchResults} aria-label="Risultati ricerca luoghi">
                {locationSearchResults.map((result, index) => (
                  <button
                    key={`${result.lat}:${result.lng}:${index}`}
                    type="button"
                    onClick={() => void selectLocationSearchResult(result)}
                    aria-label={`Seleziona ${result.locationName || result.label}`}
                  >
                    <span className={result.isSportFacility ? styles.locationSearchSportIcon : ''}>
                      {result.isSportFacility ? <Dumbbell size={18} aria-hidden="true" /> : <MapPin size={18} aria-hidden="true" />}
                    </span>
                    <span>
                      <strong>{result.locationName || String(result.label || '').split(',')[0]}</strong>
                      <small>{result.label}</small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}

            {!form.has_route ? (
              <div className={styles.locationFlowGuide} aria-label={`Come scegliere il ${fixedLocationLabelLower}`}>
                <span className={locationPreview ? styles.locationFlowDone : ''}>
                  <b>1</b> Trova l’area
                </span>
                <i aria-hidden="true" />
                <span className={locationPreview ? styles.locationFlowDone : ''}>
                  <b>2</b> Sposta la mappa
                </span>
                <i aria-hidden="true" />
                <span className={locationConfirmed ? styles.locationFlowDone : ''}>
                  <b>{locationConfirmed ? <Check size={12} /> : '3'}</b> Conferma
                </span>
              </div>
            ) : null}

            <section className={`${styles.locationPicker} ${styles.locationPickerActive}`}>
              <div className={styles.locationMapHead}>
                <span>
                  {form.has_route ? <Route size={17} aria-hidden="true" /> : <MapPinned size={17} aria-hidden="true" />}
                  {form.has_route ? 'Costruisci il percorso' : `Scegli il ${fixedLocationLabelLower}`}
                </span>
                <small className={styles.locationGpsStatus}>
                  <i className={userLocationCoords ? styles.locationGpsActive : ''} />
                  {locationRequesting
                    ? 'Cerco la tua area'
                    : userLocationCoords
                      ? `GPS attivo${locationAccuracyLabel ? ` ${locationAccuracyLabel}` : ''}`
                      : locationPermission === 'denied'
                        ? 'GPS non autorizzato'
                        : 'GPS in attesa'}
                </small>
              </div>

              <div className={`${styles.routeMapWrap} ${styles.locationMapWrap} ${form.has_route && routePicking ? styles.routeMapPicking : ''}`}>
                <MapContainer
                  key={`place-map-${form.has_route ? 'route' : 'point'}-${locationMapRevision}`}
                  center={form.has_route ? routeMapCenter : locationMapCenter}
                  zoom={form.has_route ? (routePoints.length || locationPreview ? 14 : 6) : locationMapZoom}
                  className={styles.routeMap}
                  dragging
                  scrollWheelZoom={false}
                  touchZoom
                  doubleClickZoom={!form.has_route || !routePicking}
                >
                  <TileLayer
                    {...CREATE_EVENT_MAP_TILES.options}
                    url={CREATE_EVENT_MAP_TILES.url}
                  />

                  {!form.has_route ? <LocationRadiusPreview radius={geofenceRadius} /> : null}
                  {userLocationCoords ? (
                    <CircleMarker
                      center={[userLocationCoords.lat, userLocationCoords.lng]}
                      radius={6}
                      pathOptions={{
                        color: '#ffffff',
                        fillColor: '#218cff',
                        fillOpacity: 1,
                        opacity: 1,
                        weight: 3
                      }}
                    >
                      <Popup>La tua posizione GPS</Popup>
                    </CircleMarker>
                  ) : null}

                  {form.has_route ? (
                    <>
                      <RouteMapTapHandler active={routePicking} onAddPoint={addRoutePoint} />
                      {routePoints.length >= 2 ? (
                        <Polyline positions={routePoints} pathOptions={{ color: '#a8f000', weight: 5, opacity: 0.92 }} />
                      ) : null}
                      {routePoints.map((point, index) => {
                        const isFirst = index === 0;
                        const isLast = routePoints.length > 1 && index === routePoints.length - 1;
                        const label = isFirst ? 'Partenza' : isLast ? 'Arrivo' : `Tappa ${index}`;
                        return (
                          <CircleMarker
                            key={`${point[0]}:${point[1]}:${index}`}
                            center={point}
                            radius={isFirst || isLast ? 10 : 6}
                            className={styles.routePingMarker}
                            pathOptions={{
                              color: '#111511',
                              fillColor: isLast ? '#ff8a2b' : isFirst ? '#a8f000' : '#f2f4ef',
                              fillOpacity: 1,
                              weight: 4
                            }}
                          >
                            <Popup>{label}</Popup>
                          </CircleMarker>
                        );
                      })}
                    </>
                  ) : (
                    <LocationMapCenterHandler
                      onMoveStart={handleLocationMapMoveStart}
                      onSelect={(coords) => resolveSelectedCoordinates(coords, { source: 'map' })}
                    />
                  )}
                </MapContainer>

                {!form.has_route ? (
                  <div className={styles.locationCenterPin} aria-hidden="true">
                    <span><MapPin size={27} strokeWidth={3} /></span>
                    <i />
                  </div>
                ) : (
                  <div className={styles.routeGuideBadge} role="status">
                    <b>{routePoints.length ? (routePoints.length === 1 ? '2' : '✓') : '1'}</b>
                    <span>
                      {routePoints.length === 0
                        ? 'Tocca la mappa per impostare la partenza'
                        : routePoints.length === 1
                          ? 'Ora tocca il punto di arrivo'
                          : routePicking
                            ? 'Aggiungi tappe oppure conferma il percorso'
                            : 'Percorso confermato'}
                    </span>
                  </div>
                )}

                {!form.has_route ? (
                  <div className={styles.locationRadiusBadge} aria-label={`Raggio area evento ${geofenceRadius} metri`}>
                    <i />
                    Area check-in {geofenceRadius} m
                  </div>
                ) : null}
                {locationResolving ? <div className={styles.locationMapLoading}>Recupero indirizzo…</div> : null}
              </div>

              <div className={`${styles.mapQuickActions} ${form.has_route ? styles.mapQuickActionsRoute : ''}`}>
                <button type="button" disabled={locationRequesting} onClick={() => void useCurrentLocationForMode()}>
                  <MapPinned size={17} aria-hidden="true" />
                  {locationRequesting ? 'Posizione in corso…' : 'Centra sulla mia posizione'}
                </button>
                {form.has_route ? (
                  <>
                    <button type="button" disabled={routePoints.length < 2} onClick={closeRouteLoop}>
                      <Route size={17} aria-hidden="true" />
                      Percorso ad anello
                    </button>
                    <button type="button" disabled={!routePoints.length} onClick={undoLastRoutePoint}>
                      <Undo2 size={17} aria-hidden="true" />
                      Annulla punto
                    </button>
                  </>
                ) : null}
              </div>

              {form.has_route ? (
                <div className={`${styles.routeSummaryCard} ${routePoints.length >= 2 ? styles.routeSummaryReady : ''}`}>
                  <div className={styles.routeSummaryHead}>
                    <span><Route size={21} aria-hidden="true" /></span>
                    <div>
                      <small>{routePoints.length >= 2 ? 'PERCORSO PRONTO' : 'PERCORSO DA COMPLETARE'}</small>
                      <strong>{form.route_name || 'Scegli partenza e arrivo'}</strong>
                    </div>
                  </div>
                  <div className={styles.routeSummaryPlaces}>
                    <span><i className={styles.routeStartDot} /> {form.route_from || 'Partenza non impostata'}</span>
                    <span><i className={styles.routeEndDot} /> {form.route_to || 'Arrivo non impostato'}</span>
                  </div>
                  <div className={styles.routeSummaryMetrics}>
                    <b>{form.route_distance_km || '0'} km</b>
                    <span>{routeEstimatedMinutes ? `circa ${routeEstimatedMinutes} min` : 'durata da calcolare'}</span>
                    {form.route_elevation_gain_m !== '' ? <span>+{form.route_elevation_gain_m} m</span> : null}
                  </div>
                  <button
                    type="button"
                    className={routePoints.length >= 2 ? styles.routeConfirmButton : styles.routeConfirmButtonDisabled}
                    disabled={routePoints.length < 2}
                    onClick={startRoutePointSelection}
                  >
                    {routePicking ? <Check size={19} aria-hidden="true" /> : <MapPinned size={19} aria-hidden="true" />}
                    {routePicking ? 'Conferma percorso' : 'Modifica percorso'}
                  </button>
                </div>
              ) : (
                <div className={`${styles.locationResultCard} ${locationConfirmed ? styles.locationResultConfirmed : ''}`}>
                  <span><MapPin size={20} aria-hidden="true" /></span>
                  <div>
                    <strong>{form.location_name || 'Sposta la mappa per scegliere il punto'}</strong>
                    <small>
                      {form.city || (locationPreview ? `${locationPreview.lat.toFixed(5)}, ${locationPreview.lng.toFixed(5)}` : 'Via e città si compileranno automaticamente')}
                    </small>
                    {locationDistanceFromUser !== null ? (
                      <em>{formatDistanceMeters(locationDistanceFromUser)}</em>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={!locationPreview || locationResolving}
                    className={locationConfirmed ? styles.locationConfirmButtonDone : ''}
                    onClick={confirmSelectedLocation}
                  >
                    {locationConfirmed ? <Check size={16} aria-hidden="true" /> : <MapPinned size={16} aria-hidden="true" />}
                    {locationConfirmed ? 'Confermato' : 'Conferma punto'}
                  </button>
                </div>
              )}

              {!form.has_route && form.venue_type === VENUE_TYPE_GYM ? (
                <section className={styles.gymAccessCard} aria-labelledby="gym-access-title">
                  <div className={styles.gymAccessHeading}>
                    <span><Dumbbell size={20} aria-hidden="true" /></span>
                    <div>
                      <small>STRUTTURA SPORTIVA RILEVATA</small>
                      <strong id="gym-access-title">L’accesso viene scelto dal partecipante</strong>
                    </div>
                  </div>
                  <p>Quando richiede di partecipare, ogni utente indicherà se è già abbonato, usa la prima entrata gratuita oppure acquista un ingresso giornaliero. Queste condizioni restano separate dalla caparra Motrice.</p>
                </section>
              ) : null}

              <p className={styles.locationSelectionMessage} role="status">
                {locationSelectionMessage || userLocationError || (form.has_route
                  ? 'Il primo punto è la partenza; ogni nuovo tocco aggiunge una tappa e aggiorna l’arrivo.'
                  : 'Sposta la mappa: il pin resta fisso al centro e l’indirizzo si aggiorna automaticamente.')}
              </p>
            </section>

            {errors.coordinates ? <span className={`error ${styles.coordError}`}>{errors.coordinates}</span> : null}
            {form.has_route && errors.route_distance_km ? <span className={`error ${styles.coordError}`}>{errors.route_distance_km}</span> : null}

            <details className={styles.advancedDetails}>
              <summary>{form.has_route ? 'Modifica nomi e dati del percorso' : 'Modifica indirizzo e coordinate'}</summary>
              <div className={styles.inlineGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Città</span>
                  <input
                    className={invalidClass('city')}
                    value={form.city}
                    onChange={(event) => setField('city', event.target.value)}
                    placeholder="Es. Milano"
                  />
                  {errors.city ? <span className="error">{errors.city}</span> : null}
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{form.has_route ? 'Punto di ritrovo' : 'Nome location'}</span>
                  <input
                    className={invalidClass('location_name')}
                    value={form.location_name}
                    onChange={(event) => setField('location_name', event.target.value)}
                    placeholder="Es. Parco di Porta Romana"
                  />
                  {errors.location_name ? <span className="error">{errors.location_name}</span> : null}
                </label>
              </div>

              {form.has_route ? (
                <div className={styles.routeAdvancedFields}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Nome percorso</span>
                    <input
                      className={invalidClass('route_name')}
                      value={form.route_name}
                      onChange={(event) => setField('route_name', event.target.value)}
                      placeholder="Es. Anello Parco Nord"
                    />
                    {errors.route_name ? <span className="error">{errors.route_name}</span> : null}
                  </label>
                  <div className={styles.inlineGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Partenza</span>
                      <input
                        className={invalidClass('route_from')}
                        value={form.route_from}
                        onChange={(event) => setField('route_from', event.target.value)}
                      />
                      {errors.route_from ? <span className="error">{errors.route_from}</span> : null}
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Arrivo</span>
                      <input
                        className={invalidClass('route_to')}
                        value={form.route_to}
                        onChange={(event) => setField('route_to', event.target.value)}
                      />
                      {errors.route_to ? <span className="error">{errors.route_to}</span> : null}
                    </label>
                  </div>
                  <div className={styles.inlineGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Distanza (km)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        className={invalidClass('route_distance_km')}
                        value={form.route_distance_km}
                        onChange={(event) => setField('route_distance_km', event.target.value)}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Dislivello (m)</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className={invalidClass('route_elevation_gain_m')}
                        value={form.route_elevation_gain_m}
                        onChange={(event) => setField('route_elevation_gain_m', event.target.value)}
                        placeholder="Opzionale"
                      />
                      {errors.route_elevation_gain_m ? <span className="error">{errors.route_elevation_gain_m}</span> : null}
                    </label>
                  </div>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>URL percorso opzionale</span>
                    <input
                      className={invalidClass('route_map_url')}
                      value={form.route_map_url}
                      onChange={(event) => setField('route_map_url', event.target.value)}
                      placeholder="https://..."
                    />
                    {errors.route_map_url ? <span className="error">{errors.route_map_url}</span> : null}
                  </label>
                </div>
              ) : null}

              <div className={styles.inlineGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Latitudine</span>
                  <input
                    type="number"
                    step="any"
                    className={invalidClass('coordinates')}
                    value={form.lat}
                    onChange={(event) => setField('lat', event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Longitudine</span>
                  <input
                    type="number"
                    step="any"
                    className={invalidClass('coordinates')}
                    value={form.lng}
                    onChange={(event) => setField('lng', event.target.value)}
                  />
                </label>
              </div>
            </details>
          </fieldset>
        ) : null}

        {activeStep === 3 ? (
          <fieldset className={`${styles.wizardStep} ${stepDirection === 'backward' ? styles.wizardStepBackward : styles.wizardStepForward}`} aria-label="Regole e pubblicazione">

            {!form.is_personal ? <div className={styles.primarySettingsCard}>
              <div
                className={`${styles.settingRow} ${styles.settingRowCompact} ${form.participation_protection ? styles.settingRowActive : ''}`}
              >
                <span className={styles.settingIcon}><ShieldCheck size={22} /></span>
                <span className={styles.settingCopy}>
                  <strong>Proteggi la partecipazione</strong>
                  <small>Deposito fisso e sblocco tramite QR o GPS. Presenza e premi sono calcolati da Motrice.</small>
                </span>
                <span className={styles.requiredBadge}>Sempre attiva</span>
              </div>
            </div> : null}

            {form.is_personal ? (
              <div className={styles.personalNotice}>
                <UserRoundCheck size={24} aria-hidden="true" />
                <div>
                  <strong>{recurrenceMode === 'weekly' ? 'Programma personale ricorrente' : 'Evento personale singolo'}</strong>
                  <span>
                    {recurrenceMode === 'weekly'
                      ? 'Privato e flessibile: si sblocca dall’orario scelto e parte soltanto dopo GPS e conferma.'
                      : 'Privato, senza deposito, partecipanti o QR. L’avvio avviene dal tuo allenamento live.'}
                  </span>
                </div>
              </div>
            ) : null}

            {form.is_personal ? (
              <section className={styles.personalTimingCard} aria-label="Programmazione allenamento personale">
                <div className={styles.personalTimingHead}>
                  <span><CalendarDays size={21} aria-hidden="true" /></span>
                  <div>
                    <strong>{recurrenceMode === 'weekly' ? 'Inizio del programma' : 'Quando ti alleni'}</strong>
                    <small>
                      {recurrenceMode === 'weekly'
                        ? 'Scegli la data di partenza e la durata comune delle sessioni.'
                        : 'Imposta data, ora e durata del tuo allenamento.'}
                    </small>
                  </div>
                </div>

                <div className={`${styles.personalTimingFields} ${recurrenceMode === 'weekly' ? styles.personalTimingFieldsCompact : ''}`}>
                  <label>
                    <span>{recurrenceMode === 'weekly' ? 'Data di partenza' : 'Data'}</span>
                    <input
                      type="date"
                      min={todayDateValue}
                      value={eventDate}
                      onChange={(event) => selectEventDate(event.target.value)}
                    />
                  </label>
                  {recurrenceMode === 'once' ? (
                    <label>
                      <span>Ora</span>
                      <input
                        type="time"
                        step="300"
                        value={eventTime}
                        onChange={(event) => selectEventTime(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <label>
                    <span>Durata sessione</span>
                    <span className={styles.personalDurationInput}>
                      <input
                        type="number"
                        min="15"
                        max="360"
                        step="15"
                        value={form.duration_minutes}
                        onChange={(event) => setField('duration_minutes', event.target.value)}
                        aria-label="Durata allenamento personale in minuti"
                      />
                      <b>min</b>
                    </span>
                  </label>
                </div>

                <div className={styles.personalDurationPresets} role="group" aria-label="Durate rapide">
                  {DURATION_PRESETS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className={Number(form.duration_minutes) === minutes ? styles.personalDurationSelected : ''}
                      onClick={() => selectEventDuration(minutes)}
                    >
                      {minutes}′
                    </button>
                  ))}
                </div>
                {errors.event_datetime ? <span className="error">{errors.event_datetime}</span> : null}
                {errors.duration_minutes ? <span className="error">{errors.duration_minutes}</span> : null}
              </section>
            ) : null}

            {form.is_personal && recurrenceMode === 'weekly' ? (
              <section className={styles.recurrencePlanner} aria-label="Programmazione settimanale">
                <div className={styles.recurrencePlannerHead}>
                  <span className={styles.recurrencePlannerIcon}><CalendarRange size={23} aria-hidden="true" /></span>
                  <div>
                    <span className={styles.fieldLabel}>Programmazione settimanale</span>
                    <strong>Scegli giorni e disponibilità</strong>
                    <small>A partire dal {formatEventDateLabel(eventDate)} · anteprima di {PERSONAL_RECURRENCE_WEEKS} settimane</small>
                  </div>
                  <span className={styles.previewBadge}>Anteprima</span>
                </div>

                <div className={styles.recurrenceDayPicker} role="group" aria-label="Giorni di allenamento">
                  {PERSONAL_RECURRENCE_DAYS.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      className={weeklySchedule[day.id]?.enabled ? styles.recurrenceDaySelected : ''}
                      aria-pressed={Boolean(weeklySchedule[day.id]?.enabled)}
                      onClick={() => toggleRecurringDay(day.id)}
                    >
                      <span>{day.shortLabel}</span>
                      {weeklySchedule[day.id]?.enabled ? <Check size={15} aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
                {errors.recurrence_days ? <span className="error">{errors.recurrence_days}</span> : null}

                {recurringDays.length ? (
                  <div className={styles.recurrenceDayList}>
                    {recurringDays.map((day) => {
                      const configuration = weeklySchedule[day.id];
                      const plan = workoutPlansById.get(String(configuration.planId || ''));
                      return (
                        <article key={day.id} className={styles.recurrenceDayCard}>
                          <header>
                            <span>{day.shortLabel}</span>
                            <div><strong>{day.label}</strong><small>{configuration.time ? `Disponibile dalle ${configuration.time}` : 'Disponibilità da scegliere'}</small></div>
                            <button type="button" onClick={() => toggleRecurringDay(day.id)} aria-label={`Rimuovi ${day.label}`}>
                              <X size={17} aria-hidden="true" />
                            </button>
                          </header>
                          <div className={styles.recurrenceDayFields}>
                            <label>
                              <span>Disponibile dalle</span>
                              <input
                                type="time"
                                step="300"
                                value={configuration.time}
                                onChange={(event) => updateRecurringDay(day.id, 'time', event.target.value)}
                              />
                            </label>
                            <label>
                              <span>Scheda</span>
                              <select
                                value={configuration.planId}
                                onChange={(event) => updateRecurringDay(day.id, 'planId', event.target.value)}
                                disabled={workoutPlansLoading}
                              >
                                <option value="">{workoutPlansLoading ? 'Caricamento…' : 'Scegli una scheda'}</option>
                                {workoutPlans.map((item) => (
                                  <option key={getWorkoutPlanValue(item)} value={getWorkoutPlanValue(item)}>
                                    {item.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <footer>
                            <Dumbbell size={15} aria-hidden="true" />
                            <span>{plan ? `${plan.exercises?.length || 0} esercizi · ${plan.duration || form.duration_minutes} min` : 'Collega una scheda per questo giorno'}</span>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.recurrenceEmpty}>Seleziona almeno un giorno per costruire la tua settimana.</div>
                )}
                {errors.recurrence_times ? <span className="error">{errors.recurrence_times}</span> : null}
                {errors.recurrence_plans ? <span className="error">{errors.recurrence_plans}</span> : null}

                <div className={styles.recurrenceAccessRule}>
                  <Clock3 size={18} aria-hidden="true" />
                  <span>
                    <strong>Finestra flessibile</strong>
                    <small>Accesso dall’orario indicato fino alle 23:59. Il timer parte solo dopo verifica GPS e “Avvia allenamento”.</small>
                  </span>
                </div>

                {!workoutPlansLoading && !workoutPlans.length ? (
                  <div className={styles.recurrenceNoPlans}>
                    <Dumbbell size={19} aria-hidden="true" />
                    <span><strong>Nessuna scheda disponibile</strong><small>Crea prima almeno una scheda personale.</small></span>
                    <button type="button" onClick={() => navigate('/dashboard/plans')}>Vai alle schede</button>
                  </div>
                ) : null}

                <div className={styles.recurrenceReminder}>
                  <BellRing size={19} aria-hidden="true" />
                  <div><strong>Promemoria intelligente</strong><small>Quando il GPS rileva che hai raggiunto il punto di allenamento, ricevi un avviso per verificare la presenza e avviare la sessione.</small></div>
                </div>
              </section>
            ) : null}

            {form.is_personal ? (
              <div className={styles.personalVisibilityCompact} aria-label="Visibilità allenamento personale">
                <LockKeyhole size={18} aria-hidden="true" />
                <span><strong>Solo tu</strong><small>Visibile esclusivamente ne “I miei eventi”.</small></span>
                <b>Privato</b>
              </div>
            ) : (
            <div className={`${styles.choiceSection} ${styles.optionCard}`}>
              <div className={styles.sectionLabelRow}><span>Visibilita</span></div>
              <div className={styles.segmentedControl} role="group" aria-label="Visibilita evento">
                <button
                  type="button"
                  className={form.visibility === 'public' ? styles.segmentSelected : ''}
                  aria-pressed={form.visibility === 'public'}
                  onClick={() => setVisibility('public')}
                >
                  <Globe2 size={20} /> Pubblico
                </button>
                <button
                  type="button"
                  className={form.visibility === 'private' ? styles.segmentSelected : ''}
                  aria-pressed={form.visibility === 'private'}
                  onClick={() => setVisibility('private')}
                >
                  <LockKeyhole size={20} /> Privato
                </button>
              </div>
              <div className={styles.settingHint}>
                <i aria-hidden="true" />
                <span>
                  {form.visibility === 'private'
                      ? 'Solo su invito con link. Non compare nella mappa o nelle liste pubbliche.'
                      : `Visibile a tutti${form.city ? ` a ${form.city}` : ''}. Chiunque puo trovare l evento.`}
                </span>
              </div>
              {errors.visibility && <span className="error">{errors.visibility}</span>}
            </div>
            )}

            {!form.is_personal && form.visibility === 'public' ? (
              <div className={`${styles.choiceSection} ${styles.optionCard}`}>
                <div className={styles.sectionLabelRow}><span>Accesso</span></div>
                <div className={styles.segmentedControl} role="group" aria-label="Modalita di accesso">
                  <button
                    type="button"
                    className={form.join_policy === 'open' ? styles.segmentSelected : ''}
                    aria-pressed={form.join_policy === 'open'}
                    onClick={() => setField('join_policy', 'open')}
                  >
                    <Users size={20} /> Aperto a tutti
                  </button>
                  <button
                    type="button"
                    className={form.join_policy === 'approval' ? styles.segmentSelected : ''}
                    aria-pressed={form.join_policy === 'approval'}
                    onClick={() => setField('join_policy', 'approval')}
                  >
                    <ShieldCheck size={20} /> Su richiesta
                  </button>
                </div>
                <p className={styles.choiceHelper}>
                  {form.join_policy === 'approval'
                    ? 'La riserva viene bloccata con la richiesta e torna disponibile se l’organizer la rifiuta.'
                    : 'La partecipazione viene confermata subito, senza approvazione.'}
                </p>
                {errors.join_policy && <span className="error">{errors.join_policy}</span>}
              </div>
            ) : null}

            <div className={styles.extraSettings}>
              <div className={styles.sectionLabelRow}><span>Impostazioni extra</span></div>
              <label className={`${styles.settingRow} ${styles.settingRowCompact} ${form.add_to_calendar ? styles.settingRowActive : ''}`}>
                <span className={styles.settingIcon}><CalendarPlus size={22} /></span>
                <span className={styles.settingCopy}>
                  <strong>Aggiungi al mio calendario</strong>
                  <small>Al termine apre un file calendario compatibile con Android, iPhone e desktop.</small>
                </span>
                <input
                  type="checkbox"
                  checked={form.add_to_calendar}
                  onChange={(event) => setField('add_to_calendar', event.target.checked)}
                />
                <span className={styles.switchTrack} aria-hidden="true"><i /></span>
              </label>
              <div className={styles.rewardCallout}>
                <span><Sparkles size={24} /></span>
                <div>
                  <small>Premio PX</small>
                  <strong>
                    {form.is_personal
                      ? `Questo promemoria vale ${form.completion_xp} PX al completamento.`
                      : `I partecipanti possono ottenere fino a ${Number(form.completion_xp || 0) + Number(form.review_bonus_xp || 0)} PX.`}
                  </strong>
                </div>
              </div>
            </div>

            {!form.is_personal ? (
              <section className={styles.visibleRulesSection} aria-label="Deposito e tolleranza ritardatari">
                <div className={styles.sectionLabelRow}>
                  <span>Deposito e tolleranza</span>
                  <ContextInfoButton
                    title="Deposito e tolleranza"
                    description="Queste regole proteggono organizzatore e partecipanti prima dell’inizio dell’attività."
                    items={[
                      { title: 'Deposito', text: 'La quota fissa di 10 € viene impegnata per l’evento e gestita secondo l’esito della presenza.' },
                      { title: 'Verifica', text: 'Ogni persona può validarsi tramite QR Code oppure geolocalizzazione.' },
                      { title: 'Tolleranza', text: 'L’organizzatore concede da 15 a 30 minuti per registrare eventuali ritardatari.' }
                    ]}
                    note="La tolleranza estende soltanto il check-in e non modifica l’orario di fine dell’evento."
                  />
                </div>
                <div className={styles.ruleCardGrid}>
                  <div className={`${styles.ruleCard} ${styles.fixedDepositCard} ${errors.deposit_cents ? styles.invalidCard : ''}`}>
                    <span className={styles.controlTitle}><WalletCards size={18} />Deposito</span>
                    <div className={styles.fixedDepositValue}>
                      <strong>10 €</strong>
                      <span>quota fissa per persona</span>
                    </div>
                    <small>
                      {Number(moneyWallet?.trial_events_remaining || 0) > 0
                        ? `${moneyWallet.trial_events_remaining} eventi prova disponibili: nessun addebito reale.`
                        : String(moneyWallet?.provider_mode || '') === 'virtual_beta'
                          ? 'Credito virtuale bloccato alla conferma e restituito dopo la presenza verificata.'
                        : 'Bloccato alla conferma e restituito dopo l’evento, trascorse 48 ore senza contestazioni.'}
                    </small>
                    {errors.deposit_cents && <span className="error">{errors.deposit_cents}</span>}
                  </div>

                  <div className={`${styles.ruleCard} ${errors.checkin_grace_minutes ? styles.invalidCard : ''}`}>
                    <span className={styles.controlTitle}><Clock3 size={18} />Tolleranza ritardatari</span>
                    <div className={styles.presetRow}>
                      {CHECK_IN_GRACE_PRESETS.map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          className={Number(form.checkin_grace_minutes) === minutes ? styles.presetSelected : ''}
                          onClick={() => setField('checkin_grace_minutes', minutes)}
                        >
                          {minutes}′
                        </button>
                      ))}
                    </div>
                    <small>{checkInWindowPreview} Non modifica la fine dell’evento.</small>
                    {errors.checkin_grace_minutes && <span className="error">{errors.checkin_grace_minutes}</span>}
                  </div>
                </div>
              </section>
            ) : null}

            {!(form.is_personal && recurrenceMode === 'weekly') ? <section className={`${styles.workoutAttachmentCard} ${selectedWorkoutPlan ? styles.workoutAttachmentSelected : ''}`}>
              <div className={styles.workoutAttachmentHeading}>
                <span className={styles.workoutAttachmentIcon}><Dumbbell size={23} aria-hidden="true" /></span>
                <div>
                  <span className={styles.fieldLabel}>Allega scheda</span>
                  <small>
                    {form.is_personal
                      ? 'Collega una delle tue Schede personali all’allenamento.'
                      : 'Condividi una delle tue Schede personali con i partecipanti.'}
                  </small>
                </div>
              </div>
              {selectedWorkoutPlan ? (
                <div className={styles.workoutAttachmentPreview}>
                  <div>
                    <strong>{selectedWorkoutPlan.title}</strong>
                    <span>{selectedWorkoutPlan.exercises?.length || 0} esercizi · {selectedWorkoutPlan.duration || 60} min</span>
                  </div>
                  <button type="button" onClick={removeWorkoutPlan} aria-label={`Rimuovi ${selectedWorkoutPlan.title}`}><X size={18} /></button>
                  <button type="button" className={styles.workoutPreviewLink} onClick={() => setWorkoutPlanPreviewOpen(true)}>
                    <Eye size={17} aria-hidden="true" /> Vedi anteprima
                  </button>
                </div>
              ) : (
                <button type="button" className={styles.workoutAttachButton} onClick={openWorkoutPlanPicker}>
                  <Plus size={19} aria-hidden="true" /> Scegli una scheda
                </button>
              )}
            </section> : null}

            {!form.is_personal ? <label className={`${styles.field} ${styles.descriptionCard}`}>
              <span className={styles.descriptionLabel}>
                <span className={styles.fieldLabel}>Descrizione</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={Sparkles}
                  onClick={suggestDescriptionWithAi}
                  disabled={!aiEnabled || aiLoading}
                  aria-label="Suggerisci descrizione evento con AI"
                  title={aiEnabled ? 'Genera descrizione breve con AI' : 'Attiva AI Locale in Account'}
                >
                  {aiLoading ? 'Generazione...' : 'Suggerisci con AI'}
                </Button>
              </span>
              <textarea
                rows="5"
                className={invalidClass('description')}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Ritmo, attrezzatura, punto di incontro e obiettivo..."
                maxLength="2000"
              />
              <span className={styles.descriptionMeta}>
                <span>{!aiEnabled ? 'Attiva AI Locale (Beta) dalla sezione Account.' : 'Min. 20 caratteri'}</span>
                <b className={form.description.trim().length >= 20 ? styles.descriptionReady : ''}>
                  {Math.min(form.description.trim().length, 20)}/20
                </b>
              </span>
              {errors.description && <span className="error">{errors.description}</span>}
            </label> : null}
          </fieldset>
        ) : null}

        {activeStep === 4 ? (
          <fieldset className={`${styles.wizardStep} ${stepDirection === 'backward' ? styles.wizardStepBackward : styles.wizardStepForward}`} aria-label="Riepilogo evento">
            <section className={styles.reviewHero}>
              <span className={styles.reviewHeroVisual}>{getSportVisual(selectedSport).emoji}</span>
              <div>
                <span className={styles.reviewEyebrow}>
                  {form.is_personal && recurrenceMode === 'weekly' ? 'Programma personale pronto' : 'Pronto per la pubblicazione'}
                </span>
                <h3>{getEventDisplayTitle(form, selectedSport)}</h3>
                <p>{selectedSport?.name || 'Attività sportiva'} · {form.city}</p>
              </div>
              <Check size={22} aria-hidden="true" />
            </section>

            <section className={styles.reviewSection}>
              <div className={styles.reviewSectionHeader}>
                <div><CalendarDays size={19} /><strong>Attività e orario</strong></div>
                <button type="button" onClick={() => editReviewStep(form.is_personal ? 3 : 1)}>Modifica</button>
              </div>
              <div className={styles.reviewGrid}>
                <div><span>Sport</span><strong>{selectedSport?.name || '—'}</strong></div>
                {!form.is_personal ? <div><span>Livello</span><strong>{LEVEL_OPTIONS.find((item) => item.value === form.level)?.label || 'Open'}</strong></div> : null}
                <div><span>{form.is_personal && recurrenceMode === 'weekly' ? 'Inizio programma' : 'Data'}</span><strong>{formatEventDateLabel(eventDate)}</strong></div>
                <div><span>{form.is_personal && recurrenceMode === 'weekly' ? 'Disponibilità' : 'Orario'}</span><strong>{form.is_personal && recurrenceMode === 'weekly' ? 'Dalle ore indicate' : `${eventTime}–${eventEndTime}`}</strong></div>
                <div><span>Durata</span><strong>{form.duration_minutes} min</strong></div>
                {form.is_personal
                  ? <div><span>Frequenza</span><strong>{recurrenceMode === 'weekly' ? `${recurringDays.length} giorni a settimana` : 'Una volta'}</strong></div>
                  : <>
                    <div><span>Partecipanti</span><strong>Fino a {form.max_participants}</strong></div>
                    <div><span>Età</span><strong>{form.min_age}–{form.max_age} anni</strong></div>
                  </>}
              </div>
            </section>

            {form.is_personal && recurrenceMode === 'weekly' ? (
              <section className={styles.reviewSection}>
                <div className={styles.reviewSectionHeader}>
                  <div><Repeat2 size={19} /><strong>Settimana di allenamento</strong></div>
                  <button type="button" onClick={() => editReviewStep(3)}>Modifica</button>
                </div>
                <div className={styles.recurrenceReviewList}>
                  {recurringDays.map((day) => {
                    const configuration = weeklySchedule[day.id];
                    const plan = workoutPlansById.get(String(configuration.planId || ''));
                    return (
                      <div key={day.id}>
                        <span>{day.shortLabel}</span>
                        <strong>{day.label}</strong>
                        <small>Dalle {configuration.time} · {plan?.title || 'Scheda non selezionata'}</small>
                      </div>
                    );
                  })}
                </div>
                <p className={styles.recurrenceReviewSummary}>
                  {recurrencePreview.length} allenamenti nelle prossime {PERSONAL_RECURRENCE_WEEKS} settimane, generati progressivamente.
                </p>
              </section>
            ) : null}

            <section className={styles.reviewSection}>
              <div className={styles.reviewSectionHeader}>
                <div><MapPin size={19} /><strong>Luogo e percorso</strong></div>
                <button type="button" onClick={() => editReviewStep(2)}>Modifica</button>
              </div>
              <div className={styles.reviewLocation}>
                <strong>{form.location_name}</strong>
                <span>{form.city}</span>
                {form.has_route ? (
                  <small>{form.route_name} · {form.route_distance_km} km · {routePoints.length} punti</small>
                ) : form.venue_type === VENUE_TYPE_GYM ? (
                  <small className={styles.reviewGymAccess}>
                    <LockKeyhole size={14} aria-hidden="true" />
                    {getGymAccessPresentation(form)?.label}
                  </small>
                ) : (
                  <small>{fixedLocationLabel} confermato sulla mappa</small>
                )}
              </div>
            </section>

            <section className={styles.reviewSection}>
              <div className={styles.reviewSectionHeader}>
                <div><ShieldCheck size={19} /><strong>Regole e contenuti</strong></div>
                <button type="button" onClick={() => editReviewStep(3)}>Modifica</button>
              </div>
              <div className={styles.reviewGrid}>
                <div><span>Visibilità</span><strong>{form.visibility === 'private' ? 'Privato' : 'Pubblico'}</strong></div>
                <div><span>Accesso</span><strong>{form.is_personal ? 'Solo tu' : form.join_policy === 'approval' ? 'Su richiesta' : 'Aperto a tutti'}</strong></div>
                <div><span>Deposito</span><strong>{form.is_personal ? 'Non richiesto' : '10 €'}</strong></div>
                <div><span>Tolleranza</span><strong>{form.is_personal ? '—' : `${form.checkin_grace_minutes} min`}</strong></div>
                <div><span>Verifica</span><strong>{form.is_personal ? 'GPS' : 'QR + GPS'}</strong></div>
                <div><span>Scheda</span><strong>{form.is_personal && recurrenceMode === 'weekly' ? 'Diversa per ogni giorno' : selectedWorkoutPlan?.title || 'Non allegata'}</strong></div>
              </div>
              {!form.is_personal ? <div className={styles.reviewDescription}>
                <span>Descrizione</span>
                <p>{form.description}</p>
              </div> : null}
            </section>

            <div className={styles.reviewConfirmation}>
              <Check size={21} aria-hidden="true" />
              <span>
                {form.is_personal && recurrenceMode === 'weekly'
                  ? 'Confermando, Motrice creerà le sessioni e continuerà a generarle progressivamente senza duplicati.'
                  : 'Controlla i dati. La pubblicazione avverrà solo dopo la conferma finale.'}
              </span>
            </div>
          </fieldset>
        ) : null}

        <footer
          className={`${styles.wizardFooter} ${activeStep === 1 ? styles.wizardFooterSingle : ''}`}
          hidden={keyboardVisible}
        >
          {activeStep > 1 ? (
            <button type="button" className={`${styles.backButton} ${styles.backButtonCompact}`} onClick={goToPreviousStep}>
              <ChevronLeft size={18} />Indietro
            </button>
          ) : null}
          {activeStep < WIZARD_STEPS.length ? (
            <button type="button" className={styles.nextButton} onClick={goToNextStep}>
              Avanti <ChevronRight size={23} />
            </button>
          ) : (
            <button type="button" className={styles.nextButton} disabled={submitting} onClick={publishEvent}>
              {submitting
                ? 'Pubblicazione...'
                : form.is_personal && recurrenceMode === 'weekly'
                  ? 'Crea programma'
                  : 'Conferma e pubblica'}{' '}
              <Check size={23} />
            </button>
          )}
        </footer>
      </form>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature={`Limite creazione eventi (${creationLimit}/mese)`}
      />
      <Modal
        open={workoutPlanPickerOpen}
        title="Allega scheda"
        onClose={() => setWorkoutPlanPickerOpen(false)}
        onConfirm={attachPendingWorkoutPlan}
        confirmText="Allega scheda"
        confirmDisabled={!pendingWorkoutPlan}
      >
        <div className={styles.workoutPicker}>
          <label className={styles.workoutSearch}>
            <Search size={19} aria-hidden="true" />
            <input value={workoutPlanQuery} onChange={(event) => setWorkoutPlanQuery(event.target.value)} placeholder="Cerca nelle tue schede..." />
          </label>
          {workoutPlansLoading ? <p className={styles.workoutEmpty}>Caricamento schede...</p> : null}
          {!workoutPlansLoading && !filteredWorkoutPlans.length ? (
            <div className={styles.workoutEmpty}>
              <Dumbbell size={28} aria-hidden="true" />
              <strong>Nessuna scheda disponibile</strong>
              <span>Crea prima una Scheda personale e poi torna qui.</span>
              <Button type="button" size="sm" onClick={() => navigate('/dashboard/plans')}>Crea una scheda</Button>
            </div>
          ) : null}
          <div className={styles.workoutPickerList}>
            {filteredWorkoutPlans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                className={String(pendingWorkoutPlan?.id) === String(plan.id) ? styles.workoutPickerItemActive : ''}
                onClick={() => setPendingWorkoutPlan(plan)}
              >
                <span><Dumbbell size={20} aria-hidden="true" /></span>
                <div><strong>{plan.title}</strong><small>{plan.exercises?.length || 0} esercizi · {plan.duration || 60} min</small></div>
                <i aria-hidden="true">{String(pendingWorkoutPlan?.id) === String(plan.id) ? '✓' : ''}</i>
              </button>
            ))}
          </div>
        </div>
      </Modal>
      <Modal
        open={workoutPlanPreviewOpen}
        title={selectedWorkoutPlan?.title || 'Anteprima scheda'}
        onClose={() => setWorkoutPlanPreviewOpen(false)}
        showConfirm={false}
        closeText="Chiudi"
      >
        <div className={styles.workoutExerciseList}>
          {(selectedWorkoutPlan?.exercises || []).map((exercise, index) => (
            <article key={exercise.instanceId || `${exercise.name}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><strong>{exercise.name}</strong><small>{exercise.sets || 1} serie × {exercise.reps || '10'} ripetizioni</small></div>
            </article>
          ))}
        </div>
      </Modal>
    </section>
  );
}

export default CreateEventPage;

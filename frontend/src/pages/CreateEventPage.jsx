import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  UserRound,
  UserRoundCheck,
  Users,
  UsersRound,
  WalletCards,
  X
} from 'lucide-react';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { useUserLocation } from '../hooks/useUserLocation';
import { useToast } from '../context/ToastContext';
import { useBilling } from '../context/BillingContext';
import PaywallModal from '../components/PaywallModal';
import Modal from '../components/Modal';
import Button from '../components/Button';
import { ensureLeafletIcons } from '../features/coach/utils/leafletIconFix';
import { markStepByAction } from '../services/tutorialMode';
import { ai, getAiSettings } from '../services/ai';
import { geocodeAddress, geocodeEventLocation, reverseGeocodeCoordinates } from '../services/geocoding';
import { downloadEventIcs } from '../utils/ics';
import {
  ensurePersonalWorkoutPlanRemote,
  listAvailablePersonalWorkoutPlans
} from '../features/coach/services/personalWorkoutPlansApi';
import styles from '../styles/pages/createEvent.module.css';

const initialState = {
  title: '',
  city: '',
  sport_id: '',
  level: 'beginner',
  event_datetime: '',
  duration_minutes: 120,
  deposit_cents: 500,
  minimum_presence_minutes: 45,
  verification_mode: 'both',
  geofence_radius_m: 250,
  completion_xp: 50,
  review_bonus_xp: 25,
  max_participants: 8,
  audience: 'mixed',
  participation_protection: true,
  visibility: 'public',
  join_policy: 'open',
  add_to_calendar: true,
  is_personal: false,
  location_name: '',
  lat: '',
  lng: '',
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
  { id: 3, label: 'Regole', description: 'Accesso, verifica e pubblicazione' }
];

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzato' },
  { value: 'all', label: 'Open' }
];

const DURATION_PRESETS = [60, 90, 120];
const DEPOSIT_PRESETS = [0, 500, 1000, 1500];
const PRESENCE_PRESETS = [30, 45, 60, 90];
const ADVANCED_RULE_FIELDS = [
  'deposit_cents',
  'minimum_presence_minutes',
  'verification_mode',
  'geofence_radius_m',
  'completion_xp',
  'review_bonus_xp'
];

const AUDIENCE_OPTIONS = [
  { value: 'mixed', label: 'Misto', copy: 'Aperto a tutti, senza distinzioni.', icon: UsersRound },
  { value: 'male', label: 'Maschile', copy: 'Categoria maschile.', icon: UserRound },
  { value: 'female', label: 'Femminile', copy: 'Categoria femminile.', icon: UserRoundCheck }
];

const SPORT_VISUALS = {
  running: { emoji: '🏃', subtitle: 'Gruppi corsa' },
  padel: { emoji: '🎾', subtitle: 'Doppio · Singolo' },
  calcio: { emoji: '⚽', subtitle: '5vs5 · 11vs11' },
  palestra: { emoji: '🏋️', subtitle: 'Forza · Fitness' },
  bici: { emoji: '🚴', subtitle: 'Strada · Gravel' },
  trekking: { emoji: '🥾', subtitle: 'Sentieri · Gruppi' }
};

const STEP_ERROR_FIELDS = {
  1: ['title', 'sport_id', 'event_datetime', 'duration_minutes', 'max_participants', 'audience'],
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
    'minimum_presence_minutes',
    'verification_mode',
    'geofence_radius_m',
    'completion_xp',
    'review_bonus_xp',
    'visibility',
    'join_policy',
    'description'
  ]
};

function getSportVisual(sport) {
  const key = String(sport?.slug || sport?.name || '').trim().toLowerCase();
  return SPORT_VISUALS[key] || { emoji: '🏅', subtitle: 'Allenamento di gruppo' };
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
  const map = useMapEvents({
    movestart() {
      onMoveStart?.();
    },
    moveend() {
      const center = map.getCenter();
      onSelect({ lat: center.lat, lng: center.lng });
    }
  });
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
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [routeResolving, setRouteResolving] = useState(false);
  const [routeResolveError, setRouteResolveError] = useState('');
  const [routePicking, setRoutePicking] = useState(false);
  const [manualRouteSelection, setManualRouteSelection] = useState(false);
  const [locationResolving, setLocationResolving] = useState(false);
  const [locationMapRevision, setLocationMapRevision] = useState(0);
  const [locationSelectionMessage, setLocationSelectionMessage] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [workoutPlans, setWorkoutPlans] = useState([]);
  const [workoutPlansLoading, setWorkoutPlansLoading] = useState(false);
  const [workoutPlanPickerOpen, setWorkoutPlanPickerOpen] = useState(false);
  const [workoutPlanPreviewOpen, setWorkoutPlanPreviewOpen] = useState(false);
  const [workoutPlanQuery, setWorkoutPlanQuery] = useState('');
  const [selectedWorkoutPlan, setSelectedWorkoutPlan] = useState(null);
  const [pendingWorkoutPlan, setPendingWorkoutPlan] = useState(null);
  const groupSettingsRef = useRef(null);
  const protectionSettingsRef = useRef(null);
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

  const filteredWorkoutPlans = useMemo(() => {
    const query = String(workoutPlanQuery || '').trim().toLowerCase();
    if (!query) return workoutPlans;
    return workoutPlans.filter((plan) =>
      `${plan.title || ''} ${plan.type || ''}`.toLowerCase().includes(query)
    );
  }, [workoutPlanQuery, workoutPlans]);

  usePageMeta({
    title: 'Crea Sessione | Motrice',
    description: 'Pubblica una nuova sessione sportiva e connetti atleti nella tua area.'
  });

  useEffect(() => {
    api.listSports().then(setSports);
    api.getEventCreationStats().then(setCreationStats);
  }, []);

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

  const locationMapCenter = useMemo(
    () => (locationPreview ? [locationPreview.lat, locationPreview.lng] : [41.8719, 12.5674]),
    [locationPreview]
  );

  const geofenceRadius = useMemo(
    () => Math.min(1000, Math.max(50, Number(form.geofence_radius_m) || 250)),
    [form.geofence_radius_m]
  );

  const locationMapZoom = useMemo(() => {
    if (!locationPreview) return 6;
    if (geofenceRadius >= 750) return 13;
    if (geofenceRadius >= 400) return 14;
    if (geofenceRadius >= 200) return 15;
    return 16;
  }, [geofenceRadius, locationPreview]);

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

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const errorKey = key === 'lat' || key === 'lng' ? 'coordinates' : key;
      if (!prev[errorKey]) return prev;
      const next = { ...prev };
      delete next[errorKey];
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

  function toggleParticipationProtection(enabled) {
    if (form.is_personal) return;

    if (!enabled) {
      protectionSettingsRef.current = {
        deposit_cents: form.deposit_cents,
        minimum_presence_minutes: form.minimum_presence_minutes,
        verification_mode: form.verification_mode,
        geofence_radius_m: form.geofence_radius_m
      };
      setForm((prev) => ({
        ...prev,
        participation_protection: false,
        deposit_cents: 0,
        minimum_presence_minutes: Math.min(15, Number(prev.duration_minutes || 15)),
        verification_mode: 'qr',
        geofence_radius_m: 250
      }));
      setAdvancedSettingsOpen(false);
      return;
    }

    const previous = protectionSettingsRef.current || {};
    setForm((prev) => ({
      ...prev,
      participation_protection: true,
      deposit_cents: Number(previous.deposit_cents ?? 500),
      minimum_presence_minutes: Number(
        previous.minimum_presence_minutes ?? Math.min(45, Number(prev.duration_minutes || 45))
      ),
      verification_mode: previous.verification_mode || 'both',
      geofence_radius_m: Number(previous.geofence_radius_m ?? 250)
    }));
  }

  function togglePersonalEvent(enabled) {
    if (enabled) {
      groupSettingsRef.current = {
        visibility: form.visibility,
        join_policy: form.join_policy,
        max_participants: form.max_participants,
        deposit_cents: form.deposit_cents,
        minimum_presence_minutes: form.minimum_presence_minutes,
        verification_mode: form.verification_mode,
        geofence_radius_m: form.geofence_radius_m,
        completion_xp: form.completion_xp,
        review_bonus_xp: form.review_bonus_xp,
        participation_protection: form.participation_protection
      };
      setForm((prev) => ({
        ...prev,
        is_personal: true,
        participation_protection: false,
        visibility: 'private',
        join_policy: 'open',
        max_participants: 1,
        deposit_cents: 0,
        minimum_presence_minutes: Math.min(15, Number(prev.duration_minutes || 15)),
        verification_mode: 'geo',
        geofence_radius_m: 250,
        completion_xp: 5,
        review_bonus_xp: 0
      }));
      setAdvancedSettingsOpen(false);
      return;
    }

    const previous = groupSettingsRef.current || {};
    setForm((prev) => ({
      ...prev,
      is_personal: false,
      participation_protection: previous.participation_protection ?? true,
      visibility: previous.visibility || 'public',
      join_policy: previous.join_policy || 'open',
      max_participants: Math.max(2, Number(previous.max_participants || 8)),
      deposit_cents: Number(previous.deposit_cents ?? 500),
      minimum_presence_minutes: Number(previous.minimum_presence_minutes ?? 45),
      verification_mode: previous.verification_mode || 'both',
      geofence_radius_m: Number(previous.geofence_radius_m ?? 250),
      completion_xp: Number(previous.completion_xp ?? 50),
      review_bonus_xp: Number(previous.review_bonus_xp ?? 25)
    }));
  }

  function clearRouteFieldErrors() {
    setErrors((prev) => {
      const next = { ...prev };
      ['route_name', 'route_from', 'route_to', 'route_distance_km'].forEach((field) => delete next[field]);
      return next;
    });
  }

  function addRoutePoint(point) {
    if (!isValidRoutePoint(point)) return;
    if (routePoints.length >= 30) {
      showToast('Puoi inserire al massimo 30 punti per percorso', 'error');
      return;
    }

    const normalizedPoint = [Number(point[0]), Number(point[1])];
    setForm((prev) => {
      const currentPoints = Array.isArray(prev.route_points) ? prev.route_points.filter(isValidRoutePoint) : [];
      const nextPoints = [...currentPoints, normalizedPoint];
      const firstPoint = nextPoints[0];
      const lastPoint = nextPoints[nextPoints.length - 1];
      const distanceKm = calculateRouteDistanceKm(nextPoints);

      return {
        ...prev,
        has_route: true,
        lat: prev.lat || String(firstPoint[0]),
        lng: prev.lng || String(firstPoint[1]),
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
    showToast('Punti del percorso cancellati', 'info');
  }

  function invalidClass(name) {
    return errors[name] ? styles.invalid : '';
  }

  async function resolveRouteOnline() {
    const from = String(form.route_from || '').trim();
    const to = String(form.route_to || '').trim();
    if (!from || !to) {
      setRouteResolveError('Inserisci Via X e Via Y prima di cercare');
      return;
    }

    setRouteResolving(true);
    setRouteResolveError('');
    try {
      const [fromGeo, toGeo] = await Promise.all([geocodeAddress(from), geocodeAddress(to)]);
      const osrmUrl =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${fromGeo.lng},${fromGeo.lat};${toGeo.lng},${toGeo.lat}` +
        '?overview=full&geometries=geojson&steps=false';
      const routeResponse = await fetch(osrmUrl);
      if (!routeResponse.ok) {
        throw new Error('Servizio routing non disponibile');
      }
      const routePayload = await routeResponse.json();
      const route = Array.isArray(routePayload?.routes) ? routePayload.routes[0] : null;
      if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2) {
        throw new Error('Percorso non trovato tra Via X e Via Y');
      }

      const routePoints = route.geometry.coordinates
        .map((pair) => [Number(pair[1]), Number(pair[0])])
        .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
      const routeDistanceKm = Number(route.distance || 0) / 1000;

      setForm((prev) => ({
        ...prev,
        lat: prev.lat || String(fromGeo.lat),
        lng: prev.lng || String(fromGeo.lng),
        route_name: prev.route_name || `Da ${from} a ${to}`,
        route_from_lat: String(fromGeo.lat),
        route_from_lng: String(fromGeo.lng),
        route_to_lat: String(toGeo.lat),
        route_to_lng: String(toGeo.lng),
        route_distance_km: Number.isFinite(routeDistanceKm) && routeDistanceKm > 0 ? routeDistanceKm.toFixed(1) : prev.route_distance_km,
        route_points: routePoints
      }));
      setRoutePicking(false);
      setManualRouteSelection(false);
      showToast('Percorso tracciato su mappa', 'success');
    } catch (error) {
      const message = error.message || 'Impossibile trovare percorso online';
      setRouteResolveError(message);
      showToast(message, 'error');
    } finally {
      setRouteResolving(false);
    }
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
    setLocationSelectionMessage('Pin centrato. Sto recuperando l’indirizzo...');
    setForm((prev) => ({ ...prev, lat: String(lat), lng: String(lng) }));
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
      setLocationSelectionMessage('Punto d’incontro aggiornato automaticamente.');
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
    setLocationSelectionMessage('Sposta la mappa: il pin resta fisso al centro.');
  }

  function collectValidationErrors() {
    const nextErrors = {};

    if (!form.sport_id) nextErrors.sport_id = 'Seleziona uno sport';
    if (!form.title || form.title.length < 4) nextErrors.title = 'Titolo troppo corto';
    if (!form.city || form.city.length < 2) nextErrors.city = 'Citta richiesta';
    if (!form.location_name || form.location_name.length < 3) nextErrors.location_name = 'Location troppo corta';
    if (!form.event_datetime) nextErrors.event_datetime = 'Data/ora richiesta';
    if (Number(form.duration_minutes) < 15 || Number(form.duration_minutes) > 360) {
      nextErrors.duration_minutes = 'Durata tra 15 e 360 minuti';
    }
    if (
      form.participation_protection &&
      (
        Number(form.minimum_presence_minutes) < 15 ||
        Number(form.minimum_presence_minutes) > Number(form.duration_minutes)
      )
    ) {
      nextErrors.minimum_presence_minutes = 'Il tempo minimo deve essere compreso nella durata evento';
    }
    if (
      Number(form.deposit_cents) < 0 ||
      Number(form.deposit_cents) > 5000 ||
      Number(form.deposit_cents) % 100 !== 0
    ) {
      nextErrors.deposit_cents = 'Deposito tra 0 e 50 EUR, in euro interi';
    }
    if (form.participation_protection && !['qr', 'geo', 'both'].includes(form.verification_mode)) {
      nextErrors.verification_mode = 'Scegli una modalita di verifica';
    }
    if (
      form.participation_protection &&
      form.verification_mode !== 'qr' &&
      (Number(form.geofence_radius_m) < 50 || Number(form.geofence_radius_m) > 1000)
    ) {
      nextErrors.geofence_radius_m = 'Raggio consentito tra 50 e 1000 metri';
    }
    if (Number(form.completion_xp) < 0 || Number(form.completion_xp) > 200) {
      nextErrors.completion_xp = 'PX evento tra 0 e 200';
    }
    if (Number(form.review_bonus_xp) < 0 || Number(form.review_bonus_xp) > 100) {
      nextErrors.review_bonus_xp = 'Bonus recensione tra 0 e 100 PX';
    }
    if (!['mixed', 'male', 'female'].includes(form.audience)) {
      nextErrors.audience = 'Scegli la categoria dell evento';
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
    if (Number(form.max_participants) < (form.is_personal ? 1 : 2)) {
      nextErrors.max_participants = form.is_personal ? 'Partecipanti non validi' : 'Minimo 2 partecipanti';
    }
    if (!form.description || form.description.trim().length < 20) {
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
    if (ADVANCED_RULE_FIELDS.some((field) => nextErrors[field])) {
      setAdvancedSettingsOpen(true);
    }
    if (Object.keys(nextErrors).length) {
      const firstInvalidStep = WIZARD_STEPS.find((step) =>
        STEP_ERROR_FIELDS[step.id].some((field) => nextErrors[field])
      );
      if (firstInvalidStep) setActiveStep(firstInvalidStep.id);
      return false;
    }
    return true;
  }

  function goToNextStep() {
    const nextErrors = collectValidationErrors();
    const fields = STEP_ERROR_FIELDS[activeStep];
    const currentStepErrors = Object.fromEntries(
      Object.entries(nextErrors).filter(([field]) => fields.includes(field))
    );

    setErrors((prev) => {
      const next = { ...prev };
      fields.forEach((field) => delete next[field]);
      return { ...next, ...currentStepErrors };
    });

    if (Object.keys(currentStepErrors).length) {
      showToast('Completa i campi evidenziati prima di continuare', 'error');
      return;
    }
    setActiveStep((step) => Math.min(WIZARD_STEPS.length, step + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToPreviousStep() {
    setActiveStep((step) => Math.max(1, step - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    if (creationStats.created_this_month >= entitlements.maxEventsPerMonth) {
      setPaywallOpen(true);
      return;
    }

    let attachedWorkoutPlan = selectedWorkoutPlan;
    if (attachedWorkoutPlan && !attachedWorkoutPlan.remoteId) {
      try {
        attachedWorkoutPlan = await ensurePersonalWorkoutPlanRemote(attachedWorkoutPlan);
        setSelectedWorkoutPlan(attachedWorkoutPlan);
      } catch (planError) {
        showToast(planError.message || 'Impossibile allegare la scheda', 'error');
        return;
      }
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

    const created = await api.createEvent({
      ...form,
      sport_id: Number(form.sport_id),
      duration_minutes: Number(form.duration_minutes),
      deposit_cents: Number(form.deposit_cents),
      minimum_presence_minutes: Number(form.minimum_presence_minutes),
      verification_mode: form.verification_mode,
      geofence_radius_m: Number(form.geofence_radius_m),
      completion_xp: Number(form.completion_xp),
      review_bonus_xp: Number(form.review_bonus_xp),
      max_participants: Number(form.max_participants),
      audience: form.audience,
      participation_protection: Boolean(form.participation_protection),
      visibility: form.visibility,
      join_policy: form.join_policy,
      is_personal: Boolean(form.is_personal),
      lat: resolvedLat,
      lng: resolvedLng,
      scheda_id: attachedWorkoutPlan?.remoteId || null,
      workout_plan: attachedWorkoutPlan || null,
      route_info: form.has_route
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
        : null
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
    const stats = await api.getEventCreationStats();
    setCreationStats(stats);
    navigate(`/events/${created.id}`);
  }

  async function suggestDescriptionWithAi() {
    if (!aiEnabled || aiLoading) return;
    setAiLoading(true);
    try {
      const context = [form.title, form.sport_id ? `Sport: ${selectedSport?.name || form.sport_id}` : '', form.city, form.location_name]
        .filter(Boolean)
        .join(' · ');
      const result = await ai.generateText({
        purpose: 'event_description',
        prompt: context || 'Sessione sportiva locale',
        maxTokens: 50,
        contextPayload: {
          title: form.title,
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

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.pageEyebrow}>Nuova sessione</span>
          <h1>Crea il tuo evento</h1>
        </div>
        {!Number.isFinite(entitlements.maxEventsPerMonth) ? null : (
          <span className={styles.planBadge}>
            {creationStats.created_this_month}/{entitlements.maxEventsPerMonth} questo mese
          </span>
        )}
      </header>

      <form className={styles.formCard} onSubmit={onSubmit} noValidate>
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
            <span>{WIZARD_STEPS[activeStep - 1].label}</span>
            <h2>{WIZARD_STEPS[activeStep - 1].description}</h2>
          </div>
          <strong>{activeStep}/{WIZARD_STEPS.length}</strong>
        </div>

        {activeStep === 1 ? (
          <fieldset className={styles.wizardStep} aria-label="Informazioni base">

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Nome evento</span>
              <input
                className={invalidClass('title')}
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Es. Allenamento serale al parco"
                maxLength="100"
              />
              {errors.title && <span className="error">{errors.title}</span>}
            </label>

            <div className={styles.choiceSection}>
              <div className={styles.sectionLabelRow}>
                <span>Che sport?</span>
                <small>{selectedSport ? selectedSport.name : 'Seleziona uno'}</small>
              </div>
              <div className={styles.sportGrid} role="group" aria-label="Scegli lo sport">
                {sports.map((sport) => {
                  const visual = getSportVisual(sport);
                  const selected = String(form.sport_id) === String(sport.id);
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      className={`${styles.sportCard} ${selected ? styles.sportCardSelected : ''}`}
                      aria-pressed={selected}
                      onClick={() => onSportChange(sport.id)}
                    >
                      <span className={styles.sportEmoji} aria-hidden="true">{visual.emoji}</span>
                      <strong>{sport.name}</strong>
                      <small>{visual.subtitle}</small>
                      {selected ? <span className={styles.sportCheck}><Check size={17} /></span> : null}
                    </button>
                  );
                })}
              </div>
              {errors.sport_id && <span className="error">{errors.sport_id}</span>}
            </div>

            <div className={styles.choiceSection}>
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
            </div>

            <div className={styles.dateTimeGrid}>
              <label className={`${styles.infoControl} ${errors.event_datetime ? styles.invalidCard : ''}`}>
                <span><CalendarDays size={18} />Data</span>
                <input
                  type="date"
                  value={eventDate}
                  onInput={(e) => {
                    setEventDate(e.target.value);
                  }}
                />
              </label>
              <label className={`${styles.infoControl} ${errors.event_datetime ? styles.invalidCard : ''}`}>
                <span><Clock3 size={18} />Ora</span>
                <input
                  type="time"
                  value={eventTime}
                  onInput={(e) => {
                    setEventTime(e.target.value);
                  }}
                />
              </label>
            </div>
            {errors.event_datetime && <span className="error">{errors.event_datetime}</span>}

            <div className={styles.controlGrid}>
              <div className={`${styles.controlCard} ${errors.duration_minutes ? styles.invalidCard : ''}`}>
                <span className={styles.controlTitle}><Clock3 size={18} />Durata</span>
                <div className={styles.presetRow}>
                  {DURATION_PRESETS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className={Number(form.duration_minutes) === minutes ? styles.presetSelected : ''}
                      onClick={() => setField('duration_minutes', minutes)}
                    >
                      {minutes}′
                    </button>
                  ))}
                </div>
                <label className={styles.compactNumber}>
                  Altro
                  <input
                    type="number"
                    min="15"
                    max="360"
                    step="15"
                    value={form.duration_minutes}
                    onChange={(e) => setField('duration_minutes', e.target.value)}
                    aria-label="Durata personalizzata in minuti"
                  />
                </label>
                {errors.duration_minutes && <span className="error">{errors.duration_minutes}</span>}
              </div>

              <div className={`${styles.controlCard} ${errors.max_participants ? styles.invalidCard : ''}`}>
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
                      <Icon size={24} aria-hidden="true" />
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
          </fieldset>
        ) : null}

        {activeStep === 2 ? (
          <fieldset className={styles.wizardStep} aria-label="Luogo e percorso">

            <div className={styles.sectionHero}>
              <span><MapPin size={22} /></span>
              <div>
                <strong>Dove vi allenate?</strong>
                <small>Inserisci luogo e città: penseremo noi alle coordinate.</small>
              </div>
            </div>

            <div className={styles.inlineGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Città</span>
                <input
                  className={invalidClass('city')}
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                  placeholder="Es. Milano"
                />
                {errors.city && <span className="error">{errors.city}</span>}
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nome location</span>
                <input
                  className={invalidClass('location_name')}
                  value={form.location_name}
                  onChange={(e) => setField('location_name', e.target.value)}
                  placeholder="Es. Parco di Porta Romana"
                />
                {errors.location_name && <span className="error">{errors.location_name}</span>}
              </label>
            </div>

            {!(form.has_route && (routePicking || routePoints.length)) ? (
              <div className={`${styles.locationPicker} ${styles.locationPickerActive}`}>
                <div className={styles.locationMapHead}>
                  <span>
                    <MapPinned size={17} aria-hidden="true" />
                    Punto d’incontro
                  </span>
                  <small className={styles.locationGpsStatus}>
                    <i className={userLocationCoords ? styles.locationGpsActive : ''} />
                    {locationRequesting
                      ? 'Cerco la tua area'
                      : userLocationCoords
                        ? 'GPS attivo'
                        : locationPermission === 'denied'
                          ? 'GPS non autorizzato'
                          : 'GPS in attesa'}
                  </small>
                </div>
                <div className={`${styles.routeMapWrap} ${styles.locationMapWrap}`}>
                  <MapContainer
                    key={`location-map-${locationMapRevision}`}
                    center={locationMapCenter}
                    zoom={locationMapZoom}
                    className={styles.routeMap}
                    dragging
                    scrollWheelZoom={false}
                    touchZoom
                    doubleClickZoom
                  >
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationRadiusPreview radius={geofenceRadius} />
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
                    <LocationMapCenterHandler
                      onMoveStart={handleLocationMapMoveStart}
                      onSelect={(coords) => resolveSelectedCoordinates(coords, { source: 'map' })}
                    />
                  </MapContainer>
                  <div className={styles.locationCenterPin} aria-hidden="true">
                    <span><MapPin size={27} strokeWidth={3} /></span>
                    <i />
                  </div>
                  <div className={styles.locationRadiusBadge} aria-label={`Raggio area evento ${geofenceRadius} metri`}>
                    <i />
                    Raggio {geofenceRadius} m
                  </div>
                  {locationResolving ? <div className={styles.locationMapLoading}>Recupero indirizzo…</div> : null}
                </div>
                <div className={styles.locationResultCard}>
                  <span><MapPin size={20} aria-hidden="true" /></span>
                  <div>
                    <strong>{form.location_name || 'Sposta la mappa per scegliere il punto'}</strong>
                    <small>
                      {form.city || (locationPreview ? `${locationPreview.lat.toFixed(5)}, ${locationPreview.lng.toFixed(5)}` : 'Via e città si compileranno automaticamente')}
                    </small>
                  </div>
                  <b>PIN CENTRALE</b>
                </div>
                <p className={styles.locationSelectionMessage} role="status">
                  {locationSelectionMessage || userLocationError || 'Sposta la mappa: il pin resta fisso e il cerchio mostra l’area di verifica.'}
                </p>
              </div>
            ) : null}

            <details className={styles.advancedDetails}>
              <summary>Coordinate avanzate</summary>
              <div className={styles.inlineGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Latitudine</span>
                  <input
                    type="number"
                    step="any"
                    className={invalidClass('coordinates')}
                    value={form.lat}
                    onChange={(e) => setField('lat', e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Longitudine</span>
                  <input
                    type="number"
                    step="any"
                    className={invalidClass('coordinates')}
                    value={form.lng}
                    onChange={(e) => setField('lng', e.target.value)}
                  />
                </label>
              </div>
              <span className="input-helper">Compilate automaticamente dalla ricerca del luogo.</span>
            </details>
            {errors.coordinates && <span className={`error ${styles.coordError}`}>{errors.coordinates}</span>}

            <label className={`${styles.routeSwitch} ${form.has_route ? styles.routeSwitchActive : ''}`}>
              <input
                type="checkbox"
                checked={Boolean(form.has_route)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setField('has_route', checked);
                  if (!checked) setRoutePicking(false);
                }}
              />
              <span><Route size={22} /></span>
              <div>
                <strong>Questo evento ha un percorso</strong>
                <small>
                  {selectedSportHasRoute
                    ? 'Consigliato per questo sport: aggiungi partenza e arrivo.'
                    : 'Attivalo per itinerari, giri o sentieri.'}
                </small>
              </div>
              <b>{form.has_route ? 'Sì' : 'No'}</b>
            </label>

            {form.has_route ? (
              <div className={styles.routeFields}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Nome percorso</span>
                  <input
                    className={invalidClass('route_name')}
                    value={form.route_name}
                    onChange={(e) => setField('route_name', e.target.value)}
                    placeholder="Es. Anello Parco Nord"
                  />
                  {errors.route_name && <span className="error">{errors.route_name}</span>}
                </label>

                <div className={styles.inlineGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Partenza</span>
                    <input
                      className={invalidClass('route_from')}
                      value={form.route_from}
                      onChange={(e) => setField('route_from', e.target.value)}
                      placeholder="Via o punto di partenza"
                    />
                    {errors.route_from && <span className="error">{errors.route_from}</span>}
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Arrivo</span>
                    <input
                      className={invalidClass('route_to')}
                      value={form.route_to}
                      onChange={(e) => setField('route_to', e.target.value)}
                      placeholder="Via o punto di arrivo"
                    />
                    {errors.route_to && <span className="error">{errors.route_to}</span>}
                  </label>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={Route}
                  disabled={routeResolving}
                  onClick={resolveRouteOnline}
                  fullWidth
                >
                  {routeResolving ? 'Tracciamento...' : 'Cerca e traccia percorso'}
                </Button>
                {routeResolveError ? <span className={`error ${styles.coordError}`}>{routeResolveError}</span> : null}

                <section className={`${styles.routePicker} ${routePicking ? styles.routePickerActive : ''}`}>
                  <div className={styles.routePickerHead}>
                    <div>
                      <span className={styles.routePickerEyebrow}>Percorso personalizzato</span>
                      <strong>Seleziona i punti sulla mappa</strong>
                      <small>
                        {routePicking
                          ? 'Tocca la mappa: il primo punto è la partenza, l’ultimo è l’arrivo.'
                          : manualRouteSelection && routePoints.length
                            ? `${routePoints.length} punti selezionati · ${form.route_distance_km || '0'} km`
                            : 'In alternativa alla ricerca, disegna liberamente il tuo itinerario.'}
                      </small>
                    </div>
                    <button
                      type="button"
                      className={`${styles.routePickerButton} ${routePicking ? styles.routePickerButtonActive : ''}`}
                      aria-pressed={routePicking}
                      onClick={startRoutePointSelection}
                    >
                      {routePicking ? <Check size={19} /> : <MapPinned size={19} />}
                      {routePicking ? 'Concludi' : 'Seleziona punti'}
                    </button>
                  </div>

                  {routePicking || routePoints.length ? (
                    <>
                      <div className={`${styles.routeMapWrap} ${routePicking ? styles.routeMapPicking : ''}`}>
                        <MapContainer
                          key={`route-${manualRouteSelection ? 'manual' : 'automatic'}-${routeMapCenter.join(':')}`}
                          center={routeMapCenter}
                          zoom={routePoints.length || locationPreview ? 13 : 6}
                          className={styles.routeMap}
                          scrollWheelZoom={false}
                          doubleClickZoom={!routePicking}
                        >
                          <TileLayer
                            attribution='&copy; OpenStreetMap contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />
                          <RouteMapTapHandler active={routePicking} onAddPoint={addRoutePoint} />
                          {routePoints.length >= 2 ? (
                            <Polyline
                              positions={routePoints}
                              pathOptions={{ color: '#a8f000', weight: 5, opacity: 0.9 }}
                            />
                          ) : null}

                          {manualRouteSelection
                            ? routePoints.map((point, index) => {
                                const isFirst = index === 0;
                                const isLast = index === routePoints.length - 1;
                                const label = routePoints.length === 1
                                  ? 'Punto 1'
                                  : isFirst
                                    ? 'Partenza'
                                    : isLast
                                      ? 'Arrivo'
                                      : `Tappa ${index}`;
                                return (
                                  <CircleMarker
                                    key={`${point[0]}:${point[1]}:${index}`}
                                    center={point}
                                    radius={isFirst || isLast ? 9 : 7}
                                    className={styles.routePingMarker}
                                    pathOptions={{
                                      color: '#111511',
                                      fillColor: '#a8f000',
                                      fillOpacity: 1,
                                      weight: 4
                                    }}
                                  >
                                    <Popup>{label}</Popup>
                                  </CircleMarker>
                                );
                              })
                            : routePoints.length >= 2
                              ? (
                                  <>
                                    <Marker position={routePoints[0]}>
                                      <Popup>Partenza: {form.route_from}</Popup>
                                    </Marker>
                                    <Marker position={routePoints[routePoints.length - 1]}>
                                      <Popup>Arrivo: {form.route_to}</Popup>
                                    </Marker>
                                  </>
                                )
                              : null}
                        </MapContainer>
                      </div>

                      {manualRouteSelection ? (
                        <div className={styles.routePointMeta}>
                          <span>
                            <MapPin size={16} />
                            <b>{routePoints.length}/30</b> punti
                          </span>
                          <div className={styles.routePointActions}>
                            <button type="button" disabled={!routePoints.length} onClick={undoLastRoutePoint}>
                              <Undo2 size={17} />
                              Annulla ultimo
                            </button>
                            <button
                              type="button"
                              className={styles.routePointDanger}
                              disabled={!routePoints.length}
                              onClick={clearRoutePoints}
                            >
                              <Trash2 size={17} />
                              Cancella
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </section>

                <div className={styles.inlineGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Distanza (km)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      className={invalidClass('route_distance_km')}
                      value={form.route_distance_km}
                      onChange={(e) => setField('route_distance_km', e.target.value)}
                    />
                    {errors.route_distance_km && <span className="error">{errors.route_distance_km}</span>}
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Dislivello (m)</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className={invalidClass('route_elevation_gain_m')}
                      value={form.route_elevation_gain_m}
                      onChange={(e) => setField('route_elevation_gain_m', e.target.value)}
                      placeholder="Opzionale"
                    />
                    {errors.route_elevation_gain_m && <span className="error">{errors.route_elevation_gain_m}</span>}
                  </label>
                </div>

                <details className={styles.advancedDetails}>
                  <summary>Link mappa opzionale</summary>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>URL percorso</span>
                    <input
                      className={invalidClass('route_map_url')}
                      value={form.route_map_url}
                      onChange={(e) => setField('route_map_url', e.target.value)}
                      placeholder="https://..."
                    />
                    {errors.route_map_url && <span className="error">{errors.route_map_url}</span>}
                  </label>
                </details>
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {activeStep === 3 ? (
          <fieldset className={styles.wizardStep} aria-label="Regole e pubblicazione">

            <div className={styles.primarySettingsCard}>
              <label
                className={`${styles.settingRow} ${styles.settingRowCompact} ${form.participation_protection ? styles.settingRowActive : ''}`}
              >
                <span className={styles.settingIcon}><ShieldCheck size={22} /></span>
                <span className={styles.settingCopy}>
                  <strong>Proteggi la partecipazione</strong>
                  <small>Attiva deposito, presenza minima e verifica QR/GPS per una partecipazione affidabile.</small>
                </span>
                <input
                  type="checkbox"
                  checked={form.participation_protection}
                  disabled={form.is_personal}
                  onChange={(event) => toggleParticipationProtection(event.target.checked)}
                />
                <span className={styles.switchTrack} aria-hidden="true"><i /></span>
              </label>

              <label
                className={`${styles.settingRow} ${styles.settingRowCompact} ${form.is_personal ? styles.settingRowActive : ''}`}
              >
                <span className={styles.settingIcon}><UserRoundCheck size={22} /></span>
                <span className={styles.settingCopy}>
                  <strong>Evento personale</strong>
                  <small>Attiva per tracciare un allenamento personale visibile solo a te.</small>
                </span>
                <input
                  type="checkbox"
                  checked={form.is_personal}
                  onChange={(event) => togglePersonalEvent(event.target.checked)}
                />
                <span className={styles.switchTrack} aria-hidden="true"><i /></span>
              </label>
            </div>

            {form.is_personal ? (
              <div className={styles.personalNotice}>
                <UserRoundCheck size={24} aria-hidden="true" />
                <div>
                  <strong>Solo tu</strong>
                  <span>Deposito, partecipanti, approvazioni e QR vengono disattivati automaticamente.</span>
                </div>
              </div>
            ) : null}

            <div className={`${styles.choiceSection} ${styles.optionCard}`}>
              <div className={styles.sectionLabelRow}><span>Visibilita</span></div>
              <div className={styles.segmentedControl} role="group" aria-label="Visibilita evento">
                <button
                  type="button"
                  className={form.visibility === 'public' ? styles.segmentSelected : ''}
                  aria-pressed={form.visibility === 'public'}
                  disabled={form.is_personal}
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
                  {form.is_personal
                    ? 'Promemoria privato: compare solo nella tua sezione I miei eventi.'
                    : form.visibility === 'private'
                      ? 'Solo su invito con link. Non compare nella mappa o nelle liste pubbliche.'
                      : `Visibile a tutti${form.city ? ` a ${form.city}` : ''}. Chiunque puo trovare l evento.`}
                </span>
              </div>
              {errors.visibility && <span className="error">{errors.visibility}</span>}
            </div>

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
                    ? 'L organizer approva ogni richiesta prima del blocco del deposito.'
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

            {!form.is_personal && form.participation_protection ? (
              <details
                className={styles.advancedRuleDetails}
                open={advancedSettingsOpen}
                onToggle={(event) => setAdvancedSettingsOpen(event.currentTarget.open)}
              >
                <summary>
                  <span>Impostazioni avanzate</span>
                  <ChevronDown size={22} aria-hidden="true" />
                </summary>
                <div className={styles.advancedRuleBody}>
                  <div className={styles.ruleCardGrid}>
                    <div className={`${styles.ruleCard} ${errors.deposit_cents ? styles.invalidCard : ''}`}>
                      <span className={styles.controlTitle}><WalletCards size={18} />Deposito</span>
                      <div className={styles.presetRow}>
                        {DEPOSIT_PRESETS.map((cents) => (
                          <button
                            key={cents}
                            type="button"
                            className={Number(form.deposit_cents) === cents ? styles.presetSelected : ''}
                            onClick={() => setField('deposit_cents', cents)}
                          >
                            {cents === 0 ? 'No' : `${cents / 100} €`}
                          </button>
                        ))}
                      </div>
                      <label className={styles.compactNumber}>
                        Altro importo (€)
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="1"
                          value={Number(form.deposit_cents || 0) / 100}
                          onChange={(event) => setField('deposit_cents', Math.round(Number(event.target.value || 0) * 100))}
                        />
                      </label>
                      <small>Bloccato all’iscrizione e restituito al completamento.</small>
                      {errors.deposit_cents && <span className="error">{errors.deposit_cents}</span>}
                    </div>

                    <div className={`${styles.ruleCard} ${errors.minimum_presence_minutes ? styles.invalidCard : ''}`}>
                      <span className={styles.controlTitle}><Clock3 size={18} />Presenza minima</span>
                      <div className={styles.presetRow}>
                        {PRESENCE_PRESETS.map((minutes) => (
                          <button
                            key={minutes}
                            type="button"
                            className={Number(form.minimum_presence_minutes) === minutes ? styles.presetSelected : ''}
                            onClick={() => setField('minimum_presence_minutes', minutes)}
                          >
                            {minutes}′
                          </button>
                        ))}
                      </div>
                      <label className={styles.compactNumber}>
                        Minuti personalizzati
                        <input
                          type="number"
                          min="15"
                          max={form.duration_minutes || 360}
                          step="5"
                          value={form.minimum_presence_minutes}
                          onChange={(event) => setField('minimum_presence_minutes', event.target.value)}
                        />
                      </label>
                      <small>Al raggiungimento il cashback passa al 100%.</small>
                      {errors.minimum_presence_minutes && <span className="error">{errors.minimum_presence_minutes}</span>}
                    </div>
                  </div>

                  <div className={styles.choiceSection}>
                    <div className={styles.sectionLabelRow}><span>Metodo di verifica</span></div>
                    <div className={styles.verificationGrid} role="group" aria-label="Metodo di verifica">
                      {[
                        { value: 'both', title: 'QR + GPS', copy: 'Più sicuro', icon: '◎' },
                        { value: 'qr', title: 'Solo QR', copy: 'Più rapido', icon: '▦' },
                        { value: 'geo', title: 'Solo GPS', copy: 'Automatico', icon: '⌖' }
                      ].map((mode) => (
                        <button
                          key={mode.value}
                          type="button"
                          className={form.verification_mode === mode.value ? styles.verificationSelected : ''}
                          aria-pressed={form.verification_mode === mode.value}
                          onClick={() => setField('verification_mode', mode.value)}
                        >
                          <span aria-hidden="true">{mode.icon}</span>
                          <strong>{mode.title}</strong>
                          <small>{mode.copy}</small>
                        </button>
                      ))}
                    </div>
                    {errors.verification_mode && <span className="error">{errors.verification_mode}</span>}
                  </div>

                  {form.verification_mode !== 'qr' ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Raggio area evento (metri)</span>
                      <input
                        type="number"
                        min="50"
                        max="1000"
                        step="25"
                        className={invalidClass('geofence_radius_m')}
                        value={form.geofence_radius_m}
                        onChange={(event) => setField('geofence_radius_m', event.target.value)}
                      />
                      <span className="input-helper">Organizer e partecipanti devono rimanere dentro quest’area.</span>
                      {errors.geofence_radius_m && <span className="error">{errors.geofence_radius_m}</span>}
                    </label>
                  ) : null}

                  <div className={styles.inlineGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>PX completamento</span>
                      <input
                        type="number"
                        min="0"
                        max="200"
                        step="5"
                        className={invalidClass('completion_xp')}
                        value={form.completion_xp}
                        onChange={(event) => setField('completion_xp', event.target.value)}
                      />
                      {errors.completion_xp && <span className="error">{errors.completion_xp}</span>}
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Bonus questionario (PX)</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        className={invalidClass('review_bonus_xp')}
                        value={form.review_bonus_xp}
                        onChange={(event) => setField('review_bonus_xp', event.target.value)}
                      />
                      {errors.review_bonus_xp && <span className="error">{errors.review_bonus_xp}</span>}
                    </label>
                  </div>
                </div>
              </details>
            ) : !form.is_personal ? (
              <div className={styles.protectionOffNotice}>
                <ShieldCheck size={22} aria-hidden="true" />
                <span>Partecipazione semplice: nessun deposito e check-in rapido tramite QR.</span>
              </div>
            ) : null}

            <label className={`${styles.field} ${styles.descriptionCard}`}>
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
            </label>

            <section className={`${styles.workoutAttachmentCard} ${selectedWorkoutPlan ? styles.workoutAttachmentSelected : ''}`}>
              <div className={styles.workoutAttachmentHeading}>
                <span className={styles.workoutAttachmentIcon}><Dumbbell size={23} aria-hidden="true" /></span>
                <div>
                  <span className={styles.fieldLabel}>Allega scheda</span>
                  <small>Condividi una delle tue Schede personali con i partecipanti.</small>
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
            </section>

            <div className={styles.summaryCard}>
              <span>{getSportVisual(selectedSport).emoji}</span>
              <div>
                <strong>{form.title || 'Il tuo evento'}</strong>
                <small>
                  {[selectedSport?.name, form.city, eventDate && eventTime ? `${eventDate} · ${eventTime}` : 'Data da scegliere']
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
            </div>
          </fieldset>
        ) : null}

        <footer className={`${styles.wizardFooter} ${activeStep === 1 ? styles.wizardFooterSingle : ''}`}>
          {activeStep > 1 ? (
            <button type="button" className={styles.backButton} onClick={goToPreviousStep}>
              <ChevronLeft size={21} />Indietro
            </button>
          ) : null}
          {activeStep < WIZARD_STEPS.length ? (
            <button type="button" className={styles.nextButton} onClick={goToNextStep}>
              Avanti <ChevronRight size={23} />
            </button>
          ) : (
            <button type="submit" className={styles.nextButton}>
              {form.is_personal
                ? 'Crea promemoria'
                : form.visibility === 'private'
                  ? 'Crea evento privato'
                  : 'Pubblica evento'}{' '}
              <Check size={23} />
            </button>
          )}
        </footer>
      </form>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature={`Limite creazione eventi (${entitlements.maxEventsPerMonth}/mese)`}
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

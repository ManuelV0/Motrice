import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards
} from 'lucide-react';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import { api } from '../services/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import { useBilling } from '../context/BillingContext';
import { useUserLocation } from '../hooks/useUserLocation';
import PaywallModal from '../components/PaywallModal';
import Button from '../components/Button';
import ExploreMapToggle from '../components/explore/ExploreMapToggle';
import { ensureLeafletIcons } from '../features/coach/utils/leafletIconFix';
import { markStepByAction } from '../services/tutorialMode';
import { ai, getAiSettings } from '../services/ai';
import { geocodeAddress, geocodeEventLocation } from '../services/geocoding';
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
  location_name: '',
  lat: '',
  lng: '',
  description: '',
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
  { id: 3, label: 'Regole', description: 'Deposito, verifica e dettagli' }
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

const SPORT_VISUALS = {
  running: { emoji: '🏃', subtitle: 'Gruppi corsa' },
  padel: { emoji: '🎾', subtitle: 'Doppio · Singolo' },
  calcio: { emoji: '⚽', subtitle: '5vs5 · 11vs11' },
  palestra: { emoji: '🏋️', subtitle: 'Forza · Fitness' },
  bici: { emoji: '🚴', subtitle: 'Strada · Gravel' },
  trekking: { emoji: '🥾', subtitle: 'Sentieri · Gruppi' }
};

const STEP_ERROR_FIELDS = {
  1: ['title', 'sport_id', 'event_datetime', 'duration_minutes', 'max_participants'],
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
    'description'
  ]
};

function getSportVisual(sport) {
  const key = String(sport?.slug || sport?.name || '').trim().toLowerCase();
  return SPORT_VISUALS[key] || { emoji: '🏅', subtitle: 'Allenamento di gruppo' };
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
  const [locationResolving, setLocationResolving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const { requesting, requestLocation } = useUserLocation();
  const aiEnabled = getAiSettings().enableLocalAI;

  usePageMeta({
    title: 'Crea Sessione | Motrice',
    description: 'Pubblica una nuova sessione sportiva e connetti atleti nella tua area.'
  });

  useEffect(() => {
    api.listSports().then(setSports);
    api.getEventCreationStats().then(setCreationStats);
  }, []);

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

  function updateEventDateTime(nextDate, nextTime) {
    setField('event_datetime', nextDate && nextTime ? `${nextDate}T${nextTime}` : '');
  }

  function changeParticipantCount(delta) {
    const current = Number(form.max_participants || 2);
    setField('max_participants', Math.min(500, Math.max(2, current + delta)));
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
    try {
      const result = await geocodeEventLocation(form);
      setForm((prev) => ({ ...prev, lat: String(result.lat), lng: String(result.lng) }));
      setErrors((prev) => ({ ...prev, coordinates: undefined }));
      if (!silent) showToast('Luogo trovato e collegato alla mappa', 'success');
      return result;
    } catch (error) {
      const message = error.message || 'Impossibile trovare il luogo sulla mappa';
      setErrors((prev) => ({ ...prev, coordinates: message }));
      if (!silent) showToast(message, 'error');
      return null;
    } finally {
      setLocationResolving(false);
    }
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
      Number(form.minimum_presence_minutes) < 15 ||
      Number(form.minimum_presence_minutes) > Number(form.duration_minutes)
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
    if (!['qr', 'geo', 'both'].includes(form.verification_mode)) {
      nextErrors.verification_mode = 'Scegli una modalita di verifica';
    }
    if (
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
    if (Number(form.max_participants) < 2) nextErrors.max_participants = 'Minimo 2 partecipanti';
    if (!form.description || form.description.length < 12) nextErrors.description = 'Descrizione troppo breve';

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
      lat: resolvedLat,
      lng: resolvedLng,
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

    showToast('Evento creato con successo', 'success');
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
      <div className={styles.topToggle}>
        <ExploreMapToggle
          activeView="right"
          leftLabel="Esplora"
          rightLabel="Crea (evento)"
          thirdLabel="Agenda"
          leftTo="/explore"
          rightTo="/create"
          thirdTo="/agenda"
        />
      </div>

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
          <fieldset className={styles.wizardStep}>
            <legend className="sr-only">Informazioni base</legend>

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
                  onChange={(e) => {
                    setEventDate(e.target.value);
                    updateEventDateTime(e.target.value, eventTime);
                  }}
                />
              </label>
              <label className={`${styles.infoControl} ${errors.event_datetime ? styles.invalidCard : ''}`}>
                <span><Clock3 size={18} />Ora</span>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => {
                    setEventTime(e.target.value);
                    updateEventDateTime(eventDate, e.target.value);
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
                    min="2"
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
          </fieldset>
        ) : null}

        {activeStep === 2 ? (
          <fieldset className={styles.wizardStep}>
            <legend className="sr-only">Luogo e percorso</legend>

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

            <div className={styles.locationActions}>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={Navigation}
                disabled={locationResolving}
                onClick={() => resolveLocationOnline()}
              >
                {locationResolving ? 'Ricerca luogo...' : 'Trova sulla mappa'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={Navigation}
                disabled={requesting}
                onClick={async () => {
                  const coords = await requestLocation();
                  if (!coords) {
                    showToast('Impossibile ottenere la posizione. Controlla i permessi browser.', 'error');
                    return;
                  }
                  setField('lat', String(coords.lat));
                  setField('lng', String(coords.lng));
                  showToast('Coordinate compilate automaticamente', 'success');
                }}
              >
                {requesting ? 'Rilevazione...' : 'Usa la mia posizione'}
              </Button>
            </div>

            {locationPreview ? (
              <div className={styles.routeMapWrap}>
                <MapContainer
                  key={`${locationPreview.lat}:${locationPreview.lng}`}
                  center={[locationPreview.lat, locationPreview.lng]}
                  zoom={15}
                  className={styles.routeMap}
                  dragging={false}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[locationPreview.lat, locationPreview.lng]}>
                    <Popup>{form.location_name || 'Location evento'}</Popup>
                  </Marker>
                </MapContainer>
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
                onChange={(e) => setField('has_route', e.target.checked)}
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

                {Array.isArray(form.route_points) && form.route_points.length >= 2 ? (
                  <div className={styles.routeMapWrap}>
                    <MapContainer center={form.route_points[0]} zoom={12} className={styles.routeMap}>
                      <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Polyline positions={form.route_points} />
                      <Marker position={form.route_points[0]}><Popup>Partenza: {form.route_from}</Popup></Marker>
                      <Marker position={form.route_points[form.route_points.length - 1]}><Popup>Arrivo: {form.route_to}</Popup></Marker>
                    </MapContainer>
                  </div>
                ) : null}

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
          <fieldset className={styles.wizardStep}>
            <legend className="sr-only">Regole e pubblicazione</legend>

            <div className={styles.sectionHero}>
              <span><ShieldCheck size={22} /></span>
              <div>
                <strong>Proteggi la partecipazione</strong>
                <small>Definisci deposito, presenza minima e metodo di verifica.</small>
              </div>
            </div>

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
                    onChange={(e) => setField('deposit_cents', Math.round(Number(e.target.value || 0) * 100))}
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
                    onChange={(e) => setField('minimum_presence_minutes', e.target.value)}
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
                  onChange={(e) => setField('geofence_radius_m', e.target.value)}
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
                  onChange={(e) => setField('completion_xp', e.target.value)}
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
                  onChange={(e) => setField('review_bonus_xp', e.target.value)}
                />
                {errors.review_bonus_xp && <span className="error">{errors.review_bonus_xp}</span>}
              </label>
            </div>

            <label className={styles.field}>
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
              {!aiEnabled ? <span className="input-helper">Attiva AI Locale (Beta) dalla sezione Account.</span> : null}
              {errors.description && <span className="error">{errors.description}</span>}
            </label>

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
              Pubblica evento <Check size={23} />
            </button>
          )}
        </footer>
      </form>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature={`Limite creazione eventi (${entitlements.maxEventsPerMonth}/mese)`}
      />
    </section>
  );
}

export default CreateEventPage;

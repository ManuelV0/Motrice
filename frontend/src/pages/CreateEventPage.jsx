import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation, Sparkles } from 'lucide-react';
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
import styles from '../styles/pages/createEvent.module.css';

const initialState = {
  title: '',
  city: '',
  sport_id: '',
  level: 'beginner',
  event_datetime: '',
  duration_minutes: 120,
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
  const [aiLoading, setAiLoading] = useState(false);
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

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
  }

  function invalidClass(name) {
    return errors[name] ? styles.invalid : '';
  }

  async function geocodeAddress(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Servizio geocoding non disponibile');
    }
    const items = await response.json();
    const first = Array.isArray(items) ? items[0] : null;
    if (!first) {
      throw new Error(`Via non trovata: ${query}`);
    }
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`Coordinate non valide per: ${query}`);
    }
    return { lat, lng, label: String(first.display_name || query) };
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

  function validate() {
    const nextErrors = {};

    if (!form.sport_id) nextErrors.sport_id = 'Seleziona uno sport';
    if (!form.title || form.title.length < 4) nextErrors.title = 'Titolo troppo corto';
    if (!form.city || form.city.length < 2) nextErrors.city = 'Citta richiesta';
    if (!form.location_name || form.location_name.length < 3) nextErrors.location_name = 'Location troppo corta';
    if (!form.event_datetime) nextErrors.event_datetime = 'Data/ora richiesta';
    if (Number(form.duration_minutes) < 15 || Number(form.duration_minutes) > 360) {
      nextErrors.duration_minutes = 'Durata tra 15 e 360 minuti';
    }
    if (Number(form.max_participants) < 2) nextErrors.max_participants = 'Minimo 2 partecipanti';
    if (!form.description || form.description.length < 12) nextErrors.description = 'Descrizione troppo breve';

    if ((form.lat && !form.lng) || (!form.lat && form.lng)) {
      nextErrors.coordinates = 'Inserisci entrambe le coordinate o nessuna';
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

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    if (creationStats.created_this_month >= entitlements.maxEventsPerMonth) {
      setPaywallOpen(true);
      return;
    }

    const created = await api.createEvent({
      ...form,
      sport_id: Number(form.sport_id),
      duration_minutes: Number(form.duration_minutes),
      max_participants: Number(form.max_participants),
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
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
      <ExploreMapToggle
        activeView="right"
        leftLabel="Esplora"
        rightLabel="Crea (evento)"
        thirdLabel="Agenda"
        leftTo="/explore"
        rightTo="/create"
        thirdTo="/agenda"
      />
      <h1>Crea sessione</h1>
      {!Number.isFinite(entitlements.maxEventsPerMonth) ? null : (
        <p className={styles.meta}>
          Piano Free: {creationStats.created_this_month}/{entitlements.maxEventsPerMonth} eventi creati questo mese.
        </p>
      )}

      <form className={`card ${styles.formCard}`} onSubmit={onSubmit} noValidate>
        <fieldset className={styles.fieldset}>
          <legend>Dettagli sessione</legend>

          <label className={styles.field}>
            Titolo sessione
            <input
              className={invalidClass('title')}
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
            />
            <span className="input-helper">Es. Running collettivo serale</span>
            {errors.title && <span className="error">{errors.title}</span>}
          </label>

          <label className={styles.field}>
            Sport
            <select
              className={invalidClass('sport_id')}
              value={form.sport_id}
              onChange={(e) => onSportChange(e.target.value)}
            >
              <option value="">Seleziona</option>
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.name}
                </option>
              ))}
            </select>
            {errors.sport_id && <span className="error">{errors.sport_id}</span>}
          </label>

          <label className={styles.field}>
            Livello richiesto
            <select value={form.level} onChange={(e) => setField('level', e.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Percorso</legend>

          <label className={styles.field}>
            <span className={styles.routeToggleRow}>
              <input
                type="checkbox"
                checked={Boolean(form.has_route)}
                onChange={(e) => setField('has_route', e.target.checked)}
              />
              <span>Questo evento ha un percorso di viaggio</span>
            </span>
            <span className="input-helper">
              {selectedSportHasRoute
                ? 'Sport con percorso rilevato: aggiungi dettagli rotta per Esplora e scheda informazioni.'
                : 'Attiva solo se la sessione prevede un itinerario (strada/sentiero/giro).'}
            </span>
          </label>

          {form.has_route ? (
            <>
              <label className={styles.field}>
                Nome percorso
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
                  Via di partenza (X)
                  <input
                    className={invalidClass('route_from')}
                    value={form.route_from}
                    onChange={(e) => setField('route_from', e.target.value)}
                    placeholder="Es. Via X"
                  />
                  {errors.route_from && <span className="error">{errors.route_from}</span>}
                </label>
                <label className={styles.field}>
                  Via di arrivo (Y)
                  <input
                    className={invalidClass('route_to')}
                    value={form.route_to}
                    onChange={(e) => setField('route_to', e.target.value)}
                    placeholder="Es. Via Y"
                  />
                  {errors.route_to && <span className="error">{errors.route_to}</span>}
                </label>
              </div>

              <div className={styles.locationActions}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={routeResolving}
                  onClick={resolveRouteOnline}
                >
                  {routeResolving ? 'Ricerca percorso online...' : 'Cerca via online e traccia su mappa'}
                </Button>
              </div>
              {routeResolveError ? <span className={`error ${styles.coordError}`}>{routeResolveError}</span> : null}

              {Array.isArray(form.route_points) && form.route_points.length >= 2 ? (
                <div className={styles.routeMapWrap}>
                  <MapContainer
                    center={form.route_points[0]}
                    zoom={12}
                    className={styles.routeMap}
                  >
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Polyline positions={form.route_points} />
                    <Marker position={form.route_points[0]}>
                      <Popup>Partenza: {form.route_from || 'Via X'}</Popup>
                    </Marker>
                    <Marker position={form.route_points[form.route_points.length - 1]}>
                      <Popup>Arrivo: {form.route_to || 'Via Y'}</Popup>
                    </Marker>
                  </MapContainer>
                </div>
              ) : null}

              <div className={styles.inlineGrid}>
                <label className={styles.field}>
                  Distanza percorso (km)
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
                  Dislivello positivo (m, opzionale)
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className={invalidClass('route_elevation_gain_m')}
                    value={form.route_elevation_gain_m}
                    onChange={(e) => setField('route_elevation_gain_m', e.target.value)}
                  />
                  {errors.route_elevation_gain_m && <span className="error">{errors.route_elevation_gain_m}</span>}
                </label>
              </div>

              <label className={styles.field}>
                Link mappa percorso (opzionale)
                <input
                  className={invalidClass('route_map_url')}
                  value={form.route_map_url}
                  onChange={(e) => setField('route_map_url', e.target.value)}
                  placeholder="https://..."
                />
                {errors.route_map_url && <span className="error">{errors.route_map_url}</span>}
              </label>
            </>
          ) : null}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Programmazione</legend>

          <label className={styles.field}>
            Data e ora
            <input
              type="datetime-local"
              className={invalidClass('event_datetime')}
              value={form.event_datetime}
              onChange={(e) => setField('event_datetime', e.target.value)}
            />
            {errors.event_datetime && <span className="error">{errors.event_datetime}</span>}
          </label>

          <label className={styles.field}>
            Durata sessione (minuti)
            <input
              type="number"
              min="15"
              max="360"
              step="15"
              className={invalidClass('duration_minutes')}
              value={form.duration_minutes}
              onChange={(e) => setField('duration_minutes', e.target.value)}
            />
            <span className="input-helper">Al termine, la sessione si chiude e l'evento viene rimosso automaticamente.</span>
            {errors.duration_minutes && <span className="error">{errors.duration_minutes}</span>}
          </label>

          <label className={styles.field}>
            Max partecipanti
            <input
              type="number"
              min="2"
              className={invalidClass('max_participants')}
              value={form.max_participants}
              onChange={(e) => setField('max_participants', e.target.value)}
            />
            {errors.max_participants && <span className="error">{errors.max_participants}</span>}
          </label>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Location</legend>

          <label className={styles.field}>
            Citta
            <input className={invalidClass('city')} value={form.city} onChange={(e) => setField('city', e.target.value)} />
            {errors.city && <span className="error">{errors.city}</span>}
          </label>

          <label className={styles.field}>
            Nome location
            <input
              className={invalidClass('location_name')}
              value={form.location_name}
              onChange={(e) => setField('location_name', e.target.value)}
            />
            {errors.location_name && <span className="error">{errors.location_name}</span>}
          </label>

          <div className={styles.inlineGrid}>
            <label className={styles.field}>
              Latitudine (opzionale)
              <input
                type="number"
                step="any"
                className={invalidClass('coordinates')}
                value={form.lat}
                onChange={(e) => setField('lat', e.target.value)}
              />
            </label>
            <label className={styles.field}>
              Longitudine (opzionale)
              <input
                type="number"
                step="any"
                className={invalidClass('coordinates')}
                value={form.lng}
                onChange={(e) => setField('lng', e.target.value)}
              />
            </label>
          </div>
          <div className={styles.locationActions}>
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
              {requesting ? 'Rilevazione posizione...' : 'Usa la mia posizione'}
            </Button>
          </div>
          {errors.coordinates && <span className={`error ${styles.coordError}`}>{errors.coordinates}</span>}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Descrizione</legend>

          <label className={styles.field}>
            Dettagli utili
            <div className={styles.aiActionRow}>
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
                {aiLoading ? 'Generazione...' : 'Suggerisci descrizione (AI)'}
              </Button>
            </div>
            <textarea
              rows="4"
              className={invalidClass('description')}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
            {!aiEnabled ? <span className="input-helper">Attiva AI Locale (Beta) dalla sezione Account.</span> : null}
            <span className="input-helper">Spiega ritmo, attrezzatura e obiettivo della sessione.</span>
            {errors.description && <span className="error">{errors.description}</span>}
          </label>
        </fieldset>

        <button type="submit" className={styles.submit}>
          Pubblica sessione
        </button>
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

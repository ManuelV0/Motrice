import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SearchX, PlusCircle, PiggyBank, Map as MapIcon } from 'lucide-react';
import { api } from '../services/api';
import FilterBar from '../components/FilterBar';
import EventCard from '../components/EventCard';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import CTAButton from '../components/CTAButton';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import PaywallModal from '../components/PaywallModal';
import ExploreHero from '../components/explore/ExploreHero';
import ExploreFiltersToolbar from '../components/explore/ExploreFiltersToolbar';
import ExploreFeaturedRow from '../components/explore/ExploreFeaturedRow';
import ExploreHowItWorks from '../components/explore/ExploreHowItWorks';
import { usePageMeta } from '../hooks/usePageMeta';
import { readFiltersFromSearch, writeFiltersToSearch } from '../utils/queryFilters';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';
import { useBilling } from '../context/BillingContext';
import { useToast } from '../context/ToastContext';
import { useUserLocation } from '../hooks/useUserLocation';
import LocationPermissionAlert from '../components/LocationPermissionAlert';
import styles from '../styles/pages/explore.module.css';

const FILTERS_STORAGE = 'motrice_explore_filters_v1';
const defaults = {
  q: '',
  sport: 'all',
  dateRange: 'all',
  distance: 'all',
  level: 'all',
  timeOfDay: 'all',
  sortBy: 'soonest'
};

function readStoredFiltersSafe() {
  try {
    const raw = safeStorageGet(FILTERS_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function ExplorePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { entitlements } = useBilling();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sports, setSports] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);
  const [showMapPanel, setShowMapPanel] = useState(false);
  const [onlyOpenSpots, setOnlyOpenSpots] = useState(false);
  const [cityFilter, setCityFilter] = useState('all');
  const [savingIds, setSavingIds] = useState([]);
  const [groupBookingEvent, setGroupBookingEvent] = useState(null);
  const [groupStakeCents, setGroupStakeCents] = useState(500);
  const [bookingGroupEventId, setBookingGroupEventId] = useState(null);
  const [participantName, setParticipantName] = useState('Partecipante');

  const initialFilters = useMemo(() => {
    const fromStorage = readStoredFiltersSafe();
    const merged = { ...defaults, ...(fromStorage || {}) };
    return readFiltersFromSearch(searchParams, merged);
  }, [searchParams]);

  const [filters, setFilters] = useState(initialFilters);
  const { hasLocation, permission, error: locationError, requesting, requestLocation, originParams } = useUserLocation();

  const mapSearch = useMemo(() => writeFiltersToSearch(new URLSearchParams(), filters, defaults).toString(), [filters]);

  usePageMeta({
    title: 'Esplora Eventi | Motrice',
    description: 'Scopri sessioni sportive dal vivo per sport, livello, fascia oraria e distanza.'
  });

  useEffect(() => {
    api.listSports().then(setSports);
    api.getLocalProfile().then((profile) => {
      const nextName = String(profile?.name || profile?.display_name || 'Partecipante').trim();
      setParticipantName(nextName || 'Partecipante');
    });
  }, []);

  useEffect(() => {
    const next = readFiltersFromSearch(searchParams, { ...defaults, ...filters });
    if (JSON.stringify(next) !== JSON.stringify(filters)) {
      setFilters(next);
    }
  }, [searchParams]);

  useEffect(() => {
    const base = entitlements.canUseAdvancedFilters
      ? filters
      : { ...filters, distance: 'all', level: 'all', timeOfDay: 'all' };
    const effectiveFilters = { ...base, ...originParams };

    setLoading(true);
    setLoadError('');
    api
      .listEvents(effectiveFilters)
      .then(setEvents)
      .catch((error) => {
        setEvents([]);
        setLoadError(error?.message || 'Errore nel caricamento eventi.');
      })
      .finally(() => setLoading(false));

    safeStorageSet(FILTERS_STORAGE, JSON.stringify(filters));
    setSearchParams(writeFiltersToSearch(searchParams, filters, defaults), { replace: true });
  }, [filters, originParams]);

  const cities = useMemo(() => {
    const set = new Set();
    events.forEach((event) => {
      const city = String(event.city || '').trim();
      if (city) set.add(city);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'it'));
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (cityFilter !== 'all' && String(event.city || '').trim() !== cityFilter) return false;
      if (onlyOpenSpots && Number(event.participants_count || 0) >= Number(event.max_participants || 0)) return false;
      return true;
    });
  }, [events, cityFilter, onlyOpenSpots]);

  const featuredEvents = useMemo(() => {
    return [...filteredEvents]
      .sort((a, b) => {
        const popA = Number(a.popularity || 0);
        const popB = Number(b.popularity || 0);
        if (popB !== popA) return popB - popA;
        return Date.parse(a.event_datetime) - Date.parse(b.event_datetime);
      })
      .slice(0, 6);
  }, [filteredEvents]);

  async function reloadEvents() {
    const base = entitlements.canUseAdvancedFilters
      ? filters
      : { ...filters, distance: 'all', level: 'all', timeOfDay: 'all' };
    const refreshed = await api.listEvents({ ...base, ...originParams });
    setEvents(refreshed);
  }

  async function toggleSaveEvent(event) {
    const eventId = event.id;
    setSavingIds((prev) => [...prev, eventId]);
    try {
      if (event.is_saved) {
        await api.unsaveEvent(eventId);
        showToast('Evento rimosso dall agenda', 'info');
      } else {
        await api.saveEvent(eventId);
        showToast('Evento salvato in agenda', 'success');
      }
      await reloadEvents();
    } catch (error) {
      showToast(error.message || 'Impossibile aggiornare agenda', 'error');
    } finally {
      setSavingIds((prev) => prev.filter((id) => id !== eventId));
    }
  }

  async function bookGroupSession() {
    if (!groupBookingEvent) return;
    const event = groupBookingEvent;
    setBookingGroupEventId(event.id);
    try {
      if (!event.is_going) {
        await api.joinEvent(event.id, {
          name: participantName,
          skill_level: 'beginner',
          note: entitlements.canUseCoachChat
            ? 'Prenotazione gruppo Premium (quota esente)'
            : `Prenotazione gruppo con quota ${groupStakeCents === 1000 ? '10' : '5'} EUR`,
          participation_fee_cents: entitlements.canUseCoachChat ? 0 : groupStakeCents,
          event_title: event.title || `${event.sport_name} @ ${event.location_name}`
        });
      }

      await reloadEvents();
      showToast(
        entitlements.canUseCoachChat
          ? 'Sessione di gruppo prenotata. Accesso Premium senza quota.'
          : `Sessione di gruppo prenotata. Quota ${groupStakeCents === 1000 ? '10' : '5'} EUR congelata nel salvadanaio.`,
        'success'
      );
      setGroupBookingEvent(null);
    } catch (error) {
      showToast(error.message || 'Impossibile prenotare la sessione di gruppo', 'error');
    } finally {
      setBookingGroupEventId(null);
    }
  }

  async function handleNearMe() {
    const coords = await requestLocation();
    if (!coords) {
      showToast(locationError || 'Impossibile ottenere la tua posizione', 'error');
      return;
    }
    setFilters((prev) => ({ ...prev, sortBy: 'closest' }));
    showToast('Ordinamento per vicinanza attivato.', 'success');
  }

  function resetFilters() {
    setFilters(defaults);
    setCityFilter('all');
    setOnlyOpenSpots(false);
  }

  return (
    <div className={styles.page}>
      <ExploreHero onPrimaryAction={handleNearMe} onSecondaryAction={() => setShowHowItWorksModal(true)} />

      <section className={styles.topActions}>
        <CTAButton to={mapSearch ? `/map?${mapSearch}` : '/map'}>
          <MapIcon size={18} aria-hidden="true" /> Apri mappa
        </CTAButton>
        <CTAButton to="/create">
          <PlusCircle size={18} aria-hidden="true" /> Crea sessione
        </CTAButton>
      </section>

      <LocationPermissionAlert
        hasLocation={hasLocation}
        permission={permission}
        error={locationError}
        requesting={requesting}
        onRequest={requestLocation}
      />

      <Card className={styles.toolbarCard}>
        <ExploreFiltersToolbar
          filters={filters}
          cityFilter={cityFilter}
          onCityFilterChange={setCityFilter}
          cities={cities}
          sports={sports}
          onlyOpenSpots={onlyOpenSpots}
          onOnlyOpenSpotsChange={setOnlyOpenSpots}
          onFiltersChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
          resultCount={filteredEvents.length}
          onReset={resetFilters}
          onToggleAdvanced={() => setShowAdvancedFilters((prev) => !prev)}
          advancedOpen={showAdvancedFilters}
        />
      </Card>

      {showAdvancedFilters ? (
        <Card className={styles.advancedCard}>
          <FilterBar
            filters={filters}
            sports={sports}
            onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
            onSubmit={(event) => event.preventDefault()}
            advancedLocked={!entitlements.canUseAdvancedFilters}
            onRequestUpgrade={() => setPaywallOpen(true)}
          />
        </Card>
      ) : null}

      <Card className={styles.mapPanel}>
        <div className={styles.mapPanelHead}>
          <h2>Vedi sulla mappa</h2>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowMapPanel((prev) => !prev)}
            aria-expanded={showMapPanel}
            aria-controls="explore-map-panel"
          >
            {showMapPanel ? 'Nascondi' : 'Apri'}
          </Button>
        </div>
        {showMapPanel ? (
          <div id="explore-map-panel" className={styles.mapPanelBody}>
            <p className="muted">Apri la mappa interattiva per visualizzare marker e percorsi.</p>
            <Link to={mapSearch ? `/map?${mapSearch}` : '/map'}>
              <Button type="button">Vai alla mappa</Button>
            </Link>
          </div>
        ) : null}
      </Card>

      <ExploreFeaturedRow
        events={featuredEvents}
        onToggleSave={toggleSaveEvent}
        onBookGroup={(selectedEvent) => {
          setGroupStakeCents(500);
          setGroupBookingEvent(selectedEvent);
        }}
        savingIds={savingIds}
        bookingGroupEventId={bookingGroupEventId}
      />

      <section className={styles.listSection} aria-label="Lista sessioni">
        <div className={styles.listHead}>
          <h2>Sessioni disponibili</h2>
          <p className="muted">Scegli un evento e conferma la tua partecipazione.</p>
        </div>

        {loading ? (
          <LoadingSkeleton rows={6} />
        ) : loadError ? (
          <Card className={styles.errorCard}>
            <p>{loadError}</p>
            <Button type="button" onClick={reloadEvents}>Riprova</Button>
          </Card>
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            icon={SearchX}
            imageSrc="/images/default-sport.svg"
            imageAlt="Icona sport"
            title="Nessun evento trovato"
            description="Prova con altri filtri o crea la tua prima sessione nella zona."
            primaryActionLabel="Reset filtri"
            onPrimaryAction={resetFilters}
            secondaryActionLabel="Crea evento"
            onSecondaryAction={() => navigate('/create')}
          />
        ) : (
          <div className={styles.eventsGrid}>
            {filteredEvents.map((event) => (
              <div key={event.id} className={styles.eventItem}>
                <EventCard
                  event={event}
                  variant="compact"
                  onToggleSave={toggleSaveEvent}
                  onBookGroup={(selectedEvent) => {
                    setGroupStakeCents(500);
                    setGroupBookingEvent(selectedEvent);
                  }}
                  saving={savingIds.includes(event.id)}
                  booking={bookingGroupEventId === event.id}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <Card className={styles.groupBookingNotice}>
        <p className={styles.groupBookingTitle}>
          <PiggyBank size={16} aria-hidden="true" /> Anti-ghosting gruppi
        </p>
        <p className="muted">
          Usa “Prenota sessione di gruppo” e scegli quota partecipazione (5 EUR o 10 EUR). La quota viene congelata nel
          salvadanaio per incentivare presenza e creazione gruppi.
        </p>
      </Card>

      <Card className={styles.extraCta}>
        <h2>Hai una community o un centro sportivo?</h2>
        <p className="muted">Pubblica sessioni ricorrenti e aumenta partecipazione locale.</p>
        <div className={styles.extraCtaActions}>
          <CTAButton to="/create">Pubblica una sessione</CTAButton>
        </div>
      </Card>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature="Filtri avanzati (distanza, livello, fascia oraria)"
      />

      <Modal
        open={Boolean(groupBookingEvent)}
        onClose={() => setGroupBookingEvent(null)}
        onConfirm={bookGroupSession}
        confirmText={bookingGroupEventId ? 'Prenotazione...' : 'Conferma prenotazione gruppo'}
        confirmDisabled={Boolean(bookingGroupEventId)}
        title={groupBookingEvent ? `Prenota gruppo: ${groupBookingEvent.sport_name}` : 'Prenota sessione di gruppo'}
      >
        {groupBookingEvent ? (
          <div className={styles.groupBookingModalBody}>
            <p className="muted">
              {groupBookingEvent.location_name} ·{' '}
              {new Date(groupBookingEvent.event_datetime).toLocaleString('it-IT', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
            <label className={styles.groupBookingField}>
              Quota partecipazione
              {entitlements.canUseCoachChat ? (
                <p className="muted">Esente quota con abbonamento Premium attivo.</p>
              ) : (
                <select value={groupStakeCents} onChange={(event) => setGroupStakeCents(Number(event.target.value))}>
                  <option value={500}>5 EUR</option>
                  <option value={1000}>10 EUR</option>
                </select>
              )}
            </label>
            <p className="muted">
              {entitlements.canUseCoachChat
                ? 'Con Premium puoi accedere al gruppo senza quota di partecipazione.'
                : 'La quota viene congelata nel salvadanaio. Se il gruppo si raduna e la presenza viene verificata, torna disponibile.'}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showHowItWorksModal}
        onClose={() => setShowHowItWorksModal(false)}
        onConfirm={() => setShowHowItWorksModal(false)}
        title="Come funziona Esplora"
        confirmText="Chiudi"
      >
        <ExploreHowItWorks compact />
      </Modal>
    </div>
  );
}

export default ExplorePage;

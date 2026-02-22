import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SearchX, PiggyBank, ChevronLeft, ChevronRight } from 'lucide-react';
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
import ExploreMapToggle from '../components/explore/ExploreMapToggle';
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
const EVENTS_PER_PAGE = 6;
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
  const [currentPage, setCurrentPage] = useState(1);
  const eventsRequestRef = useRef(0);

  const initialFilters = useMemo(() => {
    const fromStorage = readStoredFiltersSafe();
    const merged = { ...defaults, ...(fromStorage || {}) };
    return readFiltersFromSearch(searchParams, merged);
  }, [searchParams]);

  const [filters, setFilters] = useState(initialFilters);
  const [qInput, setQInput] = useState(initialFilters.q || '');
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
    setQInput(filters.q || '');
  }, [filters.q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => {
        if ((prev.q || '') === qInput) return prev;
        return { ...prev, q: qInput };
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    const base = entitlements.canUseAdvancedFilters
      ? filters
      : { ...filters, distance: 'all', level: 'all', timeOfDay: 'all' };
    const effectiveFilters = { ...base, ...originParams };
    const requestId = eventsRequestRef.current + 1;
    eventsRequestRef.current = requestId;

    setLoading(true);
    setLoadError('');
    api
      .listEvents(effectiveFilters)
      .then((nextEvents) => {
        if (requestId !== eventsRequestRef.current) return;
        setEvents(nextEvents);
      })
      .catch((error) => {
        if (requestId !== eventsRequestRef.current) return;
        setEvents([]);
        setLoadError(error?.message || 'Errore nel caricamento eventi.');
      })
      .finally(() => {
        if (requestId !== eventsRequestRef.current) return;
        setLoading(false);
      });

    safeStorageSet(FILTERS_STORAGE, JSON.stringify(filters));
    const nextSearchParams = writeFiltersToSearch(searchParams, filters, defaults);
    const nextSearchString = nextSearchParams.toString();
    const currentSearchString = searchParams.toString();
    if (nextSearchString !== currentSearchString) {
      setSearchParams(nextSearchParams, { replace: true });
    }
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

  const totalCards = filteredEvents.length;

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCards / EVENTS_PER_PAGE));
  }, [totalCards]);

  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * EVENTS_PER_PAGE;
    return filteredEvents.slice(start, start + EVENTS_PER_PAGE);
  }, [filteredEvents, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, cityFilter, onlyOpenSpots]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (cityFilter === 'all') return;
    if (cities.includes(cityFilter)) return;
    setCityFilter('all');
  }, [cities, cityFilter]);

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
    setQInput(defaults.q);
    setCityFilter('all');
    setOnlyOpenSpots(false);
  }

  function updateFilter(key, value) {
    if (key === 'q') {
      setQInput(value);
      return;
    }
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className={styles.page}>
      <ExploreMapToggle
        activeView="explore"
        leftLabel="Esplora"
        rightLabel="Mappa"
        thirdLabel="Crea"
        leftTo="/explore"
        rightTo={mapSearch ? `/map?${mapSearch}` : '/map'}
        thirdTo="/create"
      />
      <ExploreHero onPrimaryAction={handleNearMe} onSecondaryAction={() => setShowHowItWorksModal(true)} />

      <LocationPermissionAlert
        hasLocation={hasLocation}
        permission={permission}
        error={locationError}
        requesting={requesting}
        onRequest={requestLocation}
      />

      <Card className={styles.toolbarCard}>
        <ExploreFiltersToolbar
          filters={{ ...filters, q: qInput }}
          cityFilter={cityFilter}
          onCityFilterChange={setCityFilter}
          cities={cities}
          sports={sports}
          onlyOpenSpots={onlyOpenSpots}
          onOnlyOpenSpotsChange={setOnlyOpenSpots}
          onFiltersChange={updateFilter}
          resultCount={filteredEvents.length}
          onReset={resetFilters}
          onToggleAdvanced={() => setShowAdvancedFilters((prev) => !prev)}
          advancedOpen={showAdvancedFilters}
        />
      </Card>

      {showAdvancedFilters ? (
        <Card className={styles.advancedCard}>
          <FilterBar
            filters={{ ...filters, q: qInput }}
            sports={sports}
            onChange={updateFilter}
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
          <>
            <div className={styles.eventsGrid}>
              {paginatedEvents.map((event) => (
                <div key={event.id} className={styles.eventItem}>
                  <EventCard
                    event={event}
                    variant="compact"
                    className={styles.uniformCard}
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
            <div className={styles.paginationCompact} aria-label="Paginazione sessioni">
              <button
                type="button"
                className={styles.pageArrow}
                onClick={() => {
                  if (totalPages <= 1) return;
                  setCurrentPage((prev) => (prev <= 1 ? totalPages : prev - 1));
                }}
                aria-label="Pagina precedente"
                aria-disabled={totalPages <= 1}
                disabled={totalPages <= 1}
              >
                <ChevronLeft size={18} strokeWidth={2.25} aria-hidden="true" />
              </button>
              <p className={styles.paginationCompactInfo}>Pag {currentPage}/{totalPages} · {totalCards} card</p>
              <button
                type="button"
                className={styles.pageArrow}
                onClick={() => {
                  if (totalPages <= 1) return;
                  setCurrentPage((prev) => (prev >= totalPages ? 1 : prev + 1));
                }}
                aria-label="Pagina successiva"
                aria-disabled={totalPages <= 1}
                disabled={totalPages <= 1}
              >
                <ChevronRight size={18} strokeWidth={2.25} aria-hidden="true" />
              </button>
            </div>
          </>
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

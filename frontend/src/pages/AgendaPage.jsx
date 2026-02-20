import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarX2 } from 'lucide-react';
import { api } from '../services/api';
import { piggybank } from '../services/piggybank';
import { usePageMeta } from '../hooks/usePageMeta';
import { readFiltersFromSearch, writeFiltersToSearch } from '../utils/queryFilters';
import { useBilling } from '../context/BillingContext';
import PaywallModal from '../components/PaywallModal';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import Card from '../components/Card';
import Button from '../components/Button';
import { useToast } from '../context/ToastContext';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';
import { useUserLocation } from '../hooks/useUserLocation';
import LocationPermissionAlert from '../components/LocationPermissionAlert';
import styles from '../styles/pages/agenda.module.css';

const defaults = {
  view: 'today',
  sport: 'all',
  level: 'all',
  timeOfDay: 'all'
};

function readStoredAgendaFiltersSafe() {
  try {
    const raw = safeStorageGet('motrice_agenda_filters_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function AgendaPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { entitlements } = useBilling();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sports, setSports] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { coords, hasLocation, permission, error: locationError, requesting, requestLocation } = useUserLocation();

  const [filters, setFilters] = useState(() => {
    const local = readStoredAgendaFiltersSafe();
    return readFiltersFromSearch(searchParams, { ...defaults, ...(local || {}) });
  });

  usePageMeta({
    title: 'Agenda | Motrice',
    description: 'Vista oggi, settimana e mese delle tue sessioni sportive locali.'
  });

  useEffect(() => {
    api.listSports().then(setSports);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listAgenda(filters.view, filters)
      .then(setGroups)
      .finally(() => setLoading(false));

    safeStorageSet('motrice_agenda_filters_v1', JSON.stringify(filters));
    setSearchParams(writeFiltersToSearch(searchParams, filters, defaults), { replace: true });
  }, [filters]);

  const hasItems = useMemo(() => groups.some((group) => group.items.length > 0), [groups]);

  async function removeFromAgenda(eventId) {
    try {
      await api.unsaveEvent(eventId);
      const refreshed = await api.listAgenda(filters.view, filters);
      setGroups(refreshed);
      showToast('Evento rimosso dall agenda', 'info');
    } catch (error) {
      showToast(error.message || 'Impossibile rimuovere evento', 'error');
    }
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function unlockStakeWithPosition(event) {
    const fee = Number(event?.user_rsvp?.participation_fee_cents || 0);
    if (!(fee === 500 || fee === 1000)) {
      showToast('Nessuna quota da sbloccare per questo evento', 'info');
      return;
    }
    if (!hasLocation || !coords) {
      showToast('Attiva la posizione per sbloccare la quota', 'info');
      requestLocation();
      return;
    }
    if (event.lat == null || event.lng == null) {
      showToast('Evento senza coordinate: impossibile verificare posizione', 'error');
      return;
    }

    const distanceKm = haversineKm(coords.lat, coords.lng, Number(event.lat), Number(event.lng));
    try {
      if (distanceKm <= 0.4) {
        piggybank.unlockByGathering({ eventId: event.id });
        showToast('Quota sbloccata: raduno confermato in posizione', 'success');
      } else {
        piggybank.deferUntilNextParticipation({ eventId: event.id });
        showToast('Non sei nel punto raduno: quota congelata fino alla prossima partecipazione', 'info');
      }
    } catch (error) {
      showToast(error.message || 'Impossibile aggiornare quota', 'error');
    }
  }

  function selectView(view) {
    if ((view === 'week' || view === 'month') && !entitlements.canUseAgendaWeekMonth) {
      setPaywallOpen(true);
      return;
    }
    setFilters((prev) => ({ ...prev, view }));
  }

  return (
    <section className={styles.page}>
      <div className={styles.head}>
        <h1>Agenda</h1>
        <div className={styles.tabs}>
          <Button type="button" variant={filters.view === 'today' ? 'primary' : 'secondary'} onClick={() => selectView('today')}>
            Oggi
          </Button>
          <Button type="button" variant={filters.view === 'week' ? 'primary' : 'secondary'} onClick={() => selectView('week')}>
            Settimana {!entitlements.canUseAgendaWeekMonth ? '🔒' : ''}
          </Button>
          <Button type="button" variant={filters.view === 'month' ? 'primary' : 'secondary'} onClick={() => selectView('month')}>
            Mese {!entitlements.canUseAgendaWeekMonth ? '🔒' : ''}
          </Button>
        </div>
      </div>

      <LocationPermissionAlert
        hasLocation={hasLocation}
        permission={permission}
        error={locationError}
        requesting={requesting}
        onRequest={requestLocation}
      />

      <Card className="grid3">
        <label>
          Sport
          <select value={filters.sport} onChange={(event) => setFilters((prev) => ({ ...prev, sport: event.target.value }))}>
            <option value="all">Tutti</option>
            {sports.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Livello
          <select value={filters.level} onChange={(event) => setFilters((prev) => ({ ...prev, level: event.target.value }))}>
            <option value="all">Tutti</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>

        <label>
          Fascia
          <select value={filters.timeOfDay} onChange={(event) => setFilters((prev) => ({ ...prev, timeOfDay: event.target.value }))}>
            <option value="all">Tutte</option>
            <option value="morning">Mattina</option>
            <option value="afternoon">Pomeriggio</option>
            <option value="evening">Sera</option>
          </select>
        </label>
      </Card>

      {loading ? (
        <LoadingSkeleton rows={3} variant="detail" />
      ) : !hasItems ? (
        <EmptyState
          icon={CalendarX2}
          imageSrc="/images/default-sport.svg"
          imageAlt="Illustrazione sport"
          title="Nessuna sessione in agenda"
          description="Non ci sono eventi in questa finestra temporale."
          primaryActionLabel="Explore nearby"
          onPrimaryAction={() => navigate('/explore')}
          secondaryActionLabel="Reset filters"
          onSecondaryAction={() => setFilters(defaults)}
        />
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <Card as="section" key={group.label}>
              <h2>{group.label}</h2>
              <ul className={styles.list}>
                {group.items.map((event) => (
                  <li key={event.id} className={styles.item}>
                    <div className={styles.itemMain}>
                      <div>
                        <Link to={`/events/${event.id}`}>{event.sport_name}</Link>
                        <span className="muted"> {event.location_name}</span>
                        <span className="muted">{' '}
                          {new Date(event.event_datetime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className={styles.metaRow}>
                        {event.is_going ? (
                          <span className={styles.metaBadge}>
                            {Number(event.user_rsvp?.participation_fee_cents || 0) > 0
                              ? `Quota ${Number(event.user_rsvp.participation_fee_cents) / 100} EUR`
                              : 'Quota esente (Premium)'}
                          </span>
                        ) : null}
                        {Number(event.group_chat_unread_count || 0) > 0 ? (
                          <span className={styles.unreadBadge}>
                            Chat gruppo: {event.group_chat_unread_count} new
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.itemActions}>
                      {event.is_going && [500, 1000].includes(Number(event.user_rsvp?.participation_fee_cents || 0)) ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => unlockStakeWithPosition(event)}>
                          Sblocca quota (posizione)
                        </Button>
                      ) : null}
                      {event.is_going ? (
                        <Link to={`/events/${event.id}?chat=group`}>
                          <Button type="button" variant="secondary" size="sm">Chat gruppo</Button>
                        </Link>
                      ) : null}
                      {event.is_saved ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeFromAgenda(event.id)}>
                          Rimuovi
                        </Button>
                      ) : (
                        <span className="muted">RSVP</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} feature="Vista agenda Settimana/Mese" />
    </section>
  );
}

export default AgendaPage;

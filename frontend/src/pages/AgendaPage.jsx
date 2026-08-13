import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  CalendarX2,
  Clock3,
  MapPin,
  Plus,
  QrCode,
  Users,
  WalletCards
} from 'lucide-react';
import QRCode from 'qrcode';
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
import Modal from '../components/Modal';
import ExploreMapToggle from '../components/explore/ExploreMapToggle';
import { useToast } from '../context/ToastContext';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';
import { useUserLocation } from '../hooks/useUserLocation';
import LocationPermissionAlert from '../components/LocationPermissionAlert';
import styles from '../styles/pages/agenda.module.css';

const defaults = {
  section: 'owned',
  view: 'today',
  sport: 'all',
  level: 'all',
  timeOfDay: 'all'
};

function formatEventDay(value) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'Oggi';
  if (date.toDateString() === tomorrow.toDateString()) return 'Domani';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

function formatEventTime(value) {
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function formatDeposit(value) {
  const amount = Number(value || 0) / 100;
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(amount)}€ deposito`;
}

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
  const [ownedEvents, setOwnedEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [qrEvent, setQrEvent] = useState(null);
  const [organizerQrUrl, setOrganizerQrUrl] = useState('');
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
    let active = true;
    setLoading(true);
    Promise.all([
      api.listAgenda(filters.view, filters),
      api.listEvents({ ...filters, dateRange: 'all', sortBy: 'soonest' })
    ])
      .then(([nextGroups, events]) => {
        if (!active) return;
        setGroups(nextGroups);
        setOwnedEvents(events.filter((event) => event.created_by === 'me'));
      })
      .catch((error) => {
        if (active) showToast(error?.message || 'Impossibile aggiornare l agenda', 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    safeStorageSet('motrice_agenda_filters_v1', JSON.stringify(filters));
    setSearchParams(writeFiltersToSearch(searchParams, filters, defaults), { replace: true });

    return () => {
      active = false;
    };
  }, [filters]);

  const participatingGroups = useMemo(
    () =>
      groups
        .map((group) => ({ ...group, items: group.items.filter((event) => event.is_going) }))
        .filter((group) => group.items.length > 0),
    [groups]
  );
  const participatingCount = useMemo(
    () => new Set(participatingGroups.flatMap((group) => group.items.map((event) => String(event.id)))).size,
    [participatingGroups]
  );
  const hasItems = filters.section === 'owned' ? ownedEvents.length > 0 : participatingCount > 0;

  useEffect(() => {
    let active = true;
    if (!qrEvent) {
      setOrganizerQrUrl('');
      return undefined;
    }

    const payload = {
      version: 1,
      type: 'organizer',
      eventId: String(qrEvent.id),
      organizerId: String(qrEvent.organizerId || qrEvent.organizer?.auth_user_id || '')
    };

    QRCode.toDataURL(JSON.stringify(payload), {
      width: 720,
      margin: 2,
      color: { dark: '#090b0d', light: '#ffffff' },
      errorCorrectionLevel: 'M'
    })
      .then((url) => {
        if (active) setOrganizerQrUrl(url);
      })
      .catch(() => {
        if (active) setOrganizerQrUrl('');
      });

    return () => {
      active = false;
    };
  }, [qrEvent]);

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
      <ExploreMapToggle
        activeView="left"
        leftLabel="I miei eventi"
        rightLabel="Mappa"
        thirdLabel="Esplora"
        leftTo="/agenda"
        rightTo="/map"
        thirdTo="/explore"
      />
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>Agenda personale</span>
          <h1>Agenda</h1>
        </div>
        {filters.section === 'participating' ? (
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
        ) : null}
      </div>

      <div className={styles.sectionSwitch} role="tablist" aria-label="Tipo di eventi in agenda">
        <button
          type="button"
          role="tab"
          aria-selected={filters.section === 'owned'}
          className={filters.section === 'owned' ? styles.sectionActive : ''}
          onClick={() => setFilters((prev) => ({ ...prev, section: 'owned' }))}
        >
          I miei eventi <span>{ownedEvents.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filters.section === 'participating'}
          className={filters.section === 'participating' ? styles.sectionActive : ''}
          onClick={() => setFilters((prev) => ({ ...prev, section: 'participating' }))}
        >
          Partecipo <span>{participatingCount}</span>
        </button>
      </div>

      {filters.section === 'participating' ? (
        <>
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
        </>
      ) : null}

      {loading ? (
        <LoadingSkeleton rows={3} variant="detail" />
      ) : !hasItems ? (
        <EmptyState
          icon={CalendarX2}
          title={filters.section === 'owned' ? 'Nessun evento organizzato' : 'Nessuna partecipazione in agenda'}
          description={
            filters.section === 'owned'
              ? 'Crea il tuo primo evento e gestisci iscritti, QR e check-in da qui.'
              : 'Non partecipi ancora a eventi in questa finestra temporale.'
          }
          primaryActionLabel={filters.section === 'owned' ? 'Crea evento' : 'Esplora eventi'}
          onPrimaryAction={() => navigate(filters.section === 'owned' ? '/create' : '/explore')}
          secondaryActionLabel="Azzera filtri"
          onSecondaryAction={() => setFilters(defaults)}
        />
      ) : filters.section === 'owned' ? (
        <div className={styles.ownedList} role="tabpanel">
          {ownedEvents.map((event) => {
            const participants = Math.max(0, Number(event.participants_count || 0));
            const capacity = Math.max(1, Number(event.max_participants || 1));
            const fillPercent = Math.min(100, Math.round((participants / capacity) * 100));

            return (
              <article
                key={event.id}
                className={styles.ownedCard}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/events/${event.id}`)}
                onKeyDown={(keyboardEvent) => {
                  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                    keyboardEvent.preventDefault();
                    navigate(`/events/${event.id}`);
                  }
                }}
              >
                <div className={styles.cardTopline}>
                  <span className={styles.sportIcon} aria-hidden="true"><Activity size={26} /></span>
                  <div className={styles.cardTitle}>
                    <h2>{event.title || event.sport_name}</h2>
                    <span><MapPin size={15} /> {event.location_name || event.city}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.qrShortcut}
                    aria-label={`Mostra QR organizer per ${event.title}`}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      setQrEvent(event);
                    }}
                  >
                    <QrCode size={22} />
                  </button>
                </div>

                <div className={styles.cardMeta}>
                  <span><Clock3 size={16} /> {formatEventDay(event.event_datetime)} {formatEventTime(event.event_datetime)}</span>
                  <span><Users size={16} /> {participants}/{capacity} iscritti</span>
                  <span className={styles.deposit}><WalletCards size={16} /> {formatDeposit(event.deposit_cents)}</span>
                </div>

                <div className={styles.capacityTrack} aria-label={`Capienza ${fillPercent}%`}>
                  <span style={{ width: `${fillPercent}%` }} />
                </div>
              </article>
            );
          })}

          <Link className={styles.createFab} to="/create" aria-label="Crea un nuovo evento">
            <Plus size={32} />
          </Link>
        </div>
      ) : (
        <div className={styles.groups}>
          {participatingGroups.map((group) => (
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
      <Modal
        open={Boolean(qrEvent)}
        title="QR presenza organizer"
        onClose={() => setQrEvent(null)}
        closeText="Chiudi"
        showConfirm={false}
      >
        {qrEvent ? (
          <div className={styles.qrSheetContent}>
            <p>Usa questo QR come identificativo dell’organizzatore per il check-in dell’evento.</p>
            <div className={styles.qrCanvas}>
              {organizerQrUrl ? (
                <img src={organizerQrUrl} alt={`QR organizer per ${qrEvent.title}`} />
              ) : (
                <span>Generazione QR…</span>
              )}
            </div>
            <strong>{qrEvent.title}</strong>
            <span className={styles.qrEventTime}>
              {formatEventDay(qrEvent.event_datetime)} · {formatEventTime(qrEvent.event_datetime)}
            </span>
            <span className={styles.qrStatus}>
              <i aria-hidden="true" /> Attivo · {Number(qrEvent.participants_count || 0)}/{Number(qrEvent.max_participants || 0)} iscritti
            </span>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}

export default AgendaPage;

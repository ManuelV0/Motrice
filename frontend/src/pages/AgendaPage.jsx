import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  CalendarX2,
  Clock3,
  MapPin,
  QrCode,
  Users,
  WalletCards
} from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../services/api';
import { piggybank } from '../services/piggybank';
import { usePageMeta } from '../hooks/usePageMeta';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { useUserLocation } from '../hooks/useUserLocation';
import LocationPermissionAlert from '../components/LocationPermissionAlert';
import styles from '../styles/pages/agenda.module.css';

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

function groupEventsByDate(events) {
  const groups = new Map();

  events.forEach((event) => {
    const date = new Date(event.event_datetime);
    const label = date.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    groups.set(label, [...(groups.get(label) || []), event]);
  });

  return Array.from(groups, ([label, items]) => ({ label, items }));
}

function AgendaPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('created');
  const [qrEvent, setQrEvent] = useState(null);
  const [organizerQrUrl, setOrganizerQrUrl] = useState('');
  const { coords, hasLocation, permission, error: locationError, requesting, requestLocation } = useUserLocation();

  usePageMeta({
    title: 'Eventi | Motrice',
    description: 'Tutti gli eventi che organizzi, salvi o a cui partecipi in un unica vista.'
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listEvents({ dateRange: 'all', sortBy: 'soonest' })
      .then((nextEvents) => {
        if (!active) return;
        setEvents(Array.isArray(nextEvents) ? nextEvents : []);
      })
      .catch((error) => {
        if (active) showToast(error?.message || 'Impossibile aggiornare gli eventi', 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [showToast]);

  const ownedEvents = useMemo(
    () => events.filter((event) => event.created_by === 'me'),
    [events]
  );
  const participatingEvents = useMemo(
    () => events.filter((event) => event.created_by !== 'me' && (event.is_going || event.is_saved)),
    [events]
  );

  const participatingGroups = useMemo(
    () => groupEventsByDate(participatingEvents),
    [participatingEvents]
  );
  const participatingCount = participatingEvents.length;
  const hasItems = ownedEvents.length > 0 || participatingCount > 0;

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
      const refreshed = await api.listEvents({ dateRange: 'all', sortBy: 'soonest' });
      setEvents(Array.isArray(refreshed) ? refreshed : []);
      showToast('Evento rimosso dai tuoi eventi', 'info');
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

  return (
    <section className={styles.page}>
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>Tutto in un unico posto</span>
          <h1>I miei eventi</h1>
          <p>Eventi creati, partecipazioni e contenuti salvati senza filtri.</p>
        </div>
        <div className={styles.summary} aria-label="Riepilogo eventi">
          <span><strong>{ownedEvents.length}</strong> creati</span>
          <span><strong>{participatingCount}</strong> partecipo o salvati</span>
        </div>
      </div>

      <div className={styles.sectionSwitch} role="tablist" aria-label="Seleziona gli eventi da mostrare">
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'created'}
          className={activeSection === 'created' ? styles.sectionActive : undefined}
          onClick={() => setActiveSection('created')}
        >
          Creati <span>{ownedEvents.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'participating'}
          className={activeSection === 'participating' ? styles.sectionActive : undefined}
          onClick={() => setActiveSection('participating')}
        >
          Partecipo <span>{participatingCount}</span>
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton rows={3} variant="detail" />
      ) : !hasItems ? (
        <EmptyState
          icon={CalendarX2}
          title="Nessun evento"
          description="Trova sulla mappa la prossima attività a cui partecipare."
          primaryActionLabel="Apri la mappa"
          onPrimaryAction={() => navigate('/map')}
        />
      ) : (
        <>
          {activeSection === 'created' && ownedEvents.length > 0 ? (
            <section className={styles.eventSection} aria-labelledby="owned-events-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Modalità organizer</span>
                  <h2 id="owned-events-title">Creati da te</h2>
                </div>
                <span className={styles.sectionCount}>{ownedEvents.length}</span>
              </div>

              <div className={styles.ownedList}>
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
              </div>
            </section>
          ) : null}

          {activeSection === 'created' && ownedEvents.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="Nessun evento creato"
              description="Gli eventi che organizzerai compariranno qui."
            />
          ) : null}

          {activeSection === 'participating' && participatingCount > 0 ? (
            <section className={styles.eventSection} aria-labelledby="participating-events-title">
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Partecipazioni e preferiti</span>
                  <h2 id="participating-events-title">Partecipo o salvati</h2>
                </div>
                <span className={styles.sectionCount}>{participatingCount}</span>
              </div>

              <LocationPermissionAlert
                hasLocation={hasLocation}
                permission={permission}
                error={locationError}
                requesting={requesting}
                onRequest={requestLocation}
              />

              <div className={styles.groups}>
                {participatingGroups.map((group) => (
                  <Card as="section" key={group.label}>
                    <h2>{group.label}</h2>
                    <ul className={styles.list}>
                      {group.items.map((event) => (
                        <li key={event.id} className={styles.item}>
                          <div className={styles.itemMain}>
                            <div>
                              <Link to={`/events/${event.id}`}>{event.title || event.sport_name}</Link>
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
            </section>
          ) : null}

          {activeSection === 'participating' && participatingCount === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="Nessuna partecipazione"
              description="Gli eventi a cui partecipi o che salvi compariranno qui."
              primaryActionLabel="Apri la mappa"
              onPrimaryAction={() => navigate('/map')}
            />
          ) : null}
        </>
      )}

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

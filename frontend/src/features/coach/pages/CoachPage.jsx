import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BadgeCheck, Mail, MapPin, Search, Send, Star, Target } from 'lucide-react';
import { coachApi } from '../services/coachApi';
import { api } from '../../../services/api';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useToast } from '../../../context/ToastContext';
import { useUserLocation } from '../../../hooks/useUserLocation';
import Card from '../../../components/Card';
import EmptyState from '../../../components/EmptyState';
import LoadingSkeleton from '../../../components/LoadingSkeleton';
import Button from '../../../components/Button';
import avatarPlaceholder from '../../../assets/avatar-placeholder.svg';
import styles from '../../../styles/pages/coachMarketplace.module.css';

function coachMatchesQuery(coach, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const sports = (coach.sports_practiced || []).map((sport) => `${sport.sport_name} ${sport.level}`).join(' ');
  const primarySport = coach.primary_sport?.sport_name || '';
  const locationNames = (coach.training_locations || []).map((spot) => spot.location_name).join(' ');
  const haystack = `${coach.name} ${coach.bio || ''} ${coach.contact_email} ${sports} ${primarySport} ${locationNames}`.toLowerCase();

  return haystack.includes(q);
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

function coachMinDistanceKm(coach, coords) {
  if (!coords) return null;
  const spots = (coach.training_locations || []).filter(
    (spot) => Number.isFinite(Number(spot.lat)) && Number.isFinite(Number(spot.lng))
  );
  if (!spots.length) return null;
  let best = null;
  spots.forEach((spot) => {
    const km = haversineKm(coords.lat, coords.lng, Number(spot.lat), Number(spot.lng));
    if (best == null || km < best) best = km;
  });
  return best;
}

function CoachPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { coords, hasLocation, requestLocation, requesting } = useUserLocation();
  const [loading, setLoading] = useState(true);
  const [coachApplicationStatus, setCoachApplicationStatus] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [query, setQuery] = useState('');
  const [sportFilter, setSportFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [maxRateFilter, setMaxRateFilter] = useState('');
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [maxDistanceKm, setMaxDistanceKm] = useState('');
  const [selectedCoachId, setSelectedCoachId] = useState(null);
  const [requestForm, setRequestForm] = useState({ goal: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [accountProfilesByUserId, setAccountProfilesByUserId] = useState({});
  const [ratingsByUserId, setRatingsByUserId] = useState({});

  usePageMeta({
    title: 'Trova Coach | Motrice',
    description: 'Trova coach verificati, seleziona e invia rapidamente una richiesta scheda.'
  });

  useEffect(() => {
    let active = true;

    coachApi
      .listCoaches()
      .then(async (items) => {
        if (!active) return;
        setCoaches(items);

        const uniqueUserIds = Array.from(new Set((items || []).map((coach) => Number(coach.user_id)).filter(Boolean)));
        const pairs = await Promise.all(
          uniqueUserIds.map(async (userId) => {
            const profile = await api.getAccountProfileByUserId(userId);
            return [String(userId), profile];
          })
        );
        const ratingPairs = await Promise.all(
          uniqueUserIds.map(async (userId) => {
            const summary = await api.getCoachRatingSummary(userId);
            return [String(userId), summary];
          })
        );
        if (!active) return;
        setAccountProfilesByUserId(Object.fromEntries(pairs));
        setRatingsByUserId(Object.fromEntries(ratingPairs));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    coachApi
      .getMyCoachApplication()
      .then((payload) => {
        if (!active) return;
        if (payload?.has_application) {
          setCoachApplicationStatus(payload.status || null);
          return;
        }
        setCoachApplicationStatus(null);
      })
      .catch(() => {
        if (!active) return;
        setCoachApplicationStatus(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredCoaches = useMemo(() => {
    return coaches.filter((coach) => {
      if (!coachMatchesQuery(coach, query)) return false;

      if (sportFilter !== 'all') {
        const sportId = Number(sportFilter);
        const primarySportId = Number(coach.primary_sport?.sport_id || 0);
        const inPracticed = (coach.sports_practiced || []).some((sport) => Number(sport.sport_id) === sportId);
        if (primarySportId !== sportId && !inPracticed) return false;
      }

      const rating = Number(ratingsByUserId[String(coach.user_id)]?.average || 0);
      if (ratingFilter !== 'all' && rating < Number(ratingFilter)) return false;

      const maxRate = Number(maxRateFilter || 0);
      if (maxRate > 0 && Number(coach.hourly_rate || 0) > maxRate) return false;

      if (nearbyOnly) {
        const distanceKm = coachMinDistanceKm(coach, coords);
        if (distanceKm == null) return false;
        const maxKm = Number(maxDistanceKm || 0);
        if (maxKm > 0 && distanceKm > maxKm) return false;
      }

      return true;
    });
  }, [coaches, query, sportFilter, ratingFilter, maxRateFilter, ratingsByUserId, nearbyOnly, maxDistanceKm, coords]);

  const availableSports = useMemo(() => {
    const map = new Map();
    coaches.forEach((coach) => {
      if (coach.primary_sport?.sport_id) {
        map.set(String(coach.primary_sport.sport_id), {
          id: Number(coach.primary_sport.sport_id),
          name: coach.primary_sport.sport_name || 'Sport'
        });
      }
      (coach.sports_practiced || []).forEach((sport) => {
        if (sport.sport_id) {
          map.set(String(sport.sport_id), {
            id: Number(sport.sport_id),
            name: sport.sport_name || 'Sport'
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [coaches]);
  const allDecoratedCoaches = useMemo(() => {
    return coaches.map((coach) => {
      const accountProfile = accountProfilesByUserId[String(coach.user_id)] || null;
      const rating = ratingsByUserId[String(coach.user_id)] || { average: 0, count: 0 };
      return {
        ...coach,
        avatar_url: accountProfile?.avatar_url || '',
        bio: accountProfile?.bio || coach.bio,
        rating_average: rating.average || 0,
        rating_count: rating.count || 0
      };
    });
  }, [coaches, accountProfilesByUserId, ratingsByUserId]);

  const decoratedCoaches = useMemo(() => {
    return filteredCoaches.map((coach) => {
      const accountProfile = accountProfilesByUserId[String(coach.user_id)] || null;
      const rating = ratingsByUserId[String(coach.user_id)] || { average: 0, count: 0 };
      return {
        ...coach,
        avatar_url: accountProfile?.avatar_url || '',
        bio: accountProfile?.bio || coach.bio,
        rating_average: rating.average || 0,
        rating_count: rating.count || 0,
        distance_km: coachMinDistanceKm(coach, coords)
      };
    });
  }, [filteredCoaches, accountProfilesByUserId, ratingsByUserId, coords]);

  const sortedDecoratedCoaches = useMemo(() => {
    if (!nearbyOnly) return decoratedCoaches;
    return [...decoratedCoaches].sort((a, b) => {
      const da = Number.isFinite(Number(a.distance_km)) ? Number(a.distance_km) : Number.POSITIVE_INFINITY;
      const db = Number.isFinite(Number(b.distance_km)) ? Number(b.distance_km) : Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [decoratedCoaches, nearbyOnly]);

  const topRatedCoaches = useMemo(() => {
    return [...allDecoratedCoaches]
      .filter((coach) => Number(coach.rating_count) > 0)
      .sort((a, b) => {
        if (Number(b.rating_average) !== Number(a.rating_average)) {
          return Number(b.rating_average) - Number(a.rating_average);
        }
        return Number(b.rating_count) - Number(a.rating_count);
      })
      .slice(0, 10);
  }, [allDecoratedCoaches]);

  const topTenBoard = useMemo(
    () =>
      Array.from({ length: 10 }, (_, index) => {
        const coach = topRatedCoaches[index];
        return {
          rank: index + 1,
          coach: coach || null
        };
      }),
    [topRatedCoaches]
  );

  const selectedCoach = useMemo(
    () => decoratedCoaches.find((coach) => Number(coach.id) === Number(selectedCoachId)) || null,
    [decoratedCoaches, selectedCoachId]
  );

  async function submitQuickRequest() {
    if (!selectedCoach) {
      showToast('Seleziona prima un coach', 'error');
      return;
    }

    if (requestForm.goal.trim().length < 4) {
      showToast('Inserisci un obiettivo di almeno 4 caratteri', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await coachApi.requestPlan(selectedCoach.id, {
        goal: requestForm.goal,
        notes: requestForm.notes
      });
      setRequestForm({ goal: '', notes: '' });
      showToast('Richiesta inviata al coach selezionato', 'success');
      navigate('/dashboard/plans');
    } catch (error) {
      showToast(error.message || 'Impossibile inviare richiesta', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function openCoachArea() {
    if (coachApplicationStatus !== 'approved') {
      window.alert("Prima registrati e attendi l'approvazione admin.");
      return;
    }
    navigate('/dashboard/coach');
  }

  if (loading) return <LoadingSkeleton rows={4} />;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>Trova Coach</p>
          <h1>Seleziona un coach approvato e invia la richiesta</h1>
          <p className="muted">Ricerca rapida, selezione diretta e invio richiesta scheda con un unico flusso.</p>
        </div>
        <div className="row">
          <Link to="/dashboard/plans">
            <Button variant="secondary">Le mie schede</Button>
          </Link>
        </div>
      </header>

      <Card className={styles.quickRequestBox}>
        <div className={styles.headRow}>
          <h2>Box richiesta rapida</h2>
          <span className={styles.badgeSoft}>Trova Coach</span>
        </div>

        <p className="muted">
          Coach selezionato:{' '}
          <strong>{selectedCoach ? selectedCoach.name : 'nessuno'}</strong>
        </p>

        <div className={styles.filterGrid}>
          <label className={styles.field}>
            Obiettivo
            <input
              value={requestForm.goal}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, goal: event.target.value }))}
              placeholder="Es. preparazione mezza maratona"
            />
          </label>
          <label className={styles.field}>
            Note
            <input
              value={requestForm.notes}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Disponibilita, preferenze, vincoli"
            />
          </label>
        </div>

        <div className="row">
          <Button type="button" icon={Send} onClick={submitQuickRequest} disabled={submitting}>
            {submitting ? 'Invio...' : 'OK e invia richiesta'}
          </Button>
        </div>
      </Card>

      <Card className={styles.quickRequestBox}>
        <div className={styles.headRow}>
          <h2>Top 10 Coach</h2>
          <span className={styles.badgeSoft}>Ranking chat</span>
        </div>
        <ul className={`${styles.listCompact} ${styles.rankList}`}>
          {topTenBoard.map((item) => (
            <li key={`top-slot-${item.rank}`} className={styles.rankRow}>
              <span className={styles.rankIndex}>#{item.rank}</span>
              {item.coach ? (
                <span>
                  {item.coach.name} · {Number(item.coach.rating_average).toFixed(1)}/5 ({item.coach.rating_count}{' '}
                  recensioni)
                </span>
              ) : (
                <span className="muted">Classificato...</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className={styles.searchCard}>
        <div className={styles.headRow}>
          <h2>Filtri avanzati coach</h2>
          <span className={styles.badgeSoft}>Ricerca</span>
        </div>
        <div className={styles.advancedFiltersGrid}>
          <label className={styles.searchLabel}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, sport, bio o zona"
            />
          </label>
          <label className={styles.field}>
            Sport
            <select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}>
              <option value="all">Tutti</option>
              {availableSports.map((sport) => (
                <option key={`sport-filter-${sport.id}`} value={sport.id}>
                  {sport.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Rating minimo
            <select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)}>
              <option value="all">Qualsiasi</option>
              <option value="4">4+ stelle</option>
              <option value="4.5">4.5+ stelle</option>
            </select>
          </label>
          <label className={styles.field}>
            Tariffa massima EUR/h
            <input
              type="number"
              min="0"
              step="1"
              value={maxRateFilter}
              onChange={(event) => setMaxRateFilter(event.target.value)}
              placeholder="Es. 60"
            />
          </label>
          <label className={styles.field}>
            Distanza massima (km)
            <input
              type="number"
              min="1"
              step="1"
              value={maxDistanceKm}
              onChange={(event) => setMaxDistanceKm(event.target.value)}
              placeholder="Es. 20"
              disabled={!nearbyOnly}
            />
          </label>
        </div>
        <div className="row">
          <label className={styles.inlineMeta}>
            <input
              type="checkbox"
              checked={nearbyOnly}
              onChange={(event) => {
                const checked = event.target.checked;
                setNearbyOnly(checked);
                if (checked && !hasLocation) {
                  requestLocation().then((next) => {
                    if (!next) showToast('Attiva la posizione per filtrare i coach vicini', 'info');
                  });
                }
              }}
            />
            Mostra coach piu vicini
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={requestLocation} disabled={requesting}>
            {requesting ? 'Rilevo posizione...' : hasLocation ? 'Aggiorna posizione' : 'Attiva posizione'}
          </Button>
        </div>
        <div className="row">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              setSportFilter('all');
              setRatingFilter('all');
              setMaxRateFilter('');
              setNearbyOnly(false);
              setMaxDistanceKm('');
            }}
          >
            Reset filtri
          </Button>
        </div>
      </Card>

      {sortedDecoratedCoaches.length === 0 ? (
        <EmptyState
          icon={Target}
          imageSrc="/images/default-sport.svg"
          imageAlt="Icona coach sport"
          title="Nessun coach trovato"
          description="Prova a cambiare ricerca oppure scorri in basso per candidatura coach."
        />
      ) : (
        <section className={styles.grid}>
          {sortedDecoratedCoaches.map((coach) => {
            const isSelected = Number(selectedCoachId) === Number(coach.id);
            return (
              <Card key={coach.id} className={styles.coachCard} hover>
                <div className={styles.coachHeader}>
                  <div className={styles.coachTitleBlock}>
                    <img src={coach.avatar_url || avatarPlaceholder} alt={`Avatar coach ${coach.name}`} className={styles.coachAvatar} />
                    <h2>{coach.name}</h2>
                  </div>
                  <span className={styles.badge}>
                    <BadgeCheck size={16} aria-hidden="true" /> Approved
                  </span>
                </div>

                <p className="muted">{coach.bio || 'Coach professionista disponibile per piani personalizzati.'}</p>

                <ul className={styles.metaList}>
                  <li>
                    <Mail size={16} aria-hidden="true" /> {coach.contact_email}
                  </li>
                  <li>
                    <MapPin size={16} aria-hidden="true" />
                    {coach.primary_sport?.sport_name || 'Sport multipli'}
                  </li>
                  {Number.isFinite(Number(coach.distance_km)) ? (
                    <li>
                      <MapPin size={16} aria-hidden="true" /> {Number(coach.distance_km).toFixed(1)} km da te
                    </li>
                  ) : null}
                  <li>
                    <Star size={16} aria-hidden="true" />
                    {coach.rating_count > 0
                      ? `${Number(coach.rating_average).toFixed(1)}/5 (${coach.rating_count})`
                      : 'Nessuna valutazione'}
                  </li>
                </ul>

                <div className={styles.cardFooter}>
                  <strong>€{Number(coach.hourly_rate).toFixed(0)}/h</strong>
                  <div className="row">
                    <Button
                      type="button"
                      variant={isSelected ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedCoachId(coach.id)}
                    >
                      {isSelected ? 'Selezionato' : 'Seleziona'}
                    </Button>
                    <Link to={`/coach/${coach.id}`}>
                      <Button type="button" variant="ghost" size="sm">
                        Vedi profilo
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </section>
      )}

      <Card className={styles.becomeCoachCta}>
        <div className={styles.becomeCoachOverlay} />
        <div className={styles.becomeCoachContent}>
          <p className={styles.kicker}>Percorso Coach</p>
          <h2>Vuoi diventare coach?</h2>
          <p>
            Invia la tua candidatura e segui il percorso di approvazione per entrare nel marketplace coach.
          </p>
          <Link to="/become-coach">
            <Button>Accedi</Button>
          </Link>
        </div>
      </Card>

      <Card className={styles.coachAreaCard}>
        <h2>Area Coach</h2>
        <p className="muted">Accesso riservato ai coach approvati dall'admin.</p>
        <Button type="button" onClick={openCoachArea}>
          Accedi area coach
        </Button>
      </Card>
    </section>
  );
}

export default CoachPage;

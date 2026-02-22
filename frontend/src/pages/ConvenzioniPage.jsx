import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, ChevronLeft, ChevronRight, MapPin, ShieldCheck } from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { useLocation, useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import { usePageMeta } from '../hooks/usePageMeta';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ConvenzioniContractPanel from '../components/ConvenzioniContractPanel';
import ConvenzioniFilters from '../components/ConvenzioniFilters';
import FeaturedPartnersRow from '../components/FeaturedPartnersRow';
import HowItWorksConvenzioni from '../components/HowItWorksConvenzioni';
import AccountWalletCard from '../components/account/AccountWalletCard';
import ExploreMapToggle from '../components/explore/ExploreMapToggle';
import PartnerCard from '../components/PartnerCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../context/ToastContext';
import { useUserLocation } from '../hooks/useUserLocation';
import { ensureLeafletIcons } from '../features/coach/utils/leafletIconFix';
import { api } from '../services/api';
import { getAuthSession } from '../services/authSession';
import { piggybank } from '../services/piggybank';
import { allConvenzioniLocations, majorCities, partners } from '../data/convenzioniData';
import styles from '../styles/pages/convenzioni.module.css';

const PARTNER_PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='700' viewBox='0 0 1200 700'>" +
      "<defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>" +
      "<stop offset='0%' stop-color='#fff8f0'/><stop offset='100%' stop-color='#ffe0c2'/></linearGradient></defs>" +
      "<rect width='1200' height='700' fill='url(#g)'/>" +
      "<circle cx='1060' cy='90' r='190' fill='#ffb347' fill-opacity='0.52'/>" +
      "<circle cx='120' cy='620' r='220' fill='#ffd4ad' fill-opacity='0.48'/>" +
      "<rect x='80' y='110' width='560' height='84' rx='16' fill='#ffffff' fill-opacity='0.88'/>" +
      "<text x='112' y='162' fill='#1a1a1a' font-size='42' font-family='Arial, sans-serif' font-weight='700'>Motrice Partner</text>" +
      "<rect x='80' y='226' width='920' height='60' rx='12' fill='#ffffff' fill-opacity='0.76'/>" +
      "<text x='112' y='266' fill='#3a3a3a' font-size='28' font-family='Arial, sans-serif'>Immagine struttura non disponibile</text>" +
      "</svg>"
  );
const PARTNERS_PER_PAGE = 6;

function badgeLabel(level) {
  const key = String(level || 'rame').toLowerCase();
  if (key === 'diamante') return 'Diamante';
  if (key === 'oro') return 'Oro';
  if (key === 'argento') return 'Argento';
  if (key === 'bronzo') return 'Bronzo';
  return 'Rame';
}

function weekSeed() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), 0, 1));
  const diff = (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start.getTime()) / (24 * 60 * 60 * 1000);
  return Math.floor((diff + start.getUTCDay() + 1) / 7);
}

function deterministicShuffle(list, seed) {
  const items = [...list];
  let state = (Number(seed || 0) % 2147483647) + 1;
  function next() {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  }
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isPromoExpired(partner) {
  const expiryMs = Date.parse(String(partner?.promo_expires_at || ''));
  return Number.isFinite(expiryMs) ? expiryMs <= Date.now() : false;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const angle =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle));
  return 6371 * c;
}

function buildPartnerTags(partner) {
  const tags = [];
  if (partner.kind) tags.push(String(partner.kind));
  (Array.isArray(partner.offered_courses) ? partner.offered_courses : []).forEach((item) => tags.push(String(item)));
  (Array.isArray(partner.course_promos) ? partner.course_promos : []).forEach((item) => {
    tags.push(String(item.course_type || ''));
  });
  return Array.from(new Set(tags.map(normalizeToken).filter(Boolean)));
}

function ConvenzioniPage() {
  ensureLeafletIcons();

  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { coords, hasLocation, error: locationError, requestLocation } = useUserLocation();

  const [cityFilter, setCityFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortByNearest, setSortByNearest] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvedPartners, setApprovedPartners] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [voucherModalPartner, setVoucherModalPartner] = useState(null);
  const [detailModalPartner, setDetailModalPartner] = useState(null);
  const [isVoucherLoading, setIsVoucherLoading] = useState(false);
  const [wallet, setWallet] = useState(() => piggybank.getWallet());
  const [showPlanPanel, setShowPlanPanel] = useState(false);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isContractCardOpen, setIsContractCardOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [applicationContext, setApplicationContext] = useState({
    isAuthenticated: false,
    status: 'inactive',
    loaded: false,
    application: null,
    partnerProfile: null
  });

  const planPanelRef = useRef(null);
  const resultsRef = useRef(null);
  const joinSectionRef = useRef(null);

  const [joinDraft, setJoinDraft] = useState({
    organization: '',
    type: 'Palestra',
    city: majorCities[0],
    partner_plan: 'free',
    courses_count: 1,
    contact: '',
    message: ''
  });

  usePageMeta({
    title: 'Convenzioni | Motrice',
    description: 'Catalogo partner aderenti: palestre e associazioni convenzionate al progetto Motrice.'
  });

  const allLocations = useMemo(() => allConvenzioniLocations, []);
  const allPartners = useMemo(() => {
    const merged = [...partners, ...(approvedPartners || [])];
    const seen = new Set();
    return merged.filter((item) => {
      const key = String(item.id || `${item.name}:${item.city}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [approvedPartners]);

  const allPartnersWithBadge = useMemo(
    () =>
      allPartners.map((partner) => ({
        ...partner,
        badge_level: String(partner.badge_level || 'rame').toLowerCase(),
        score_rolling_30d: Number(partner.score_rolling_30d || 0),
        metrics_rolling_30d: {
          redeemed_count: Number(partner?.metrics_rolling_30d?.redeemed_count || 0),
          redeemed_amount_cents: Number(partner?.metrics_rolling_30d?.redeemed_amount_cents || 0),
          expired_count: Number(partner?.metrics_rolling_30d?.expired_count || 0),
          redeem_rate: Number(partner?.metrics_rolling_30d?.redeem_rate || 0)
        }
      })),
    [allPartners]
  );

  const tagOptions = useMemo(() => {
    const set = new Set();
    allPartnersWithBadge.forEach((partner) => {
      buildPartnerTags(partner).forEach((tag) => set.add(tag));
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'it'));
  }, [allPartnersWithBadge]);

  const partnerDistanceMap = useMemo(() => {
    if (!coords) return new Map();
    const map = new Map();
    allPartnersWithBadge.forEach((partner) => {
      if (partner.lat == null || partner.lng == null) return;
      map.set(partner.id, haversineKm(coords.lat, coords.lng, Number(partner.lat), Number(partner.lng)));
    });
    return map;
  }, [allPartnersWithBadge, coords]);

  const partnersByFilters = useMemo(() => {
    const normalizedSearch = normalizeToken(searchQuery);
    const normalizedTag = normalizeToken(tagFilter);

    const filtered = allPartnersWithBadge.filter((partner) => {
      if (cityFilter !== 'all' && String(partner.city || '') !== cityFilter) return false;
      if (activeOnly && isPromoExpired(partner)) return false;
      if (normalizedTag !== 'all' && !buildPartnerTags(partner).includes(normalizedTag)) return false;

      if (normalizedSearch.length === 0) return true;

      const searchableText = [
        String(partner.name || ''),
        String(partner.city || ''),
        String(partner.kind || ''),
        String(partner.benefit || ''),
        String(partner.profile_tagline || ''),
        ...(Array.isArray(partner.offered_courses) ? partner.offered_courses : []),
        ...(Array.isArray(partner.course_promos) ? partner.course_promos.map((item) => String(item.course_type || '')) : [])
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });

    return filtered.sort((a, b) => {
      if (sortByNearest && hasLocation) {
        const distanceA = Number(partnerDistanceMap.get(a.id) ?? Number.POSITIVE_INFINITY);
        const distanceB = Number(partnerDistanceMap.get(b.id) ?? Number.POSITIVE_INFINITY);
        if (distanceA !== distanceB) return distanceA - distanceB;
      }
      const activeA = isPromoExpired(a) ? 0 : 1;
      const activeB = isPromoExpired(b) ? 0 : 1;
      if (activeB !== activeA) return activeB - activeA;
      const scoreA = Number(a.score_rolling_30d || 0);
      const scoreB = Number(b.score_rolling_30d || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return String(a.name || '').localeCompare(String(b.name || ''), 'it');
    });
  }, [allPartnersWithBadge, cityFilter, activeOnly, tagFilter, searchQuery, sortByNearest, hasLocation, partnerDistanceMap]);

  const featuredPartners = useMemo(() => {
    const ranked = [...partnersByFilters].sort((a, b) => {
      const activeA = isPromoExpired(a) ? 0 : 1;
      const activeB = isPromoExpired(b) ? 0 : 1;
      if (activeB !== activeA) return activeB - activeA;
      const scoreA = Number(a.score_rolling_30d || 0);
      const scoreB = Number(b.score_rolling_30d || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      const distanceA = Number(partnerDistanceMap.get(a.id) ?? Number.POSITIVE_INFINITY);
      const distanceB = Number(partnerDistanceMap.get(b.id) ?? Number.POSITIVE_INFINITY);
      return distanceA - distanceB;
    });
    return deterministicShuffle(ranked.slice(0, 10), weekSeed()).slice(0, 3);
  }, [partnersByFilters, partnerDistanceMap]);

  const totalPartners = partnersByFilters.length;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalPartners / PARTNERS_PER_PAGE)), [totalPartners]);
  const paginatedPartners = useMemo(() => {
    const start = (currentPage - 1) * PARTNERS_PER_PAGE;
    return partnersByFilters.slice(start, start + PARTNERS_PER_PAGE);
  }, [partnersByFilters, currentPage]);

  const mapPartners = useMemo(
    () => partnersByFilters.filter((partner) => partner.lat != null && partner.lng != null),
    [partnersByFilters]
  );

  const mapCenter = useMemo(() => {
    if (!mapPartners.length) return [42.6, 12.6];
    const lat = mapPartners.reduce((sum, item) => sum + Number(item.lat), 0) / mapPartners.length;
    const lng = mapPartners.reduce((sum, item) => sum + Number(item.lng), 0) / mapPartners.length;
    return [lat, lng];
  }, [mapPartners]);

  const partnerPortalUrl =
    String(import.meta.env.VITE_PARTNER_PORTAL_URL || '').trim() || 'http://localhost:5174';
  const canAccessSubscription = applicationContext.status === 'pending' || applicationContext.status === 'active';
  const activationLabel =
    applicationContext.status === 'active'
      ? 'Attivo'
      : applicationContext.status === 'expired'
        ? 'Scaduto'
        : applicationContext.status === 'pending'
          ? 'Pending'
          : 'Non attivo';

  const subscriptionExpiresAt = applicationContext.partnerProfile?.subscription_expires_at || '';
  const hasExpiry = Number.isFinite(Date.parse(subscriptionExpiresAt));
  const currentView = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('view');
    if (raw === 'wallet' || raw === 'join') return raw;
    return 'catalog';
  }, [location.search]);
  const isWalletView = currentView === 'wallet';
  const isJoinView = currentView === 'join';

  useEffect(() => {
    let active = true;

    async function hydrateApplicationContext() {
      try {
        const fresh = await api.getMyConventionPartnerContext();
        if (!active) return;
        setApplicationContext({
          isAuthenticated: Boolean(fresh?.is_authenticated),
          status: String(fresh?.activation_status || 'inactive'),
          loaded: true,
          application: fresh?.application || null,
          partnerProfile: fresh?.partner_profile || null
        });
      } catch {
        if (!active) return;
        setApplicationContext({
          isAuthenticated: false,
          status: 'inactive',
          loaded: true,
          application: null,
          partnerProfile: null
        });
      }
    }

    hydrateApplicationContext();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadApprovedPartners() {
      try {
        const items = await api.listApprovedConventionPartners();
        if (!active) return;
        setApprovedPartners(Array.isArray(items) ? items : []);
      } catch {
        if (!active) return;
        setApprovedPartners([]);
      } finally {
        if (!active) return;
        setPartnersLoading(false);
      }
    }

    loadApprovedPartners();
    function onFocus() {
      loadApprovedPartners();
    }
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (canAccessSubscription) return;
    setShowPlanPanel(false);
  }, [canAccessSubscription]);

  useEffect(() => {
    setCurrentPage(1);
  }, [cityFilter, tagFilter, searchQuery, activeOnly, sortByNearest]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    function refreshWallet() {
      setWallet(piggybank.getWallet());
    }
    refreshWallet();
    window.addEventListener('focus', refreshWallet);
    return () => {
      window.removeEventListener('focus', refreshWallet);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    setIsMapOpen(media.matches);
    const onChange = (event) => setIsMapOpen(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'n/d';
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function eur(value) {
    return `${(Number(value || 0) / 100).toFixed(2)} EUR`;
  }

  function openSubscriptionPanel() {
    if (!applicationContext.isAuthenticated) {
      showToast('Effettua il login per gestire abbonamento convenzioni.', 'info');
      navigate('/login');
      return;
    }
    if (!canAccessSubscription) {
      if (applicationContext.status === 'expired') {
        showToast('Abbonamento convenzione scaduto: invia una nuova candidatura per verifica.', 'info');
        return;
      }
      showToast('Invia prima la proposta in "Vuoi unirti" per attivare le regole convenzioni.', 'info');
      return;
    }
    setShowPlanPanel(true);
    window.setTimeout(() => {
      planPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  }

  function openPartnerPortal() {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    async function bootstrapPartnerPortal() {
      try {
        const session = getAuthSession();
        if (!session.isAuthenticated || !session.userId) {
          showToast('Effettua il login prima di accedere al portale partner.', 'info');
          popup?.close();
          navigate('/login');
          return;
        }
        const handoff = await api.getPartnerPortalHandoffData();
        const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(handoff)))));
        const url = `${partnerPortalUrl}?handoff=${encoded}`;
        if (popup) popup.location.href = url;
        else window.open(url, '_blank', 'noopener,noreferrer');
      } catch (error) {
        showToast(error.message || 'Impossibile aprire il portale partner', 'error');
        popup?.close();
      }
    }
    bootstrapPartnerPortal();
  }

  async function submitJoinRequest(event) {
    event.preventDefault();
    const session = getAuthSession();
    if (!session.isAuthenticated || !session.userId) {
      showToast('Effettua il login per inviare la proposta convenzioni.', 'info');
      navigate('/login');
      return;
    }
    const org = String(joinDraft.organization || '').trim();
    const contact = String(joinDraft.contact || '').trim();
    if (org.length < 3 || contact.length < 5) {
      showToast('Compila nome struttura e contatto valido prima di inviare.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.submitConventionApplication(joinDraft);
      showToast('Richiesta adesione inviata. Ti contatteremo a breve.', 'success');
      const fresh = await api.getMyConventionPartnerContext();
      setApplicationContext({
        isAuthenticated: Boolean(fresh?.is_authenticated),
        status: String(fresh?.activation_status || 'inactive'),
        loaded: true,
        application: fresh?.application || null,
        partnerProfile: fresh?.partner_profile || null
      });
      setJoinDraft({
        organization: '',
        type: 'Palestra',
        city: majorCities[0],
        partner_plan: 'free',
        courses_count: 1,
        contact: '',
        message: ''
      });
    } catch (error) {
      showToast(error.message || 'Impossibile inviare candidatura', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  function requestOpenVoucher(partner) {
    if (isPromoExpired(partner)) {
      showToast('Promozione partner scaduta: buono non disponibile.', 'error');
      return;
    }
    setVoucherModalPartner(partner);
  }

  function openPartnerDetail(partner) {
    setDetailModalPartner(partner);
  }

  async function openVoucher(partner) {
    const session = getAuthSession();
    if (!session.isAuthenticated || !session.userId) {
      showToast('Per usare il buono devi essere registrato. Effettua il login.', 'info');
      navigate('/login');
      return;
    }

    setIsVoucherLoading(true);
    try {
      const voucher = await api.issueConventionVoucher(partner);
      setWallet(piggybank.getWallet());
      setVoucherModalPartner(null);
      navigate(`/convenzioni/voucher/${voucher.id}`);
    } catch (error) {
      showToast(error.message || 'Impossibile generare il buono', 'error');
    } finally {
      setIsVoucherLoading(false);
    }
  }

  async function findNearMe() {
    const nextCoords = hasLocation ? coords : await requestLocation();
    if (!nextCoords) {
      showToast(locationError || 'Impossibile recuperare la tua posizione.', 'error');
      return;
    }

    setSortByNearest(true);

    const nearest = allPartnersWithBadge
      .filter((item) => item.lat != null && item.lng != null)
      .map((item) => ({
        partner: item,
        distance: haversineKm(nextCoords.lat, nextCoords.lng, Number(item.lat), Number(item.lng))
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.partner;

    if (nearest?.city) setCityFilter(nearest.city);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToJoinForm() {
    joinSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleInvestWallet() {
    try {
      const next = piggybank.investAvailableBalance();
      setWallet(next);
      showToast('Saldo spostato nel budget reinvestito.', 'success');
    } catch (error) {
      showToast(error.message || 'Operazione non disponibile.', 'error');
    }
  }

  function handleWithdrawWallet() {
    try {
      const next = piggybank.withdrawReinvestedBalance();
      setWallet(next);
      showToast('Saldo reinvestito riportato su disponibile.', 'success');
    } catch (error) {
      showToast(error.message || 'Operazione non disponibile.', 'error');
    }
  }

  return (
    <section className={styles.page}>
      <ExploreMapToggle
        activeView={isJoinView ? 'third' : isWalletView ? 'right' : 'left'}
        leftLabel="Convenzioni"
        rightLabel="Salvadanaio"
        thirdLabel="Vuoi unirti?"
        leftTo="/convenzioni"
        rightTo="/convenzioni?view=wallet"
        thirdTo="/convenzioni?view=join"
      />
      {isWalletView ? (
        <AccountWalletCard
          wallet={wallet}
          onInvest={handleInvestWallet}
          onWithdraw={handleWithdrawWallet}
          onPricing={() => navigate('/pricing')}
        />
      ) : (
        <>
          {!isJoinView ? (
            <>
          <Card className={`${styles.hero} ${styles.heroPrimary}`}>
            <div className={styles.heroContent}>
              <div className={styles.heroText}>
                <p className={styles.kicker}>
                  <ShieldCheck size={15} aria-hidden="true" /> Catalogo partner
                </p>
                <div className={`${styles.titleCard} ${styles.titleCardHero}`}>
                  <h1>Convenzioni Motrice</h1>
                </div>
                <p className={styles.heroSubtitle}>Risparmia sullo sport con le strutture convenzionate nella tua zona.</p>
                <p className={styles.heroWalletLine}>
                  Buono: 2 EUR dal saldo reinvestito. Disponibile: <strong>{eur(wallet.available_cents)}</strong>
                </p>
                <div className={styles.heroActionsPrimary}>
                  <Button type="button" onClick={findNearMe} aria-label="Trova offerte vicino a me">
                    Trova vicino a me
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowHowItWorksModal(true)}
                    aria-label="Apri guida come funziona"
                  >
                    Come funziona
                  </Button>
                </div>
              </div>
              <img
                className={styles.heroImage}
                src="https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=480&h=320&fit=crop&q=80"
                alt=""
                loading="lazy"
              />
            </div>
          </Card>

          <Card className={styles.quickFiltersCard}>
            <ConvenzioniFilters
              searchQuery={searchQuery}
              onSearchChange={(value) => setSearchQuery(String(value || '').slice(0, 120))}
              cityFilter={cityFilter}
              onCityChange={setCityFilter}
              tagFilter={tagFilter}
              onTagChange={setTagFilter}
              activeOnly={activeOnly}
              onActiveOnlyChange={setActiveOnly}
              cityOptions={allLocations}
              tagOptions={tagOptions}
              resultCount={partnersByFilters.length}
            />
          </Card>

          <FeaturedPartnersRow
            partners={featuredPartners}
            onOpenDetail={openPartnerDetail}
            onOpenVoucher={requestOpenVoucher}
            isPromoExpired={isPromoExpired}
          />

          <section ref={resultsRef} className={styles.resultsSection} aria-label="Risultati convenzioni">
            <div className={styles.sectionHeadInline}>
              <div className={styles.titleCard}>
                <h2>Partner disponibili</h2>
              </div>
              <p className={styles.sectionLead}>{partnersByFilters.length} risultati</p>
            </div>

            {partnersLoading ? (
              <LoadingSkeleton rows={6} variant="list" />
            ) : partnersByFilters.length === 0 ? (
              <Card className={styles.searchEmpty}>
                <p className={styles.searchHint}>Nessuna convenzione con i filtri correnti.</p>
                <div className={styles.searchEmptyActions}>
                  <Button type="button" variant="secondary" onClick={() => setCityFilter('all')}>
                    Reset citta
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setTagFilter('all')}>
                    Reset sport/tag
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setSearchQuery('')}>
                    Azzera ricerca
                  </Button>
                </div>
              </Card>
            ) : (
              <>
                <div className={styles.partnersGrid}>
                  {paginatedPartners.map((partner) => (
                    <PartnerCard
                      key={`partner-${partner.id}`}
                      partner={partner}
                      placeholderImage={PARTNER_PLACEHOLDER_IMAGE}
                      distanceKm={partnerDistanceMap.get(partner.id) ?? null}
                      promoExpired={isPromoExpired(partner)}
                      onOpenDetail={openPartnerDetail}
                      onOpenVoucher={requestOpenVoucher}
                    />
                  ))}
                </div>
                <div className={styles.paginationCompact} aria-label="Paginazione partner convenzioni">
                  <button
                    type="button"
                    className={styles.pageArrow}
                    onClick={() => {
                      if (totalPages <= 1) return;
                      setCurrentPage((prev) => (prev <= 1 ? totalPages : prev - 1));
                    }}
                    aria-label="Pagina precedente partner"
                    aria-disabled={totalPages <= 1}
                    disabled={totalPages <= 1}
                  >
                    <ChevronLeft size={18} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                  <p className={styles.paginationCompactInfo}>
                    Pag {currentPage}/{totalPages} · {totalPartners} partner
                  </p>
                  <button
                    type="button"
                    className={styles.pageArrow}
                    onClick={() => {
                      if (totalPages <= 1) return;
                      setCurrentPage((prev) => (prev >= totalPages ? 1 : prev + 1));
                    }}
                    aria-label="Pagina successiva partner"
                    aria-disabled={totalPages <= 1}
                    disabled={totalPages <= 1}
                  >
                    <ChevronRight size={18} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </section>

          <Card className={styles.mapCard}>
            <div className={styles.mapHead}>
              <div className={styles.titleCard}>
                <h2>Vedi sulla mappa</h2>
              </div>
              <button
                type="button"
                className={styles.mapToggle}
                onClick={() => setIsMapOpen((prev) => !prev)}
                aria-expanded={isMapOpen}
                aria-controls="convenzioni-map-content"
              >
                {isMapOpen ? 'Chiudi mappa' : 'Apri mappa'}
              </button>
            </div>

            {isMapOpen ? (
              <div id="convenzioni-map-content">
                {mapPartners.length === 0 ? (
                  <p className={styles.mapHint}>Nessuna struttura con coordinate disponibili per i filtri selezionati.</p>
                ) : (
                  <MapContainer center={mapCenter} zoom={cityFilter === 'all' ? 5.8 : 11} className={styles.mapFrame}>
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {mapPartners.map((partner) => (
                      <Marker key={`map-${partner.id}`} position={[partner.lat, partner.lng]}>
                        <Popup>
                          <strong>{partner.name}</strong>
                          <br />
                          {partner.city} · {partner.kind}
                          <br />
                          <button type="button" onClick={() => openPartnerDetail(partner)}>
                            Apri offerte
                          </button>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                )}
              </div>
            ) : null}
          </Card>

          <Card className={styles.howItWorksCard}>
            <HowItWorksConvenzioni />
          </Card>
            </>
          ) : null}

          {isJoinView ? (
            <>
          <Card className={styles.partnerHeroCard}>
            <p className={styles.kicker}>
              <Building2 size={15} aria-hidden="true" /> Area partner
            </p>
            <div className={`${styles.titleCard} ${styles.titleCardHero}`}>
              <h1>Vuoi unirti a Motrice?</h1>
            </div>
            <p className="muted">Attiva promozioni locali, genera voucher QR e raggiungi nuovi sportivi nella tua citta.</p>
            <div className={styles.partnerHeroGrid}>
              <p className={styles.partnerHeroStat}>
                <strong>{allPartnersWithBadge.length}</strong>
                <span>partner nel catalogo</span>
              </p>
              <p className={styles.partnerHeroStat}>
                <strong>1-3 giorni</strong>
                <span>tempo medio verifica</span>
              </p>
              <p className={styles.partnerHeroStat}>
                <strong>{joinDraft.partner_plan === 'premium' ? Number(joinDraft.courses_count || 1) * 7 : 2}</strong>
                <span>promo disponibili con piano scelto</span>
              </p>
            </div>
            <div className={styles.heroActionsPrimary}>
              <Button type="button" onClick={scrollToJoinForm}>
                Invia candidatura
              </Button>
              <Button type="button" variant="secondary" onClick={openPartnerPortal}>
                Apri portale partner
              </Button>
            </div>
          </Card>

          <Card className={styles.partnerBenefitsCard}>
            <div className={styles.benefitGrid}>
              <article className={styles.benefitItem}>
                <h3>Visibilita locale</h3>
                <p>Compari in catalogo e mappa convenzioni con profilo e corsi.</p>
              </article>
              <article className={styles.benefitItem}>
                <h3>Voucher QR</h3>
                <p>Promo verificabili in struttura con validita temporale controllata.</p>
              </article>
              <article className={styles.benefitItem}>
                <h3>Gestione piani</h3>
                <p>Passa da Free a Premium per aumentare numero e copertura promo.</p>
              </article>
            </div>
          </Card>

          <Card className={styles.rulesCard}>
        <div className={styles.rulesHeader}>
          <div>
            <div className={styles.titleCard}>
              <h2>Regole convenzioni</h2>
            </div>
            <p className={styles.rulesSubtitle}>Limiti, piani e scadenze in sintesi.</p>
          </div>
          <span
            className={`${styles.ruleStateChip} ${
              applicationContext.status === 'active'
                ? styles.ruleStateActive
                : applicationContext.status === 'expired'
                  ? styles.ruleStateExpired
                  : applicationContext.status === 'pending'
                    ? styles.ruleStatePending
                    : styles.ruleStateInactive
            }`}
          >
            {activationLabel}
          </span>
        </div>
        {!canAccessSubscription ? (
          <p className={styles.rulesInfo}>
            {applicationContext.status === 'expired'
              ? 'Abbonamento convenzione scaduto: invia una nuova candidatura e attendi verifica.'
              : !applicationContext.isAuthenticated
                ? 'Le regole sono non attive: effettua login e invia una proposta in “Vuoi unirti”.'
                : 'Le regole sono non attive finche non invii una proposta in “Vuoi unirti”.'}
          </p>
        ) : null}
        {applicationContext.status === 'active' && hasExpiry ? (
          <p className={styles.rulesTimer}>
            Abbonamento convenzione valido fino al {formatDateTime(subscriptionExpiresAt)}.
          </p>
        ) : null}
        <div className={styles.rulesGrid}>
          <article className={styles.ruleItem}>
            <h3>Free Partner</h3>
            <p>Fino a 2 promo disponibili.</p>
          </article>
          <article className={styles.ruleItem}>
            <h3>Premium Partner</h3>
            <p>Fino a 7 promo per ogni corso disponibile dichiarato (max 5 corsi).</p>
          </article>
          <article className={styles.ruleItem}>
            <h3>Voucher QR</h3>
            <p>Validi solo per utenti registrati.</p>
          </article>
          <article className={styles.ruleItem}>
            <h3>Timer Voucher</h3>
            <p>1 ora e 30 minuti dalla generazione del codice.</p>
          </article>
          <article className={styles.ruleItem}>
            <h3>Scadenza Promo</h3>
            <p>Il voucher si emette solo se la promozione partner e ancora attiva.</p>
          </article>
        </div>
        <div className={styles.rulesActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={openSubscriptionPanel}
            disabled={!canAccessSubscription || !applicationContext.loaded}
          >
            Abbonamento convenzioni
          </Button>
        </div>
          </Card>

          {showPlanPanel && canAccessSubscription ? (
            <Card className={styles.planPanel} ref={planPanelRef}>
          <div className={styles.planHeader}>
            <div className={styles.titleCard}>
              <h2>Piano e upgrade convenzioni</h2>
            </div>
            <span className={styles.planActiveChip}>{joinDraft.partner_plan === 'premium' ? 'PREMIUM' : 'FREE'}</span>
          </div>
          <div className={styles.planSummary}>
            <p className={styles.planMeta}>
              Piano selezionato: <strong>{joinDraft.partner_plan === 'premium' ? 'Premium' : 'Free'}</strong>
            </p>
            <p className={styles.planMeta}>
              Promo disponibili:{' '}
              <strong>{joinDraft.partner_plan === 'premium' ? Number(joinDraft.courses_count || 1) * 7 : 2}</strong>
            </p>
          </div>
          <div className={styles.pricingGrid}>
            <article className={`${styles.pricingCard} ${styles.planCardFree}`}>
              <h3>Convenzioni Free</h3>
              <p className={styles.planPrice}>0 EUR/mese</p>
              <ul className={styles.planList}>
                <li>Fino a 2 promo disponibili</li>
                <li>Presenza catalogo convenzioni</li>
                <li>Voucher con validita standard</li>
              </ul>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setJoinDraft((prev) => ({ ...prev, partner_plan: 'free' }))}
              >
                Attiva Free
              </Button>
            </article>

            <article className={`${styles.pricingCard} ${styles.planCardPremium}`}>
              <h3>Convenzioni Premium</h3>
              <p className={styles.planPrice}>Upgrade partner</p>
              <ul className={styles.planList}>
                <li>Fino a 7 promo per ogni corso disponibile (max 5 corsi)</li>
                <li>Maggiore spinta commerciale su promo e iniziative</li>
                <li>Gestione campagne partner avanzata</li>
              </ul>
              <Button
                type="button"
                onClick={() =>
                  setJoinDraft((prev) => ({
                    ...prev,
                    partner_plan: 'premium',
                    courses_count: Math.max(1, Math.min(5, Number(prev.courses_count || 1)))
                  }))
                }
              >
                Attiva Premium
              </Button>
            </article>
          </div>
          <div className={styles.rulesActions}>
            <Button type="button" variant="ghost" onClick={() => setShowPlanPanel(false)}>
              Nascondi abbonamento
            </Button>
          </div>
            </Card>
          ) : null}

          <Card className={styles.partnerAreaIntro}>
        <div className={styles.joinHead}>
          <div className={styles.titleCard}>
            <h2>Sei una palestra/ASD/coach?</h2>
          </div>
          <Button type="button" variant="secondary" onClick={scrollToJoinForm}>
            Richiedi convenzione
          </Button>
        </div>
        <p className="muted">Area partner separata: invia candidatura senza interrompere il flusso utente.</p>
          </Card>

          <Card className={styles.joinCard} ref={joinSectionRef}>
        <div className={styles.joinHead}>
          <div>
            <div className={styles.titleCard}>
              <h2>Vuoi unirti?</h2>
            </div>
            <p className={styles.joinSubtitle}>Completa il form e ricevi risposta in 1-3 giorni.</p>
          </div>
          <Button type="button" variant="secondary" onClick={openPartnerPortal}>
            Accedi al portale
          </Button>
        </div>
        <form className={styles.joinForm} onSubmit={submitJoinRequest}>
          <p className={styles.joinStepLabel}>Step 1 · Dati struttura</p>
          <fieldset className={styles.joinFieldset}>
            <legend>Dati struttura</legend>
            <label>
              Nome struttura/associazione
              <input
                value={joinDraft.organization}
                onChange={(e) => setJoinDraft((prev) => ({ ...prev, organization: e.target.value.slice(0, 100) }))}
                placeholder="Es. Centro Sportivo Aurora"
              />
            </label>
            <label>
              Tipologia
              <select value={joinDraft.type} onChange={(e) => setJoinDraft((prev) => ({ ...prev, type: e.target.value }))}>
                <option value="Palestra">Palestra</option>
                <option value="Associazione">Associazione</option>
              </select>
            </label>
            <label>
              Citta
              <select value={joinDraft.city} onChange={(e) => setJoinDraft((prev) => ({ ...prev, city: e.target.value }))}>
                {allLocations.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <p className={styles.joinStepLabel}>Step 2 · Piano e contatto</p>
          <fieldset className={styles.joinFieldset}>
            <legend>Piano e contatto</legend>
            <label>
              Piano partner
              <select
                value={joinDraft.partner_plan}
                onChange={(e) =>
                  setJoinDraft((prev) => ({
                    ...prev,
                    partner_plan: e.target.value
                  }))
                }
              >
                <option value="free">Free (2 promo)</option>
                <option value="premium">Premium (7 promo per corso, max 5 corsi)</option>
              </select>
            </label>
            {joinDraft.partner_plan === 'premium' ? (
              <label>
                Numero corsi disponibili
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={joinDraft.courses_count}
                  onChange={(e) =>
                    setJoinDraft((prev) => ({
                      ...prev,
                      courses_count: Math.max(1, Math.min(5, Number(e.target.value) || 1))
                    }))
                  }
                />
              </label>
            ) : null}
            <label>
              Contatto email/telefono
              <input
                value={joinDraft.contact}
                onChange={(e) => setJoinDraft((prev) => ({ ...prev, contact: e.target.value.slice(0, 120) }))}
                placeholder="partner@example.com"
              />
            </label>
            <label className={styles.joinMessage}>
              Messaggio
              <textarea
                rows="3"
                value={joinDraft.message}
                onChange={(e) => setJoinDraft((prev) => ({ ...prev, message: e.target.value.slice(0, 500) }))}
                placeholder="Descrivi struttura, capienza, servizi e proposta convenzione."
              />
            </label>
          </fieldset>

          <p className={styles.planRuleHint}>
            {joinDraft.partner_plan === 'free'
              ? 'Regola attiva: piano Free con 2 promo disponibili.'
              : `Regola attiva: piano Premium con fino a ${Number(joinDraft.courses_count || 1) * 7} promo disponibili (7 per corso).`}
          </p>
          <Button type="submit" className={styles.joinSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Invio...' : 'Invia candidatura partner'}
          </Button>
        </form>
          </Card>

          <Card className={styles.joinCard}>
        <button
          type="button"
          className={styles.contractCardToggle}
          onClick={() => setIsContractCardOpen((prev) => !prev)}
          aria-expanded={isContractCardOpen}
          aria-controls="convenzioni-contract-card-body"
        >
          <span className={styles.contractCardTitleWrap}>
            <strong className={styles.contractCardTitle}>Contratto</strong>
            <span className={styles.contractCardHint}>Apri o chiudi sezione</span>
          </span>
          <span
            className={`${styles.contractCardIcon} ${isContractCardOpen ? styles.contractCardIconOpen : ''}`}
            aria-hidden="true"
          >
            <ChevronDown size={24} strokeWidth={2.6} />
          </span>
        </button>
        <div
          id="convenzioni-contract-card-body"
          className={`${styles.contractCardBody} ${isContractCardOpen ? styles.contractCardBodyOpen : ''}`}
        >
          <ConvenzioniContractPanel
            isAuthenticated={applicationContext.isAuthenticated}
            applicationStatus={applicationContext.status}
            partnerPlan={applicationContext.partnerProfile?.plan}
            refreshKey={`${applicationContext.status}:${applicationContext.application?.id || ''}`}
            formatDateTime={formatDateTime}
            showToast={showToast}
          />
        </div>
          </Card>
            </>
          ) : null}
        </>
      )}

      <Modal
        open={Boolean(voucherModalPartner)}
        title="Apri codice promozione"
        onClose={() => {
          if (isVoucherLoading) return;
          setVoucherModalPartner(null);
        }}
        onConfirm={() => openVoucher(voucherModalPartner)}
        confirmText={isVoucherLoading ? 'Apertura...' : 'Conferma e apri codice'}
        confirmDisabled={!voucherModalPartner || isVoucherLoading}
      >
        <p className={styles.modalWarning}>
          Aprendo il codice si avvia subito un timer di <strong>1 ora e 30 minuti</strong>. Il voucher deve essere
          validato entro questa finestra, altrimenti scade.
        </p>
        {voucherModalPartner?.promo_expires_at ? (
          <p className={styles.modalPromoDate}>
            Scadenza promozione partner: <strong>{formatDateTime(voucherModalPartner.promo_expires_at)}</strong>
          </p>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(detailModalPartner)}
        title={detailModalPartner?.name || 'Scheda associazione'}
        onClose={() => setDetailModalPartner(null)}
        onConfirm={() => setDetailModalPartner(null)}
        confirmText="Chiudi"
      >
        {detailModalPartner ? (
          <div className={styles.partnerDetail}>
            <img
              className={styles.partnerDetailImage}
              src={String(detailModalPartner.profile_image_data_url || '') || PARTNER_PLACEHOLDER_IMAGE}
              alt={`Immagine ${detailModalPartner.name}`}
              loading="lazy"
            />
            <div className={styles.partnerDetailHeader}>
              <p className={styles.partnerDetailLine}>
                <strong>Tipologia:</strong> {detailModalPartner.kind || 'n/d'}
              </p>
              <p className={styles.partnerDetailLine}>
                <strong>Citta:</strong> {detailModalPartner.city || 'n/d'}
              </p>
              <p className={styles.partnerDetailLine}>
                <strong>Badge:</strong> {badgeLabel(detailModalPartner.badge_level)}
              </p>
            </div>
            {detailModalPartner.profile_tagline ? (
              <p className={styles.partnerDetailLine}>{detailModalPartner.profile_tagline}</p>
            ) : null}
            {detailModalPartner.profile_description ? (
              <p className={styles.partnerDetailLine}>{detailModalPartner.profile_description}</p>
            ) : null}
            <div className={styles.partnerDetailContacts}>
              {detailModalPartner.profile_address ? (
                <p className={styles.partnerDetailLine}>
                  <strong>Indirizzo:</strong> {detailModalPartner.profile_address}
                </p>
              ) : null}
              {detailModalPartner.profile_phone ? (
                <p className={styles.partnerDetailLine}>
                  <strong>Telefono:</strong> {detailModalPartner.profile_phone}
                </p>
              ) : null}
              {detailModalPartner.profile_email ? (
                <p className={styles.partnerDetailLine}>
                  <strong>Email:</strong> {detailModalPartner.profile_email}
                </p>
              ) : null}
              {detailModalPartner.profile_website ? (
                <p className={styles.partnerDetailLine}>
                  <strong>Sito:</strong> {detailModalPartner.profile_website}
                </p>
              ) : null}
            </div>
            <div className={styles.partnerDetailCourses}>
              <p className={styles.promoCoursesTitle}>Corsi standard</p>
              <div className={styles.courseChipWrap}>
                {(Array.isArray(detailModalPartner.offered_courses) ? detailModalPartner.offered_courses : [])
                  .slice(0, 20)
                  .map((course, index) => (
                    <span className={styles.courseChip} key={`${detailModalPartner.id}-course-${course}-${index}`}>
                      {course}
                    </span>
                  ))}
              </div>
              <p className={styles.promoCoursesTitle}>Corsi promo</p>
              <div className={styles.courseChipWrap}>
                {(Array.isArray(detailModalPartner.course_promos) ? detailModalPartner.course_promos : [])
                  .slice(0, 20)
                  .map((promo) => (
                    <span className={styles.courseChipPromo} key={`${detailModalPartner.id}-promo-${promo.id}`}>
                      {promo.course_type} · {Number(promo.discounted_price_eur || 0).toFixed(2)} EUR
                    </span>
                  ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showHowItWorksModal}
        title="Come funzionano le convenzioni"
        onClose={() => setShowHowItWorksModal(false)}
        onConfirm={() => setShowHowItWorksModal(false)}
        confirmText="Chiudi"
      >
        <HowItWorksConvenzioni title="Flusso utente" compact />
      </Modal>
    </section>
  );
}

export default ConvenzioniPage;

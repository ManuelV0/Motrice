import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Award, Camera, ChevronDown, Cpu, PlayCircle, Save, Sparkles, TrendingUp } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useBilling } from '../context/BillingContext';
import { api } from '../services/api';
import { piggybank } from '../services/piggybank';
import {
  PLAN_DEFINITIONS,
  REWARDED_DAILY_LIMIT,
  REWARDED_DAILY_UNLOCK_LIMIT,
  REWARDED_UNLOCK_MINUTES,
  REWARDED_VIDEOS_REQUIRED
} from '../services/entitlements';
import { coachApi } from '../features/coach/services/coachApi';
import Card from '../components/Card';
import Button from '../components/Button';
import LoadingSkeleton from '../components/LoadingSkeleton';
import RewardedVideoDemoModal from '../components/RewardedVideoDemoModal';
import AccountHero from '../components/account/AccountHero';
import AccountSectionToolbar from '../components/account/AccountSectionToolbar';
import AccountFeaturedActions from '../components/account/AccountFeaturedActions';
import AccountQuickActions from '../components/account/AccountQuickActions';
import AccountReliabilityCard from '../components/account/AccountReliabilityCard';
import AccountCard from '../components/account/AccountCard';
import { useToast } from '../context/ToastContext';
import avatarPlaceholder from '../assets/avatar-placeholder.svg';
import {
  getTutorialState,
  markStepByAction,
  startTutorial
} from '../services/tutorialMode';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';
import { ai, AI_PROVIDER_MODE, getAiSettings, updateAiSettings } from '../services/ai';
import styles from '../styles/pages/account.module.css';

const THEME_KEY = 'motrice.theme';
const CHAT_SLOT_OPTIONS = [
  'Lunedi 09:00-11:00',
  'Lunedi 18:00-20:00',
  'Martedi 09:00-11:00',
  'Martedi 18:00-20:00',
  'Mercoledi 09:00-11:00',
  'Mercoledi 18:00-20:00',
  'Giovedi 09:00-11:00',
  'Giovedi 18:00-20:00',
  'Venerdi 09:00-11:00',
  'Venerdi 18:00-20:00',
  'Sabato 10:00-12:00',
  'Sabato 16:00-18:00'
];

function AccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    subscription,
    entitlements,
    activatePremium,
    activateFreeWithAds,
    activateFreeOnly,
    activateRewardedUnlock,
    isPremium
  } = useBilling();

  const [theme, setTheme] = useState(() => safeStorageGet(THEME_KEY) || 'dark');
  const [profile, setProfile] = useState({
    display_name: 'Tu',
    bio: '',
    avatar_url: '',
    chat_slots: [],
    city: '',
    goal: '',
    attended: 0,
    no_show: 0,
    cancelled: 0,
    reliability: 0
  });
  const [draft, setDraft] = useState({
    display_name: 'Tu',
    bio: '',
    avatar_url: '',
    chat_slots: [],
    city: '',
    goal: ''
  });
  const [coachApplicationStatus, setCoachApplicationStatus] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(true);
  const [isCoachSlotsOpen, setIsCoachSlotsOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [xpState, setXpState] = useState(null);
  const [sportsCatalog, setSportsCatalog] = useState([]);
  const [showAllSportXp, setShowAllSportXp] = useState(false);
  const [wallet, setWallet] = useState(() => piggybank.getWallet());
  const [tutorialState, setTutorialState] = useState(() => getTutorialState());
  const [sectionQuery, setSectionQuery] = useState('');
  const [sectionCategory, setSectionCategory] = useState('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [aiSettings, setAiSettings] = useState(() => getAiSettings());
  const [aiAvailability, setAiAvailability] = useState({ available: false, reason: 'In verifica...' });
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState('');

  const profileRef = useRef(null);
  const planRef = useRef(null);
  const settingsRef = useRef(null);

  const useDemoVideoFlow = String(import.meta.env.VITE_REWARDED_REQUIRE_VIDEO || 'true').toLowerCase() !== 'false';

  usePageMeta({
    title: 'Account | Motrice',
    description: 'Gestisci piano, stato abbonamento e funzionalita attive.'
  });

  useEffect(() => {
    let active = true;

    async function hydrate() {
      setAccountLoading(true);
      const [profileRes, xpRes, sportsRes, coachRes] = await Promise.allSettled([
        api.getLocalProfile(),
        api.getXpState(),
        api.listSports(),
        coachApi.getMyCoachApplication()
      ]);
      if (!active) return;

      if (profileRes.status === 'fulfilled') {
        const data = profileRes.value;
        const next = {
          display_name: data?.display_name || data?.name || 'Tu',
          bio: data?.bio || '',
          avatar_url: data?.avatar_url || '',
          chat_slots: Array.isArray(data?.chat_slots) ? data.chat_slots : [],
          city: data?.city || '',
          goal: data?.goal || '',
          attended: Number(data?.attended || 0),
          no_show: Number(data?.no_show || 0),
          cancelled: Number(data?.cancelled || 0),
          reliability: Number(data?.reliability || data?.reliability_score || 0)
        };
        setProfile(next);
        setDraft(next);
        setEditingProfile(!(next.bio || next.avatar_url));
      }

      if (xpRes.status === 'fulfilled') setXpState(xpRes.value);
      else setXpState(null);

      if (sportsRes.status === 'fulfilled') setSportsCatalog(sportsRes.value);
      else setSportsCatalog([]);

      if (coachRes.status === 'fulfilled' && coachRes.value?.has_application) {
        setCoachApplicationStatus(coachRes.value.status || null);
      } else {
        setCoachApplicationStatus(null);
      }

      setWallet(piggybank.getWallet());
      setAccountLoading(false);
    }

    hydrate();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function refreshWallet() {
      setWallet(piggybank.getWallet());
    }
    window.addEventListener('focus', refreshWallet);
    return () => window.removeEventListener('focus', refreshWallet);
  }, []);

  useEffect(() => {
    if (accountLoading) return;
    const section = new URLSearchParams(location.search).get('section');
    const shouldOpenWallet = location.hash === '#wallet' || section === 'wallet';
    if (!shouldOpenWallet) return;
    navigate('/convenzioni?view=wallet', { replace: true });
  }, [accountLoading, location.hash, location.search, navigate]);

  const isCoachApproved = coachApplicationStatus === 'approved';

  useEffect(() => {
    setIsCoachSlotsOpen(Boolean(isCoachApproved));
  }, [isCoachApproved]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    safeStorageSet(THEME_KEY, theme);
  }, [theme]);

  const unlockEndsMs = Date.parse(subscription.rewarded_status?.unlock_ends_at || '');
  const hasUnlockWindow = Number.isFinite(unlockEndsMs) && unlockEndsMs > Date.now();

  useEffect(() => {
    if (!hasUnlockWindow) return undefined;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [hasUnlockWindow]);

  const unlockRemainingMs = Number.isFinite(unlockEndsMs) ? Math.max(0, unlockEndsMs - nowMs) : 0;
  const unlockRemainingMinutes = Math.floor(unlockRemainingMs / 60000);
  const unlockRemainingSeconds = Math.floor((unlockRemainingMs % 60000) / 1000);
  const unlockRemainingLabel = `${String(unlockRemainingMinutes).padStart(2, '0')}:${String(unlockRemainingSeconds).padStart(2, '0')}`;
  const isTutorialActive = tutorialState.status === 'active';

  const sportLabels = useMemo(() => {
    const next = {
      generic: 'Generic',
      fitness: 'Fitness'
    };
    sportsCatalog.forEach((sport) => {
      next[String(sport.id).toLowerCase()] = sport.name;
      next[String(sport.name || '').toLowerCase()] = sport.name;
    });
    return next;
  }, [sportsCatalog]);

  const xpSportsRows = useMemo(() => {
    if (!xpState?.xp_by_sport || typeof xpState.xp_by_sport !== 'object') return [];
    return Object.entries(xpState.xp_by_sport)
      .map(([sportId, xp]) => {
        const key = String(sportId || '').toLowerCase();
        const rawLabel = sportLabels[key] || String(sportId || 'Generic');
        return {
          sportId,
          label: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1),
          xp: Number(xp || 0)
        };
      })
      .sort((a, b) => b.xp - a.xp);
  }, [sportLabels, xpState]);

  const xpTopRows = xpSportsRows.slice(0, 3);
  const xpHistoryRows = Array.isArray(xpState?.xp_history) ? xpState.xp_history.slice(0, 5) : [];

  const sectionsCatalog = useMemo(
    () => [
      { id: 'profile', category: 'profilo', label: 'Profilo', keywords: ['profilo', 'bio', 'avatar'], available: true },
      { id: 'plan', category: 'billing', label: 'Piano', keywords: ['piano', 'premium', 'abbonamento'], available: true },
      { id: 'reliability', category: 'growth', label: 'Affidabilita', keywords: ['reliability', 'xp', 'badge'], available: true },
      { id: 'ai', category: 'utility', label: 'AI Locale', keywords: ['ai', 'locale', 'provider', 'beta'], available: true },
      { id: 'theme', category: 'utility', label: 'Tema', keywords: ['tema', 'dark', 'light'], available: true },
      { id: 'support', category: 'utility', label: 'Supporto', keywords: ['supporto', 'faq', 'contatti'], available: true }
    ],
    []
  );

  const visibleSectionIds = useMemo(() => {
    const q = String(sectionQuery || '').trim().toLowerCase();
    return sectionsCatalog
      .filter((section) => (sectionCategory === 'all' ? true : section.category === sectionCategory))
      .filter((section) => (onlyAvailable ? section.available : true))
      .filter((section) => {
        if (!q) return true;
        return [section.label, ...section.keywords].join(' ').toLowerCase().includes(q);
      })
      .map((section) => section.id);
  }, [sectionsCatalog, sectionCategory, onlyAvailable, sectionQuery]);

  const featuredActions = useMemo(
    () => [
      {
        id: 'profile',
        title: 'Completa il profilo',
        description: 'Aggiungi bio e immagine per aumentare affidabilita.',
        label: 'Vai al profilo',
        onClick: () => profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
      {
        id: 'wallet',
        title: Number(wallet.reinvested_cents || 0) > 0 ? 'Gestisci salvadanaio' : 'Attiva reinvestimento',
        description: 'Controlla saldo disponibile e budget reinvestito.',
        label: 'Apri salvadanaio',
        onClick: () => navigate('/convenzioni?view=wallet')
      },
      {
        id: 'plan',
        title: isPremium ? 'Premium attivo' : 'Passa a Premium',
        description: isPremium ? 'Consulta i benefici attivi.' : 'Sblocca feature avanzate e chat coach.',
        label: 'Gestisci piano',
        onClick: () => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    ],
    [isPremium, navigate, wallet.reinvested_cents]
  );

  useEffect(() => {
    let active = true;
    ai.getAvailability()
      .then((status) => {
        if (!active) return;
        setAiAvailability(status);
      })
      .catch((error) => {
        if (!active) return;
        setAiAvailability({
          available: false,
          reason: error.message || 'Local provider non disponibile'
        });
      });
    return () => {
      active = false;
    };
  }, [aiSettings.enableLocalAI]);

  function onChangeAiSettings(patch) {
    const next = updateAiSettings(patch);
    setAiSettings(next);
  }

  async function runAiTest() {
    setAiTestLoading(true);
    setAiTestResult('');
    try {
      const result = await ai.generateText({
        purpose: 'event_description',
        prompt: 'Scrivi una descrizione evento in una frase',
        maxTokens: 36
      });
      setAiTestResult(`${result.text} (${result.provider})`);
      showToast('Test AI completato', 'success');
    } catch (error) {
      setAiTestResult(`Errore: ${error.message || 'AI non disponibile'}`);
      showToast(error.message || 'AI non disponibile', 'error');
    } finally {
      setAiTestLoading(false);
    }
  }

  const entitlementsRows = useMemo(
    () => [
      { label: 'Filtri avanzati', value: entitlements.canUseAdvancedFilters },
      { label: 'Agenda Week/Month', value: entitlements.canUseAgendaWeekMonth },
      { label: 'Export ICS', value: entitlements.canExportICS },
      { label: 'Notifiche', value: entitlements.canUseNotifications },
      { label: 'Chat coach', value: entitlements.canUseCoachChat }
    ],
    [entitlements]
  );

  function isSectionVisible(id) {
    return visibleSectionIds.includes(id);
  }

  function formatXpHistoryLabel(item) {
    const type = String(item?.type || '');
    if (type === 'attendance_confirmed') return 'Presenza evento confermata';
    if (type === 'attendance_no_show') return 'No-show evento';
    if (type === 'cancel_late') return 'Cancellazione tardiva';
    if (type === 'voucher_redeemed') return 'Voucher convenzione riscattato';
    if (type === 'coach_checkin') return 'Check-in coach registrato';
    return 'Aggiornamento XP';
  }

  async function onSaveProfile() {
    setSavingProfile(true);
    try {
      const payload = isCoachApproved ? draft : { ...draft, chat_slots: profile.chat_slots || [] };
      const updated = await api.updateLocalProfile(payload);
      const next = {
        display_name: updated?.display_name || updated?.name || draft.display_name || 'Tu',
        bio: updated?.bio || '',
        avatar_url: updated?.avatar_url || '',
        chat_slots: Array.isArray(updated?.chat_slots) ? updated.chat_slots : [],
        city: updated?.city || '',
        goal: updated?.goal || '',
        attended: Number(updated?.attended || profile.attended || 0),
        no_show: Number(updated?.no_show || profile.no_show || 0),
        cancelled: Number(updated?.cancelled || profile.cancelled || 0),
        reliability: Number(updated?.reliability || updated?.reliability_score || profile.reliability || 0)
      };
      setProfile(next);
      setDraft(next);
      setEditingProfile(false);
      if (String(next.display_name || '').trim().length >= 2 && String(next.bio || '').trim().length >= 10) {
        markStepByAction('profile_completed');
      }
      showToast('Profilo aggiornato', 'success');
    } catch (error) {
      showToast(error.message || 'Errore aggiornamento profilo', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function onAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!String(file.type || '').startsWith('image/')) {
      showToast('Carica un file immagine valido', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('Immagine troppo pesante: massimo 2MB', 'error');
      return;
    }

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Impossibile leggere immagine'));
        reader.readAsDataURL(file);
      });
      setDraft((prev) => ({ ...prev, avatar_url: dataUrl }));
    } catch (error) {
      showToast(error.message || 'Errore lettura immagine', 'error');
    }
  }

  function onUnlockWithVideo() {
    if (useDemoVideoFlow) {
      setVideoModalOpen(true);
      return;
    }
    redeemRewardedUnlock();
  }

  function redeemRewardedUnlock() {
    try {
      const next = activateRewardedUnlock();
      const result = next?.rewarded_result;
      if (result?.unlocked_now) {
        showToast(`Contenuti Pro sbloccati per ${REWARDED_UNLOCK_MINUTES} minuti.`, 'success');
        return;
      }
      if (result) {
        showToast(`Video completato: ${result.progress_videos}/${result.videos_required}.`, 'success');
        return;
      }
      showToast('Video completato.', 'success');
    } catch (error) {
      showToast(error.message || 'Video non disponibile.', 'error');
    }
  }

  function handleTutorialPrimary() {
    if (isTutorialActive) {
      navigate(tutorialState.resumeRoute || '/tutorial');
      return;
    }
    setTutorialState(startTutorial(tutorialState.selectedRole));
    navigate('/tutorial');
  }

  function resetSectionFilters() {
    setSectionQuery('');
    setSectionCategory('all');
    setOnlyAvailable(false);
  }

  return (
    <section className={styles.page}>
      <AccountHero
        onPrimaryAction={() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onSecondaryAction={() => profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      <Card className={styles.accountHeadMeta}>
        <div className={styles.accountHeadIdentity}>
          <img src={profile.avatar_url || avatarPlaceholder} alt="Avatar account" loading="lazy" className={styles.accountHeadAvatar} />
          <div className={styles.accountHeadCopy}>
            <h2>{profile.display_name || 'Utente Motrice'}</h2>
            <p>Piano attuale: <strong>{subscription.plan.toUpperCase()}</strong> · Stato: <strong>{subscription.status}</strong></p>
          </div>
        </div>
        <div className={styles.accountHeadActions}>
          <Button type="button" onClick={() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {isPremium ? 'Gestisci piano' : 'Upgrade'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Modifica profilo
          </Button>
        </div>
      </Card>

      <AccountQuickActions
        onWallet={() => navigate('/convenzioni?view=wallet')}
        onNotifications={() => navigate('/notifications')}
        onTutorial={handleTutorialPrimary}
        onSettings={() => settingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      <Card className={styles.toolbarCard}>
        <AccountSectionToolbar
          query={sectionQuery}
          onQueryChange={(value) => setSectionQuery(String(value || '').slice(0, 80))}
          category={sectionCategory}
          onCategoryChange={setSectionCategory}
          onlyAvailable={onlyAvailable}
          onOnlyAvailableChange={setOnlyAvailable}
          resultCount={visibleSectionIds.length}
          onReset={resetSectionFilters}
        />
      </Card>

      <AccountFeaturedActions actions={featuredActions} />

      {accountLoading ? <LoadingSkeleton rows={4} variant="detail" /> : null}

      {!accountLoading && visibleSectionIds.length === 0 ? (
        <Card className={styles.emptyCard}>
          <h2>Nessuna sezione trovata</h2>
          <p className="muted">Modifica i filtri o azzera la ricerca per tornare a tutte le sezioni.</p>
          <Button type="button" variant="secondary" onClick={resetSectionFilters}>
            Azzera filtri
          </Button>
        </Card>
      ) : null}

      <div className={styles.dashboardGrid}>
        {!accountLoading && isSectionVisible('profile') ? (
          <AccountCard title="Profilo" subtitle="Dati principali e modifica rapida" className={styles.gridSpanTwo}>
            <div className={styles.profileCard} ref={profileRef}>
              <div className={styles.profileGrid}>
                <div className={styles.avatarWrap}>
                  <img src={draft.avatar_url || avatarPlaceholder} alt="Avatar profilo" className={styles.avatar} loading="lazy" />
                  <p className={styles.avatarHint}>Formato consigliato: quadrato, max 2MB.</p>
                  {editingProfile ? (
                    <label className={styles.uploadLabel}>
                      <Camera size={14} aria-hidden="true" /> Carica immagine
                      <input type="file" accept="image/*" onChange={onAvatarChange} />
                    </label>
                  ) : null}
                </div>

                <label className={styles.bioField}>
                  Nome utente
                  {editingProfile ? (
                    <input
                      value={draft.display_name}
                      onChange={(event) => setDraft((prev) => ({ ...prev, display_name: event.target.value.slice(0, 40) }))}
                      placeholder="Inserisci il nome utente"
                    />
                  ) : (
                    <p className={styles.bioPreview}>{profile.display_name || 'Nessun nome utente.'}</p>
                  )}
                </label>

                <label className={styles.bioField}>
                  Inserisci bio
                  {editingProfile ? (
                    <>
                      <textarea
                        rows="5"
                        value={draft.bio}
                        onChange={(event) => setDraft((prev) => ({ ...prev, bio: event.target.value.slice(0, 600) }))}
                        placeholder="Racconta chi sei, i tuoi obiettivi e il tuo stile di allenamento."
                      />
                      <small className={styles.bioCount}>{draft.bio.length}/600</small>
                    </>
                  ) : (
                    <p className={styles.bioPreview}>{profile.bio || 'Nessuna bio inserita.'}</p>
                  )}
                </label>
              </div>

              <div className={`${styles.slotBox} ${!isCoachApproved ? styles.slotBoxLocked : ''}`}>
                <button
                  type="button"
                  className={styles.slotToggle}
                  onClick={() => {
                    if (!isCoachApproved) return;
                    setIsCoachSlotsOpen((prev) => !prev);
                  }}
                  aria-expanded={isCoachSlotsOpen}
                  aria-controls="coach-slots-body"
                  disabled={!isCoachApproved}
                >
                  <span className={styles.slotToggleCopy}>
                    <strong>Fasce orarie chat coach</strong>
                    <span>{isCoachApproved ? 'Apri o chiudi la sezione' : 'Disponibile dopo approvazione coach'}</span>
                  </span>
                  <span className={`${styles.slotToggleIcon} ${isCoachSlotsOpen ? styles.slotToggleIconOpen : ''}`} aria-hidden="true">
                    <ChevronDown size={22} strokeWidth={2.6} />
                  </span>
                </button>
                <div id="coach-slots-body" className={`${styles.slotBody} ${isCoachSlotsOpen ? styles.slotBodyOpen : ''}`}>
                  <p className="muted">
                    {isCoachApproved ? (
                      'Seleziona quando i clienti possono avviare una chat con te (feature Premium).'
                    ) : (
                      <>
                        Disponibili solo dopo approvazione candidatura coach. Completa o verifica stato in{' '}
                        <Link to="/become-coach">Diventa Coach</Link>.
                      </>
                    )}
                  </p>
                  <div className={styles.slotGrid}>
                    {CHAT_SLOT_OPTIONS.map((slot) => {
                      const active = draft.chat_slots.includes(slot);
                      return (
                        <button
                          key={slot}
                          type="button"
                          className={`${styles.slotChip} ${active ? styles.slotChipActive : ''}`}
                          onClick={() => {
                            if (!editingProfile || !isCoachApproved) return;
                            setDraft((prev) => ({
                              ...prev,
                              chat_slots: active
                                ? prev.chat_slots.filter((item) => item !== slot)
                                : [...prev.chat_slots, slot]
                            }));
                          }}
                          disabled={!editingProfile || !isCoachApproved}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={styles.actions}>
                {editingProfile ? (
                  <>
                    <Button type="button" icon={Save} onClick={onSaveProfile} disabled={savingProfile}>
                      {savingProfile ? 'Salvataggio...' : 'Salva bio e immagine'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setDraft(profile);
                        setEditingProfile(false);
                      }}
                    >
                      Annulla
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => setEditingProfile(true)}>
                    Modifica bio e immagine
                  </Button>
                )}
              </div>
            </div>
          </AccountCard>
        ) : null}

        {!accountLoading && isSectionVisible('plan') ? (
          <Card className={styles.planPanel} ref={planRef}>
            <div className={styles.planHeader}>
              <h2>Piano & Benefici</h2>
              <span className={styles.planActiveChip}>{subscription.plan.toUpperCase()}</span>
            </div>
            <div className={styles.planSummary}>
              <p className={styles.planMeta}>Piano attuale: <strong>{subscription.plan.toUpperCase()}</strong></p>
              <p className={styles.planMeta}>Stato: <strong>{subscription.status}</strong></p>
              <p className={styles.planMeta}>Provider: {subscription.provider}</p>
              {entitlementsRows.map((row) => (
                <p key={row.label} className={styles.planMeta}>
                  {row.label}: <strong>{row.value ? 'Attivo' : 'Non attivo'}</strong>
                </p>
              ))}
            </div>

            <div className={styles.pricingGrid}>
              <Card subtle className={`${styles.pricingCard} ${styles.planCardFree}`}>
                <h3>{PLAN_DEFINITIONS.free.label}</h3>
                <p className={styles.planPrice}>{PLAN_DEFINITIONS.free.price}</p>
                <ul className={styles.planList}>
                  <li>RSVP eventi</li>
                  <li>Fino a 3 eventi al mese</li>
                  <li>Filtri base (sport, data)</li>
                  <li>Sblocco Pro via video 3/3 (chat coach esclusa)</li>
                </ul>
                <Button
                  type="button"
                  variant="secondary"
                  icon={PlayCircle}
                  onClick={onUnlockWithVideo}
                  disabled={isPremium || subscription.plan === 'free_only' || !subscription.rewarded_status?.can_watch_now}
                >
                  Guarda video ({subscription.rewarded_status?.progress_videos ?? 0}/{REWARDED_VIDEOS_REQUIRED})
                </Button>
              </Card>

              <Card subtle className={`${styles.pricingCard} ${styles.planCardFreeOnly}`}>
                <h3>{PLAN_DEFINITIONS.free_only.label}</h3>
                <p className={styles.planPrice}>{PLAN_DEFINITIONS.free_only.price}</p>
                <ul className={styles.planList}>
                  <li>Esperienza solo Free</li>
                  <li>Nessun reward video</li>
                  <li>Fino a 3 eventi al mese</li>
                </ul>
                <Button type="button" variant="secondary" onClick={activateFreeOnly} disabled={subscription.plan === 'free_only'}>
                  {subscription.plan === 'free_only' ? 'Piano attivo' : 'Attiva Free solo'}
                </Button>
              </Card>

              <Card subtle className={`${styles.pricingCard} ${styles.planCardPremium}`}>
                <h3>{PLAN_DEFINITIONS.premium.label}</h3>
                <p className={styles.planPrice}>{PLAN_DEFINITIONS.premium.price}</p>
                <ul className={styles.planList}>
                  <li>Creazione eventi illimitata</li>
                  <li>Filtri avanzati + Agenda Week/Month + ICS + Notifiche</li>
                  <li>Chatta con il coach (solo Premium)</li>
                </ul>
                <Button type="button" onClick={activatePremium} disabled={isPremium}>
                  {isPremium ? 'Premium attivo' : 'Attiva Premium'}
                </Button>
              </Card>
            </div>

            {hasUnlockWindow ? (
              <p className={styles.unlockNotice}>
                Sblocco Pro da video attivo fino alle{' '}
                {new Date(subscription.rewarded_status.unlock_ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                ({unlockRemainingLabel} rimanenti, chat coach esclusa).
              </p>
            ) : null}
            <div className={styles.rewardGrid}>
              <p className={styles.rewardItem}>
                Video guardati oggi: <strong>{subscription.rewarded_status?.videos_today ?? 0}/{REWARDED_DAILY_LIMIT}</strong>
              </p>
              <p className={styles.rewardItem}>
                Sblocchi Pro da video oggi: <strong>{subscription.rewarded_status?.unlocks_today ?? 0}/{REWARDED_DAILY_UNLOCK_LIMIT}</strong>
              </p>
              <p className={styles.rewardItem}>
                Progressione sblocco: <strong>{subscription.rewarded_status?.progress_videos ?? 0}/{REWARDED_VIDEOS_REQUIRED}</strong>
              </p>
            </div>

            <div className={styles.actions}>
              <Button type="button" variant="secondary" onClick={activateFreeWithAds} disabled={subscription.plan === 'free'}>
                {subscription.plan === 'premium' ? 'Disattiva Premium' : 'Attiva Free con pubblicita'}
              </Button>
            </div>
          </Card>
        ) : null}

        {!accountLoading && isSectionVisible('reliability') ? (
          <>
            <AccountReliabilityCard
              reliability={profile.reliability}
              attended={profile.attended}
              noShow={profile.no_show}
              cancelled={profile.cancelled}
            />

            <Card className={styles.xpCard}>
              <div className={styles.xpHeader}>
                <div className={styles.xpTitleWrap}>
                  <h2>XP &amp; Badge</h2>
                  <p className={styles.xpSubtle}>Progressione reputazione certificata</p>
                </div>
                <span className={styles.xpBadgePill} aria-label={`Badge attuale ${xpState?.badge?.label || 'Rame'}`}>
                  <Award size={14} aria-hidden="true" />
                  {xpState?.badge?.label || 'Rame'}
                </span>
              </div>

              <div className={styles.xpGlobalWrap}>
                <p className={styles.xpGlobalValue}>
                  <TrendingUp size={16} aria-hidden="true" />
                  XP globale: <strong>{xpState?.xp_global ?? 0}</strong>
                </p>
                <p className={styles.xpProgressLabel}>
                  {xpState?.progress?.nextThreshold
                    ? `${xpState.progress.currentXp}/${xpState.progress.nextThreshold} verso livello successivo`
                    : 'Livello massimo raggiunto'}
                </p>
                <div
                  className={styles.xpProgressBar}
                  role="progressbar"
                  aria-label="Progresso XP verso il prossimo badge"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={xpState?.progress?.progressPct ?? 0}
                >
                  <span style={{ width: `${xpState?.progress?.progressPct ?? 0}%` }} />
                </div>
              </div>

              <div className={styles.xpSection}>
                <div className={styles.xpSectionHeader}>
                  <h3>XP per sport</h3>
                  {xpSportsRows.length > 3 ? (
                    <button
                      type="button"
                      className={styles.xpToggle}
                      onClick={() => setShowAllSportXp((prev) => !prev)}
                      aria-label={showAllSportXp ? 'Mostra meno sport' : 'Vedi tutti gli sport'}
                    >
                      {showAllSportXp ? 'Mostra meno' : 'Vedi tutti'}
                    </button>
                  ) : null}
                </div>
                <div className={styles.xpList}>
                  {(showAllSportXp ? xpSportsRows : xpTopRows).map((item) => (
                    <p key={item.sportId} className={styles.xpRow} title={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.xp}</strong>
                    </p>
                  ))}
                  {!xpTopRows.length ? <p className={styles.xpEmpty}>Nessun XP sport disponibile.</p> : null}
                </div>
              </div>

              <div className={styles.xpSection}>
                <h3>Ultime attivita XP</h3>
                <div className={styles.xpHistoryList}>
                  {xpHistoryRows.map((item) => {
                    const pointLabel = Number(item.points || 0) >= 0 ? `+${item.points}` : `${item.points}`;
                    return (
                      <p key={item.id} className={styles.xpHistoryRow}>
                        <span className={styles.xpHistoryLabel} title={formatXpHistoryLabel(item)}>
                          {formatXpHistoryLabel(item)}
                        </span>
                        <span className={styles.xpHistoryMeta}>
                          <strong>{pointLabel}</strong>
                          <small>{new Date(item.ts).toLocaleDateString('it-IT')}</small>
                        </span>
                      </p>
                    );
                  })}
                  {!xpHistoryRows.length ? <p className={styles.xpEmpty}>Nessuna attivita XP registrata.</p> : null}
                </div>
              </div>
            </Card>
          </>
        ) : null}

        {!accountLoading && isSectionVisible('theme') ? (
          <Card ref={settingsRef}>
            <h2>Preferenze</h2>
            <div className={styles.actions}>
              <Button type="button" variant={theme === 'light' ? 'primary' : 'secondary'} onClick={() => setTheme('light')}>
                Tema chiaro
              </Button>
              <Button type="button" variant={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => setTheme('dark')}>
                Tema scuro
              </Button>
            </div>
          </Card>
        ) : null}

        {!accountLoading && isSectionVisible('ai') ? (
          <Card className={styles.aiPanel}>
            <div className={styles.aiPanelHeader}>
              <h2>AI (Beta)</h2>
              <span className={styles.aiStatusPill}>
                <Cpu size={14} aria-hidden="true" />
                {aiAvailability.available ? 'Disponibile' : 'Non disponibile'}
              </span>
            </div>
            <p className="muted">
              Attiva suggerimenti AI in creazione evento e chat. In app mobile nativa usa sempre il provider locale.
            </p>

            <label className={styles.aiToggle}>
              <input
                type="checkbox"
                checked={aiSettings.enableLocalAI}
                onChange={(event) => onChangeAiSettings({ enableLocalAI: event.target.checked })}
                aria-label="Abilita AI Locale beta"
              />
              <span>Abilita AI (Beta)</span>
            </label>

            <label className={styles.aiField}>
              Provider
              <select
                value={aiSettings.providerMode}
                onChange={(event) => onChangeAiSettings({ providerMode: event.target.value })}
              >
                <option value={AI_PROVIDER_MODE.AUTO}>Auto (Locale a Remoto)</option>
                <option value={AI_PROVIDER_MODE.LOCAL}>Solo Locale</option>
              </select>
            </label>

            <div className={styles.aiGrid}>
              <label className={styles.aiField}>
                Model ID
                <input
                  value={aiSettings.modelId}
                  onChange={(event) => onChangeAiSettings({ modelId: event.target.value.slice(0, 60) })}
                  placeholder="motrice-mini-v1"
                />
              </label>
              <label className={styles.aiField}>
                Model Path
                <input
                  value={aiSettings.modelPath}
                  onChange={(event) => onChangeAiSettings({ modelPath: event.target.value.slice(0, 160) })}
                  placeholder="/models/motrice-mini.gguf"
                />
              </label>
            </div>
            <p className={styles.aiReason}>Model path opzionale: se vuoto usa il path interno predefinito.</p>

            <p className={styles.aiReason}>
              {aiAvailability.available
                ? 'Runtime locale pronto su dispositivo.'
                : `${aiAvailability.reason || 'Runtime locale non disponibile'}. In web puo usare Auto, in app serve plugin locale.`}
            </p>

            <div className={styles.actions}>
              <Button
                type="button"
                icon={Sparkles}
                onClick={runAiTest}
                disabled={!aiSettings.enableLocalAI || aiTestLoading}
              >
                {aiTestLoading ? 'Test in corso...' : 'Test AI'}
              </Button>
            </div>
            {aiTestResult ? <p className={styles.aiTestResult}>{aiTestResult}</p> : null}
          </Card>
        ) : null}

        {!accountLoading && isSectionVisible('support') ? (
          <AccountCard title="Supporto" subtitle="Hai dubbi o problemi? Qui trovi i collegamenti rapidi.">
            <div className={styles.actions}>
              <Link to="/faq" className={styles.quickLink}>Apri FAQ</Link>
              <Link to="/notifications" className={styles.quickLink}>Vedi notifiche</Link>
            </div>
          </AccountCard>
        ) : null}
      </div>

      <RewardedVideoDemoModal
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        onCompleted={() => {
          setVideoModalOpen(false);
          redeemRewardedUnlock();
        }}
      />
    </section>
  );
}

export default AccountPage;

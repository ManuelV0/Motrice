import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import PartnerPortalLayout from './components/partner-portal/PartnerPortalLayout';
import { PartnerPortalProvider } from './components/partner-portal/PartnerPortalContext';
import { portalStyles as styles } from './components/partner-portal/PortalPrimitives';
import DashboardPage from './pages/partner-portal/DashboardPage';
import VoucherPage from './pages/partner-portal/VoucherPage';
import ConventionPage from './pages/partner-portal/ConventionPage';
import PaymentsPage from './pages/partner-portal/PaymentsPage';
import SettingsPage from './pages/partner-portal/SettingsPage';
import LoginPage from './pages/partner-portal/LoginPage';
import AccessDeniedPage from './pages/partner-portal/AccessDeniedPage';
import { partnerPortalApi } from './services/partnerPortalApi';
import { computeAnnualCashbackStats, computeLiveStats } from './utils/convenzioni/stats';
import './styles.css';

function readExpiryCountdown(expiresAt, nowMs) {
  const expiresMs = Date.parse(expiresAt || '');
  const hasExpiry = Number.isFinite(expiresMs);
  const remainingMs = hasExpiry ? Math.max(0, expiresMs - nowMs) : 0;
  return {
    remainingDays: Math.floor(remainingMs / (24 * 60 * 60 * 1000)),
    remainingHours: Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  };
}

export default function App() {
  const [session, setSession] = useState(() => partnerPortalApi.getAuthSession());
  const [ctx, setCtx] = useState(() => partnerPortalApi.getMyPartnerContext());
  const [applications, setApplications] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [coursePromos, setCoursePromos] = useState([]);
  const [activeRoute, setActiveRoute] = useState('dashboard');
  const [info, setInfo] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherNote, setVoucherNote] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [voucherFilter, setVoucherFilter] = useState('all');
  const [coursesDraft, setCoursesDraft] = useState(1);
  const [promoFilterType, setPromoFilterType] = useState('all');
  const [promoDraft, setPromoDraft] = useState({ courseType: '', discountedPrice: '', expiresAt: '' });
  const [editingPromoId, setEditingPromoId] = useState('');
  const [editingPromo, setEditingPromo] = useState({ courseType: '', discountedPrice: '', expiresAt: '' });
  const [profile, setProfile] = useState({
    tagline: '',
    description: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    coursesText: '',
    imageDataUrl: ''
  });
  const [nowMs, setNowMs] = useState(() => Date.now());

  const mainAppUrl = String(import.meta.env.VITE_MAIN_APP_URL || '').trim() || 'http://localhost:5173/convenzioni';

  const flashInfo = useCallback((text) => {
    setInfo(text);
    window.setTimeout(() => setInfo(''), 2400);
  }, []);

  const refreshPortal = useCallback(() => {
    const nextSession = partnerPortalApi.getAuthSession();
    setSession(nextSession);
    if (!nextSession.isAuthenticated) {
      setCtx({ isAuthenticated: false, activationStatus: 'inactive', latestApplication: null, partnerProfile: null });
      setApplications([]);
      setVouchers([]);
      setCoursePromos([]);
      return;
    }
    const nextCtx = partnerPortalApi.getMyPartnerContext();
    setCtx(nextCtx);
    setApplications(partnerPortalApi.listMyApplications());
    setVouchers(partnerPortalApi.listVouchersForMyCity().slice(0, 40));
    setCoursePromos(partnerPortalApi.listMyCoursePromos());
  }, []);

  useEffect(() => {
    partnerPortalApi.initializeFromHandoff();
    refreshPortal();
  }, [refreshPortal]);

  useEffect(() => {
    const p = ctx.partnerProfile || {};
    setProfile({
      tagline: String(p.profile_tagline || ''),
      description: String(p.profile_description || ''),
      address: String(p.profile_address || ''),
      phone: String(p.profile_phone || ''),
      email: String(p.profile_email || ''),
      website: String(p.profile_website || ''),
      coursesText: Array.isArray(p.offered_courses) ? p.offered_courses.join('\n') : '',
      imageDataUrl: String(p.profile_image_data_url || '')
    });
    setCoursesDraft(Math.max(1, Math.min(5, Number(p.courses_count || 1) || 1)));
  }, [ctx.partnerProfile?.id, ctx.partnerProfile?.updated_at]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const onLogin = useCallback(
    (provider) => {
      partnerPortalApi.continueWithProvider(provider);
      refreshPortal();
    },
    [refreshPortal]
  );

  const onLogout = useCallback(() => {
    partnerPortalApi.logout();
    refreshPortal();
  }, [refreshPortal]);

  const onRedeem = useCallback(() => {
    try {
      setRedeemBusy(true);
      const result = partnerPortalApi.redeemVoucher(voucherInput, voucherNote);
      setVoucherInput('');
      setVoucherNote('');
      const scoreEvent = result?.partner_score_award;
      if (scoreEvent?.applied) {
        flashInfo(`Redeem riuscito: +${scoreEvent.points} punti`);
      } else {
        flashInfo('Voucher riscattato correttamente');
      }
      refreshPortal();
    } catch (error) {
      flashInfo(error?.message || 'Errore riscatto voucher');
    } finally {
      setRedeemBusy(false);
    }
  }, [flashInfo, refreshPortal, voucherInput, voucherNote]);

  const onSetPlan = useCallback(
    (plan) => {
      try {
        partnerPortalApi.updatePartnerPlan({ plan, coursesCount: coursesDraft });
        flashInfo(`Piano ${String(plan).toUpperCase()} aggiornato`);
        refreshPortal();
      } catch (error) {
        flashInfo(error?.message || 'Impossibile aggiornare piano');
      }
    },
    [coursesDraft, flashInfo, refreshPortal]
  );

  const onCreateCoursePromo = useCallback(() => {
    try {
      partnerPortalApi.createCoursePromo({
        courseType: promoDraft.courseType,
        discountedPriceEur: promoDraft.discountedPrice,
        expiresAt: promoDraft.expiresAt
      });
      setPromoDraft({ courseType: '', discountedPrice: '', expiresAt: '' });
      flashInfo('Promo corso creata');
      refreshPortal();
    } catch (error) {
      flashInfo(error?.message || 'Impossibile creare promo');
    }
  }, [flashInfo, promoDraft, refreshPortal]);

  const savePromoEdit = useCallback(
    (promoId) => {
      try {
        partnerPortalApi.updateCoursePromo(promoId, {
          courseType: editingPromo.courseType,
          discountedPriceEur: editingPromo.discountedPrice,
          expiresAt: editingPromo.expiresAt
        });
        setEditingPromoId('');
        flashInfo('Promo aggiornata');
        refreshPortal();
      } catch (error) {
        flashInfo(error?.message || 'Impossibile aggiornare promo');
      }
    },
    [editingPromo, flashInfo, refreshPortal]
  );

  const onDeactivatePromo = useCallback(
    (promoId) => {
      try {
        partnerPortalApi.deactivateCoursePromo(promoId);
        if (String(editingPromoId) === String(promoId)) setEditingPromoId('');
        flashInfo('Promo disattivata');
        refreshPortal();
      } catch (error) {
        flashInfo(error?.message || 'Impossibile disattivare promo');
      }
    },
    [editingPromoId, flashInfo, refreshPortal]
  );

  const onSelectProfileImage = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!String(file.type || '').startsWith('image/')) {
        flashInfo('Seleziona un file immagine');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        flashInfo('Immagine troppo grande (max 2MB)');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        setProfile((prev) => ({ ...prev, imageDataUrl: dataUrl }));
        flashInfo('Anteprima immagine caricata');
      };
      reader.onerror = () => flashInfo('Impossibile leggere immagine');
      reader.readAsDataURL(file);
    },
    [flashInfo]
  );

  const onSaveAssociationProfile = useCallback(() => {
    try {
      partnerPortalApi.updateAssociationProfile({
        tagline: profile.tagline,
        description: profile.description,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        website: profile.website,
        offeredCourses: profile.coursesText,
        imageDataUrl: profile.imageDataUrl
      });
      flashInfo('Scheda associazione aggiornata');
      refreshPortal();
    } catch (error) {
      flashInfo(error?.message || 'Impossibile aggiornare la scheda');
    }
  }, [flashInfo, profile, refreshPortal]);

  const isPremiumPlan = String(ctx.partnerProfile?.plan || '').toLowerCase() === 'premium';
  const annualStats = useMemo(() => computeAnnualCashbackStats(ctx.partnerProfile), [ctx.partnerProfile]);
  const liveStats = useMemo(() => computeLiveStats({ vouchers, partnerProfile: ctx.partnerProfile }), [ctx.partnerProfile, vouchers]);
  const partnerMetrics = ctx.partnerProfile?.metrics_rolling_30d || {
    redeemed_count: 0,
    redeemed_amount_cents: 0,
    expired_count: 0,
    redeem_rate: 0
  };
  const { remainingDays, remainingHours } = readExpiryCountdown(ctx.partnerProfile?.subscription_expires_at, nowMs);

  const promoTypeOptions = useMemo(() => {
    const set = new Set();
    coursePromos.forEach((item) => {
      const key = String(item.course_type || '').trim();
      if (key) set.add(key);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'it'));
  }, [coursePromos]);

  const filteredCoursePromos = useMemo(() => {
    if (promoFilterType === 'all') return coursePromos;
    return coursePromos.filter(
      (item) => String(item.course_type || '').trim().toLowerCase() === String(promoFilterType || '').toLowerCase()
    );
  }, [coursePromos, promoFilterType]);

  const contextValue = useMemo(
    () => ({
      session,
      ctx,
      applications,
      vouchers,
      coursePromos,
      info,
      setInfo: flashInfo,
      activeRoute,
      setRoute: setActiveRoute,
      annualStats,
      liveStats,
      partnerMetrics,
      remainingDays,
      remainingHours,
      isPremiumPlan,
      voucherInput,
      setVoucherInput,
      voucherNote,
      setVoucherNote,
      scannerOpen,
      setScannerOpen,
      voucherFilter,
      setVoucherFilter,
      redeemBusy,
      onRedeem,
      coursesDraft,
      setCoursesDraft,
      onSetPlan,
      profile,
      setProfile,
      onSelectProfileImage,
      onSaveAssociationProfile,
      promoDraft,
      setPromoDraft,
      onCreateCoursePromo,
      promoFilterType,
      setPromoFilterType,
      promoTypeOptions,
      filteredCoursePromos,
      editingPromoId,
      setEditingPromoId,
      editingPromo,
      setEditingPromo,
      savePromoEdit,
      onDeactivatePromo,
      onRefresh: refreshPortal,
      onLogout
    }),
    [
      session,
      ctx,
      applications,
      vouchers,
      coursePromos,
      info,
      flashInfo,
      activeRoute,
      annualStats,
      liveStats,
      partnerMetrics,
      remainingDays,
      remainingHours,
      isPremiumPlan,
      voucherInput,
      voucherNote,
      scannerOpen,
      voucherFilter,
      redeemBusy,
      onRedeem,
      coursesDraft,
      onSetPlan,
      profile,
      onSelectProfileImage,
      onSaveAssociationProfile,
      promoDraft,
      onCreateCoursePromo,
      promoFilterType,
      promoTypeOptions,
      filteredCoursePromos,
      editingPromoId,
      editingPromo,
      savePromoEdit,
      onDeactivatePromo,
      refreshPortal,
      onLogout
    ]
  );

  if (!session.isAuthenticated) {
    return (
      <main className="pageShell">
        <PartnerPortalProvider value={contextValue}>
          <LoginPage onLogin={onLogin} />
        </PartnerPortalProvider>
      </main>
    );
  }

  if (ctx.activationStatus !== 'active') {
    return (
      <main className="pageShell">
        <AccessDeniedPage activationStatus={ctx.activationStatus} onLogout={onLogout} mainAppUrl={mainAppUrl} />
      </main>
    );
  }

  return (
    <PartnerPortalProvider value={contextValue}>
      <PartnerPortalLayout
        partnerName={ctx.partnerProfile?.organization || `Utente #${session.userId || 'n/d'}`}
        activationStatus={ctx.activationStatus}
        activeRoute={activeRoute}
        onNavigate={setActiveRoute}
        topActions={
          <>
            <button type="button" className={`${styles.actionBtn} ${styles.secondaryBtn}`} onClick={refreshPortal} aria-label="Aggiorna dati">
              <RefreshCcw size={14} aria-hidden="true" /> Aggiorna
            </button>
            <button type="button" className={`${styles.actionBtn} ${styles.ghostBtn}`} onClick={onLogout}>
              Logout
            </button>
          </>
        }
      >
        {info ? <p className={styles.flash}>{info}</p> : null}

        {activeRoute === 'dashboard' ? <DashboardPage /> : null}
        {activeRoute === 'voucher' ? <VoucherPage /> : null}
        {activeRoute === 'convenzione' ? <ConventionPage /> : null}
        {activeRoute === 'pagamenti' ? <PaymentsPage /> : null}
        {activeRoute === 'impostazioni' ? <SettingsPage /> : null}
      </PartnerPortalLayout>
    </PartnerPortalProvider>
  );
}

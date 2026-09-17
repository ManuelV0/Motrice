import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Map,
  PlusCircle,
  Handshake,
  UserRound,
  MessageCircle,
  Bell,
  LockKeyhole,
  Menu,
  Target,
  LogIn,
  LogOut,
  ShieldCheck,
  TrendingUp,
  X
} from 'lucide-react';
import { useMobileMenu } from '../hooks/useMobileMenu';
import { useToast } from '../context/ToastContext';
import { useUserLocation } from '../hooks/useUserLocation';
import { getAuthSession, signOutFromSupabase } from '../services/authSession';
import { isProfileVerificationAdmin } from '../services/profileVerification';
import IconButton from './IconButton';
import BrandLogo from './BrandLogo';
import HeaderWallet from './HeaderWallet';
import styles from '../styles/components/navbar.module.css';

const DRAWER_OPEN_THRESHOLD = 0.34;
const DRAWER_CLOSE_THRESHOLD = 0.66;
const DRAWER_SWIPE_VELOCITY = 0.45;
const DRAWER_GESTURE_SLOP = 8;
const DRAWER_SETTLE_MS = 220;

function clampDrawerProgress(value) {
  return Math.min(1, Math.max(0, value));
}

const links = [
  { to: '/agenda', label: 'Eventi', icon: CalendarDays },
  { to: '/map', label: 'Mappa', icon: Map },
  { to: '/create', label: 'Crea', icon: PlusCircle, primary: true },
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/account', label: 'Profilo', icon: UserRound }
];

const drawerSections = [
  {
    title: 'La tua attività',
    items: [
      { to: '/dashboard/plans', label: 'Schede personali', icon: CalendarDays },
      { to: '/dashboard/progress', label: 'Progressi esercizi', icon: TrendingUp }
    ]
  },
  {
    title: 'Altro',
    items: [
      { to: '/coach', label: 'Coach', icon: Target, locked: true },
      { to: '/convenzioni', label: 'Premi e convenzioni', icon: Handshake, locked: true },
      { to: '/notifications', label: 'Notifiche', icon: Bell }
    ]
  }
];

function Navbar({ forceMobile = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, setIsOpen } = useMobileMenu();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(0);
  const [authSession, setAuthSession] = useState(() => getAuthSession());
  const [authActionBusy, setAuthActionBusy] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const visibleDrawerSections = isProfileVerificationAdmin(authSession)
    ? [
        ...drawerSections,
        {
          title: 'Amministrazione',
          items: [{ to: '/admin', label: 'Centro operativo', icon: ShieldCheck }]
        }
      ]
    : drawerSections;
  const { hasLocation, error: locationError, requesting, requestLocation } = useUserLocation();
  const drawerRef = useRef(null);
  const drawerPanelRef = useRef(null);
  const drawerGestureSessionRef = useRef(null);
  const drawerGestureStateRef = useRef(null);
  const drawerSettleTimerRef = useRef(null);
  const drawerMoveFrameRef = useRef(null);
  const pendingDrawerGestureRef = useRef(null);
  const suppressDrawerClickRef = useRef(false);
  const [drawerGesture, setDrawerGesture] = useState(null);
  const notificationReturnTo = `${location.pathname}${location.search}${location.hash}`;

  function closeNotifications() {
    const returnTo = location.state?.notificationReturnTo;
    const hasSafeReturnPath =
      typeof returnTo === 'string' &&
      returnTo.startsWith('/') &&
      !returnTo.startsWith('//') &&
      !returnTo.startsWith('/notifications');

    if (hasSafeReturnPath) {
      navigate(-1);
      return;
    }

    navigate('/map', { replace: true });
  }

  function updateDrawerGesture(progress, settling = false) {
    const nextGesture = { progress: clampDrawerProgress(progress), settling };
    if (drawerMoveFrameRef.current) {
      window.cancelAnimationFrame(drawerMoveFrameRef.current);
      drawerMoveFrameRef.current = null;
    }
    pendingDrawerGestureRef.current = null;
    drawerGestureStateRef.current = nextGesture;
    setDrawerGesture(nextGesture);
  }

  function scheduleDrawerGesture(progress) {
    const nextGesture = { progress: clampDrawerProgress(progress), settling: false };
    drawerGestureStateRef.current = nextGesture;
    pendingDrawerGestureRef.current = nextGesture;
    if (drawerMoveFrameRef.current) return;

    drawerMoveFrameRef.current = window.requestAnimationFrame(() => {
      drawerMoveFrameRef.current = null;
      const pendingGesture = pendingDrawerGestureRef.current;
      pendingDrawerGestureRef.current = null;
      if (pendingGesture) setDrawerGesture(pendingGesture);
    });
  }

  function clearDrawerGesture() {
    if (drawerMoveFrameRef.current) {
      window.cancelAnimationFrame(drawerMoveFrameRef.current);
      drawerMoveFrameRef.current = null;
    }
    pendingDrawerGestureRef.current = null;
    drawerGestureSessionRef.current = null;
    drawerGestureStateRef.current = null;
    setDrawerGesture(null);
  }

  function getDrawerWidth() {
    return drawerPanelRef.current?.getBoundingClientRect().width || Math.min(window.innerWidth * 0.88, 352);
  }

  function settleDrawerGesture(shouldOpen) {
    if (drawerSettleTimerRef.current) window.clearTimeout(drawerSettleTimerRef.current);
    drawerGestureSessionRef.current = null;
    if (shouldOpen) setIsOpen(true);
    updateDrawerGesture(shouldOpen ? 1 : 0, true);
    drawerSettleTimerRef.current = window.setTimeout(() => {
      if (!shouldOpen) setIsOpen(false);
      clearDrawerGesture();
      drawerSettleTimerRef.current = null;
    }, DRAWER_SETTLE_MS);
  }

  function onEdgePointerDown(event) {
    if (isOpen || drawerGestureStateRef.current || event.button !== 0) return;

    if (drawerSettleTimerRef.current) window.clearTimeout(drawerSettleTimerRef.current);
    setWalletOpen(false);
    drawerGestureSessionRef.current = {
      mode: 'opening',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      width: getDrawerWidth(),
      recognized: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateDrawerGesture(0);
  }

  function onEdgePointerMove(event) {
    const session = drawerGestureSessionRef.current;
    if (!session || session.mode !== 'opening' || session.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;

    if (!session.recognized) {
      if (Math.abs(deltaX) < DRAWER_GESTURE_SLOP && Math.abs(deltaY) < DRAWER_GESTURE_SLOP) return;
      if (deltaX <= 0 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) {
        clearDrawerGesture();
        return;
      }
      session.recognized = true;
    }

    event.preventDefault();
    scheduleDrawerGesture(deltaX / session.width);
  }

  function onEdgePointerEnd(event) {
    const session = drawerGestureSessionRef.current;
    if (!session || session.mode !== 'opening' || session.pointerId !== event.pointerId) return;

    const progress = drawerGestureStateRef.current?.progress || 0;
    const elapsed = Math.max(performance.now() - session.startedAt, 1);
    const velocity = (event.clientX - session.startX) / elapsed;
    settleDrawerGesture(session.recognized && (progress >= DRAWER_OPEN_THRESHOLD || velocity >= DRAWER_SWIPE_VELOCITY));
  }

  function onDrawerPointerDown(event) {
    const currentGesture = drawerGestureStateRef.current;
    const canInterruptOpenSettle = Boolean(
      currentGesture?.settling && currentGesture.progress >= 0.98
    );
    if ((!isOpen && !canInterruptOpenSettle) || (currentGesture && !canInterruptOpenSettle) || event.button !== 0) return;

    if (drawerSettleTimerRef.current) {
      window.clearTimeout(drawerSettleTimerRef.current);
      drawerSettleTimerRef.current = null;
    }
    if (canInterruptOpenSettle) {
      setIsOpen(true);
      updateDrawerGesture(1);
    }

    drawerGestureSessionRef.current = {
      mode: 'closing',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      width: getDrawerWidth(),
      recognized: false
    };
  }

  function onDrawerPointerMove(event) {
    const session = drawerGestureSessionRef.current;
    if (!session || session.mode !== 'closing' || session.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;

    if (!session.recognized) {
      if (Math.abs(deltaX) < DRAWER_GESTURE_SLOP && Math.abs(deltaY) < DRAWER_GESTURE_SLOP) return;
      if (deltaX >= 0 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) {
        drawerGestureSessionRef.current = null;
        return;
      }
      session.recognized = true;
      scheduleDrawerGesture(1);
    }

    event.preventDefault();
    scheduleDrawerGesture(1 + deltaX / session.width);
  }

  function onDrawerPointerEnd(event) {
    const session = drawerGestureSessionRef.current;
    if (!session || session.mode !== 'closing' || session.pointerId !== event.pointerId) return;

    if (!session.recognized) {
      drawerGestureSessionRef.current = null;
      return;
    }

    suppressDrawerClickRef.current = true;
    window.setTimeout(() => {
      suppressDrawerClickRef.current = false;
    }, 350);

    const progress = drawerGestureStateRef.current?.progress ?? 1;
    const elapsed = Math.max(performance.now() - session.startedAt, 1);
    const velocity = (event.clientX - session.startX) / elapsed;
    const shouldRemainOpen = progress > DRAWER_CLOSE_THRESHOLD && velocity > -DRAWER_SWIPE_VELOCITY;
    settleDrawerGesture(shouldRemainOpen);
  }

  function onDrawerPointerCancel() {
    const session = drawerGestureSessionRef.current;
    if (!session) return;
    if (session.mode === 'opening') settleDrawerGesture(false);
    else if (session.recognized) settleDrawerGesture(true);
    else drawerGestureSessionRef.current = null;
  }

  useEffect(() => {
    function onWindowPointerMove(event) {
      const session = drawerGestureSessionRef.current;
      if (!session) return;
      if (session.mode === 'opening') onEdgePointerMove(event);
      else onDrawerPointerMove(event);
    }

    function onWindowPointerUp(event) {
      const session = drawerGestureSessionRef.current;
      if (!session) return;
      if (session.mode === 'opening') onEdgePointerEnd(event);
      else onDrawerPointerEnd(event);
    }

    function onWindowPointerCancel() {
      onDrawerPointerCancel();
    }

    window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
    window.addEventListener('blur', onWindowPointerCancel);

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
      window.removeEventListener('blur', onWindowPointerCancel);
    };
  }, []);

  useEffect(() => {
    function refreshAuthSession() {
      setAuthSession(getAuthSession());
    }

    window.addEventListener('motrice-auth-changed', refreshAuthSession);
    window.addEventListener('storage', refreshAuthSession);
    return () => {
      window.removeEventListener('motrice-auth-changed', refreshAuthSession);
      window.removeEventListener('storage', refreshAuthSession);
    };
  }, []);

  useEffect(() => {
    setWalletOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => () => {
    if (drawerSettleTimerRef.current) window.clearTimeout(drawerSettleTimerRef.current);
    if (drawerMoveFrameRef.current) window.cancelAnimationFrame(drawerMoveFrameRef.current);
  }, []);

  useEffect(() => {
    let active = true;

    function refreshUnread() {
      import('../services/api')
        .then(({ api }) => api.getUnreadCount())
        .then((count) => {
          if (!active) return;
          setUnread(Number.isFinite(count) ? count : 0);
        })
        .catch(() => {
          if (active) setUnread(0);
        });
    }

    refreshUnread();
    window.addEventListener('motrice:notifications-changed', refreshUnread);

    return () => {
      active = false;
      window.removeEventListener('motrice:notifications-changed', refreshUnread);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (locationError) showToast(locationError, 'error');
  }, [locationError, showToast]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarComp = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarComp > 0) {
      document.body.style.paddingRight = `${scrollbarComp}px`;
    }

    const previousActive = document.activeElement;
    const getFocusable = () =>
      Array.from(
        drawerRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) || []
      );

    const focusable = getFocusable();
    if (focusable[0]) focusable[0].focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
      }

      if (event.key === 'Tab') {
        const nodes = getFocusable();
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      if (previousActive && typeof previousActive.focus === 'function') {
        previousActive.focus();
      }
    };
  }, [isOpen, setIsOpen]);

  function onSearchSubmit(event) {
    event.preventDefault();
    navigate(`/map?q=${encodeURIComponent(query)}`);
    setIsOpen(false);
  }

  async function onAuthAction() {
    if (!authSession.isAuthenticated) {
      setIsOpen(false);
      navigate('/login');
      return;
    }

    setAuthActionBusy(true);
    try {
      await signOutFromSupabase();
      setAuthSession(getAuthSession());
      setIsOpen(false);
      showToast('Sei uscito da Motrice', 'success');
      navigate('/login');
    } catch (error) {
      showToast(error?.message || 'Impossibile uscire dall’app', 'error');
    } finally {
      setAuthActionBusy(false);
    }
  }

  return (
    <header className={`${styles.header} ${forceMobile ? styles.forceMobile : ''}`} role="banner">
      <a href="#main-content" className={styles.skip}>
        Vai al contenuto
      </a>

      <div className={`${styles.inner} ${walletOpen ? styles.walletExpanded : ''} container`}>
        <div className={styles.leftGroup}>
          <IconButton
            icon={Menu}
            label="Apri menu"
            className={styles.toggle}
            iconSize={20}
            aria-expanded={isOpen}
            aria-controls="mobile-nav"
            onClick={() => {
              setWalletOpen(false);
              setIsOpen((prev) => !prev);
            }}
          />

          <NavLink className={styles.brand} to="/">
            <BrandLogo className={styles.brandMark} decorative />
            <span>MOTRICE</span>
          </NavLink>
        </div>

        <form className={styles.search} onSubmit={onSearchSubmit} role="search" aria-label="Ricerca globale">
          <input
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca sport, citta, titolo"
            aria-label="Cerca sport, citta o evento"
          />
        </form>

        <div className={styles.rightGroup}>
          <NavLink
            to="/notifications"
            state={location.pathname === '/notifications' ? undefined : { notificationReturnTo }}
            className={({ isActive }) => `${styles.notificationButton} ${isActive ? styles.notificationButtonActive : ''}`}
            aria-label={unread > 0 ? `Notifiche, ${unread} non lette` : 'Notifiche'}
            title="Notifiche"
            onClick={(event) => {
              setIsOpen(false);
              setWalletOpen(false);
              if (location.pathname === '/notifications') {
                event.preventDefault();
                closeNotifications();
              }
            }}
          >
            <Bell size={18} aria-hidden="true" />
            {unread > 0 ? (
              <span className={styles.notificationBadge} aria-hidden="true">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </NavLink>
          <HeaderWallet
            open={walletOpen}
            onOpenChange={(nextOpen) => {
              setIsOpen(false);
              setWalletOpen(nextOpen);
            }}
            authenticated={authSession.isAuthenticated}
          />
        </div>

        {!forceMobile ? (
          <nav className={styles.desktopNav} aria-label="Navigazione principale">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `${styles.link} ${link.primary ? styles.createLink : ''} ${link.to === '/chat' ? styles.chatriceLink : ''} ${isActive ? styles.active : ''}`
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{link.label}</span>
                </NavLink>
              );
            })}
          </nav>
        ) : null}
      </div>

      {!isOpen ? (
        <div
          className={styles.drawerEdgeGesture}
          data-drawer-edge-gesture="true"
          aria-hidden="true"
          onPointerDown={onEdgePointerDown}
        />
      ) : null}

      {isOpen || drawerGesture ? (
        <button
          type="button"
          aria-label="Chiudi menu"
          className={`${styles.backdrop} ${drawerGesture ? (drawerGesture.settling ? styles.backdropGestureSettling : styles.backdropGestureActive) : ''}`}
          style={drawerGesture ? { opacity: drawerGesture.progress } : undefined}
          onClick={() => {
            if (!drawerGesture) setIsOpen(false);
          }}
        />
      ) : null}

      <div
        id="mobile-nav"
        ref={drawerPanelRef}
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''} ${drawerGesture ? (drawerGesture.settling ? styles.drawerGestureSettling : styles.drawerGestureActive) : ''}`}
        style={drawerGesture ? { transform: `translate3d(${(drawerGesture.progress - 1) * 102}%, 0, 0)` } : undefined}
        aria-hidden={!isOpen}
        onPointerDown={onDrawerPointerDown}
        onClickCapture={(event) => {
          if (!suppressDrawerClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <nav ref={drawerRef} className={styles.mobileNav} aria-label="Navigazione mobile">
          <div className={styles.mobileHeader}>
            <div className={styles.mobileHeaderCopy}>
              <div className={styles.mobileBrandRow}>
                <BrandLogo className={styles.mobileBrandLogo} decorative />
                <p className={styles.mobileKicker}>MOTRICE</p>
              </div>
              <h2 className={styles.mobileTitle}>Tutto il resto, qui.</h2>
            </div>
            <button
              type="button"
              className={styles.drawerClose}
              onClick={() => setIsOpen(false)}
              aria-label="Chiudi menu"
            >
              <X size={22} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          <form className={styles.search} onSubmit={onSearchSubmit}>
            <input
              className={styles.searchInput}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca sport, citta, titolo"
              aria-label="Cerca sport, citta o evento"
            />
          </form>

          {visibleDrawerSections.map((section) => (
            <section key={section.title} className={styles.mobileSection} aria-label={section.title}>
              <p className={styles.mobileSectionTitle}>{section.title}</p>
              <div className={styles.mobileSectionList}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  if (item.locked) {
                    return (
                      <button
                        key={item.to}
                        type="button"
                        className={`${styles.link} ${styles.drawerLink} ${styles.drawerLocked}`}
                        disabled
                        aria-label={`${item.label}, sezione temporaneamente bloccata`}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span>{item.label}</span>
                        <span className={styles.drawerLockBadge} aria-hidden="true">
                          <LockKeyhole size={15} strokeWidth={2.3} />
                        </span>
                      </button>
                    );
                  }
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      state={item.to === '/notifications' && location.pathname !== '/notifications' ? { notificationReturnTo } : undefined}
                      className={({ isActive }) =>
                        `${styles.link} ${styles.drawerLink} ${item.to === '/chat' ? styles.chatriceLink : ''} ${isActive ? styles.active : ''}`
                      }
                      onClick={(event) => {
                        setIsOpen(false);
                        if (item.to === '/notifications' && location.pathname === '/notifications') {
                          event.preventDefault();
                          closeNotifications();
                        }
                      }}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{item.label}</span>
                      {item.to === '/notifications' && unread > 0 ? (
                        <span className={styles.drawerNotificationCount} aria-label={`${unread} notifiche non lette`}>
                          {unread > 99 ? '99+' : unread}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
                {section.title === 'Altro' ? (
                  <button
                    type="button"
                    className={`${styles.link} ${styles.drawerLink} ${styles.authLink}`}
                    onClick={onAuthAction}
                    disabled={authActionBusy}
                  >
                    {authSession.isAuthenticated ? (
                      <LogOut size={18} aria-hidden="true" />
                    ) : (
                      <LogIn size={18} aria-hidden="true" />
                    )}
                    <span>
                      {authActionBusy
                        ? 'Uscita in corso…'
                        : authSession.isAuthenticated
                          ? 'Esci dall’app'
                          : 'Accedi all’app'}
                    </span>
                  </button>
                ) : null}
              </div>
            </section>
          ))}

          <button
            type="button"
            className={`${styles.locationPill} ${hasLocation ? styles.locationOn : styles.locationOff}`}
            onClick={() => {
              if (!hasLocation) requestLocation();
            }}
          >
            <span>{hasLocation ? 'Posizione attiva' : requesting ? 'Attivazione...' : 'Posizione off'}</span>
          </button>
        </nav>
      </div>

    </header>
  );
}

export default Navbar;

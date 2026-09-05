import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BottomNav from '../components/BottomNav';
import SiteTourOverlay from '../components/SiteTourOverlay';
import PullToRefresh from '../components/PullToRefresh';
import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useViewportInsets from '../hooks/useViewportInsets';
import { getAuthSession } from '../services/authSession';
import { hasCompletedAppIntro } from '../services/appIntro';

function AppShell({ children }) {
  const location = useLocation();
  const [soonNotification, setSoonNotification] = useState(null);
  const [authSession, setAuthSession] = useState(getAuthSession);
  const isEmbed = location.pathname.startsWith('/embed/');
  const isLandingRoute = location.pathname === '/';
  const isStartupAuthRoute = isLandingRoute && !authSession.isAuthenticated;
  const isFirstAccessIntro =
    isLandingRoute && authSession.isAuthenticated && !hasCompletedAppIntro(authSession);
  const isVerificationRoute = location.pathname === '/verify-profile';
  const isPasswordResetRoute = location.pathname === '/reset-password';
  const isWorkoutRoute = /^\/events\/[^/]+\/workout$/.test(location.pathname);
  const isFullscreenEntryRoute = isStartupAuthRoute || isFirstAccessIntro || isVerificationRoute || isPasswordResetRoute || isWorkoutRoute;
  const isFixedFullscreenRoute = isStartupAuthRoute || isFirstAccessIntro || isVerificationRoute || isPasswordResetRoute;
  const isMapLikeRoute = location.pathname === '/map' || location.pathname === '/game';
  const isChatRoute = location.pathname.startsWith('/chat') || location.pathname.startsWith('/chatrice');
  const isCommunityRoute = location.pathname.startsWith('/community');
  const isMapSurfaceRoute = isMapLikeRoute || isCommunityRoute;
  const isAccountRoute = location.pathname.startsWith('/account');
  const isLocalProfileRoute = location.pathname === '/profile/me';
  const isAccountLikeRoute = isAccountRoute || isLocalProfileRoute;
  const [chatNoticeDismissed, setChatNoticeDismissed] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  useViewportInsets();

  const isRefreshableRoute = useMemo(() => {
    const pathname = location.pathname;
    if (pathname === '/agenda' || pathname === '/map' || pathname === '/account' || pathname === '/notifications') return true;
    if (pathname === '/chat' || pathname === '/chat/inbox') return true;
    if (/^\/events\/[^/]+$/.test(pathname)) return true;
    return /^\/(admin|coach|convenzioni|dashboard|profile)(\/|$)/.test(pathname);
  }, [location.pathname]);

  const refreshCurrentPage = useCallback(async () => {
    window.dispatchEvent(
      new CustomEvent('motrice:pull-refresh', {
        detail: { pathname: location.pathname, requestedAt: Date.now() }
      })
    );

    setRefreshVersion((version) => version + 1);

    try {
      const { api } = await import('../services/api');
      const items = await api.listNotifications();
      const list = Array.isArray(items) ? items : [];
      const soon = list.find((item) => item.type === 'event_starting_soon' && !item.read);
      setSoonNotification(soon || null);
    } catch {
      // The route refresh still succeeds even when the optional notification refresh fails.
    }

    await new Promise((resolve) => window.setTimeout(resolve, 520));
    window.dispatchEvent(
      new CustomEvent('motrice:pull-refreshed', {
        detail: { pathname: location.pathname, completedAt: Date.now() }
      })
    );
  }, [location.pathname]);

  const refreshedChildren = isValidElement(children)
    ? cloneElement(children, { key: `${location.pathname}:${refreshVersion}` })
    : children;

  useEffect(() => {
    const refreshAuthSession = () => setAuthSession(getAuthSession());
    window.addEventListener('motrice-auth-changed', refreshAuthSession);
    return () => window.removeEventListener('motrice-auth-changed', refreshAuthSession);
  }, []);

  useEffect(() => {
    let active = true;

    import('../services/api')
      .then(({ api }) => api.listNotifications())
      .then((items) => {
        if (!active) return;
        const list = Array.isArray(items) ? items : [];
        const soon = list.find((item) => item.type === 'event_starting_soon' && !item.read);
        setSoonNotification(soon || null);
      })
      .catch(() => {
        if (active) setSoonNotification(null);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isAccountLikeRoute) {
      root.classList.add('account-mobile-lock');
    } else {
      root.classList.remove('account-mobile-lock');
    }
    return () => {
      root.classList.remove('account-mobile-lock');
    };
  }, [isAccountLikeRoute]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('chat-surface-lock', isChatRoute);
    return () => {
      root.classList.remove('chat-surface-lock');
    };
  }, [isChatRoute]);

  useEffect(() => {
    if (!isChatRoute) {
      setChatNoticeDismissed(false);
    }
  }, [isChatRoute, location.pathname]);

  if (isEmbed) {
    return (
      <div className="appShell">
        <main id="main-content" className="embedMain">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className={`appShell ${isAccountLikeRoute ? 'account-mobile-only' : ''} ${isLandingRoute ? 'landing-shell' : ''} ${isFullscreenEntryRoute ? 'startup-auth-shell' : ''} ${isChatRoute ? 'chat-shell' : ''}`}>
      <PullToRefresh
        enabled={authSession.isAuthenticated && isRefreshableRoute && !isFullscreenEntryRoute}
        edgeOnly={isMapSurfaceRoute}
        fullscreen={isMapSurfaceRoute || isChatRoute}
        routeKey={`${location.pathname}${location.search}`}
        onRefresh={refreshCurrentPage}
      />
      {!isFullscreenEntryRoute ? <Navbar forceMobile={isAccountLikeRoute} /> : null}
      <main
        key={location.pathname}
        id="main-content"
        className={`${isAccountLikeRoute ? 'mainContentAccountMobile' : isLandingRoute || isMapSurfaceRoute || isChatRoute || isVerificationRoute || isPasswordResetRoute || isWorkoutRoute ? 'mainContentFullBleed' : 'container'} mainContent mainContentRouteEnter ${isLandingRoute ? 'mainContentLanding' : ''} ${isFixedFullscreenRoute ? 'mainContentStartupAuth' : ''} ${isWorkoutRoute ? 'mainContentWorkout' : ''} ${isFirstAccessIntro ? 'mainContentFirstAccessIntro' : ''} ${isMapSurfaceRoute ? 'mainContentMap' : ''} ${isChatRoute ? 'mainContentChat' : ''}`}
      >
        {!isFullscreenEntryRoute && soonNotification && !(isChatRoute && chatNoticeDismissed) && !isCommunityRoute && (
          <section className={`mainNotice ${isChatRoute ? 'mainNoticeSlim' : ''}`} role="status" aria-live="polite">
            <p>
              {soonNotification.message} <Link to={`/events/${soonNotification.event_id}`}>Apri dettaglio</Link>
              {isChatRoute ? (
                <button type="button" className="mainNoticeClose" onClick={() => setChatNoticeDismissed(true)} aria-label="Nascondi avviso">
                  Chiudi
                </button>
              ) : null}
            </p>
          </section>
        )}
        {refreshedChildren}
      </main>
      {!isFullscreenEntryRoute ? <BottomNav forceVisible={isAccountLikeRoute} chatSurface={isChatRoute} /> : null}
      {!isFullscreenEntryRoute && !isLandingRoute && !isMapSurfaceRoute ? <Footer /> : null}
      {!isFullscreenEntryRoute ? <SiteTourOverlay /> : null}
    </div>
  );
}

export default AppShell;

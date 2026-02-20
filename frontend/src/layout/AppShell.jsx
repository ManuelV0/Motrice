import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BottomNav from '../components/BottomNav';
import SiteTourOverlay from '../components/SiteTourOverlay';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import useViewportInsets from '../hooks/useViewportInsets';

function AppShell({ children }) {
  const location = useLocation();
  const [soonNotification, setSoonNotification] = useState(null);
  const isEmbed = location.pathname.startsWith('/embed/');
  const isMapLikeRoute = location.pathname === '/map' || location.pathname === '/game';
  const isChatRoute = location.pathname.startsWith('/chat') || location.pathname.startsWith('/chatrice');
  const isCommunityRoute = location.pathname.startsWith('/community');
  const isAccountRoute = location.pathname.startsWith('/account');
  const isLocalProfileRoute = location.pathname === '/profile/me';
  const isAccountLikeRoute = isAccountRoute || isLocalProfileRoute;
  const [chatNoticeDismissed, setChatNoticeDismissed] = useState(false);
  useViewportInsets();

  useEffect(() => {
    let active = true;

    api
      .listNotifications()
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
    <div className={`appShell ${isAccountLikeRoute ? 'account-mobile-only' : ''}`}>
      <Navbar forceMobile={isAccountLikeRoute} />
      <main
        id="main-content"
        className={`${isAccountLikeRoute ? 'mainContentAccountMobile' : isMapLikeRoute || isChatRoute || isCommunityRoute ? 'mainContentFullBleed' : 'container'} mainContent ${isMapLikeRoute ? 'mainContentMap' : ''} ${isChatRoute ? 'mainContentChat' : ''} ${isCommunityRoute ? 'mainContentChat' : ''}`}
      >
        {soonNotification && !(isChatRoute && chatNoticeDismissed) && !isCommunityRoute && (
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
        {children}
      </main>
      <BottomNav forceVisible={isAccountLikeRoute} />
      <Footer />
      <SiteTourOverlay />
    </div>
  );
}

export default AppShell;

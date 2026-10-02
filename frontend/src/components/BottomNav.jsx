import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, MapPinned, MessageCircle, Plus, UserRound } from 'lucide-react';
import {
  advanceNavbarScrollState,
  createNavbarScrollState,
  getNavbarScrollY,
  isNavbarScrollCompactionBlocked
} from '../utils/navbarScrollBehavior';
import styles from '../styles/components/bottomNav.module.css';

const MAIN_TABS = [
  { id: 'agenda', label: 'I miei eventi', icon: CalendarDays, iconSize: 21, to: '/agenda' },
  { id: 'map', label: 'Mappa', icon: MapPinned, iconSize: 22, to: '/map' },
  { id: 'create', label: 'Crea', icon: Plus, iconSize: 25, to: '/create', primary: true },
  { id: 'chat', label: 'Chat', icon: MessageCircle, iconSize: 22, to: '/chat' },
  { id: 'profile', label: 'Profilo', icon: UserRound, iconSize: 22, to: '/account' }
];

function BottomNav({ forceVisible = false, chatSurface = false, compact = false }) {
  const location = useLocation();
  const [scrollCompact, setScrollCompact] = useState(false);
  const scrollStateRef = useRef(createNavbarScrollState(0));
  const scrollFrameRef = useRef(null);

  const activeTab = useMemo(
    () => {
      if (location.pathname.startsWith('/account') || location.pathname.startsWith('/profile') || location.pathname.startsWith('/wallet') || location.pathname.startsWith('/marketplace')) return 'profile';
      if (location.pathname.startsWith('/chat') || location.pathname.startsWith('/community')) return 'chat';
      if (location.pathname.startsWith('/create')) return 'create';
      if (location.pathname.startsWith('/map') || location.pathname.startsWith('/game')) return 'map';
      if (location.pathname.startsWith('/agenda')) return 'agenda';
      return null;
    },
    [location.pathname]
  );

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const visualViewport = window.visualViewport;

    scrollStateRef.current = createNavbarScrollState(getNavbarScrollY());
    setScrollCompact(false);

    const updateCompactState = () => {
      scrollFrameRef.current = null;
      const nextState = advanceNavbarScrollState(
        scrollStateRef.current,
        getNavbarScrollY(),
        {
          enabled: mobileQuery.matches,
          blocked: isNavbarScrollCompactionBlocked()
        }
      );
      scrollStateRef.current = nextState;
      setScrollCompact((current) => (
        current === nextState.compact ? current : nextState.compact
      ));
    };

    const scheduleCompactUpdate = () => {
      if (scrollFrameRef.current) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateCompactState);
    };

    const resetCompactState = () => {
      scrollStateRef.current = createNavbarScrollState(getNavbarScrollY());
      setScrollCompact(false);
    };

    const handleFocusChange = () => {
      if (isNavbarScrollCompactionBlocked()) {
        resetCompactState();
      } else {
        scheduleCompactUpdate();
      }
    };

    window.addEventListener('scroll', scheduleCompactUpdate, { passive: true });
    window.addEventListener('focusin', handleFocusChange);
    window.addEventListener('focusout', handleFocusChange);
    visualViewport?.addEventListener('resize', scheduleCompactUpdate);
    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', resetCompactState);
    } else {
      mobileQuery.addListener?.(resetCompactState);
    }

    return () => {
      window.removeEventListener('scroll', scheduleCompactUpdate);
      window.removeEventListener('focusin', handleFocusChange);
      window.removeEventListener('focusout', handleFocusChange);
      visualViewport?.removeEventListener('resize', scheduleCompactUpdate);
      if (typeof mobileQuery.removeEventListener === 'function') {
        mobileQuery.removeEventListener('change', resetCompactState);
      } else {
        mobileQuery.removeListener?.(resetCompactState);
      }
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [location.pathname, location.search]);

  const isCompact = compact || scrollCompact;

  return (
    <nav
      className={`${styles.bottomNav} ${forceVisible ? styles.forceVisible : ''} ${chatSurface ? styles.chatSurface : ''} ${isCompact ? styles.compact : ''}`}
      aria-label="Navigazione principale mobile"
      data-compact={isCompact ? 'true' : undefined}
      data-scroll-compact={scrollCompact ? 'true' : undefined}
    >
      {MAIN_TABS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <NavLink
            key={item.id}
            to={item.to}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`${styles.tab} ${item.primary ? styles.primaryTab : ''} ${isActive ? styles.tabActive : ''}`}
          >
            <span className={styles.iconWrap}>
              <Icon
                className={styles.tabIcon}
                size={item.iconSize}
                strokeWidth={item.primary ? 2.35 : 2.15}
                aria-hidden="true"
              />
            </span>
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default BottomNav;

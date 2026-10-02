import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, MapPinned, MessageCircle, Plus, UserRound } from 'lucide-react';
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

  return (
    <nav
      className={`${styles.bottomNav} ${forceVisible ? styles.forceVisible : ''} ${chatSurface ? styles.chatSurface : ''} ${compact ? styles.compact : ''}`}
      aria-label="Navigazione principale mobile"
      data-compact={compact ? 'true' : undefined}
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

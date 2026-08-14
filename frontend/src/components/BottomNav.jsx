import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, MapPinned, MessageCircle, Plus, UserRound } from 'lucide-react';
import styles from '../styles/components/bottomNav.module.css';

const MAIN_TABS = [
  { id: 'agenda', label: 'I miei eventi', icon: CalendarDays, to: '/agenda' },
  { id: 'map', label: 'Mappa', icon: MapPinned, to: '/map' },
  { id: 'create', label: 'Crea', icon: Plus, to: '/create', primary: true },
  { id: 'chat', label: 'Chat', icon: MessageCircle, to: '/chat' },
  { id: 'profile', label: 'Profilo', icon: UserRound, to: '/account' }
];

function BottomNav({ forceVisible = false, chatSurface = false }) {
  const location = useLocation();

  const activeTab = useMemo(
    () => {
      if (location.pathname.startsWith('/account') || location.pathname.startsWith('/profile')) return 'profile';
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
      className={`${styles.bottomNav} ${forceVisible ? styles.forceVisible : ''} ${chatSurface ? styles.chatSurface : ''}`}
      aria-label="Navigazione principale mobile"
    >
      {MAIN_TABS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <NavLink
            key={item.id}
            to={item.to}
            aria-current={isActive ? 'page' : undefined}
            className={`${styles.tab} ${item.primary ? styles.primaryTab : ''} ${isActive ? styles.tabActive : ''}`}
          >
            <span className={styles.iconWrap}>
              <Icon size={item.primary ? 25 : 21} strokeWidth={item.primary ? 2.6 : 2} aria-hidden="true" />
            </span>
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default BottomNav;

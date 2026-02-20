import { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CalendarPlus2, Filter, Home, Plus, Search, UserRound, Users, Dumbbell } from 'lucide-react';
import styles from '../styles/components/bottomNav.module.css';

const QUICK_ACTIONS = [
  { id: 'create', label: 'Crea evento', icon: CalendarPlus2, to: '/create' },
  { id: 'search', label: 'Cerca partita', icon: Search, to: '/explore?q=partita' },
  { id: 'training', label: 'Allenamento', icon: Dumbbell, to: '/coach' },
  { id: 'invite', label: 'Invita amici', icon: Users, to: '/profile/me' },
  { id: 'nearby', label: 'Filtri vicino a me', icon: Filter, to: '/map' }
];

function QuickActionsSheet({ open, onClose, onAction, forceVisible = false }) {
  return (
    <>
      <button
        type="button"
        className={`${styles.sheetBackdrop} ${open ? styles.sheetBackdropOpen : ''} ${forceVisible ? styles.forceVisibleSheet : ''}`}
        onClick={onClose}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
      />
      <section
        id="quick-actions-sheet"
        className={`${styles.sheet} ${open ? styles.sheetOpen : styles.sheetClosed} ${forceVisible ? styles.forceVisibleSheet : ''}`}
        aria-hidden={!open}
        aria-label="Comandi rapidi"
      >
        <div className={styles.sheetHandle} aria-hidden="true" />
        <h2>Comandi rapidi</h2>
        <div className={styles.sheetGrid}>
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.id} type="button" className={styles.sheetAction} onClick={() => onAction(action.to)}>
                <span className={styles.sheetIconWrap}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function BottomNav({ forceVisible = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeTab = useMemo(() => {
    if (location.pathname.startsWith('/account') || location.pathname.startsWith('/profile')) return 'profile';
    if (location.pathname === '/' || location.pathname.startsWith('/map') || location.pathname.startsWith('/explore')) return 'home';
    return null;
  }, [location.pathname]);

  function toggleSheet() {
    setSheetOpen((prev) => !prev);
  }

  function closeSheet() {
    setSheetOpen(false);
  }

  function runQuickAction(to) {
    setSheetOpen(false);
    navigate(to);
  }

  return (
    <>
      <QuickActionsSheet open={sheetOpen} onClose={closeSheet} onAction={runQuickAction} forceVisible={forceVisible} />

      <nav className={`${styles.bottomNav} ${forceVisible ? styles.forceVisible : ''}`} aria-label="Navigazione principale mobile">
        <NavLink to="/map" className={`${styles.tab} ${activeTab === 'home' ? styles.tabActive : ''}`}>
          <Home size={22} aria-hidden="true" />
          <span>Home</span>
        </NavLink>

        <button
          type="button"
          className={styles.fab}
          onClick={toggleSheet}
          aria-label="Apri comandi rapidi"
          aria-expanded={sheetOpen}
          aria-controls="quick-actions-sheet"
        >
          <Plus size={24} aria-hidden="true" />
        </button>

        <NavLink to="/account" className={`${styles.tab} ${activeTab === 'profile' ? styles.tabActive : ''}`}>
          <UserRound size={22} aria-hidden="true" />
          <span>Profile</span>
        </NavLink>
      </nav>
    </>
  );
}

export default BottomNav;

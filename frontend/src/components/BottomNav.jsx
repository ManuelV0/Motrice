import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Building2, CalendarPlus2, Home, MapPinned, MessageCircle, PiggyBank, Plus, UserRound } from 'lucide-react';
import styles from '../styles/components/bottomNav.module.css';

const QUICK_ACTIONS = [
  { id: 'create', label: 'Crea evento', icon: CalendarPlus2, to: '/create' },
  { id: 'map', label: 'Mappa eventi', icon: MapPinned, to: '/map' },
  { id: 'account', label: 'Account', icon: UserRound, to: '/account' },
  { id: 'deals', label: 'Convenzioni', icon: Building2, to: '/convenzioni' },
  { id: 'wallet', label: 'Salvadanaio', icon: PiggyBank, to: '/convenzioni?view=wallet' },
  { id: 'chat', label: 'Chat', icon: MessageCircle, to: '/chat' }
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

  const isProfileRoute = useMemo(
    () => location.pathname.startsWith('/account') || location.pathname.startsWith('/profile'),
    [location.pathname]
  );
  const isHomeRoute = !isProfileRoute;

  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname, location.search]);

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
        <NavLink to="/map" className={`${styles.tab} ${isHomeRoute ? styles.tabActive : ''}`}>
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

        <NavLink to="/account" className={`${styles.tab} ${isProfileRoute ? styles.tabActive : ''}`}>
          <UserRound size={22} aria-hidden="true" />
          <span>Profilo</span>
        </NavLink>
      </nav>
    </>
  );
}

export default BottomNav;

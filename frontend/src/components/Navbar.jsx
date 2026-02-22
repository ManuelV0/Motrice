import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Compass,
  Map,
  PlusCircle,
  Handshake,
  UserRound,
  MessageCircle,
  Lock,
  Menu,
  Target,
  LocateFixed
} from 'lucide-react';
import { useMobileMenu } from '../hooks/useMobileMenu';
import { api } from '../services/api';
import { useBilling } from '../context/BillingContext';
import { useUserLocation } from '../hooks/useUserLocation';
import PaywallModal from './PaywallModal';
import IconButton from './IconButton';
import styles from '../styles/components/navbar.module.css';

const links = [
  { to: '/explore', label: 'Esplora', icon: Compass },
  { to: '/account', label: 'Account', icon: UserRound },
  { to: '/coach', label: 'Coach', icon: Target },
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/convenzioni', label: 'Convenzioni', icon: Handshake }
];

const drawerSections = [
  {
    title: 'Scopri',
    items: [
      { to: '/explore', label: 'Esplora', icon: Compass },
      { to: '/convenzioni', label: 'Convenzioni', icon: Handshake }
    ]
  },
  {
    title: 'Gestisci',
    items: [
      { to: '/create', label: 'Crea evento', icon: PlusCircle },
      { to: '/agenda', label: 'Agenda', icon: CalendarDays },
      { to: '/dashboard/plans', label: 'Le mie schede', icon: CalendarDays }
    ]
  },
  {
    title: 'Profilo',
    items: [
      { to: '/account', label: 'Account', icon: UserRound },
      { to: '/coach', label: 'Coach', icon: Target },
      { to: '/chat', label: 'Chat', icon: MessageCircle }
    ]
  }
];

const drawerQuickActions = [
  { to: '/map', label: 'Mappa', icon: Map },
  { to: '/create', label: 'Crea', icon: PlusCircle },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays }
];

function Navbar({ forceMobile = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, setIsOpen } = useMobileMenu();
  const { entitlements } = useBilling();

  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(0);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { hasLocation, requesting, requestLocation } = useUserLocation();
  const drawerRef = useRef(null);

  useEffect(() => {
    let active = true;

    if (!entitlements.canUseNotifications) {
      setUnread(0);
      return () => {
        active = false;
      };
    }

    api
      .getUnreadCount()
      .then((count) => {
        if (!active) return;
        setUnread(Number.isFinite(count) ? count : 0);
      })
      .catch(() => {
        if (active) setUnread(0);
      });

    return () => {
      active = false;
    };
  }, [location.pathname, entitlements.canUseNotifications]);

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
    navigate(`/explore?q=${encodeURIComponent(query)}`);
    setIsOpen(false);
  }

  return (
    <header className={`${styles.header} ${forceMobile ? styles.forceMobile : ''}`} role="banner">
      <a href="#main-content" className={styles.skip}>
        Vai al contenuto
      </a>

      <div className={`${styles.inner} container`}>
        <div className={styles.leftGroup}>
          <IconButton
            icon={Menu}
            label="Apri menu"
            className={styles.toggle}
            iconSize={20}
            aria-expanded={isOpen}
            aria-controls="mobile-nav"
            onClick={() => setIsOpen((prev) => !prev)}
          />

          <NavLink className={styles.brand} to="/">
            Motrice
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
          <button
            type="button"
            className={`${styles.brandLocationIcon} ${hasLocation ? styles.brandLocationOn : styles.brandLocationOff}`}
            onClick={() => {
              if (!hasLocation) requestLocation();
            }}
            aria-label={hasLocation ? 'Posizione attiva' : requesting ? 'Attivazione posizione in corso' : 'Attiva posizione'}
            title={hasLocation ? 'Posizione attiva' : requesting ? 'Attivazione...' : 'Attiva posizione'}
          >
            <LocateFixed size={15} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`${styles.locationPill} ${hasLocation ? styles.locationOn : styles.locationOff}`}
            onClick={() => {
              if (!hasLocation) requestLocation();
            }}
            aria-live="polite"
          >
            <span className={styles.locationLabelFull}>{hasLocation ? 'Posizione attiva' : requesting ? 'Attivazione...' : 'Posizione off'}</span>
            <span className={styles.locationLabelCompact}>{hasLocation ? 'Posizione' : requesting ? 'Attiva...' : 'Off'}</span>
          </button>
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
                    `${styles.link} ${link.to === '/chat' ? styles.chatriceLink : ''} ${isActive ? styles.active : ''}`
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{link.label}</span>
                  {link.to === '/chat' && unread > 0 ? (
                    <span className={styles.chatriceBadge} aria-label={`${unread} nuovi messaggi`}>
                      {unread}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>
        ) : null}
      </div>

      {isOpen && <button type="button" aria-label="Chiudi menu" className={styles.backdrop} onClick={() => setIsOpen(false)} />}

      <div id="mobile-nav" className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`} aria-hidden={!isOpen}>
        <nav ref={drawerRef} className={styles.mobileNav} aria-label="Navigazione mobile">
          <div className={styles.mobileHeader}>
            <p className={styles.mobileKicker}>Navigazione</p>
            <h2 className={styles.mobileTitle}>Vai dove ti serve</h2>
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

          <div className={styles.quickActions} role="list" aria-label="Azioni rapide">
            {drawerQuickActions.map((action) => {
              const Icon = action.icon;
              return (
                <NavLink
                  key={action.to}
                  to={action.to}
                  role="listitem"
                  className={({ isActive }) => `${styles.quickAction} ${isActive ? styles.quickActionActive : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{action.label}</span>
                </NavLink>
              );
            })}
          </div>

          {drawerSections.map((section) => (
            <section key={section.title} className={styles.mobileSection} aria-label={section.title}>
              <p className={styles.mobileSectionTitle}>{section.title}</p>
              <div className={styles.mobileSectionList}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `${styles.link} ${styles.drawerLink} ${item.to === '/chat' ? styles.chatriceLink : ''} ${isActive ? styles.active : ''}`
                      }
                      onClick={() => setIsOpen(false)}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{item.label}{item.to === '/chat' && unread > 0 ? ` (${unread})` : ''}</span>
                    </NavLink>
                  );
                })}
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

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} feature="Upgrade" />
    </header>
  );
}

export default Navbar;

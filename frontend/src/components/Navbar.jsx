import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Map,
  PlusCircle,
  Handshake,
  UserRound,
  MessageCircle,
  Menu,
  Target,
  LocateFixed,
  X
} from 'lucide-react';
import { useMobileMenu } from '../hooks/useMobileMenu';
import { api } from '../services/api';
import { useBilling } from '../context/BillingContext';
import { useToast } from '../context/ToastContext';
import { useUserLocation } from '../hooks/useUserLocation';
import IconButton from './IconButton';
import styles from '../styles/components/navbar.module.css';

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
      { to: '/coach', label: 'Coach', icon: Target },
      { to: '/dashboard/plans', label: 'Le mie schede', icon: CalendarDays }
    ]
  },
  {
    title: 'Altro',
    items: [
      { to: '/convenzioni', label: 'Premi e convenzioni', icon: Handshake }
    ]
  }
];

function Navbar({ forceMobile = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, setIsOpen } = useMobileMenu();
  const { entitlements } = useBilling();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(0);
  const { hasLocation, error: locationError, requesting, requestLocation } = useUserLocation();
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
            <span className={styles.brandMark}>M</span>
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
          <button
            type="button"
            className={`${styles.brandLocationIcon} ${hasLocation ? styles.brandLocationOn : styles.brandLocationOff}`}
            onClick={() => {
              if (!hasLocation) requestLocation();
            }}
            aria-label={hasLocation ? 'Posizione attiva' : requesting ? 'Attivazione posizione in corso' : 'Attiva posizione'}
            title={hasLocation ? 'Posizione attiva' : requesting ? 'Attivazione...' : locationError || 'Attiva posizione'}
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
                    `${styles.link} ${link.primary ? styles.createLink : ''} ${link.to === '/chat' ? styles.chatriceLink : ''} ${isActive ? styles.active : ''}`
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
            <div className={styles.mobileHeaderCopy}>
              <p className={styles.mobileKicker}>MOTRICE</p>
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

    </header>
  );
}

export default Navbar;

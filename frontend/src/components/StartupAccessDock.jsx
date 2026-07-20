import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, LogIn, X } from 'lucide-react';
import { getAuthSession } from '../services/authSession';
import styles from '../styles/components/startupAccessDock.module.css';

const DISMISSED_KEY = 'motrice.startupAccessDockDismissed';

function readDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function StartupAccessDock() {
  const location = useLocation();
  const [session, setSession] = useState(getAuthSession());
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const refresh = () => setSession(getAuthSession());
    window.addEventListener('motrice-auth-changed', refresh);
    return () => window.removeEventListener('motrice-auth-changed', refresh);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Il dock resta comunque chiuso per la sessione React corrente.
    }
  }

  if (session.isAuthenticated || dismissed || location.pathname !== '/') {
    return null;
  }

  return (
    <aside className={styles.dock} aria-label="Accesso rapido Motrice">
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Nascondi accesso rapido">
        <X size={15} aria-hidden="true" />
      </button>
      <Link to="/login" className={styles.action}>
        <span className={styles.iconWrap}>
          <LogIn size={20} aria-hidden="true" />
        </span>
        <span className={styles.copy}>
          <strong>Accedi / Registrati</strong>
          <small>Sincronizza profilo, eventi e chat</small>
        </span>
        <ChevronRight className={styles.chevron} size={20} aria-hidden="true" />
      </Link>
    </aside>
  );
}

export default StartupAccessDock;

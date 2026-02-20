import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUp, Instagram, Music2, Youtube } from 'lucide-react';
import Button from './Button';
import styles from '../styles/components/footer.module.css';

function Footer() {
  const year = new Date().getFullYear();
  const [showBackTop, setShowBackTop] = useState(false);
  const location = useLocation();

  useEffect(() => {
    function onScroll() {
      setShowBackTop(window.scrollY > 260);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.main}`}>
        <section className={styles.brandBlock} aria-label="Brand">
          <h3 className={styles.wordmark}>Motrice</h3>
          <p className="muted">Allenati dal vivo. Connettiti davvero.</p>
        </section>

        <nav className={styles.navBlock} aria-label="Navigazione rapida">
          <h4>Navigazione</h4>
          <ul className={styles.list}>
            <li><Link to="/explore">Esplora</Link></li>
            <li><Link to="/map">Mappa</Link></li>
            <li><Link to="/agenda">Agenda</Link></li>
            <li><Link to="/account">Account</Link></li>
          </ul>
        </nav>

        <nav className={styles.navBlock} aria-label="Supporto e legale">
          <h4>Supporto</h4>
          <ul className={styles.list}>
            <li><Link to="/faq">FAQ</Link></li>
            <li><a href="#">Contatti</a></li>
            <li><a href="#">Privacy</a></li>
            <li><a href="#">Termini</a></li>
          </ul>
        </nav>

        <section className={styles.navBlock} aria-label="Canali social">
          <h4>Seguici</h4>
          <div className={styles.social}>
            <a href="#" aria-label="Instagram Motrice" className={styles.iconLink}>
              <Instagram size={16} aria-hidden="true" />
            </a>
            <a href="#" aria-label="TikTok Motrice" className={styles.iconLink}>
              <Music2 size={16} aria-hidden="true" />
            </a>
            <a href="#" aria-label="YouTube Motrice" className={styles.iconLink}>
              <Youtube size={16} aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>

      <div className={`container ${styles.bottom}`}>
        <p className={`muted ${styles.copy}`}>© {year} Motrice. Tutti i diritti riservati.</p>

        <div className={styles.bottomLinks}>
          <Link to="/admin/coach-applications" className={styles.adminLink} aria-label="Area admin candidature coach">
            admin coach
          </Link>
          <Link
            to="/admin/convenzioni-applications"
            className={styles.adminLink}
            aria-label="Area admin candidature convenzioni"
          >
            admin convenzioni
          </Link>
          {location.pathname !== '/pricing' && (
            <Link to="/pricing" className={styles.adminLink} aria-label="Vai alla sezione salvadanaio">
              salvadanaio
            </Link>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          className={`${styles.backTop} ${showBackTop ? styles.backTopVisible : ''}`}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Torna in alto"
        >
          <ArrowUp size={16} aria-hidden="true" /> Back to top
        </Button>
      </div>
    </footer>
  );
}

export default Footer;

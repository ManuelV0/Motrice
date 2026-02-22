import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Facebook, LockKeyhole, Chrome, LogOut, Zap, ArrowRight } from 'lucide-react';
import {
  clearAuthSession,
  continueWithProvider,
  consumeAuthLogoutReason,
  getAuthSession
} from '../services/authSession';
import { usePageMeta } from '../hooks/usePageMeta';
import Card from '../components/Card';
import Button from '../components/Button';
import styles from '../styles/pages/login.module.css';

function LoginPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(getAuthSession());
  const [logoutReason] = useState(() => consumeAuthLogoutReason());

  usePageMeta({
    title: 'Login | Motrice',
    description: 'Accedi a Motrice per trovare eventi sport, validare con QR e accedere a convenzioni reali.'
  });

  function onContinue(provider) {
    const next = continueWithProvider(provider);
    setSession(next);
    navigate('/coach');
  }

  function onLogout() {
    clearAuthSession();
    setSession(getAuthSession());
  }

  return (
    <section className={styles.page}>
      <div className={styles.heroImage} aria-hidden="true">
        <img
          src="/images/landing-hero.png"
          alt=""
          loading="eager"
          width="1280"
          height="720"
        />
      </div>
      <div className={styles.overlay} aria-hidden="true" />

      <div className={styles.content}>
        <div className={styles.branding}>
          <p className={styles.kicker}>
            <Zap size={14} aria-hidden="true" />
            Motrice Platform
          </p>
          <h1>Entra nel gioco.</h1>
          <p className={styles.tagline}>
            Sport locale, QR validato e reputazione che cresce. Accedi per iniziare.
          </p>
          <Link to="/" className={styles.backLink}>
            <ArrowRight size={14} aria-hidden="true" style={{ transform: 'rotate(180deg)' }} />
            Torna alla home
          </Link>
        </div>

        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>Accedi a Motrice</h2>
          <p className={styles.cardSub}>Scegli il tuo provider per continuare</p>

          {logoutReason?.code === 'voucher_redeemed' ? (
            <div className={styles.note}>
              <LockKeyhole size={16} aria-hidden="true" />
              <span>
                Sessione chiusa: il tuo voucher convenzione e stato riscattato dal partner. Effettua nuovamente l accesso.
              </span>
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" className={styles.oauthButton} onClick={() => onContinue('google')} icon={Chrome}>
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={styles.oauthButton}
              onClick={() => onContinue('facebook')}
              icon={Facebook}
            >
              Continue with Facebook
            </Button>
          </div>

          <div className={styles.divider} aria-hidden="true">
            <span />
            <small>oppure</small>
            <span />
          </div>

          <div className={styles.note}>
            <LockKeyhole size={16} aria-hidden="true" />
            <span>
              Account attuale: <strong>{session.provider || 'none'}</strong>
              {session.userId ? ` #${session.userId}` : ''}
            </span>
          </div>

          {session.isAuthenticated ? (
            <Button type="button" variant="ghost" className={styles.oauthButton} icon={LogOut} onClick={onLogout}>
              Logout
            </Button>
          ) : null}

          <p className={styles.legal}>
            Accedendo accetti i termini di servizio e la privacy policy di Motrice.
          </p>
        </Card>
      </div>
    </section>
  );
}

export default LoginPage;

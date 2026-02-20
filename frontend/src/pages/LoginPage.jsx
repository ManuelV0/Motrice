import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Facebook, LockKeyhole, Chrome, LogOut } from 'lucide-react';
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
    description: 'Placeholder login social con struttura pronta per integrazione OAuth/Supabase Auth.'
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
      <Card className={styles.card}>
        <p className={styles.kicker}>Auth Placeholder</p>
        <h1>Accedi a Motrice</h1>
        <p className="muted">UI pronta per OAuth con Supabase Auth. In questa fase il flusso e mockato per sviluppo.</p>

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
      </Card>
    </section>
  );
}

export default LoginPage;

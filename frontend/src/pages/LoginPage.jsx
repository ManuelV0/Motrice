import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Facebook, LockKeyhole, Chrome, LogIn, LogOut, Mail, UserPlus, Zap, ArrowRight } from 'lucide-react';
import {
  continueWithProvider,
  consumeAuthLogoutReason,
  getAuthSession,
  initializeSupabaseAuth,
  signInWithPassword,
  signOutFromSupabase,
  signUpWithPassword
} from '../services/authSession';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { usePageMeta } from '../hooks/usePageMeta';
import Card from '../components/Card';
import Button from '../components/Button';
import styles from '../styles/pages/login.module.css';

function LoginPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(getAuthSession());
  const [logoutReason] = useState(() => consumeAuthLogoutReason());
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  usePageMeta({
    title: 'Login | Motrice',
    description: 'Accedi a Motrice per trovare eventi sport, validare con QR e accedere a convenzioni reali.'
  });

  useEffect(() => {
    const refresh = () => setSession(getAuthSession());
    window.addEventListener('motrice-auth-changed', refresh);
    initializeSupabaseAuth().then(setSession).catch((err) => setError(err.message || 'Supabase non raggiungibile'));
    return () => window.removeEventListener('motrice-auth-changed', refresh);
  }, []);

  function onContinue(provider) {
    const next = continueWithProvider(provider);
    setSession(next);
    navigate('/coach');
  }

  async function onLogout() {
    setBusy(true);
    setError('');
    try {
      await signOutFromSupabase();
      setSession(getAuthSession());
    } catch (err) {
      setError(err.message || 'Logout non riuscito');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'register') {
        const result = await signUpWithPassword({ email, password, displayName });
        if (result.needsEmailConfirmation) {
          setMessage('Controlla la tua email e conferma la registrazione, poi torna qui per accedere.');
          setMode('login');
          setPassword('');
          return;
        }
      } else {
        const next = await signInWithPassword({ email, password });
        setSession(next);
      }
      navigate('/explore');
    } catch (err) {
      setError(err.message || 'Accesso non riuscito');
    } finally {
      setBusy(false);
    }
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
          <h2 className={styles.cardTitle}>{session.isAuthenticated ? 'Account connesso' : 'Accedi a Motrice'}</h2>
          <p className={styles.cardSub}>
            {isSupabaseConfigured ? 'Il tuo account sara sincronizzato su tutti i dispositivi.' : 'Modalita demo locale.'}
          </p>

          {logoutReason?.code === 'voucher_redeemed' ? (
            <div className={styles.note}>
              <LockKeyhole size={16} aria-hidden="true" />
              <span>
                Sessione chiusa: il tuo voucher convenzione e stato riscattato dal partner. Effettua nuovamente l accesso.
              </span>
            </div>
          ) : null}

          {isSupabaseConfigured && !session.isAuthenticated ? (
            <>
              <div className={styles.modeSwitch} role="group" aria-label="Tipo accesso">
                <button
                  type="button"
                  className={mode === 'login' ? styles.modeActive : ''}
                  onClick={() => setMode('login')}
                >
                  Accedi
                </button>
                <button
                  type="button"
                  className={mode === 'register' ? styles.modeActive : ''}
                  onClick={() => setMode('register')}
                >
                  Registrati
                </button>
              </div>

              <form className={styles.authForm} onSubmit={onSubmit}>
                {mode === 'register' ? (
                  <label>
                    Nome visualizzato
                    <input
                      type="text"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      minLength={2}
                      maxLength={40}
                      autoComplete="name"
                      required
                    />
                  </label>
                ) : null}
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={6}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    required
                  />
                </label>
                <Button
                  type="submit"
                  fullWidth
                  disabled={busy}
                  icon={mode === 'register' ? UserPlus : LogIn}
                >
                  {busy ? 'Attendi...' : mode === 'register' ? 'Crea account' : 'Accedi'}
                </Button>
              </form>
            </>
          ) : null}

          {!isSupabaseConfigured ? (
            <>
              <div className={styles.actions}>
                <Button type="button" className={styles.oauthButton} onClick={() => onContinue('google')} icon={Chrome}>
                  Demo con Google
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className={styles.oauthButton}
                  onClick={() => onContinue('facebook')}
                  icon={Facebook}
                >
                  Demo con Facebook
                </Button>
              </div>
              <div className={styles.divider} aria-hidden="true">
                <span />
                <small>locale</small>
                <span />
              </div>
            </>
          ) : null}

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {message ? <p className={styles.success} role="status">{message}</p> : null}

          <div className={styles.note}>
            {session.isAuthenticated ? <Mail size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}
            <span>
              {session.isAuthenticated ? (
                <>Account: <strong>{session.email || session.provider || 'connesso'}</strong></>
              ) : (
                <>Connessione: <strong>{isSupabaseConfigured ? 'Supabase pronto' : 'Supabase da configurare'}</strong></>
              )}
            </span>
          </div>

          {session.isAuthenticated ? (
            <Button type="button" variant="ghost" className={styles.oauthButton} icon={LogOut} onClick={onLogout} disabled={busy}>
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

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Facebook, LockKeyhole, LogIn, LogOut, Mail, UserPlus, Zap, ArrowRight } from 'lucide-react';
import {
  continueWithProvider,
  consumeAuthLogoutReason,
  getAuthSession,
  initializeSupabaseAuth,
  signInWithGoogle,
  signInWithPassword,
  signOutFromSupabase,
  signUpWithPassword
} from '../services/authSession';
import { isSupabaseConfigured, supabaseAuthCallbackError } from '../services/supabaseClient';
import { usePageMeta } from '../hooks/usePageMeta';
import Card from '../components/Card';
import Button from '../components/Button';
import styles from '../styles/pages/login.module.css';

function friendlyAuthError(message) {
  const details = String(message || '').replace(/\+/g, ' ').trim();
  if (details.toLowerCase().includes('provider is not enabled')) {
    return 'Accesso Google non ancora attivo nelle impostazioni Supabase.';
  }
  return details || 'Accesso non riuscito';
}

function consumeOAuthCallbackError() {
  if (typeof window === 'undefined') return '';

  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const details =
    url.searchParams.get('error_description') ||
    hash.get('error_description') ||
    url.searchParams.get('error') ||
    hash.get('error');

  const callbackError = details || supabaseAuthCallbackError;
  if (!callbackError) return '';

  if (details) {
    ['error', 'error_code', 'error_description'].forEach((key) => {
      url.searchParams.delete(key);
      hash.delete(key);
    });
    url.hash = hash.toString() ? `#${hash.toString()}` : '';
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return friendlyAuthError(callbackError);
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285f4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.89h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.37Z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.4l-3.24-2.52c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.39 13.91A6 6 0 0 1 6.08 12c0-.66.11-1.31.31-1.91v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.51l3.35-2.6Z"
      />
      <path
        fill="#ea4335"
        d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.49l3.35 2.6C7.18 7.72 9.39 5.96 12 5.96Z"
      />
    </svg>
  );
}

function LoginPage({ startup = false }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(getAuthSession());
  const [logoutReason] = useState(() => consumeAuthLogoutReason());
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState(consumeOAuthCallbackError);
  const [message, setMessage] = useState('');

  usePageMeta({
    title: 'Login | Motrice',
    description: 'Accedi a Motrice per trovare eventi sport, validare con QR e accedere a convenzioni reali.'
  });

  useEffect(() => {
    const refresh = () => setSession(getAuthSession());
    const showAuthError = (event) => setError(event.detail || 'Accesso non riuscito');
    window.addEventListener('motrice-auth-changed', refresh);
    window.addEventListener('motrice-auth-error', showAuthError);
    initializeSupabaseAuth().then(setSession).catch((err) => setError(err.message || 'Supabase non raggiungibile'));
    return () => {
      window.removeEventListener('motrice-auth-changed', refresh);
      window.removeEventListener('motrice-auth-error', showAuthError);
    };
  }, []);

  function onContinue(provider) {
    const next = continueWithProvider(provider);
    setSession(next);
    if (!startup) navigate('/coach');
  }

  async function onLogout() {
    setBusy(true);
    setBusyAction('logout');
    setError('');
    try {
      await signOutFromSupabase();
      setSession(getAuthSession());
    } catch (err) {
      setError(err.message || 'Logout non riuscito');
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setBusyAction('password');
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
      if (!startup) navigate('/agenda');
    } catch (err) {
      setError(err.message || 'Accesso non riuscito');
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  }

  async function onGoogleSignIn() {
    setBusy(true);
    setBusyAction('google');
    setError('');
    setMessage('');

    try {
      const next = await signInWithGoogle();
      if (next?.isAuthenticated) {
        setSession(next);
        if (!startup) navigate('/agenda');
      }
    } catch (err) {
      setError(friendlyAuthError(err?.message || 'Accesso con Google non riuscito'));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  }

  return (
    <section className={`${styles.page} ${startup ? styles.startupPage : ''}`}>
      <div className={styles.heroImage} aria-hidden="true">
        <img
          src="/images/startup-auth.jpeg"
          alt=""
          loading="eager"
          width="1122"
          height="1402"
        />
      </div>
      <div className={styles.overlay} aria-hidden="true" />

      <div className={`${styles.content} ${startup ? styles.startupContent : ''}`}>
        <div className={styles.branding}>
          <p className={styles.kicker}>
            <Zap size={14} aria-hidden="true" />
            Motrice Platform
          </p>
          <h1>Entra nel gioco.</h1>
          <p className={styles.tagline}>
            Sport locale, QR validato e reputazione che cresce. Accedi per iniziare.
          </p>
          {!startup ? (
            <Link to="/" className={styles.backLink}>
              <ArrowRight size={14} aria-hidden="true" style={{ transform: 'rotate(180deg)' }} />
              Torna alla home
            </Link>
          ) : null}
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
              <button
                type="button"
                className={styles.googleButton}
                onClick={onGoogleSignIn}
                disabled={busy}
              >
                <GoogleMark />
                <span>{busyAction === 'google' ? 'Apertura Google...' : 'Continua con Google'}</span>
              </button>

              <div className={styles.divider} aria-hidden="true">
                <span />
                <small>oppure</small>
                <span />
              </div>

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
                  {busyAction === 'password' ? 'Attendi...' : mode === 'register' ? 'Crea account' : 'Accedi'}
                </Button>
              </form>
            </>
          ) : null}

          {!isSupabaseConfigured ? (
            <>
              <div className={styles.actions}>
                <button type="button" className={styles.googleButton} onClick={() => onContinue('google')}>
                  <GoogleMark />
                  <span>Demo con Google</span>
                </button>
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
            Accedendo accetti i termini di servizio e la <a href="/privacy/">privacy policy di Motrice</a>.
          </p>
        </Card>
      </div>
    </section>
  );
}

export default LoginPage;

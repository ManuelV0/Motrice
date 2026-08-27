import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  Bell,
  BookOpenCheck,
  CreditCard,
  Cpu,
  HelpCircle,
  LogIn,
  PiggyBank,
  User
} from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useBilling } from '../context/BillingContext';
import { api } from '../services/api';
import { piggybank } from '../services/piggybank';
import { getAuthSession } from '../services/authSession';
import { getTutorialState, startTutorial } from '../services/tutorialMode';
import AccountStickyHeader from '../components/account/AccountStickyHeader';
import AccountMenuList from '../components/account/AccountMenuList';
import AccountSplash from '../components/account/AccountSplash';
import styles from '../styles/pages/account.module.css';

const SPLASH_KEY = 'motrice.accountSplashSeen';

function sessionSplashSeen() {
  try { return sessionStorage.getItem(SPLASH_KEY) === 'true'; } catch { return false; }
}
function markSessionSplash() {
  try { sessionStorage.setItem(SPLASH_KEY, 'true'); } catch { /* noop */ }
}

function AccountPage() {
  const navigate = useNavigate();
  const { subscription, isPremium } = useBilling();

  const [profile, setProfile] = useState({ display_name: 'Tu', avatar_url: '' });
  const [xpGlobal, setXpGlobal] = useState(0);
  const [badgeLabel, setBadgeLabel] = useState('Rame');
  const [wallet, setWallet] = useState(() => piggybank.getWallet());
  const [tutorialState, setTutorialState] = useState(() => getTutorialState());
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(() => !sessionSplashSeen());

  const session = getAuthSession();

  usePageMeta({
    title: 'Account | Motrice',
    description: 'Gestisci piano, stato abbonamento e funzionalita attive.'
  });

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setLoading(true);
      const [profileRes, xpRes] = await Promise.allSettled([
        api.getLocalProfile(),
        api.getXpState()
      ]);
      if (!active) return;

      if (profileRes.status === 'fulfilled') {
        const d = profileRes.value;
        setProfile({
          display_name: d?.display_name || d?.name || 'Tu',
          avatar_url: d?.avatar_url || ''
        });
      }

      if (xpRes.status === 'fulfilled') {
        setXpGlobal(xpRes.value?.xp_global ?? 0);
        setBadgeLabel(xpRes.value?.badge?.label || 'Rame');
      }

      setWallet(piggybank.getWallet());
      setLoading(false);
    }
    hydrate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function refreshWallet() { setWallet(piggybank.getWallet()); }
    window.addEventListener('focus', refreshWallet);
    return () => window.removeEventListener('focus', refreshWallet);
  }, []);

  const isTutorialActive = tutorialState.status === 'active';

  function handleTutorialNav() {
    if (isTutorialActive) {
      navigate(tutorialState.resumeRoute || '/tutorial');
      return;
    }
    setTutorialState(startTutorial(tutorialState.selectedRole));
    navigate('/tutorial');
  }

  const onSplashFinish = useCallback(() => {
    markSessionSplash();
    setShowSplash(false);
  }, []);

  const walletCents = Number(wallet.reinvested_cents || 0);
  const walletLabel = walletCents > 0 ? `${(walletCents / 100).toFixed(2)}€` : null;

  const mainItems = useMemo(() => [
    {
      id: 'profile',
      to: '/profile/me',
      icon: User,
      label: 'Profilo',
      sublabel: 'Bio, avatar e dati personali',
      iconColor: 'accent'
    },
    {
      id: 'wallet',
      to: '/convenzioni?view=wallet',
      icon: PiggyBank,
      label: 'Wallet',
      sublabel: 'Saldo e reinvestimento',
      iconColor: 'success',
      statusText: walletLabel
    },
    {
      id: 'plan',
      to: '/pricing',
      icon: CreditCard,
      label: 'Piano & Benefici',
      sublabel: 'Gestisci abbonamento e feature',
      iconColor: 'primary',
      statusText: isPremium ? 'PREMIUM' : subscription.plan.toUpperCase()
    },
    {
      id: 'xp',
      to: '/account/xp',
      icon: Award,
      label: 'XP & Badge',
      sublabel: `${badgeLabel} · ${xpGlobal} XP`,
      iconColor: 'primary'
    }
  ], [walletLabel, isPremium, subscription.plan, badgeLabel, xpGlobal]);

  const utilityItems = useMemo(() => [
    {
      id: 'notifications',
      to: '/notifications',
      icon: Bell,
      label: 'Notifiche',
      sublabel: 'Avvisi e aggiornamenti',
      iconColor: 'warning'
    },
    {
      id: 'tutorial',
      icon: BookOpenCheck,
      label: 'Tutorial',
      sublabel: isTutorialActive ? 'In corso — continua' : 'Scopri come funziona Motrice',
      iconColor: 'accent',
      statusText: isTutorialActive ? 'IN CORSO' : null,
      onClick: handleTutorialNav
    },
    {
      id: 'ai',
      to: '/account/ai',
      icon: Cpu,
      label: 'AI Locale',
      sublabel: 'Provider e impostazioni beta',
      iconColor: 'primary'
    },
    {
      id: 'support',
      to: '/faq',
      icon: HelpCircle,
      label: 'Supporto & FAQ',
      sublabel: 'Aiuto, domande frequenti',
      iconColor: 'muted'
    }
  ], [isTutorialActive]);

  const accountItems = useMemo(() => [
    {
      id: 'login',
      to: '/login',
      icon: LogIn,
      label: session.isAuthenticated ? 'Account & Sessione' : 'Accedi',
      sublabel: session.isAuthenticated
        ? `${session.provider || 'Connesso'}${session.userId ? ` · #${session.userId}` : ''}`
        : 'Email, password e sincronizzazione Supabase',
      iconColor: session.isAuthenticated ? 'success' : 'accent',
      statusText: session.isAuthenticated ? 'CONNESSO' : null
    }
  ], [session.isAuthenticated, session.provider, session.userId]);

  return (
    <>
      {showSplash ? <AccountSplash onFinish={onSplashFinish} /> : null}
      <section className={styles.page}>
        {!loading && (
          <>
            <AccountStickyHeader
              displayName={profile.display_name}
              avatarUrl={profile.avatar_url}
              plan={subscription.plan}
              xpGlobal={xpGlobal}
            />
            <AccountMenuList items={mainItems} sectionLabel="Principale" />
            <AccountMenuList items={utilityItems} sectionLabel="Impostazioni" />
            <AccountMenuList items={accountItems} sectionLabel="Account" />
          </>
        )}
      </section>
    </>
  );
}

export default AccountPage;

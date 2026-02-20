import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  activateFreeWithAdsDev,
  activateFreeOnlyDev,
  activatePremiumDev,
  activateRewardedUnlockDev,
  getSubscriptionWithEntitlements,
  loadSubscription
} from '../services/subscriptionStore';

const BillingContext = createContext(null);

export function BillingProvider({ children }) {
  const [subscription, setSubscription] = useState(() => getSubscriptionWithEntitlements(loadSubscription()));

  function refresh() {
    setSubscription(getSubscriptionWithEntitlements(loadSubscription()));
  }

  useEffect(() => {
    function onAuthChanged() {
      refresh();
    }

    function onStorage(event) {
      if (event.key === 'motrice_auth_session_v1' || event.key === 'motrice_subscription_v2') {
        refresh();
      }
    }

    window.addEventListener('motrice-auth-changed', onAuthChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('motrice-auth-changed', onAuthChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const unlockEndsAt = Date.parse(subscription.rewarded_status?.unlock_ends_at || '');
    if (!Number.isFinite(unlockEndsAt) || unlockEndsAt <= Date.now()) return undefined;

    const delayMs = Math.max(0, unlockEndsAt - Date.now()) + 250;
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [subscription.rewarded_status?.unlock_ends_at]);

  useEffect(() => {
    const periodEndMs = Date.parse(subscription.current_period_end || '');
    if (subscription.plan !== 'premium' || !Number.isFinite(periodEndMs) || periodEndMs <= Date.now()) return undefined;

    const delayMs = Math.max(0, periodEndMs - Date.now()) + 250;
    const timeoutId = window.setTimeout(() => {
      refresh();
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [subscription.plan, subscription.current_period_end]);

  function activatePremium() {
    setSubscription(activatePremiumDev());
  }

  function activateFreeOnly() {
    setSubscription(activateFreeOnlyDev());
  }

  function activateFreeWithAds() {
    setSubscription(activateFreeWithAdsDev());
  }

  function activateRewardedUnlock() {
    const next = activateRewardedUnlockDev();
    setSubscription(next);
    return next;
  }

  const value = useMemo(
    () => ({
      subscription,
      entitlements: subscription.entitlements,
      refresh,
      activatePremium,
      activateFreeWithAds,
      activateFreeOnly,
      activateRewardedUnlock,
      isPremium: subscription.plan === 'premium',
      isRewardedUnlockActive: Boolean(subscription.rewarded_status?.is_active),
      rewardedStatus: subscription.rewarded_status
    }),
    [subscription]
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  const context = useContext(BillingContext);
  if (!context) throw new Error('useBilling must be used inside BillingProvider');
  return context;
}

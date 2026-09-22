export const PLAN_DEFINITIONS = {
  free: {
    key: 'free',
    label: 'Free con pubblicita',
    price: '0 EUR',
    maxEventsPerMonth: 3,
    canUseAdvancedFilters: false,
    canUseAgendaWeekMonth: false,
    canExportICS: false,
    canUseNotifications: true,
    canUseCoachChat: false
  },
  free_only: {
    key: 'free_only',
    label: 'Free solo',
    price: '0 EUR',
    maxEventsPerMonth: 3,
    canUseAdvancedFilters: false,
    canUseAgendaWeekMonth: false,
    canExportICS: false,
    canUseNotifications: true,
    canUseCoachChat: false
  },
  premium: {
    key: 'premium',
    label: 'Premium',
    price: '12 EUR / mese',
    maxEventsPerMonth: Number.POSITIVE_INFINITY,
    canUseAdvancedFilters: true,
    canUseAgendaWeekMonth: true,
    canExportICS: true,
    canUseNotifications: true,
    canUseCoachChat: true
  }
};

// Temporary beta policy: every user-facing Premium capability is available
// without a subscription. Keep this switch centralized so paid plans can be
// reintroduced later without hunting for individual UI gates.
export const PREMIUM_FEATURES_FREE = true;

export const PREMIUM_MONTHLY_PRICE_EUR = 12;
export const COACH_CHAT_REVENUE_SHARE_PCT = 30;
export const REWARDED_UNLOCK_MINUTES = 45;
export const REWARDED_VIDEOS_REQUIRED = 3;
export const REWARDED_DAILY_LIMIT = 3;
export const REWARDED_DAILY_UNLOCK_LIMIT = 1;
export const REWARDED_COOLDOWN_MINUTES = 20;

export function getEntitlements(plan = 'free') {
  const planEntitlements = PLAN_DEFINITIONS[plan] || PLAN_DEFINITIONS.free;
  if (!PREMIUM_FEATURES_FREE) return planEntitlements;

  return {
    ...planEntitlements,
    maxEventsPerMonth: Number.POSITIVE_INFINITY,
    canUseAdvancedFilters: true,
    canUseAgendaWeekMonth: true,
    canExportICS: true,
    canUseNotifications: true,
    canUseCoachChat: true,
    premiumFeaturesFree: true
  };
}

export function isUnlimited(limit) {
  return limit === Number.POSITIVE_INFINITY;
}

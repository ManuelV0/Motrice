export const PLAN_DEFINITIONS = {
  free: {
    key: 'free',
    label: 'Free con pubblicita',
    price: '0 EUR',
    maxEventsPerMonth: 3,
    canUseAdvancedFilters: false,
    canUseAgendaWeekMonth: false,
    canExportICS: false,
    canUseNotifications: false,
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
    canUseNotifications: false,
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

export const PREMIUM_MONTHLY_PRICE_EUR = 12;
export const COACH_CHAT_REVENUE_SHARE_PCT = 30;
export const REWARDED_UNLOCK_MINUTES = 45;
export const REWARDED_VIDEOS_REQUIRED = 3;
export const REWARDED_DAILY_LIMIT = 3;
export const REWARDED_DAILY_UNLOCK_LIMIT = 1;
export const REWARDED_COOLDOWN_MINUTES = 20;

export function getEntitlements(plan = 'free') {
  return PLAN_DEFINITIONS[plan] || PLAN_DEFINITIONS.free;
}

export function isUnlimited(limit) {
  return limit === Number.POSITIVE_INFINITY;
}

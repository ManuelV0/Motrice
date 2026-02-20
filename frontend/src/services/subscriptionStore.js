import { getEntitlements } from './entitlements';
import { getAuthSession } from './authSession';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/safeStorage';
import {
  REWARDED_COOLDOWN_MINUTES,
  REWARDED_DAILY_LIMIT,
  REWARDED_DAILY_UNLOCK_LIMIT,
  REWARDED_UNLOCK_MINUTES,
  REWARDED_VIDEOS_REQUIRED
} from './entitlements';

const SUBSCRIPTION_KEY = 'motrice_subscription_v2';

const defaultSubscription = {
  plan: 'free',
  status: 'active',
  current_period_start: null,
  current_period_end: null,
  provider: 'dev',
  rewarded_unlock_until: null,
  rewarded_day_key: null,
  rewarded_videos_today: 0,
  rewarded_unlocks_today: 0,
  rewarded_progress_videos: 0,
  rewarded_last_video_at: null
};

function normalizePlan(plan) {
  if (plan === 'premium' || plan === 'free_only') return plan;
  return 'free';
}

function isPremiumExpired(subscription, now = Date.now()) {
  if (subscription.plan !== 'premium') return false;
  const periodEndMs = Date.parse(subscription.current_period_end || '');
  if (!Number.isFinite(periodEndMs)) return false;
  return periodEndMs <= now;
}

function applyPlanLifecycle(subscription) {
  const now = Date.now();
  if (!isPremiumExpired(subscription, now)) return subscription;

  return {
    ...subscription,
    plan: 'free',
    status: 'active',
    current_period_start: null,
    current_period_end: null,
    rewarded_unlock_until: null,
    rewarded_progress_videos: 0
  };
}

function toLocalDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeRewardState(subscription) {
  const lifecycleAdjusted = applyPlanLifecycle(subscription);
  const dayKey = toLocalDayKey();
  if (lifecycleAdjusted.rewarded_day_key !== dayKey) {
    return {
      ...lifecycleAdjusted,
      rewarded_day_key: dayKey,
      rewarded_videos_today: 0,
      rewarded_unlocks_today: 0,
      rewarded_progress_videos: 0
    };
  }

  const progress = Number.isFinite(Number(lifecycleAdjusted.rewarded_progress_videos))
    ? Number(lifecycleAdjusted.rewarded_progress_videos)
    : 0;
  const unlocksToday = Number.isFinite(Number(lifecycleAdjusted.rewarded_unlocks_today))
    ? Number(lifecycleAdjusted.rewarded_unlocks_today)
    : 0;
  const unlockEndsAt = Date.parse(lifecycleAdjusted.rewarded_unlock_until || '');
  const hasActiveUnlock = Number.isFinite(unlockEndsAt) && unlockEndsAt > Date.now();
  const videosToday = Number.isFinite(Number(lifecycleAdjusted.rewarded_videos_today))
    ? Number(lifecycleAdjusted.rewarded_videos_today)
    : 0;

  // Heal legacy/inconsistent counters: partial streak should always be completable.
  if (
    lifecycleAdjusted.plan === 'free' &&
    !hasActiveUnlock &&
    unlocksToday === 0 &&
    progress > 0 &&
    progress < REWARDED_VIDEOS_REQUIRED &&
    videosToday >= REWARDED_DAILY_LIMIT
  ) {
    return {
      ...subscription,
      ...lifecycleAdjusted,
      rewarded_videos_today: progress
    };
  }

  return lifecycleAdjusted;
}

function isRewardedUnlockActive(subscription, now = Date.now()) {
  if (subscription?.plan === 'free_only') return false;
  if (!subscription?.rewarded_unlock_until) return false;
  const unlockEndsAt = Date.parse(subscription.rewarded_unlock_until);
  return Number.isFinite(unlockEndsAt) && unlockEndsAt > now;
}

function resolveEffectivePlan(subscription) {
  if (subscription.plan === 'premium') return 'premium';
  if (subscription.plan === 'free_only') return 'free';
  return isRewardedUnlockActive(subscription) ? 'premium' : 'free';
}

function resolveSubscriptionUserKey() {
  const session = getAuthSession();
  const userId = Number(session.userId);
  // Keep billing identity aligned with API dev fallback user (id 1) when not logged in.
  return Number.isInteger(userId) && userId > 0 ? String(userId) : '1';
}

export function loadSubscription() {
  const raw = safeStorageGet(SUBSCRIPTION_KEY);
  if (!raw) return { ...defaultSubscription };

  try {
    const parsed = JSON.parse(raw);
    const userKey = resolveSubscriptionUserKey();

    // Legacy migration: previous versions stored a single subscription object.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...defaultSubscription };
    }

    const looksLegacy =
      Object.prototype.hasOwnProperty.call(parsed, 'plan') ||
      Object.prototype.hasOwnProperty.call(parsed, 'status') ||
      Object.prototype.hasOwnProperty.call(parsed, 'current_period_end') ||
      Object.prototype.hasOwnProperty.call(parsed, 'provider');

    if (looksLegacy) {
      const legacy = normalizeRewardState({
        ...defaultSubscription,
        ...parsed,
        plan: normalizePlan(parsed.plan)
      });
      const migrated = { [userKey]: legacy };
      safeStorageSet(SUBSCRIPTION_KEY, JSON.stringify(migrated));
      return legacy;
    }

    const scoped = parsed[userKey];
    if (!scoped || typeof scoped !== 'object') {
      const guestScoped = parsed.guest;
      if (guestScoped && typeof guestScoped === 'object' && userKey === '1') {
        const migratedGuest = normalizeRewardState({
          ...defaultSubscription,
          ...guestScoped,
          plan: normalizePlan(guestScoped.plan)
        });
        const migrated = { ...parsed, [userKey]: migratedGuest };
        delete migrated.guest;
        safeStorageSet(SUBSCRIPTION_KEY, JSON.stringify(migrated));
        return migratedGuest;
      }
      return { ...defaultSubscription };
    }
    const mergedScoped = {
      ...defaultSubscription,
      ...scoped,
      plan: normalizePlan(scoped.plan)
    };
    const normalizedScoped = normalizeRewardState(mergedScoped);
    if (
      mergedScoped.plan !== normalizedScoped.plan ||
      mergedScoped.status !== normalizedScoped.status ||
      mergedScoped.current_period_start !== normalizedScoped.current_period_start ||
      mergedScoped.current_period_end !== normalizedScoped.current_period_end
    ) {
      parsed[userKey] = normalizedScoped;
      safeStorageSet(SUBSCRIPTION_KEY, JSON.stringify(parsed));
    }
    return normalizedScoped;
  } catch {
    safeStorageRemove(SUBSCRIPTION_KEY);
    return { ...defaultSubscription };
  }
}

export function saveSubscription(subscription) {
  const raw = safeStorageGet(SUBSCRIPTION_KEY);
  let parsed = {};
  if (raw) {
    try {
      const candidate = JSON.parse(raw);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const looksLegacy =
          Object.prototype.hasOwnProperty.call(candidate, 'plan') ||
          Object.prototype.hasOwnProperty.call(candidate, 'status') ||
          Object.prototype.hasOwnProperty.call(candidate, 'current_period_end') ||
          Object.prototype.hasOwnProperty.call(candidate, 'provider');
        // Never keep legacy root shape: it can shadow scoped records on next load.
        parsed = looksLegacy ? {} : candidate;
      }
    } catch {
      parsed = {};
    }
  }
  const userKey = resolveSubscriptionUserKey();
  parsed[userKey] = normalizeRewardState({
    ...defaultSubscription,
    ...subscription,
    plan: normalizePlan(subscription.plan)
  });
  safeStorageSet(SUBSCRIPTION_KEY, JSON.stringify(parsed));
}

export function getSubscriptionWithEntitlements(subscription) {
  const normalized = normalizeRewardState({ ...defaultSubscription, ...subscription });
  const effectivePlan = resolveEffectivePlan(normalized);
  const rewardStatus = getRewardedStatus(normalized);
  const baseEntitlements = getEntitlements(effectivePlan);
  const entitlements = {
    ...baseEntitlements,
    // Product rule: coach chat is reserved to active paid Premium only.
    canUseCoachChat: normalized.plan === 'premium'
  };
  return {
    ...normalized,
    effective_plan: effectivePlan,
    rewarded_status: rewardStatus,
    entitlements
  };
}

export function activatePremiumDev() {
  const periodStart = new Date().toISOString();
  const next = {
    ...loadSubscription(),
    plan: 'premium',
    status: 'active',
    provider: 'dev',
    current_period_start: periodStart,
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    rewarded_progress_videos: 0
  };

  saveSubscription(next);
  return getSubscriptionWithEntitlements(next);
}

export function activateFreeWithAdsDev() {
  const current = loadSubscription();
  const dayKey = toLocalDayKey();
  const next = {
    ...current,
    plan: 'free',
    status: 'active',
    provider: 'dev',
    current_period_start: null,
    current_period_end: null,
    rewarded_day_key: dayKey,
    rewarded_videos_today: 0,
    rewarded_unlocks_today: 0,
    rewarded_unlock_until: null,
    rewarded_progress_videos: 0,
    rewarded_last_video_at: null
  };

  saveSubscription(next);
  return getSubscriptionWithEntitlements(next);
}

export function getRewardedStatus(subscription = loadSubscription()) {
  const normalized = normalizeRewardState({ ...defaultSubscription, ...subscription });
  const now = Date.now();
  const unlockEndsAt = Date.parse(normalized.rewarded_unlock_until || '');
  const lastVideoAt = Date.parse(normalized.rewarded_last_video_at || '');

  const isActive = isRewardedUnlockActive(normalized, now);
  const videosToday = Number.isFinite(Number(normalized.rewarded_videos_today))
    ? Number(normalized.rewarded_videos_today)
    : 0;
  const videosRemaining = Math.max(0, REWARDED_DAILY_LIMIT - videosToday);
  const unlocksToday = Number.isFinite(Number(normalized.rewarded_unlocks_today))
    ? Number(normalized.rewarded_unlocks_today)
    : 0;
  const unlocksRemaining = Math.max(0, REWARDED_DAILY_UNLOCK_LIMIT - unlocksToday);
  const progressVideosRaw = Number.isFinite(Number(normalized.rewarded_progress_videos))
    ? Number(normalized.rewarded_progress_videos)
    : 0;
  const progressVideos = isActive ? 0 : Math.min(REWARDED_VIDEOS_REQUIRED - 1, Math.max(0, progressVideosRaw));
  const videosToUnlock = isActive ? 0 : Math.max(0, REWARDED_VIDEOS_REQUIRED - progressVideos);
  const hasPendingProgress = !isActive && progressVideos > 0 && progressVideos < REWARDED_VIDEOS_REQUIRED;
  const cooldownEndsAt = Number.isFinite(lastVideoAt)
    ? lastVideoAt + REWARDED_COOLDOWN_MINUTES * 60 * 1000
    : null;
  const inCooldown = Number.isFinite(cooldownEndsAt) && cooldownEndsAt > now;
  const canCompleteStreak =
    normalized.plan === 'free' &&
    !isActive &&
    unlocksRemaining > 0 &&
    videosRemaining > 0 &&
    hasPendingProgress;

  let reason = null;
  if (normalized.plan === 'premium') {
    reason = 'premium_active';
  } else if (normalized.plan === 'free_only') {
    reason = 'free_only_plan';
  } else if (unlocksRemaining === 0) {
    reason = 'daily_unlock_used';
  } else if (videosRemaining === 0) {
    reason = 'daily_limit_reached';
  } else if (inCooldown && !canCompleteStreak) {
    reason = 'cooldown_active';
  }

  return {
    is_active: isActive,
    unlock_ends_at: Number.isFinite(unlockEndsAt) ? new Date(unlockEndsAt).toISOString() : null,
    videos_today: videosToday,
    videos_remaining: videosRemaining,
    unlocks_today: unlocksToday,
    unlocks_remaining: unlocksRemaining,
    progress_videos: progressVideos,
    videos_required: REWARDED_VIDEOS_REQUIRED,
    videos_to_unlock: videosToUnlock,
    can_watch_now:
      normalized.plan !== 'premium' &&
      normalized.plan !== 'free_only' &&
      unlocksRemaining > 0 &&
      !isActive &&
      videosRemaining > 0 &&
      (!inCooldown || canCompleteStreak),
    cooldown_ends_at: Number.isFinite(cooldownEndsAt) ? new Date(cooldownEndsAt).toISOString() : null,
    reason
  };
}

export function activateRewardedUnlockDev() {
  const current = normalizeRewardState(loadSubscription());
  const status = getRewardedStatus(current);
  const currentProgress = Number.isFinite(Number(current.rewarded_progress_videos))
    ? Number(current.rewarded_progress_videos)
    : 0;
  const isFinalStepReady = current.plan === 'free' && currentProgress >= REWARDED_VIDEOS_REQUIRED - 1;
  const canForceFinalStep =
    !status.is_active &&
    isFinalStepReady &&
    Number(status.unlocks_remaining || 0) > 0 &&
    Number(status.videos_remaining || 0) > 0;

  if (!status.can_watch_now && !canForceFinalStep) {
    if (status.reason === 'daily_limit_reached') {
      throw new Error(`Limite giornaliero raggiunto: massimo ${REWARDED_DAILY_LIMIT} video.`);
    }
    if (status.reason === 'cooldown_active' && status.cooldown_ends_at) {
      throw new Error(`Attendi il cooldown prima di guardare un altro video.`);
    }
    if (status.reason === 'premium_active') {
      throw new Error('Hai gia Premium attivo.');
    }
    if (status.reason === 'free_only_plan') {
      throw new Error('Il piano Free solo non include lo sblocco Pro via video.');
    }
    if (status.reason === 'daily_unlock_used') {
      throw new Error('Hai gia usato lo sblocco Premium di oggi. Riprova domani.');
    }
    if (status.is_active) {
      throw new Error('Sblocco Pro gia attivo.');
    }
    throw new Error('Video non disponibile in questo momento.');
  }

  const now = Date.now();
  const dayKey = toLocalDayKey(new Date(now));
  const nextVideosToday = Number(current.rewarded_videos_today || 0) + 1;
  const nextProgressVideos = Number(current.rewarded_progress_videos || 0) + 1;
  const unlockedNow = nextProgressVideos >= REWARDED_VIDEOS_REQUIRED;
  const nextUnlocksToday = Number(current.rewarded_unlocks_today || 0) + (unlockedNow ? 1 : 0);
  const next = {
    ...current,
    plan: 'free',
    status: 'active',
    provider: 'dev',
    rewarded_day_key: dayKey,
    rewarded_videos_today: nextVideosToday,
    rewarded_unlocks_today: nextUnlocksToday,
    rewarded_progress_videos: unlockedNow ? 0 : nextProgressVideos,
    rewarded_last_video_at: new Date(now).toISOString(),
    rewarded_unlock_until: unlockedNow ? new Date(now + REWARDED_UNLOCK_MINUTES * 60 * 1000).toISOString() : null
  };

  saveSubscription(next);
  const result = getSubscriptionWithEntitlements(next);
  return {
    ...result,
    rewarded_result: {
      unlocked_now: unlockedNow,
      progress_videos: unlockedNow ? REWARDED_VIDEOS_REQUIRED : nextProgressVideos,
      videos_required: REWARDED_VIDEOS_REQUIRED,
      videos_to_unlock: unlockedNow ? 0 : REWARDED_VIDEOS_REQUIRED - nextProgressVideos
    }
  };
}

export function activateFreeOnlyDev() {
  const next = {
    ...loadSubscription(),
    plan: 'free_only',
    status: 'active',
    provider: 'dev',
    current_period_start: null,
    current_period_end: null,
    rewarded_unlock_until: null,
    rewarded_progress_videos: 0
  };

  saveSubscription(next);
  return getSubscriptionWithEntitlements(next);
}

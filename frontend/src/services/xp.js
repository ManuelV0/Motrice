import { getAuthSession } from './authSession';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';

const OPERATIONAL_STORE_KEY = 'motrice_operational_store_v2';
const XP_DAILY_GLOBAL_CAP = 200;
const XP_DAILY_SPORT_CAP = 120;
const XP_MAX_HISTORY = 800;
const XP_MAX_REWARDED_REFS = 4000;
const XP_MAX_DAILY_BUCKETS = 45;

const BADGE_LEVELS = [
  { key: 'rame', label: 'Rame', min: 0, max: 99 },
  { key: 'bronzo', label: 'Bronzo', min: 100, max: 249 },
  { key: 'argento', label: 'Argento', min: 250, max: 499 },
  { key: 'oro', label: 'Oro', min: 500, max: 999 },
  { key: 'diamante', label: 'Diamante', min: 1000, max: Number.POSITIVE_INFINITY }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowMs() {
  return Date.now();
}

function clampNonNegative(value) {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return 0;
  return Math.max(0, Math.round(safeValue));
}

function sanitizeUserId(value) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return null;
}

function resolveXpUserId(preferredUserId) {
  const fromArgs = sanitizeUserId(preferredUserId);
  if (fromArgs) return fromArgs;
  const session = getAuthSession();
  const fromSession = sanitizeUserId(session.userId);
  return fromSession || 1;
}

function normalizeSportId(sportId, fallback = 'generic') {
  const raw = String(sportId || fallback || 'generic').trim().toLowerCase();
  return raw || 'generic';
}

function dayKeyFromTs(ts) {
  const date = new Date(Number.isFinite(ts) ? ts : nowMs());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureXpRoot(store) {
  if (!store || typeof store !== 'object') {
    return { xp: { by_user: {} } };
  }
  if (!store.xp || typeof store.xp !== 'object') {
    store.xp = { by_user: {} };
  }
  if (!store.xp.by_user || typeof store.xp.by_user !== 'object') {
    store.xp.by_user = {};
  }
  return store;
}

function normalizeUserXpState(raw = {}) {
  return {
    xp_global: clampNonNegative(raw.xp_global),
    xp_by_sport: raw.xp_by_sport && typeof raw.xp_by_sport === 'object' ? { ...raw.xp_by_sport } : {},
    xp_history: Array.isArray(raw.xp_history) ? raw.xp_history : [],
    rewarded_refs: raw.rewarded_refs && typeof raw.rewarded_refs === 'object' ? { ...raw.rewarded_refs } : {},
    daily_caps: raw.daily_caps && typeof raw.daily_caps === 'object' ? { ...raw.daily_caps } : {},
    updated_at: String(raw.updated_at || '') || null
  };
}

function ensureUserXpState(store, userId) {
  ensureXpRoot(store);
  const key = String(resolveXpUserId(userId));
  const current = normalizeUserXpState(store.xp.by_user[key]);
  store.xp.by_user[key] = current;
  return { state: current, key };
}

function ensureDailyBucket(state, dayKey) {
  const bucket = state.daily_caps[dayKey] || { global_awarded: 0, by_sport: {} };
  const normalized = {
    global_awarded: clampNonNegative(bucket.global_awarded),
    by_sport: bucket.by_sport && typeof bucket.by_sport === 'object' ? { ...bucket.by_sport } : {}
  };
  state.daily_caps[dayKey] = normalized;
  return normalized;
}

function pruneDailyCaps(state) {
  const keys = Object.keys(state.daily_caps || {}).sort();
  if (keys.length <= XP_MAX_DAILY_BUCKETS) return;
  const toRemove = keys.slice(0, keys.length - XP_MAX_DAILY_BUCKETS);
  toRemove.forEach((key) => {
    delete state.daily_caps[key];
  });
}

function pruneRewardedRefs(state) {
  const entries = Object.entries(state.rewarded_refs || {});
  if (entries.length <= XP_MAX_REWARDED_REFS) return;
  entries.sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0));
  const removeCount = entries.length - XP_MAX_REWARDED_REFS;
  for (let i = 0; i < removeCount; i += 1) {
    delete state.rewarded_refs[entries[i][0]];
  }
}

function readOperationalStore() {
  const raw = safeStorageGet(OPERATIONAL_STORE_KEY);
  if (!raw) return { xp: { by_user: {} } };
  try {
    const parsed = JSON.parse(raw);
    return ensureXpRoot(parsed);
  } catch {
    return { xp: { by_user: {} } };
  }
}

function saveOperationalStore(store) {
  safeStorageSet(OPERATIONAL_STORE_KEY, JSON.stringify(store));
}

export function getBadgeFromXp(xpGlobal) {
  const safeXp = clampNonNegative(xpGlobal);
  const current = BADGE_LEVELS.find((badge) => safeXp >= badge.min && safeXp <= badge.max) || BADGE_LEVELS[0];
  return {
    key: current.key,
    label: current.label,
    min: current.min,
    max: Number.isFinite(current.max) ? current.max : null
  };
}

export function getXpProgressToNextBadge(xpGlobal) {
  const safeXp = clampNonNegative(xpGlobal);
  const currentBadge = getBadgeFromXp(safeXp);
  const currentIndex = BADGE_LEVELS.findIndex((badge) => badge.key === currentBadge.key);
  const nextBadge = currentIndex >= 0 ? BADGE_LEVELS[currentIndex + 1] : null;

  if (!nextBadge) {
    return {
      currentXp: safeXp,
      currentThreshold: currentBadge.min,
      nextThreshold: null,
      progressPct: 100
    };
  }

  const span = Math.max(1, nextBadge.min - currentBadge.min);
  const covered = Math.max(0, Math.min(span, safeXp - currentBadge.min));
  const progressPct = Math.round((covered / span) * 100);

  return {
    currentXp: safeXp,
    currentThreshold: currentBadge.min,
    nextThreshold: nextBadge.min,
    progressPct
  };
}

export function getXpState(userId, externalStore = null) {
  const targetUserId = resolveXpUserId(userId);
  const store = externalStore || readOperationalStore();
  const { state } = ensureUserXpState(store, targetUserId);

  const normalizedSport = {};
  Object.entries(state.xp_by_sport || {}).forEach(([sportKey, xp]) => {
    normalizedSport[normalizeSportId(sportKey)] = clampNonNegative(xp);
  });

  const xpGlobal = clampNonNegative(state.xp_global);
  const badge = getBadgeFromXp(xpGlobal);
  const progress = getXpProgressToNextBadge(xpGlobal);

  return {
    user_id: targetUserId,
    xp_global: xpGlobal,
    xp_by_sport: normalizedSport,
    xp_history: Array.isArray(state.xp_history) ? state.xp_history : [],
    badge,
    progress,
    limits: {
      daily_global_cap: XP_DAILY_GLOBAL_CAP,
      daily_sport_cap: XP_DAILY_SPORT_CAP
    },
    updated_at: state.updated_at || null
  };
}

export function awardXp(payload = {}, externalStore = null) {
  const store = externalStore || readOperationalStore();
  const tsMs = Number.isFinite(Number(payload.ts)) ? Number(payload.ts) : nowMs();
  const targetUserId = resolveXpUserId(payload.userId);
  const sportId = normalizeSportId(payload.sportId, 'generic');
  const type = String(payload.type || 'xp_adjustment').trim() || 'xp_adjustment';
  const rewardRef = String(payload.refId || '').trim();
  const rewardKey = rewardRef ? `${type}:${rewardRef}` : '';

  const { state, key } = ensureUserXpState(store, targetUserId);

  if (rewardKey && state.rewarded_refs[rewardKey]) {
    const snapshot = getXpState(targetUserId, store);
    if (!externalStore) saveOperationalStore(store);
    return {
      applied: false,
      duplicate: true,
      xp: snapshot,
      event: null
    };
  }

  const requestedGlobal = Number(payload.pointsGlobal || 0);
  const requestedSport = Number(payload.pointsSport || 0);
  const dayKey = dayKeyFromTs(tsMs);
  const dailyBucket = ensureDailyBucket(state, dayKey);

  const positiveGlobal = Math.max(0, Math.round(requestedGlobal));
  const negativeGlobal = Math.min(0, Math.round(requestedGlobal));
  const positiveSport = Math.max(0, Math.round(requestedSport));
  const negativeSport = Math.min(0, Math.round(requestedSport));

  const availableGlobal = Math.max(0, XP_DAILY_GLOBAL_CAP - clampNonNegative(dailyBucket.global_awarded));
  const sportAwardedToday = clampNonNegative(dailyBucket.by_sport[sportId]);
  const availableSport = Math.max(0, XP_DAILY_SPORT_CAP - sportAwardedToday);

  const appliedPositiveGlobal = Math.min(positiveGlobal, availableGlobal);
  const appliedPositiveSport = Math.min(positiveSport, availableSport);
  const appliedGlobal = appliedPositiveGlobal + negativeGlobal;
  const appliedSport = appliedPositiveSport + negativeSport;

  const prevGlobal = clampNonNegative(state.xp_global);
  const prevSport = clampNonNegative(state.xp_by_sport[sportId]);

  const nextGlobal = clampNonNegative(prevGlobal + appliedGlobal);
  const nextSport = clampNonNegative(prevSport + appliedSport);

  state.xp_global = nextGlobal;
  state.xp_by_sport[sportId] = nextSport;
  dailyBucket.global_awarded = clampNonNegative(dailyBucket.global_awarded + appliedPositiveGlobal);
  dailyBucket.by_sport[sportId] = clampNonNegative(sportAwardedToday + appliedPositiveSport);

  const eventRecord = {
    id: `xp_${tsMs}_${Math.random().toString(16).slice(2, 8)}`,
    userId: Number(key),
    type,
    points: Number(appliedGlobal || 0),
    sportId,
    refId: rewardRef || null,
    ts: new Date(tsMs).toISOString(),
    meta: {
      points_sport: Number(appliedSport || 0),
      points_requested_global: Number.isFinite(requestedGlobal) ? Math.round(requestedGlobal) : 0,
      points_requested_sport: Number.isFinite(requestedSport) ? Math.round(requestedSport) : 0,
      daily_global_cap_hit: positiveGlobal > appliedPositiveGlobal,
      daily_sport_cap_hit: positiveSport > appliedPositiveSport,
      ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {})
    }
  };

  if (rewardKey) {
    state.rewarded_refs[rewardKey] = tsMs;
  }

  state.xp_history = [eventRecord, ...(Array.isArray(state.xp_history) ? state.xp_history : [])].slice(0, XP_MAX_HISTORY);
  state.updated_at = new Date(tsMs).toISOString();

  pruneDailyCaps(state);
  pruneRewardedRefs(state);

  const snapshot = getXpState(targetUserId, store);
  if (!externalStore) {
    saveOperationalStore(store);
  }

  return {
    applied: true,
    duplicate: false,
    xp: snapshot,
    event: eventRecord
  };
}

export const xpConfig = {
  dailyGlobalCap: XP_DAILY_GLOBAL_CAP,
  dailySportCap: XP_DAILY_SPORT_CAP,
  badgeLevels: BADGE_LEVELS.map((badge) => ({ ...badge }))
};

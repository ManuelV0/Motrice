const AUTH_KEY = 'motrice_auth_session_v1';
const STORE_KEY = 'motrice_operational_store_v2';
const LAST_PROVIDER_USER_MAP_KEY = 'motrice_partner_last_provider_users_v1';
const MAX_CONVENTION_COURSES = 5;
const PARTNER_SCORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PARTNER_FAST_REDEEM_MS = 45 * 60 * 1000;
const PARTNER_VOUCHER_VALIDITY_MS = 90 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readProviderUserMap() {
  const parsed = readJson(LAST_PROVIDER_USER_MAP_KEY, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

function saveProviderUser(provider, userId) {
  const normalizedProvider = String(provider || '').toLowerCase();
  const normalizedUserId = Number(userId);
  if (!normalizedProvider || !Number.isInteger(normalizedUserId) || normalizedUserId <= 0) return;
  const current = readProviderUserMap();
  writeJson(LAST_PROVIDER_USER_MAP_KEY, {
    ...current,
    [normalizedProvider]: normalizedUserId
  });
}

function decodeHandoffPayload(value) {
  try {
    const decoded = decodeURIComponent(escape(window.atob(String(value || ''))));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function initializeFromHandoff() {
  try {
    const url = new URL(window.location.href);
    const encoded = url.searchParams.get('handoff');
    if (!encoded) return false;
    const payload = decodeHandoffPayload(encoded);
    if (!payload || typeof payload !== 'object') return false;

    if (payload.auth && typeof payload.auth === 'object') {
      const userId = Number(payload.auth.userId);
      const normalizedUserId = Number.isInteger(userId) && userId > 0 ? userId : null;
      const provider = payload.auth.provider || null;
      writeJson(AUTH_KEY, {
        provider,
        accessToken: payload.auth.accessToken || null,
        userId: normalizedUserId,
        isAuthenticated: Boolean(payload.auth.isAuthenticated)
      });
      if (normalizedUserId) {
        saveProviderUser(provider, normalizedUserId);
      }
    }

    const baseStore = loadStore();
    const applications = Array.isArray(payload.applications)
      ? payload.applications
      : payload.application
        ? [payload.application]
        : [];
    const profiles = Array.isArray(payload.partner_profiles)
      ? payload.partner_profiles
      : payload.partner_profile
        ? [payload.partner_profile]
        : [];
    const vouchers = Array.isArray(payload.convention_vouchers) ? payload.convention_vouchers : [];
    const coursePromos = Array.isArray(payload.convention_course_promos) ? payload.convention_course_promos : [];

    const merged = {
      ...baseStore,
      conventionApplications: applications,
      partnerProfiles: profiles,
      conventionVouchers: vouchers,
      conventionCoursePromos: coursePromos,
      revokedAuthUserIds: Array.isArray(baseStore.revokedAuthUserIds) ? baseStore.revokedAuthUserIds : []
    };
    refreshAllPartnerProfiles(merged);
    saveStore(merged);
    url.searchParams.delete('handoff');
    window.history.replaceState({}, '', url.toString());
    return true;
  } catch {
    return false;
  }
}

function resolveVoucherStatus(voucher) {
  if (!voucher) return 'expired';
  if (String(voucher.status || '').toLowerCase() === 'redeemed') return 'redeemed';
  const expiresMs = Date.parse(voucher.expires_at || '');
  if (Number.isFinite(expiresMs)) {
    if (expiresMs <= nowMs()) return 'expired';
    return 'active';
  }
  const createdMs = Date.parse(voucher.created_at || '');
  if (Number.isFinite(createdMs) && createdMs + PARTNER_VOUCHER_VALIDITY_MS > nowMs()) {
    return 'active';
  }
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs()) return 'expired';
  return 'active';
}

function clampNonNegative(value) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe)) return 0;
  return Math.max(0, Math.round(safe));
}

function safeText(value) {
  return String(value || '').trim().toLowerCase();
}

function getPartnerBadgeFromScore(scoreRolling) {
  const score = clampNonNegative(scoreRolling);
  if (score >= 600) return 'diamante';
  if (score >= 300) return 'oro';
  if (score >= 150) return 'argento';
  if (score >= 50) return 'bronzo';
  return 'rame';
}

function ensurePartnerProfileShape(profile = {}) {
  const normalized = {
    ...profile,
    badge_level: String(profile.badge_level || 'rame').toLowerCase(),
    score_total: clampNonNegative(profile.score_total),
    score_rolling_30d: clampNonNegative(profile.score_rolling_30d),
    metrics_rolling_30d: {
      redeemed_count: clampNonNegative(profile?.metrics_rolling_30d?.redeemed_count),
      redeemed_amount_cents: clampNonNegative(profile?.metrics_rolling_30d?.redeemed_amount_cents),
      expired_count: clampNonNegative(profile?.metrics_rolling_30d?.expired_count),
      redeem_rate: Number(profile?.metrics_rolling_30d?.redeem_rate || 0)
    },
    score_history: Array.isArray(profile.score_history) ? profile.score_history : []
  };
  const denominator = normalized.metrics_rolling_30d.redeemed_count + normalized.metrics_rolling_30d.expired_count;
  normalized.metrics_rolling_30d.redeem_rate = Number(
    (normalized.metrics_rolling_30d.redeemed_count / Math.max(1, denominator)).toFixed(3)
  );
  return normalized;
}

function getPartnerMatcher(profile = {}) {
  const profileId = String(profile.id || '').trim();
  const profileToken = profileId ? `partner_profile_${profileId}` : '';
  const org = safeText(profile.organization);
  const city = safeText(profile.city);
  return function matches(voucher = {}) {
    const voucherPartnerId = String(voucher?.partner?.id || '').trim();
    if (profileToken && voucherPartnerId === profileToken) return true;
    if (profileId && voucherPartnerId === profileId) return true;
    if (org && city) {
      return safeText(voucher?.partner?.name) === org && safeText(voucher?.partner?.city) === city;
    }
    return false;
  };
}

function withinRollingWindow(tsMs, referenceMs = nowMs()) {
  if (!Number.isFinite(tsMs)) return false;
  return tsMs >= referenceMs - PARTNER_SCORE_WINDOW_MS && tsMs <= referenceMs;
}

function computePartnerRollingStats(partnerProfile, vouchers = [], referenceMs = nowMs()) {
  if (!partnerProfile) {
    return { redeemed_count: 0, redeemed_amount_cents: 0, expired_count: 0, redeem_rate: 0 };
  }
  const matches = getPartnerMatcher(partnerProfile);
  let redeemedCount = 0;
  let redeemedAmountCents = 0;
  let expiredCount = 0;
  vouchers.forEach((voucher) => {
    if (!matches(voucher)) return;
    const issuedMs = Date.parse(voucher?.created_at || '');
    if (!withinRollingWindow(issuedMs, referenceMs)) return;
    const status = resolveVoucherStatus(voucher);
    if (status === 'redeemed') {
      redeemedCount += 1;
      redeemedAmountCents += clampNonNegative(voucher?.cost_cents);
      return;
    }
    if (status === 'expired') {
      expiredCount += 1;
    }
  });
  const denominator = redeemedCount + expiredCount;
  return {
    redeemed_count: redeemedCount,
    redeemed_amount_cents: redeemedAmountCents,
    expired_count: expiredCount,
    redeem_rate: Number((redeemedCount / Math.max(1, denominator)).toFixed(3))
  };
}

function computePartnerScoreRolling30d(partnerProfile, referenceMs = nowMs()) {
  const history = Array.isArray(partnerProfile?.score_history) ? partnerProfile.score_history : [];
  const score = history
    .filter((entry) => withinRollingWindow(Date.parse(entry?.ts || ''), referenceMs))
    .reduce((sum, entry) => sum + Number(entry?.points || 0), 0);
  return clampNonNegative(score);
}

function refreshPartnerProfileBadge(store, partnerProfileId, referenceMs = nowMs()) {
  if (!Array.isArray(store.partnerProfiles)) return null;
  const index = store.partnerProfiles.findIndex((item) => String(item?.id || '') === String(partnerProfileId || ''));
  if (index < 0) return null;
  const current = ensurePartnerProfileShape(store.partnerProfiles[index]);
  const metrics = computePartnerRollingStats(current, store.conventionVouchers || [], referenceMs);
  const scoreRolling = computePartnerScoreRolling30d(current, referenceMs);
  const next = {
    ...current,
    score_rolling_30d: scoreRolling,
    metrics_rolling_30d: metrics,
    badge_level: getPartnerBadgeFromScore(scoreRolling)
  };
  store.partnerProfiles[index] = next;
  return next;
}

function refreshAllPartnerProfiles(store, referenceMs = nowMs()) {
  if (!Array.isArray(store.partnerProfiles)) return false;
  let changed = false;
  store.partnerProfiles = store.partnerProfiles.map((item) => ensurePartnerProfileShape(item || {}));
  for (let i = 0; i < store.partnerProfiles.length; i += 1) {
    const current = store.partnerProfiles[i];
    const beforeBadge = String(current?.badge_level || '');
    const beforeRolling = Number(current?.score_rolling_30d || 0);
    const beforeMetrics = JSON.stringify(current?.metrics_rolling_30d || {});
    const updated = refreshPartnerProfileBadge(store, current?.id, referenceMs) || current;
    const afterMetrics = JSON.stringify(updated.metrics_rolling_30d || {});
    if (
      beforeBadge !== String(updated.badge_level || '') ||
      beforeRolling !== Number(updated.score_rolling_30d || 0) ||
      beforeMetrics !== afterMetrics
    ) {
      changed = true;
    }
  }
  return changed;
}

function awardPartnerScoreOnRedeem({ store, partnerProfile, voucher, source }) {
  if (!store || !partnerProfile || !voucher) {
    return { applied: false, points: 0, reason: 'missing_target' };
  }
  const scoreHistory = Array.isArray(partnerProfile.score_history) ? partnerProfile.score_history : [];
  const voucherId = String(voucher.id || '');
  if (scoreHistory.some((entry) => String(entry?.voucherId || '') === voucherId)) {
    const refreshed = refreshPartnerProfileBadge(store, partnerProfile.id) || partnerProfile;
    return {
      applied: false,
      points: 0,
      reason: 'duplicate_voucher',
      badge_level: refreshed.badge_level,
      score_rolling_30d: refreshed.score_rolling_30d,
      metrics: refreshed.metrics_rolling_30d
    };
  }

  const issuedMs = Date.parse(voucher.created_at || '');
  const redeemedMs = Date.parse(voucher.redeemed_at || nowIso());
  const rollingStats = computePartnerRollingStats(partnerProfile, store.conventionVouchers || [], nowMs());
  const fastRedeem = Number.isFinite(issuedMs) && Number.isFinite(redeemedMs) && redeemedMs - issuedMs <= PARTNER_FAST_REDEEM_MS;
  const redeemRateBonus = Number(rollingStats.redeem_rate || 0) >= 0.85 ? 2 : 0;
  const points = 10 + (fastRedeem ? 3 : 0) + redeemRateBonus;
  const entry = {
    id: `ps_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    partnerId: String(partnerProfile.id || ''),
    voucherId,
    userId: Number(voucher.user_id || 0) || null,
    points,
    ts: nowIso(),
    meta: {
      source: String(source || 'partner_portal'),
      fastRedeem,
      redeem_rate_bucket:
        Number(rollingStats.redeem_rate || 0) >= 0.85
          ? 'high'
          : Number(rollingStats.redeem_rate || 0) <= 0.5
            ? 'low'
            : 'mid',
      redeem_rate_snapshot: Number(rollingStats.redeem_rate || 0)
    }
  };

  const partnerIndex = store.partnerProfiles.findIndex((item) => String(item?.id || '') === String(partnerProfile.id || ''));
  if (partnerIndex < 0) {
    return { applied: false, points: 0, reason: 'partner_not_found' };
  }
  store.partnerProfiles[partnerIndex] = {
    ...partnerProfile,
    score_total: clampNonNegative(partnerProfile.score_total + points),
    score_history: [entry, ...scoreHistory].slice(0, 600)
  };
  const voucherIndex = (store.conventionVouchers || []).findIndex((item) => String(item?.id || '') === voucherId);
  if (voucherIndex >= 0) {
    store.conventionVouchers[voucherIndex] = {
      ...store.conventionVouchers[voucherIndex],
      partner_score_points: points,
      partner_score_awarded_at: nowIso()
    };
  }
  const refreshed = refreshPartnerProfileBadge(store, partnerProfile.id) || store.partnerProfiles[partnerIndex];
  return {
    applied: true,
    points,
    reason: 'awarded',
    badge_level: refreshed.badge_level,
    score_rolling_30d: refreshed.score_rolling_30d,
    metrics: refreshed.metrics_rolling_30d
  };
}

function resolvePartnerActivationStatus(latestApplication, partnerProfile) {
  if (partnerProfile) {
    const rawStatus = String(partnerProfile.status || '').toLowerCase();
    const expiresMs = Date.parse(partnerProfile.subscription_expires_at || '');
    if (rawStatus === 'expired') return 'expired';
    if (rawStatus === 'active') {
      if (!Number.isFinite(expiresMs) || expiresMs <= nowMs()) {
        return 'expired';
      }
      return 'active';
    }
  }
  if (latestApplication && String(latestApplication.status || '').toLowerCase() === 'pending') return 'pending';
  return 'inactive';
}

function extractVoucherId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const fromPath = raw.match(/\/convenzioni\/voucher\/([A-Za-z0-9_-]+)/);
  if (fromPath?.[1]) return fromPath[1];
  return raw;
}

function normalizeCourseType(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function normalizePrice(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return NaN;
  return Math.round(normalized * 100) / 100;
}

function buildPromoCode(courseType) {
  const token = String(courseType || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    .padEnd(4, 'X');
  const random = Math.random().toString(36).toUpperCase().slice(2, 8);
  return `PRM-${token}-${random}`;
}

function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw.length <= 10 ? `${raw}T23:59:59.000Z` : raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function resolveCoursePromoStatus(item) {
  const raw = String(item?.status || '').toLowerCase();
  if (raw === 'inactive') return 'inactive';
  const expiresMs = Date.parse(item?.expires_at || '');
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs()) return 'expired';
  return 'active';
}

function withResolvedCoursePromo(item) {
  return {
    ...item,
    status: resolveCoursePromoStatus(item)
  };
}

function assertPremiumPartner(userId, store) {
  const partnerIndex = (store.partnerProfiles || []).findIndex((item) => Number(item.owner_user_id) === Number(userId));
  if (partnerIndex < 0) throw new Error('Profilo partner non attivo');
  const partner = store.partnerProfiles[partnerIndex];
  if (String(partner.status || '').toLowerCase() !== 'active') {
    throw new Error('Partner non attivo');
  }
  if (String(partner.plan || '').toLowerCase() !== 'premium') {
    throw new Error('Promo corsi disponibili solo con piano Premium');
  }
  return { partner, partnerIndex };
}

function sanitizeText(value, max = 200) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function sanitizeCourses(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeText(item, 80))
      .filter((item) => item.length > 0)
      .slice(0, 24);
  }
  return String(value || '')
    .split('\n')
    .map((item) => sanitizeText(item, 80))
    .filter((item) => item.length > 0)
    .slice(0, 24);
}

function sanitizeImageDataUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('data:image/')) throw new Error('Immagine non valida');
  if (raw.length > 2_500_000) throw new Error('Immagine troppo grande (max ~2MB)');
  return raw;
}

export function getAuthSession() {
  const parsed = readJson(AUTH_KEY, null);
  if (!parsed) return { provider: null, userId: null, isAuthenticated: false };
  const userId = Number(parsed.userId);
  return {
    provider: parsed.provider || null,
    userId: Number.isInteger(userId) && userId > 0 ? userId : null,
    isAuthenticated: Boolean(parsed.isAuthenticated)
  };
}

export function continueWithProvider(provider) {
  const normalized = String(provider || '').toLowerCase();
  const rememberedByProvider = Number(readProviderUserMap()[normalized]);
  const fallbackUserId = normalized === 'facebook' ? 2 : 1;
  const userId =
    Number.isInteger(rememberedByProvider) && rememberedByProvider > 0
      ? rememberedByProvider
      : fallbackUserId;
  const next = { provider: normalized, accessToken: null, userId, isAuthenticated: true };
  writeJson(AUTH_KEY, next);
  saveProviderUser(normalized, userId);
  return next;
}

export function logout() {
  window.localStorage.removeItem(AUTH_KEY);
}

function loadStore() {
  const store = readJson(STORE_KEY, {
    conventionApplications: [],
    partnerProfiles: [],
    conventionVouchers: [],
    conventionCoursePromos: [],
    revokedAuthUserIds: [],
    notifications: []
  });
  refreshAllPartnerProfiles(store);
  return store;
}

function saveStore(store) {
  return writeJson(STORE_KEY, store);
}

export function getMyPartnerContext() {
  const session = getAuthSession();
  const userId = Number(session.userId);
  if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
    return {
      isAuthenticated: false,
      activationStatus: 'inactive',
      latestApplication: null,
      partnerProfile: null
    };
  }

  const store = loadStore();
  const changedBadgeState = refreshAllPartnerProfiles(store);
  const applications = (store.conventionApplications || [])
    .filter((item) => Number(item.submitted_by_user_id) === userId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const latestApplication = applications[0] || null;
  const partnerProfile = (store.partnerProfiles || []).find((p) => Number(p.owner_user_id) === userId) || null;

  const activationStatus = resolvePartnerActivationStatus(latestApplication, partnerProfile);

  if (activationStatus === 'expired' && partnerProfile && String(partnerProfile.status || '').toLowerCase() !== 'expired') {
    const index = (store.partnerProfiles || []).findIndex((item) => Number(item.owner_user_id) === userId);
    if (index >= 0) {
      store.partnerProfiles[index] = {
        ...store.partnerProfiles[index],
        status: 'expired',
        expired_at: nowIso(),
        updated_at: nowIso()
      };
      saveStore(store);
    }
  } else if (changedBadgeState) {
    saveStore(store);
  }

  return {
    isAuthenticated: true,
    activationStatus,
    latestApplication: latestApplication ? clone(latestApplication) : null,
    partnerProfile: partnerProfile ? clone(partnerProfile) : null
  };
}

export function listMyApplications() {
  const session = getAuthSession();
  const userId = Number(session.userId);
  if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) return [];
  const store = loadStore();
  return (store.conventionApplications || [])
    .filter((item) => Number(item.submitted_by_user_id) === userId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((item) => clone(item));
}

export function updatePartnerPlan({ plan, coursesCount }) {
  const session = getAuthSession();
  const userId = Number(session.userId);
  if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
    throw new Error('Login richiesto');
  }

  const safePlan = String(plan || '').toLowerCase();
  if (safePlan !== 'free' && safePlan !== 'premium') throw new Error('Piano non valido');
  const safeCourses = Math.max(0, Math.min(MAX_CONVENTION_COURSES, Number(coursesCount || 0)));

  const store = loadStore();
  const index = (store.partnerProfiles || []).findIndex((item) => Number(item.owner_user_id) === userId);
  if (index < 0) throw new Error('Profilo partner non attivo: richiedi prima approvazione admin');

  const promoLimit = safePlan === 'free' ? 2 : Math.max(1, safeCourses) * 7;
  const current = store.partnerProfiles[index];
  store.partnerProfiles[index] = {
    ...current,
    plan: safePlan,
    courses_count: safePlan === 'premium' ? Math.max(1, safeCourses) : 0,
    promo_limit: promoLimit,
    updated_at: nowIso()
  };

  saveStore(store);
  return clone(store.partnerProfiles[index]);
}

export function updateAssociationProfile(payload = {}) {
  const session = getAuthSession();
  const userId = Number(session.userId);
  if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
    throw new Error('Login richiesto');
  }

  const store = loadStore();
  const index = (store.partnerProfiles || []).findIndex((item) => Number(item.owner_user_id) === userId);
  if (index < 0) throw new Error('Profilo partner non attivo');
  const current = store.partnerProfiles[index];
  if (String(current.status || '').toLowerCase() !== 'active') {
    throw new Error('Partner non attivo');
  }

  const next = {
    ...current,
    profile_tagline: sanitizeText(payload.tagline ?? current.profile_tagline, 120),
    profile_description: sanitizeText(payload.description ?? current.profile_description, 600),
    profile_address: sanitizeText(payload.address ?? current.profile_address, 160),
    profile_phone: sanitizeText(payload.phone ?? current.profile_phone, 60),
    profile_email: sanitizeText(payload.email ?? current.profile_email, 120),
    profile_website: sanitizeText(payload.website ?? current.profile_website, 180),
    offered_courses: sanitizeCourses(payload.offeredCourses ?? current.offered_courses),
    profile_image_data_url:
      payload.imageDataUrl === undefined
        ? String(current.profile_image_data_url || '')
        : sanitizeImageDataUrl(payload.imageDataUrl),
    updated_at: nowIso()
  };

  store.partnerProfiles[index] = next;
  saveStore(store);
  return clone(next);
}

export function listVouchersForMyCity() {
  const ctx = getMyPartnerContext();
  if (!ctx.partnerProfile?.city) return [];

  const store = loadStore();
  refreshAllPartnerProfiles(store);
  const city = String(ctx.partnerProfile.city || '').toLowerCase();
  const normalized = (store.conventionVouchers || []).map((item) => {
    const status = resolveVoucherStatus(item);
    return status === item.status ? item : { ...item, status };
  });
  store.conventionVouchers = normalized;
  saveStore(store);

  return normalized
    .filter((item) => String(item.partner?.city || '').toLowerCase() === city)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((item) => clone(item));
}

export function redeemVoucher(input, note = '') {
  const session = getAuthSession();
  const userId = Number(session.userId);
  if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
    throw new Error('Login richiesto');
  }
  const ctx = getMyPartnerContext();
  if (String(ctx.activationStatus || '').toLowerCase() !== 'active' || !ctx.partnerProfile?.id) {
    throw new Error('Profilo partner non attivo');
  }

  const store = loadStore();
  const id = extractVoucherId(input);
  if (!id) throw new Error('Inserisci codice o URL voucher valido');

  const index = (store.conventionVouchers || []).findIndex((item) => String(item.id) === id);
  if (index < 0) throw new Error('Voucher non trovato');

  const current = store.conventionVouchers[index];
  const isVoucherOwnedByPartner = getPartnerMatcher(ctx.partnerProfile)(current);
  if (!isVoucherOwnedByPartner) {
    throw new Error('Voucher non associato alla tua struttura partner');
  }
  const status = resolveVoucherStatus(current);
  if (status === 'expired') throw new Error('Voucher scaduto');
  if (status === 'redeemed') throw new Error('Voucher gia riscattato');

  const updated = {
    ...current,
    status: 'redeemed',
    redeemed_at: nowIso(),
    redeemed_by_user_id: userId,
    redeemed_note: String(note || '').trim().slice(0, 240),
    redeemed_source: 'partner_portal'
  };
  store.conventionVouchers[index] = updated;
  const partnerProfileId = String(ctx.partnerProfile?.id || '');
  const scoreAward = awardPartnerScoreOnRedeem({
    store,
    partnerProfile: partnerProfileId
      ? (store.partnerProfiles || []).find((item) => String(item.id || '') === partnerProfileId)
      : null,
    voucher: updated,
    source: 'partner_portal'
  });
  if (Number.isInteger(Number(updated.user_id)) && Number(updated.user_id) > 0) {
    const targetUserId = Number(updated.user_id);
    const revoked = Array.isArray(store.revokedAuthUserIds) ? store.revokedAuthUserIds : [];
    if (!revoked.some((value) => Number(value) === targetUserId)) {
      store.revokedAuthUserIds = [...revoked, targetUserId];
    }
  }

  store.notifications = [
    {
      id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      created_at: nowIso(),
      read: false,
      type: 'convention_voucher_redeemed',
      title: 'Buono convenzione utilizzato',
      message: `Il tuo buono per ${updated.partner?.name || 'partner'} e stato verificato.`,
      target_user_id: updated.user_id
    },
    ...(store.notifications || [])
  ].slice(0, 120);

  saveStore(store);
  return clone({
    ...updated,
    partner_score_award: scoreAward
  });
}

export function listMyCoursePromos() {
  const ctx = getMyPartnerContext();
  const partnerProfileId = String(ctx.partnerProfile?.id || '');
  if (!partnerProfileId) return [];
  const store = loadStore();
  return (store.conventionCoursePromos || [])
    .filter((item) => String(item.partner_profile_id || '') === partnerProfileId)
    .map((item) => withResolvedCoursePromo(item))
    .filter((item) => String(item.status || '').toLowerCase() !== 'inactive')
    .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))
    .map((item) => clone(item));
}

export function createCoursePromo({ courseType, discountedPriceEur, expiresAt }) {
  const session = getAuthSession();
  const userId = Number(session.userId);
  if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
    throw new Error('Login richiesto');
  }

  const store = loadStore();
  const { partner } = assertPremiumPartner(userId, store);

  const safeCourseType = normalizeCourseType(courseType);
  if (!safeCourseType) throw new Error('Inserisci la tipologia di corso');
  const safePrice = normalizePrice(discountedPriceEur);
  if (!Number.isFinite(safePrice) || safePrice <= 0 || safePrice > 9999) {
    throw new Error('Prezzo scontato non valido');
  }
  const safeExpiresAt = normalizeDateInput(expiresAt);
  if (safeExpiresAt && Date.parse(safeExpiresAt) <= nowMs()) {
    throw new Error('Data fine promo non valida');
  }

  const partnerProfileId = String(partner.id || '');
  const activeSameCourse = (store.conventionCoursePromos || []).filter(
    (item) =>
      String(item.partner_profile_id || '') === partnerProfileId &&
      resolveCoursePromoStatus(item) === 'active' &&
      normalizeCourseType(item.course_type).toLowerCase() === safeCourseType.toLowerCase()
  );
  if (activeSameCourse.length >= 7) {
    throw new Error(`Hai gia raggiunto il limite di 7 promo per il corso "${safeCourseType}"`);
  }

  const nextPromo = {
    id: `ccp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    partner_profile_id: partner.id,
    owner_user_id: userId,
    organization: partner.organization || 'Partner',
    city: partner.city || '',
    course_type: safeCourseType,
    discounted_price_eur: safePrice,
    promo_code: buildPromoCode(safeCourseType),
    expires_at: safeExpiresAt || null,
    status: 'active',
    created_at: nowIso(),
    updated_at: nowIso()
  };

  store.conventionCoursePromos = [nextPromo, ...(store.conventionCoursePromos || [])].slice(0, 500);
  saveStore(store);
  return clone(withResolvedCoursePromo(nextPromo));
}

export function updateCoursePromo(promoId, { courseType, discountedPriceEur, expiresAt }) {
  const session = getAuthSession();
  const userId = Number(session.userId);
  if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
    throw new Error('Login richiesto');
  }

  const store = loadStore();
  const { partner } = assertPremiumPartner(userId, store);
  const id = String(promoId || '').trim();
  if (!id) throw new Error('Promo non valida');

  const index = (store.conventionCoursePromos || []).findIndex((item) => String(item.id || '') === id);
  if (index < 0) throw new Error('Promo non trovata');
  const current = store.conventionCoursePromos[index];
  if (Number(current.owner_user_id) !== userId || Number(current.partner_profile_id) !== Number(partner.id)) {
    throw new Error('Non autorizzato a modificare questa promo');
  }
  if (resolveCoursePromoStatus(current) === 'inactive') {
    throw new Error('Promo non piu modificabile');
  }

  const nextCourseType =
    typeof courseType === 'string' ? normalizeCourseType(courseType) : normalizeCourseType(current.course_type);
  if (!nextCourseType) throw new Error('Inserisci la tipologia di corso');
  const nextPrice =
    discountedPriceEur == null ? normalizePrice(current.discounted_price_eur) : normalizePrice(discountedPriceEur);
  if (!Number.isFinite(nextPrice) || nextPrice <= 0 || nextPrice > 9999) {
    throw new Error('Prezzo scontato non valido');
  }
  const nextExpiresAt =
    expiresAt === undefined ? current.expires_at || null : normalizeDateInput(expiresAt) || null;
  if (nextExpiresAt && Date.parse(nextExpiresAt) <= nowMs()) {
    throw new Error('Data fine promo non valida');
  }

  const partnerProfileId = String(partner.id || '');
  const activeSameCourse = (store.conventionCoursePromos || []).filter(
    (item) =>
      String(item.id || '') !== id &&
      String(item.partner_profile_id || '') === partnerProfileId &&
      resolveCoursePromoStatus(item) === 'active' &&
      normalizeCourseType(item.course_type).toLowerCase() === nextCourseType.toLowerCase()
  );
  if (activeSameCourse.length >= 7) {
    throw new Error(`Hai gia raggiunto il limite di 7 promo per il corso "${nextCourseType}"`);
  }

  const updated = {
    ...current,
    course_type: nextCourseType,
    discounted_price_eur: nextPrice,
    expires_at: nextExpiresAt,
    updated_at: nowIso()
  };
  store.conventionCoursePromos[index] = updated;
  saveStore(store);
  return clone(withResolvedCoursePromo(updated));
}

export function deactivateCoursePromo(promoId) {
  const session = getAuthSession();
  const userId = Number(session.userId);
  if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
    throw new Error('Login richiesto');
  }

  const store = loadStore();
  const { partner } = assertPremiumPartner(userId, store);
  const id = String(promoId || '').trim();
  if (!id) throw new Error('Promo non valida');

  const index = (store.conventionCoursePromos || []).findIndex((item) => String(item.id || '') === id);
  if (index < 0) throw new Error('Promo non trovata');
  const current = store.conventionCoursePromos[index];
  if (Number(current.owner_user_id) !== userId || Number(current.partner_profile_id) !== Number(partner.id)) {
    throw new Error('Non autorizzato a disattivare questa promo');
  }

  const updated = {
    ...current,
    status: 'inactive',
    updated_at: nowIso()
  };
  store.conventionCoursePromos[index] = updated;
  saveStore(store);
  return clone(updated);
}

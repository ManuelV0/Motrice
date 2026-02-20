const PARTNER_SCORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PARTNER_FAST_REDEEM_MS = 45 * 60 * 1000;
const PARTNER_VOUCHER_VALIDITY_MS = 90 * 60 * 1000;
const PARTNER_SCORE_HISTORY_LIMIT = 600;

function nowMs() {
  return Date.now();
}

function clampNonNegative(value) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe)) return 0;
  return Math.max(0, Math.round(safe));
}

function safeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function withinRollingWindow(tsMs, referenceMs) {
  if (!Number.isFinite(tsMs)) return false;
  return tsMs >= referenceMs - PARTNER_SCORE_WINDOW_MS && tsMs <= referenceMs;
}

function resolveVoucherStatus(voucher, referenceMs = nowMs()) {
  if (!voucher) return 'expired';
  if (String(voucher.status || '').toLowerCase() === 'redeemed') return 'redeemed';
  const expiresMs = toMs(voucher.expires_at);
  if (Number.isFinite(expiresMs)) {
    return expiresMs > referenceMs ? 'active' : 'expired';
  }
  const createdMs = toMs(voucher.created_at);
  if (Number.isFinite(createdMs) && createdMs + PARTNER_VOUCHER_VALIDITY_MS > referenceMs) {
    return 'active';
  }
  return 'expired';
}

function buildPartnerMatcher(profile = {}) {
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

function getPartnerProfileById(store, partnerId) {
  const target = String(partnerId || '').trim();
  if (!target) return { profile: null, index: -1 };
  const profiles = Array.isArray(store?.partnerProfiles) ? store.partnerProfiles : [];
  const index = profiles.findIndex((item) => String(item?.id || '').trim() === target);
  if (index < 0) return { profile: null, index: -1 };
  return { profile: ensurePartnerProfileShape(profiles[index]), index };
}

function collectPartnerVouchers(store, partnerId) {
  const { profile } = getPartnerProfileById(store, partnerId);
  if (!profile) return [];
  const matches = buildPartnerMatcher(profile);
  const vouchers = Array.isArray(store?.conventionVouchers) ? store.conventionVouchers : [];
  return vouchers.filter((voucher) => matches(voucher));
}

export function getPartnerBadgeFromScore(scoreRolling) {
  const score = clampNonNegative(scoreRolling);
  if (score >= 600) return 'diamante';
  if (score >= 300) return 'oro';
  if (score >= 150) return 'argento';
  if (score >= 50) return 'bronzo';
  return 'rame';
}

export function computePartnerRollingStats(partnerId, now = nowMs(), store = {}) {
  const vouchers = collectPartnerVouchers(store, partnerId);

  let redeemedCount = 0;
  let redeemedAmountCents = 0;
  let expiredCount = 0;

  vouchers.forEach((voucher) => {
    const issuedMs = toMs(voucher.created_at);
    if (!withinRollingWindow(issuedMs, now)) return;

    const status = resolveVoucherStatus(voucher, now);
    if (status === 'redeemed') {
      redeemedCount += 1;
      redeemedAmountCents += clampNonNegative(voucher.cost_cents);
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

export function computePartnerScoreRolling30d(partnerId, now = nowMs(), store = {}) {
  const { profile } = getPartnerProfileById(store, partnerId);
  if (!profile) return 0;

  const score = (profile.score_history || [])
    .filter((entry) => withinRollingWindow(toMs(entry.ts), now))
    .reduce((sum, entry) => sum + Number(entry.points || 0), 0);

  return clampNonNegative(score);
}

export function updatePartnerBadge(partnerId, store = {}, now = nowMs()) {
  const { profile, index } = getPartnerProfileById(store, partnerId);
  if (!profile || index < 0) return null;

  const rollingMetrics = computePartnerRollingStats(partnerId, now, store);
  const rollingScore = computePartnerScoreRolling30d(partnerId, now, store);
  const nextBadge = getPartnerBadgeFromScore(rollingScore);

  const nextProfile = {
    ...profile,
    score_total: clampNonNegative(profile.score_total),
    score_rolling_30d: rollingScore,
    metrics_rolling_30d: rollingMetrics,
    badge_level: nextBadge,
    score_history: (profile.score_history || []).slice(0, PARTNER_SCORE_HISTORY_LIMIT)
  };

  if (Array.isArray(store?.partnerProfiles)) {
    store.partnerProfiles[index] = nextProfile;
  }

  return nextProfile;
}

export function ensurePartnerBadgeFields(store = {}) {
  if (!Array.isArray(store?.partnerProfiles)) return false;
  let changed = false;

  store.partnerProfiles = store.partnerProfiles.map((profile) => {
    const next = ensurePartnerProfileShape(profile || {});
    const changedCurrent =
      String(profile?.badge_level || '').toLowerCase() !== next.badge_level ||
      Number(profile?.score_total || 0) !== next.score_total ||
      Number(profile?.score_rolling_30d || 0) !== next.score_rolling_30d ||
      !Array.isArray(profile?.score_history) ||
      typeof profile?.metrics_rolling_30d !== 'object';
    if (changedCurrent) changed = true;
    return next;
  });

  return changed;
}

export function awardPartnerScore(payload = {}, store = {}, now = nowMs()) {
  const partnerId = String(payload.partnerId || '').trim();
  const voucherId = String(payload.voucherId || '').trim();
  if (!partnerId || !voucherId) {
    return { applied: false, points: 0, reason: 'missing_target', badge_level: null, metrics: null };
  }

  const { profile, index } = getPartnerProfileById(store, partnerId);
  if (!profile || index < 0) {
    return { applied: false, points: 0, reason: 'partner_not_found', badge_level: null, metrics: null };
  }

  const scoreHistory = Array.isArray(profile.score_history) ? profile.score_history : [];
  const duplicate = scoreHistory.some((entry) => String(entry.voucherId || '') === voucherId);
  if (duplicate) {
    const updated = updatePartnerBadge(partnerId, store, now) || profile;
    return {
      applied: false,
      points: 0,
      reason: 'duplicate_voucher',
      badge_level: updated.badge_level,
      metrics: updated.metrics_rolling_30d,
      score_rolling_30d: updated.score_rolling_30d
    };
  }

  const issuedMs = toMs(payload.issuedAt);
  const redeemedMs = toMs(payload.redeemedAt) || now;
  const currentMetrics = computePartnerRollingStats(partnerId, now, store);

  const base = 10;
  const fastRedeem = Number.isFinite(issuedMs) && redeemedMs - issuedMs <= PARTNER_FAST_REDEEM_MS;
  const fastBonus = fastRedeem ? 3 : 0;
  const redeemRateBonus = Number(currentMetrics.redeem_rate || 0) >= 0.85 ? 2 : 0;
  const points = base + fastBonus + redeemRateBonus;

  const historyEntry = {
    id: `ps_${now}_${Math.random().toString(16).slice(2, 8)}`,
    partnerId,
    voucherId,
    userId: Number(payload.userId || 0) || null,
    points,
    ts: new Date(now).toISOString(),
    meta: {
      source: String(payload.source || 'manual').trim() || 'manual',
      fastRedeem,
      redeem_rate_bucket:
        Number(currentMetrics.redeem_rate || 0) >= 0.85
          ? 'high'
          : Number(currentMetrics.redeem_rate || 0) <= 0.5
            ? 'low'
            : 'mid',
      redeem_rate_snapshot: Number(currentMetrics.redeem_rate || 0)
    }
  };

  const nextProfile = {
    ...profile,
    score_total: clampNonNegative(profile.score_total + points),
    score_history: [historyEntry, ...scoreHistory].slice(0, PARTNER_SCORE_HISTORY_LIMIT)
  };

  if (Array.isArray(store?.partnerProfiles)) {
    store.partnerProfiles[index] = nextProfile;
  }

  const vouchers = Array.isArray(store?.conventionVouchers) ? store.conventionVouchers : [];
  const voucherIndex = vouchers.findIndex((item) => String(item?.id || '') === voucherId);
  if (voucherIndex >= 0) {
    store.conventionVouchers[voucherIndex] = {
      ...store.conventionVouchers[voucherIndex],
      partner_score_awarded_at: new Date(now).toISOString(),
      partner_score_points: points
    };
  }

  const updated = updatePartnerBadge(partnerId, store, now) || nextProfile;
  return {
    applied: true,
    points,
    reason: 'awarded',
    badge_level: updated.badge_level,
    metrics: updated.metrics_rolling_30d,
    score_rolling_30d: updated.score_rolling_30d,
    score_total: updated.score_total,
    history_entry: historyEntry
  };
}

export const partnerBadgeConfig = {
  windowMs: PARTNER_SCORE_WINDOW_MS,
  fastRedeemMs: PARTNER_FAST_REDEEM_MS,
  voucherValidityMs: PARTNER_VOUCHER_VALIDITY_MS
};

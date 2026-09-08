import { getAuthSession } from './authSession';
import { isSupabaseConfigured, requireSupabase } from './supabaseClient';
import {
  getMyProfileVerification,
  getPublicProfileVerification
} from './profileVerification';
import { piggybank } from './piggybank';

const STORAGE_PREFIX = 'motrice.profile-v3.';
const SCHEMA_VERSION = 3;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function identityFrom(profile = {}) {
  const sportProfiles = Array.isArray(profile.sport_profiles)
    ? profile.sport_profiles
        .map((sport) => ({
          name: String(sport?.name || '').trim(),
          level: String(sport?.level || 'Principiante').trim() || 'Principiante'
        }))
        .filter((sport) => sport.name)
        .slice(0, 6)
    : [];
  return {
    display_name: String(profile.display_name || profile.name || 'Alessandro').trim() || 'Alessandro',
    avatar_url: String(profile.avatar_url || ''),
    cover_url: String(profile.cover_url || ''),
    bio: String(profile.bio || ''),
    city: String(profile.city || 'Ascoli Piceno').trim() || 'Ascoli Piceno',
    sports: sportProfiles.length ? sportProfiles.map((sport) => sport.name) : ['Calisthenics', 'Running'],
    sport_profiles: sportProfiles,
    training_goal: String(profile.training_goal || ''),
    looking_for: String(profile.looking_for || ''),
    training_preferences: Array.isArray(profile.training_preferences)
      ? profile.training_preferences.map(String).filter(Boolean).slice(0, 8)
      : [],
    member_since: 'Mar 2026'
  };
}

export function createEmptyProfileV3(profile = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    identity: identityFrom(profile),
    identity_verification: {
      status: 'unverified',
      verified_at: null,
      expires_at: null
    },
    verified_checkins: 0,
    reliability: {
      score: 0,
      present: 0,
      no_show: 0,
      late_cancellations: 0
    },
    mot: { total: 0, logs: [] },
    ratings: { average: 0, verified_count: 0 },
    host: { events: 0, participants: 0 },
    xp: { level: 1, total: 0, next_level_at: 250, logs: [] },
    credit_wallet: {
      available_cents: 0,
      locked_cents: 0,
      pending_cents: 0,
      withdrawable_cents: 0,
      total_cents: 0,
      trial_events_remaining: 2,
      trial_events_used: 0,
      can_participate: true,
      funding_source: 'trial',
      amount_missing_cents: 0,
      provider_mode: 'stripe_test',
      deposits_enabled: false,
      withdrawals_enabled: false,
      withdrawal: null
    },
    achievements: [
      { id: 'costante', icon: '🔥', label: 'Costante', detail: 'Prima serie' },
      { id: 'early', icon: '⚡', label: 'Early', detail: 'Prima puntualità' },
      { id: 'team', icon: '🤝', label: 'Team', detail: 'Prima collaborazione' },
      { id: 'host', icon: '🏅', label: 'Host', detail: 'Primo evento' }
    ],
    recent_activity: []
  };
}

function storageKey() {
  const session = getAuthSession();
  return `${STORAGE_PREFIX}${session?.authUserId || session?.userId || 'guest'}`;
}

function normalizeState(raw, profile = {}) {
  const empty = createEmptyProfileV3(profile);
  if (!raw || typeof raw !== 'object') return empty;
  const present = number(raw.reliability?.present ?? raw.present_count);
  const noShow = number(raw.reliability?.no_show ?? raw.no_show_count);
  const late = number(raw.reliability?.late_cancellations ?? raw.late_cancellation_count);
  const outcomes = present + noShow + late;
  const score = outcomes > 0 ? Math.round((present / outcomes) * 100) : 0;
  const xpTotal = number(raw.xp?.total ?? raw.xp_total);
  const level = Math.max(1, Math.floor(xpTotal / 250) + 1);
  const verificationStatus = String(raw.identity_verification?.status || 'unverified').toLowerCase();
  const allowedVerificationStatuses = new Set([
    'unverified',
    'pending',
    'verified',
    'rejected',
    'expired',
    'suspended'
  ]);

  return {
    ...empty,
    ...raw,
    schema_version: SCHEMA_VERSION,
    identity: { ...empty.identity, ...(raw.identity || {}) },
    identity_verification: {
      ...empty.identity_verification,
      ...(raw.identity_verification || {}),
      status: allowedVerificationStatuses.has(verificationStatus) ? verificationStatus : 'unverified'
    },
    verified_checkins: number(raw.verified_checkins),
    reliability: { score, present, no_show: noShow, late_cancellations: late },
    mot: {
      total: number(raw.mot?.total ?? raw.mot_total),
      logs: Array.isArray(raw.mot?.logs) ? raw.mot.logs : Array.isArray(raw.mot_logs) ? raw.mot_logs : []
    },
    ratings: {
      average: number(raw.ratings?.average ?? raw.rating_average),
      verified_count: number(raw.ratings?.verified_count ?? raw.verified_ratings)
    },
    host: {
      events: number(raw.host?.events ?? raw.host_events),
      participants: number(raw.host?.participants ?? raw.host_participants)
    },
    xp: {
      level,
      total: xpTotal,
      next_level_at: level * 250,
      logs: Array.isArray(raw.xp?.logs) ? raw.xp.logs : Array.isArray(raw.xp_logs) ? raw.xp_logs : []
    },
    credit_wallet: {
      available_cents: number(raw.credit_wallet?.available_cents ?? raw.available_cents),
      locked_cents: number(raw.credit_wallet?.locked_cents ?? raw.locked_cents),
      pending_cents: number(raw.credit_wallet?.pending_cents ?? raw.pending_cents),
      withdrawable_cents: number(raw.credit_wallet?.withdrawable_cents ?? raw.withdrawable_cents),
      total_cents: number(
        raw.credit_wallet?.total_cents ??
          raw.total_cents ??
          number(raw.credit_wallet?.available_cents ?? raw.available_cents) +
            number(raw.credit_wallet?.locked_cents ?? raw.locked_cents) +
            number(raw.credit_wallet?.pending_cents ?? raw.pending_cents) +
            number(raw.credit_wallet?.withdrawable_cents ?? raw.withdrawable_cents)
      ),
      trial_events_remaining: number(raw.credit_wallet?.trial_events_remaining ?? 2),
      trial_events_used: number(raw.credit_wallet?.trial_events_used),
      can_participate: raw.credit_wallet?.can_participate !== false,
      funding_source: String(raw.credit_wallet?.funding_source || 'trial'),
      amount_missing_cents: number(raw.credit_wallet?.amount_missing_cents),
      provider_mode: String(raw.credit_wallet?.provider_mode || 'stripe_test'),
      deposits_enabled: Boolean(raw.credit_wallet?.deposits_enabled),
      withdrawals_enabled: Boolean(raw.credit_wallet?.withdrawals_enabled),
      withdrawal: raw.credit_wallet?.withdrawal && typeof raw.credit_wallet.withdrawal === 'object'
        ? raw.credit_wallet.withdrawal
        : null
    },
    achievements: Array.isArray(raw.achievements) ? raw.achievements : empty.achievements,
    recent_activity: Array.isArray(raw.recent_activity) ? raw.recent_activity : []
  };
}

function readLocal(profile) {
  if (typeof window === 'undefined') return createEmptyProfileV3(profile);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey()) || 'null');
    if (parsed?.schema_version !== SCHEMA_VERSION) return createEmptyProfileV3(profile);
    return normalizeState(parsed, profile);
  } catch {
    return createEmptyProfileV3(profile);
  }
}

function isMissingProfileV3Rpc(error, functionName = 'get_my_profile_v3') {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42883' || error?.code === 'PGRST202' || message.includes(functionName);
}

export async function getProfileV3State(profile = {}) {
  const session = getAuthSession();
  if (!isSupabaseConfigured || !session?.authUserId) {
    return normalizeState({
      ...readLocal(profile),
      credit_wallet: piggybank.getWallet()
    }, profile);
  }
  const client = requireSupabase();
  const [{ data, error }, walletResult, verification] = await Promise.all([
    client.rpc('get_my_profile_v3'),
    client.rpc('get_my_money_wallet'),
    getMyProfileVerification()
  ]);
  if (error) {
    if (isMissingProfileV3Rpc(error)) return readLocal(profile);
    throw new Error(error.message || 'Impossibile caricare il profilo Motrice');
  }
  if (walletResult.error && !isMissingProfileV3Rpc(walletResult.error, 'get_my_money_wallet')) {
    throw new Error(walletResult.error.message || 'Impossibile caricare il Wallet Motrice');
  }
  return normalizeState({
    ...data,
    credit_wallet: walletResult.error ? data?.credit_wallet : walletResult.data,
    identity_verification: verification
  }, profile);
}

export async function getPublicProfileV3State(targetUserId, profile = {}) {
  const session = getAuthSession();
  const targetId = String(targetUserId || '').trim();
  if (!targetId) throw new Error('Profilo non disponibile');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId);

  if (targetId === String(session?.authUserId || '')) {
    return getProfileV3State(profile);
  }

  if (!isSupabaseConfigured || !session?.authUserId || !isUuid) {
    return createEmptyProfileV3(profile);
  }

  const client = requireSupabase();
  const [{ data, error }, verification] = await Promise.all([
    client.rpc('get_public_profile_v3', { target_user_id: targetId }),
    getPublicProfileVerification(targetId)
  ]);
  if (error) {
    if (isMissingProfileV3Rpc(error, 'get_public_profile_v3')) {
      return createEmptyProfileV3(profile);
    }
    throw new Error(error.message || 'Impossibile caricare il profilo pubblico Motrice');
  }
  return normalizeState({ ...data, identity_verification: verification }, profile);
}

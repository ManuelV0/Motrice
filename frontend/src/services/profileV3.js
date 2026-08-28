import { getAuthSession } from './authSession';
import { isSupabaseConfigured, requireSupabase } from './supabaseClient';

const STORAGE_PREFIX = 'motrice.profile-v3.';
const SCHEMA_VERSION = 3;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function identityFrom(profile = {}) {
  return {
    display_name: String(profile.display_name || profile.name || 'Alessandro').trim() || 'Alessandro',
    avatar_url: String(profile.avatar_url || ''),
    bio: String(profile.bio || ''),
    city: String(profile.city || 'Ascoli Piceno').trim() || 'Ascoli Piceno',
    sports: ['Calisthenics', 'Running'],
    member_since: 'Mar 2026'
  };
}

export function createEmptyProfileV3(profile = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    identity: identityFrom(profile),
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
    credit_wallet: { available_cents: 0, locked_cents: 0 },
    achievements: [
      { id: 'costante', icon: '🔥', label: 'Costante', detail: 'Prima serie' },
      { id: 'early', icon: '⚡', label: 'Early', detail: 'Prima puntualità' },
      { id: 'team', icon: '🤝', label: 'Team', detail: 'Prima collaborazione' },
      { id: 'host', icon: '🏅', label: 'Host', detail: 'Primo evento' }
    ],
    recent_activity: [],
    demo_used: false
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

  return {
    ...empty,
    ...raw,
    schema_version: SCHEMA_VERSION,
    identity: { ...empty.identity, ...(raw.identity || {}) },
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
      locked_cents: number(raw.credit_wallet?.locked_cents ?? raw.locked_cents)
    },
    achievements: Array.isArray(raw.achievements) ? raw.achievements : empty.achievements,
    recent_activity: Array.isArray(raw.recent_activity) ? raw.recent_activity : [],
    demo_used: Boolean(raw.demo_used)
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

function writeLocal(state) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch {
      // Lo zero-state continua a funzionare anche senza storage persistente.
    }
  }
  return state;
}

function simulateLocal(profile) {
  const current = readLocal(profile);
  if (current.demo_used) return current;
  const occurredAt = new Date().toISOString();
  const next = normalizeState(
    {
      ...current,
      verified_checkins: 1,
      reliability: { score: 100, present: 1, no_show: 0, late_cancellations: 0 },
      mot: {
        total: 20,
        logs: [{ id: `mot-demo-${Date.now()}`, evento_id: null, mot: 20, qr_verificato: true, created_at: occurredAt }]
      },
      xp: {
        level: 1,
        total: 50,
        next_level_at: 250,
        logs: [{ id: `xp-demo-${Date.now()}`, xp: 50, motivo: 'Check-in QR verificato', created_at: occurredAt }]
      },
      recent_activity: [
        { id: `activity-demo-${Date.now()}`, title: 'Check-in demo', subtitle: 'QR verificato · +20 MOT · +50 XP', created_at: occurredAt }
      ],
      demo_used: true
    },
    profile
  );
  return writeLocal(next);
}

function isMissingProfileV3Rpc(error, functionName = 'get_my_profile_v3') {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42883' || error?.code === 'PGRST202' || message.includes(functionName);
}

export async function getProfileV3State(profile = {}) {
  const session = getAuthSession();
  if (!isSupabaseConfigured || !session?.authUserId) return readLocal(profile);
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_my_profile_v3');
  if (error) {
    if (isMissingProfileV3Rpc(error)) return readLocal(profile);
    throw new Error(error.message || 'Impossibile caricare il profilo Motrice');
  }
  return normalizeState(data, profile);
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
  const { data, error } = await client.rpc('get_public_profile_v3', {
    target_user_id: targetId
  });
  if (error) {
    if (isMissingProfileV3Rpc(error, 'get_public_profile_v3')) {
      return createEmptyProfileV3(profile);
    }
    throw new Error(error.message || 'Impossibile caricare il profilo pubblico Motrice');
  }
  return normalizeState(data, profile);
}

export async function simulateProfileV3CheckIn(profile = {}) {
  const session = getAuthSession();
  if (!isSupabaseConfigured || !session?.authUserId) return simulateLocal(profile);
  const client = requireSupabase();
  const { data, error } = await client.rpc('simulate_my_profile_v3_checkin');
  if (error) {
    if (isMissingProfileV3Rpc(error)) return simulateLocal(profile);
    throw new Error(error.message || 'Simulazione check-in non riuscita');
  }
  return normalizeState(data, profile);
}

import { getAuthSession } from '../../../services/authSession';
import { isSupabaseConfigured, requireSupabase, supabase } from '../../../services/supabaseClient';
import { safeStorageGet, safeStorageSet } from '../../../utils/safeStorage';

const STORAGE_PREFIX = 'motrice_personal_workout_plans_v1';

function validPlanId(value) {
  return String(value || '').trim().slice(0, 120);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRemotePlan(row) {
  return {
    id: validPlanId(row.client_id || row.id),
    remoteId: String(row.id || '').trim(),
    title: String(row.title || '').trim(),
    sportId: String(row.sport_id || 'palestra').trim(),
    type: String(row.workout_type || 'Bodybuilding').trim(),
    duration: Number(row.duration_minutes || 60),
    level: String(row.level || 'mid').trim(),
    equipment: normalizeArray(row.equipment),
    exercises: normalizeArray(row.exercises),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getPersonalWorkoutPlansStorageKey() {
  const session = getAuthSession();
  const identity = session.authUserId || session.userId || session.email || 'guest';
  return `${STORAGE_PREFIX}:${identity}`;
}

export function listCachedPersonalWorkoutPlans() {
  try {
    const value = JSON.parse(safeStorageGet(getPersonalWorkoutPlansStorageKey()) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function cachePersonalWorkoutPlans(plans) {
  safeStorageSet(
    getPersonalWorkoutPlansStorageKey(),
    JSON.stringify(Array.isArray(plans) ? plans : [])
  );
}

function toRemotePlan(plan, userId) {
  return {
    user_id: userId,
    client_id: validPlanId(plan.id),
    title: String(plan.title || '').trim().slice(0, 70),
    sport_id: String(plan.sportId || 'palestra').trim().slice(0, 40),
    workout_type: String(plan.type || 'Bodybuilding').trim().slice(0, 60),
    duration_minutes: Math.max(5, Math.min(360, Number(plan.duration) || 60)),
    level: ['base', 'mid', 'pro'].includes(plan.level) ? plan.level : 'mid',
    equipment: normalizeArray(plan.equipment).slice(0, 30),
    exercises: normalizeArray(plan.exercises).slice(0, 100),
    created_at: plan.createdAt || new Date().toISOString(),
    updated_at: plan.updatedAt || new Date().toISOString()
  };
}

function requireRemoteUserId() {
  const session = getAuthSession();
  const userId = String(session?.authUserId || '').trim();
  if (!userId) throw new Error('Accedi con Supabase per sincronizzare le schede.');
  return userId;
}

function throwIfError(error) {
  if (error) throw error;
}

export function canSyncPersonalWorkoutPlans() {
  const session = getAuthSession();
  return Boolean(isSupabaseConfigured && supabase && session?.isAuthenticated && session?.authUserId);
}

export async function listPersonalWorkoutPlans() {
  const client = requireSupabase();
  const userId = requireRemoteUserId();
  const { data, error } = await client
    .from('personal_workout_plans')
    .select('id,client_id,title,sport_id,workout_type,duration_minutes,level,equipment,exercises,created_at,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  throwIfError(error);
  return (data || []).map(normalizeRemotePlan).filter((plan) => plan.id && plan.title);
}

export async function listAvailablePersonalWorkoutPlans() {
  const cached = listCachedPersonalWorkoutPlans();
  if (!canSyncPersonalWorkoutPlans()) return cached;
  try {
    const remote = await listPersonalWorkoutPlans();
    const merged = new Map(remote.map((plan) => [String(plan.id), plan]));
    cached.forEach((plan) => {
      if (!merged.has(String(plan.id))) merged.set(String(plan.id), plan);
    });
    return [...merged.values()];
  } catch {
    return cached;
  }
}

export async function ensurePersonalWorkoutPlanRemote(plan) {
  if (plan?.remoteId) return plan;
  if (!canSyncPersonalWorkoutPlans()) {
    throw new Error('Connettiti a Internet per allegare questa scheda all’evento.');
  }
  const synced = await upsertPersonalWorkoutPlan(plan);
  const cached = listCachedPersonalWorkoutPlans();
  cachePersonalWorkoutPlans(
    cached.some((item) => String(item.id) === String(synced.id))
      ? cached.map((item) => (String(item.id) === String(synced.id) ? synced : item))
      : [synced, ...cached]
  );
  return synced;
}

function uniqueClientId(prefix = 'plan') {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function saveSharedWorkoutPlanToLibrary(plan) {
  const now = new Date().toISOString();
  const copy = {
    ...plan,
    id: uniqueClientId('plan'),
    remoteId: undefined,
    title: String(plan?.title || 'Scheda evento').trim().slice(0, 70),
    exercises: normalizeArray(plan?.exercises).map((exercise) => ({
      ...exercise,
      instanceId: uniqueClientId('exercise')
    })),
    createdAt: now,
    updatedAt: now
  };
  const saved = canSyncPersonalWorkoutPlans() ? await upsertPersonalWorkoutPlan(copy) : copy;
  const cached = listCachedPersonalWorkoutPlans();
  cachePersonalWorkoutPlans([saved, ...cached]);
  return saved;
}

export async function upsertPersonalWorkoutPlan(plan) {
  const client = requireSupabase();
  const userId = requireRemoteUserId();
  const payload = toRemotePlan(plan, userId);
  if (!payload.client_id) throw new Error('Identificativo scheda non valido.');
  const { data, error } = await client
    .from('personal_workout_plans')
    .upsert(payload, { onConflict: 'user_id,client_id' })
    .select('id,client_id,title,sport_id,workout_type,duration_minutes,level,equipment,exercises,created_at,updated_at')
    .single();
  throwIfError(error);
  return normalizeRemotePlan(data);
}

export async function deletePersonalWorkoutPlan(planId) {
  const client = requireSupabase();
  const userId = requireRemoteUserId();
  const clientId = validPlanId(planId);
  if (!clientId) return;
  const { error } = await client
    .from('personal_workout_plans')
    .delete()
    .eq('user_id', userId)
    .eq('client_id', clientId);
  throwIfError(error);
}

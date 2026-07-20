import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/safeStorage';
import { isSupabaseConfigured, requireSupabase, supabase } from './supabaseClient';

const STORAGE_KEY = 'motrice_auth_session_v1';
const OPERATIONAL_STORE_KEY = 'motrice_operational_store_v2';
const LOGOUT_REASON_KEY = 'motrice_auth_logout_reason_v1';
const providerUserMap = {
  google: 1,
  facebook: 2
};

const defaultSession = {
  provider: null,
  accessToken: null,
  userId: null,
  authUserId: null,
  email: null,
  isAuthenticated: false
};

let supabaseAuthSubscription = null;

function normalizeLegacyUserId(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function normalizeAuthUserId(value) {
  const normalized = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export function legacyIdFromAuthUserId(authUserId) {
  const value = String(authUserId || '');
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 100000 + (Math.abs(hash >>> 0) % 900000000);
}

function emitAuthChanged(nextSession) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('motrice-auth-changed', { detail: nextSession || null }));
}

function isUserRevoked(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  try {
    const raw = safeStorageGet(OPERATIONAL_STORE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.revokedAuthUserIds) ? parsed.revokedAuthUserIds : [];
    return list.some((value) => Number(value) === id);
  } catch {
    return false;
  }
}

function consumeUserRevocation(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  try {
    const raw = safeStorageGet(OPERATIONAL_STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.revokedAuthUserIds) ? parsed.revokedAuthUserIds : [];
    const next = list.filter((value) => Number(value) !== id);
    if (next.length === list.length) return;
    safeStorageSet(
      OPERATIONAL_STORE_KEY,
      JSON.stringify({
        ...parsed,
        revokedAuthUserIds: next
      })
    );
  } catch {
    // no-op
  }
}

function setLogoutReason(reason) {
  safeStorageSet(
    LOGOUT_REASON_KEY,
    JSON.stringify({
      code: String(reason || ''),
      at: new Date().toISOString()
    })
  );
}

export function getAuthSession() {
  const raw = safeStorageGet(STORAGE_KEY);
  if (!raw) return { ...defaultSession };

  try {
    const parsed = JSON.parse(raw);
    const authUserId = normalizeAuthUserId(parsed.authUserId || parsed.userId);
    const userId = normalizeLegacyUserId(parsed.userId) || (authUserId ? legacyIdFromAuthUserId(authUserId) : null);
    const inferredAuthenticated =
      Boolean(parsed.accessToken) || Boolean(parsed.provider) || Boolean(userId) || Boolean(authUserId);

    if (isUserRevoked(userId)) {
      setLogoutReason('voucher_redeemed');
      consumeUserRevocation(userId);
      safeStorageRemove(STORAGE_KEY);
      return { ...defaultSession };
    }

    return {
      provider: parsed.provider || null,
      accessToken: parsed.accessToken || null,
      userId,
      authUserId,
      email: parsed.email || null,
      isAuthenticated:
        typeof parsed.isAuthenticated === 'boolean' ? parsed.isAuthenticated : inferredAuthenticated
    };
  } catch {
    return { ...defaultSession };
  }
}

export function setAuthSession(session) {
  const authUserId = normalizeAuthUserId(session.authUserId || session.userId);
  const userId =
    normalizeLegacyUserId(session.userId) ||
    (authUserId ? legacyIdFromAuthUserId(authUserId) : null);
  const next = {
    provider: session.provider || null,
    accessToken: session.accessToken || null,
    userId,
    authUserId,
    email: session.email || null,
    isAuthenticated: Boolean(session.isAuthenticated)
  };

  safeStorageSet(STORAGE_KEY, JSON.stringify(next));
  emitAuthChanged(next);
  return next;
}

export function continueWithProvider(provider) {
  const normalizedProvider = String(provider || '').toLowerCase();
  const mappedUserId = providerUserMap[normalizedProvider] || 1;

  return setAuthSession({
    provider: normalizedProvider,
    accessToken: null,
    userId: mappedUserId,
    isAuthenticated: true
  });
}

export function clearAuthSession() {
  safeStorageRemove(STORAGE_KEY);
  emitAuthChanged(null);
}

function applySupabaseSession(session) {
  if (!session?.user) {
    clearAuthSession();
    return { ...defaultSession };
  }

  return setAuthSession({
    provider: 'supabase',
    accessToken: session.access_token,
    authUserId: session.user.id,
    email: session.user.email || null,
    isAuthenticated: true
  });
}

export async function initializeSupabaseAuth() {
  if (!isSupabaseConfigured || !supabase) {
    return getAuthSession();
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const next = applySupabaseSession(data.session);

  if (!supabaseAuthSubscription) {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySupabaseSession(session);
    });
    supabaseAuthSubscription = listener.subscription;
  }

  return next;
}

export async function signUpWithPassword({ email, password, displayName }) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: String(email || '').trim().toLowerCase(),
    password,
    options: {
      data: {
        display_name: String(displayName || '').trim()
      }
    }
  });
  if (error) throw error;
  if (data.session) applySupabaseSession(data.session);
  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: Boolean(data.user && !data.session)
  };
}

export async function signInWithPassword({ email, password }) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password
  });
  if (error) throw error;
  return applySupabaseSession(data.session);
}

export async function signOutFromSupabase() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
  clearAuthSession();
}

export function readAuthLogoutReason() {
  const raw = safeStorageGet(LOGOUT_REASON_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      code: String(parsed?.code || ''),
      at: String(parsed?.at || '')
    };
  } catch {
    return null;
  }
}

export function consumeAuthLogoutReason() {
  const reason = readAuthLogoutReason();
  safeStorageRemove(LOGOUT_REASON_KEY);
  return reason;
}

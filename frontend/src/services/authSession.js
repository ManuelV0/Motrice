import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/safeStorage';

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
  isAuthenticated: false
};

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
    const normalizedUserId = Number(parsed.userId);
    const userId = Number.isInteger(normalizedUserId) && normalizedUserId > 0 ? normalizedUserId : null;
    const inferredAuthenticated =
      Boolean(parsed.accessToken) || Boolean(parsed.provider) || Boolean(userId);

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
      isAuthenticated:
        typeof parsed.isAuthenticated === 'boolean' ? parsed.isAuthenticated : inferredAuthenticated
    };
  } catch {
    return { ...defaultSession };
  }
}

export function setAuthSession(session) {
  const normalizedUserId = Number(session.userId);
  const userId = Number.isInteger(normalizedUserId) && normalizedUserId > 0 ? normalizedUserId : null;
  const next = {
    provider: session.provider || null,
    accessToken: session.accessToken || null,
    userId,
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

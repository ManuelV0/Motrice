import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';

const APP_INTRO_STORAGE_KEY = 'motrice_app_intro_v1';

function getSessionKey(session = {}) {
  const identity =
    session.authUserId ||
    session.userId ||
    session.email ||
    session.provider;

  return identity ? String(identity).trim().toLowerCase() : '';
}

function readState() {
  const raw = safeStorageGet(APP_INTRO_STORAGE_KEY);
  if (!raw) return { users: {} };

  try {
    const parsed = JSON.parse(raw);
    return {
      users: parsed?.users && typeof parsed.users === 'object' ? parsed.users : {}
    };
  } catch {
    return { users: {} };
  }
}

export function hasCompletedAppIntro(session) {
  const sessionKey = getSessionKey(session);
  if (!sessionKey) return false;
  return Boolean(readState().users[sessionKey]?.completedAt);
}

export function completeAppIntro(session, outcome = 'completed') {
  const sessionKey = getSessionKey(session);
  if (!sessionKey) return false;

  const current = readState();
  const next = {
    users: {
      ...current.users,
      [sessionKey]: {
        completedAt: new Date().toISOString(),
        outcome: outcome === 'skipped' ? 'skipped' : 'completed'
      }
    }
  };

  return safeStorageSet(APP_INTRO_STORAGE_KEY, JSON.stringify(next));
}

import { getAuthSession } from '../../../services/authSession';
import { safeStorageGet, safeStorageSet } from '../../../utils/safeStorage';

const STORAGE_PREFIX = 'motrice_outdoor_session_v1';

function storageIdentity() {
  const auth = getAuthSession();
  return auth.authUserId || auth.userId || auth.email || 'guest';
}

function sessionKey(eventId) {
  return `${STORAGE_PREFIX}:${storageIdentity()}:${String(eventId)}`;
}

export function loadOutdoorSession(eventId) {
  try {
    const raw = safeStorageGet(sessionKey(eventId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveOutdoorSession(eventId, session) {
  safeStorageSet(sessionKey(eventId), JSON.stringify(session));
  return session;
}

export function createOutdoorSession(eventId, kind, remote = {}) {
  const previous = loadOutdoorSession(eventId);
  const session = {
    eventId: String(eventId),
    kind,
    startedAt: previous?.startedAt || remote?.started_at || new Date().toISOString(),
    pausedAt: previous?.pausedAt || null,
    pausedTotalMs: Math.max(0, Number(previous?.pausedTotalMs || 0)),
    completedAt: previous?.completedAt || remote?.completed_at || null,
    distanceM: Math.max(0, Number(previous?.distanceM || 0)),
    elevationGainM: Math.max(0, Number(previous?.elevationGainM || 0)),
    currentSpeedMps: Math.max(0, Number(previous?.currentSpeedMps || 0)),
    lastAccuracyM: previous?.lastAccuracyM ?? null,
    lastSample: previous?.lastSample || null,
    samples: Array.isArray(previous?.samples) ? previous.samples.slice(-240) : [],
    gpsState: previous?.gpsState || 'waiting',
    sixtyPercentAwarded: Boolean(previous?.sixtyPercentAwarded || remote?.mot_sixty_awarded),
    completionAwarded: Boolean(previous?.completionAwarded || remote?.xp_completion_awarded)
  };
  return saveOutdoorSession(eventId, session);
}

export function pauseOutdoorSession(eventId, session, now = new Date()) {
  if (!session || session.pausedAt || session.completedAt) return session;
  return saveOutdoorSession(eventId, {
    ...session,
    pausedAt: now.toISOString(),
    currentSpeedMps: 0
  });
}

export function resumeOutdoorSession(eventId, session, now = new Date()) {
  if (!session?.pausedAt || session.completedAt) return session;
  const pausedAtMs = Date.parse(session.pausedAt);
  const extraPausedMs = Number.isFinite(pausedAtMs) ? Math.max(0, now.getTime() - pausedAtMs) : 0;
  return saveOutdoorSession(eventId, {
    ...session,
    pausedAt: null,
    pausedTotalMs: Math.max(0, Number(session.pausedTotalMs || 0)) + extraPausedMs,
    lastSample: null,
    currentSpeedMps: 0
  });
}

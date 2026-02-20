import { getAuthSession } from './authSession';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';

const STORE_KEY = 'motrice_traffic_ops_v1';
const VISITOR_KEY = 'motrice_traffic_visitor_v1';
const ACTIVE_USER_WINDOW_MS = 2 * 60 * 1000;
const ACTIVE_SESSION_WINDOW_MS = 10 * 60 * 1000;
const PAGEVIEW_WINDOW_MS = 5 * 60 * 1000;
const KEEP_WINDOW_MS = 60 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function readStore() {
  try {
    const raw = safeStorageGet(STORE_KEY);
    if (!raw) return { heartbeats: {}, pageviews: [] };
    const parsed = JSON.parse(raw);
    return {
      heartbeats: parsed?.heartbeats && typeof parsed.heartbeats === 'object' ? parsed.heartbeats : {},
      pageviews: Array.isArray(parsed?.pageviews) ? parsed.pageviews : []
    };
  } catch {
    return { heartbeats: {}, pageviews: [] };
  }
}

function saveStore(store) {
  safeStorageSet(STORE_KEY, JSON.stringify(store));
}

function getVisitorId() {
  const existing = String(safeStorageGet(VISITOR_KEY) || '').trim();
  if (existing) return existing;
  const created = `v_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  safeStorageSet(VISITOR_KEY, created);
  return created;
}

function pruneStore(store, now) {
  const nextHeartbeats = {};
  Object.entries(store.heartbeats || {}).forEach(([id, entry]) => {
    const ts = Number(entry?.last_seen_at_ms || 0);
    if (now - ts <= KEEP_WINDOW_MS) {
      nextHeartbeats[id] = entry;
    }
  });

  const nextViews = (store.pageviews || []).filter((item) => now - Number(item?.at_ms || 0) <= KEEP_WINDOW_MS);
  return { heartbeats: nextHeartbeats, pageviews: nextViews };
}

export function markTrafficHeartbeat({ page = 'unknown', addPageview = false } = {}) {
  const now = nowMs();
  const visitorId = getVisitorId();
  const session = getAuthSession();
  const userId = Number(session.userId);

  const store = pruneStore(readStore(), now);
  store.heartbeats[visitorId] = {
    visitor_id: visitorId,
    page: String(page || 'unknown'),
    is_authenticated: Boolean(session.isAuthenticated),
    user_id: Number.isInteger(userId) && userId > 0 ? userId : null,
    last_seen_at_ms: now
  };

  if (addPageview) {
    store.pageviews.push({
      visitor_id: visitorId,
      page: String(page || 'unknown'),
      is_authenticated: Boolean(session.isAuthenticated),
      user_id: Number.isInteger(userId) && userId > 0 ? userId : null,
      at_ms: now
    });
  }

  saveStore(store);
}

export function getOperationalTrafficSnapshot() {
  const now = nowMs();
  const store = pruneStore(readStore(), now);
  saveStore(store);

  const heartbeats = Object.values(store.heartbeats || {});
  const activeUsers = heartbeats.filter((item) => now - Number(item?.last_seen_at_ms || 0) <= ACTIVE_USER_WINDOW_MS).length;
  const activeSessions = heartbeats.filter((item) => now - Number(item?.last_seen_at_ms || 0) <= ACTIVE_SESSION_WINDOW_MS).length;
  const pageviews5m = (store.pageviews || []).filter((item) => now - Number(item?.at_ms || 0) <= PAGEVIEW_WINDOW_MS).length;

  return {
    activeUsers,
    activeSessions,
    pageviews5m
  };
}

import { getAuthSession } from './authSession';
import { api } from './api';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';

const STORAGE_KEY = 'motrice_chat_store_v1';
const DEFAULT_PAGE_LIMIT = 60;

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function wait(payload, ms = 80) {
  return new Promise((resolve) => setTimeout(() => resolve(payload), ms));
}

function resolveUserId() {
  const session = getAuthSession();
  const id = Number(session?.userId || 0);
  if (Number.isInteger(id) && id > 0) return id;
  return 1;
}

function parseIsoMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function parseDmThreadId(threadId) {
  const raw = String(threadId || '').trim();
  const match = raw.match(/^dm_(\d+)_(\d+)$/);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0 || a === b) return null;
  return { a, b };
}

function getDmThreadId(userA, userB) {
  const min = Math.min(Number(userA), Number(userB));
  const max = Math.max(Number(userA), Number(userB));
  return `dm_${min}_${max}`;
}

function ensureThreadMeta(thread, store) {
  const threadId = String(thread.id);
  const items = Array.isArray(store.messagesByThread?.[threadId]) ? store.messagesByThread[threadId] : [];
  const latest = items.length ? items[items.length - 1] : null;
  const lastMessage = latest ? String(latest.text || '').trim() : String(thread.lastMessage || '').trim();
  const lastTs = latest?.ts || thread.lastTs || nowIso();
  return {
    ...thread,
    lastMessage,
    lastTs
  };
}

function buildSeedStore(currentUserId) {
  const t0 = Date.now();
  const ts = (deltaMs) => new Date(t0 - deltaMs).toISOString();

  const threads = [
    {
      id: 'event_101',
      type: 'event',
      title: 'Partita Calcio 5v5',
      avatarUrl: '',
      participants: [currentUserId, 2, 3, 4],
      eventId: 101,
      meta: { participantsCount: 4 },
      lastMessage: '',
      lastTs: ts(20 * 60 * 1000)
    }
  ];

  const messagesByThread = {
    event_101: [
      { id: 'm_ev_1', threadId: 'event_101', senderId: 4, text: 'Ragazzi oggi campo 2.', ts: ts(25 * 60 * 1000), status: 'sent' },
      { id: 'm_ev_2', threadId: 'event_101', senderId: 2, text: 'Io arrivo 10 min prima.', ts: ts(22 * 60 * 1000), status: 'sent' },
      { id: 'm_ev_3', threadId: 'event_101', senderId: currentUserId, text: 'Perfetto, ci vediamo li.', ts: ts(20 * 60 * 1000), status: 'sent' }
    ]
  };

  const lastReadByUserThread = {
    [String(currentUserId)]: {
      event_101: ts(30 * 60 * 1000)
    }
  };

  return { threads, messagesByThread, lastReadByUserThread };
}

function loadStore() {
  const currentUserId = resolveUserId();
  const raw = safeStorageGet(STORAGE_KEY);
  if (!raw) {
    const seeded = buildSeedStore(currentUserId);
    safeStorageSet(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
    const merged = {
      threads: Array.isArray(parsed.threads) ? parsed.threads : [],
      messagesByThread: parsed.messagesByThread && typeof parsed.messagesByThread === 'object' ? parsed.messagesByThread : {},
      lastReadByUserThread: parsed.lastReadByUserThread && typeof parsed.lastReadByUserThread === 'object' ? parsed.lastReadByUserThread : {}
    };

    return merged;
  } catch {
    const seeded = buildSeedStore(currentUserId);
    safeStorageSet(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveStore(store) {
  safeStorageSet(STORAGE_KEY, JSON.stringify(store));
}

function normalizeMessage(raw) {
  return {
    id: String(raw.id || `msg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
    threadId: String(raw.threadId || ''),
    senderId: Number(raw.senderId || 0),
    text: String(raw.text || ''),
    ts: String(raw.ts || nowIso()),
    status: String(raw.status || 'sent')
  };
}

function computeUnreadCount(store, threadId, currentUserId) {
  const id = String(threadId);
  const messages = Array.isArray(store.messagesByThread?.[id]) ? store.messagesByThread[id] : [];
  if (!messages.length) return 0;
  const lastReadIso = store.lastReadByUserThread?.[String(currentUserId)]?.[id] || null;
  const lastReadMs = parseIsoMs(lastReadIso);

  return messages.filter((message) => {
    const senderId = Number(message.senderId || 0);
    if (senderId === Number(currentUserId)) return false;
    const tsMs = parseIsoMs(message.ts);
    if (!lastReadMs) return true;
    return tsMs > lastReadMs;
  }).length;
}

async function ensureDmThreadsFromFriends(store, currentUserId) {
  const friends = await api.listFriends();
  const friendItems = Array.isArray(friends) ? friends : [];
  const friendIdSet = new Set(friendItems.map((item) => Number(item?.userId || 0)).filter((id) => Number.isInteger(id) && id > 0));

  const existing = Array.isArray(store.threads) ? store.threads : [];
  const filtered = existing.filter((thread) => {
    if (String(thread?.type) !== 'dm') return true;
    const parsed = parseDmThreadId(thread.id);
    if (!parsed) return false;
    const other = parsed.a === Number(currentUserId) ? parsed.b : parsed.a;
    if (!friendIdSet.has(other)) return false;
    return true;
  });

  friendItems.forEach((friend) => {
    const friendId = Number(friend?.userId || 0);
    if (!Number.isInteger(friendId) || friendId <= 0) return;
    const threadId = getDmThreadId(currentUserId, friendId);
    const existingThread = filtered.find((item) => String(item.id) === threadId);
    const baseThread = {
      id: threadId,
      type: 'dm',
      title: String(friend?.display_name || `Utente ${friendId}`).trim() || `Utente ${friendId}`,
      avatarUrl: String(friend?.avatar_url || '').trim(),
      participants: [Number(currentUserId), friendId],
      eventId: null,
      meta: { status: 'amico' },
      lastMessage: '',
      lastTs: nowIso(),
      otherUserId: friendId
    };
    if (!existingThread) {
      filtered.push(baseThread);
      return;
    }
    Object.assign(existingThread, {
      ...existingThread,
      title: baseThread.title,
      avatarUrl: baseThread.avatarUrl,
      participants: baseThread.participants,
      otherUserId: friendId,
      meta: {
        ...(existingThread.meta || {}),
        status: 'amico'
      }
    });
  });

  store.threads = filtered;
}

function getVisibleThreads(store, currentUserId) {
  return (Array.isArray(store.threads) ? store.threads : [])
    .filter((thread) => (Array.isArray(thread.participants) ? thread.participants : []).some((id) => Number(id) === Number(currentUserId)))
    .map((thread) => {
      const withMeta = ensureThreadMeta(thread, store);
      return {
        ...withMeta,
        unreadCount: computeUnreadCount(store, withMeta.id, currentUserId)
      };
    })
    .sort((a, b) => parseIsoMs(b.lastTs) - parseIsoMs(a.lastTs));
}

function getThreadById(store, threadId, currentUserId) {
  const threads = getVisibleThreads(store, currentUserId);
  return threads.find((thread) => String(thread.id) === String(threadId)) || null;
}

export const chatApi = {
  async listThreads() {
    const store = loadStore();
    const currentUserId = resolveUserId();
    await ensureDmThreadsFromFriends(store, currentUserId);
    saveStore(store);
    const items = getVisibleThreads(store, currentUserId);
    return wait(clone(items));
  },

  async getThread(threadId) {
    const store = loadStore();
    const currentUserId = resolveUserId();
    await ensureDmThreadsFromFriends(store, currentUserId);
    saveStore(store);
    const thread = getThreadById(store, threadId, currentUserId);
    if (!thread) throw new Error('Chat non trovata');
    return wait(clone(thread));
  },

  async listMessages(threadId, options = {}) {
    const store = loadStore();
    const currentUserId = resolveUserId();
    await ensureDmThreadsFromFriends(store, currentUserId);
    saveStore(store);
    const thread = getThreadById(store, threadId, currentUserId);
    if (!thread) throw new Error('Chat non trovata');

    const limit = Number.isInteger(Number(options.limit)) ? Math.max(1, Math.min(200, Number(options.limit))) : DEFAULT_PAGE_LIMIT;
    const beforeMs = options.before ? parseIsoMs(options.before) : 0;
    const all = (Array.isArray(store.messagesByThread?.[String(threadId)]) ? store.messagesByThread[String(threadId)] : [])
      .map(normalizeMessage)
      .sort((a, b) => parseIsoMs(a.ts) - parseIsoMs(b.ts));

    const filtered = beforeMs ? all.filter((item) => parseIsoMs(item.ts) < beforeMs) : all;
    const sliceStart = Math.max(0, filtered.length - limit);
    const items = filtered.slice(sliceStart);
    const hasMore = sliceStart > 0;
    const nextBefore = hasMore && items.length ? items[0].ts : null;

    return wait(
      clone({
        thread,
        items,
        hasMore,
        nextBefore
      })
    );
  },

  async sendMessage(threadId, text) {
    const store = loadStore();
    const currentUserId = resolveUserId();
    await ensureDmThreadsFromFriends(store, currentUserId);
    const thread = getThreadById(store, threadId, currentUserId);
    if (!thread) throw new Error('Chat non trovata');

    if (String(thread.type) === 'dm') {
      const parsed = parseDmThreadId(thread.id);
      const otherUserId = parsed ? (parsed.a === Number(currentUserId) ? parsed.b : parsed.a) : Number(thread.otherUserId || 0);
      const can = await api.canDM(otherUserId);
      if (!can?.canDM) {
        throw new Error('Devi essere amico per inviare messaggi diretti');
      }
    }

    const body = String(text || '').trim();
    if (!body) throw new Error('Messaggio vuoto');
    if (body.length > 1000) throw new Error('Messaggio troppo lungo (max 1000 caratteri)');

    const created = normalizeMessage({
      id: `m_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      threadId: String(threadId),
      senderId: currentUserId,
      text: body,
      ts: nowIso(),
      status: 'sent'
    });

    const key = String(threadId);
    const prev = Array.isArray(store.messagesByThread?.[key]) ? store.messagesByThread[key] : [];
    store.messagesByThread = {
      ...(store.messagesByThread || {}),
      [key]: [...prev, created].slice(-1000)
    };

    store.threads = (Array.isArray(store.threads) ? store.threads : []).map((item) =>
      String(item.id) === key
        ? {
            ...item,
            lastMessage: created.text,
            lastTs: created.ts
          }
        : item
    );

    store.lastReadByUserThread = {
      ...(store.lastReadByUserThread || {}),
      [String(currentUserId)]: {
        ...(store.lastReadByUserThread?.[String(currentUserId)] || {}),
        [key]: created.ts
      }
    };

    saveStore(store);
    return wait(clone(created));
  },

  async markThreadRead(threadId) {
    const store = loadStore();
    const currentUserId = resolveUserId();
    const key = String(threadId);
    const messages = Array.isArray(store.messagesByThread?.[key]) ? store.messagesByThread[key] : [];
    const latestTs = messages.length ? messages[messages.length - 1].ts : nowIso();

    store.lastReadByUserThread = {
      ...(store.lastReadByUserThread || {}),
      [String(currentUserId)]: {
        ...(store.lastReadByUserThread?.[String(currentUserId)] || {}),
        [key]: latestTs
      }
    };

    saveStore(store);
    return wait({ ok: true });
  },

  async createEventThread({ eventId, title, participants = [] }) {
    const store = loadStore();
    const currentUserId = resolveUserId();
    const safeEventId = Number(eventId || 0);
    if (!Number.isInteger(safeEventId) || safeEventId <= 0) {
      throw new Error('eventId non valido');
    }

    const existing = (Array.isArray(store.threads) ? store.threads : []).find(
      (item) => String(item.type) === 'event' && Number(item.eventId || 0) === safeEventId
    );
    if (existing) return wait(clone(existing));

    const uniqueParticipants = Array.from(
      new Set([currentUserId, ...participants.map((id) => Number(id || 0)).filter((id) => Number.isInteger(id) && id > 0)])
    );
    const thread = {
      id: `event_${safeEventId}`,
      type: 'event',
      title: String(title || `Evento ${safeEventId}`).trim() || `Evento ${safeEventId}`,
      avatarUrl: '',
      participants: uniqueParticipants,
      eventId: safeEventId,
      meta: { participantsCount: uniqueParticipants.length },
      lastMessage: '',
      lastTs: nowIso()
    };

    store.threads = [thread, ...(Array.isArray(store.threads) ? store.threads : [])];
    saveStore(store);
    return wait(clone(thread));
  }
};

import { getAuthSession, legacyIdFromAuthUserId } from './authSession';
import { api } from './api';
import { isSupabaseConfigured, requireSupabase, supabase } from './supabaseClient';
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

function canUseRemoteEventChat() {
  const session = getAuthSession();
  return Boolean(isSupabaseConfigured && supabase && session?.isAuthenticated && session?.authUserId);
}

function parseEventThreadId(threadId) {
  const raw = String(threadId || '').trim();
  if (!raw.startsWith('event_')) return null;
  const eventId = raw.slice('event_'.length);
  return eventId || null;
}

function normalizeRemoteMessage(raw, threadId) {
  return normalizeMessage({
    id: raw.id,
    threadId,
    senderId: legacyIdFromAuthUserId(raw.sender_id),
    senderAuthUserId: raw.sender_id,
    senderName: raw.sender?.display_name || 'Partecipante',
    senderAvatarUrl: raw.sender?.avatar_url || '',
    text: raw.body,
    ts: raw.created_at,
    status: 'sent'
  });
}

async function listRemoteEventThreads() {
  const client = requireSupabase();
  const session = getAuthSession();
  const currentUserId = resolveUserId();
  const { data, error } = await client.rpc('get_event_chat_inbox');
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map((row) => {
    const eventId = String(row.event_id);
    const sportSlug = String(row.sport_slug || '').trim();
    return {
      id: `event_${eventId}`,
      type: 'event',
      title: String(row.title || 'Chat evento').trim() || 'Chat evento',
      avatarUrl: sportSlug ? `/images/${sportSlug}.svg` : '',
      participants: [currentUserId],
      eventId,
      meta: {
        participantsCount: Number(row.participants_count || 0),
        startsAt: row.starts_at,
        city: row.city || '',
        locationName: row.location_name || '',
        eventStatus: row.event_status || 'scheduled',
        sportName: row.sport_name || 'Sport',
        sportSlug
      },
      lastMessage: String(row.last_message || '').trim(),
      lastMessageSenderName: row.last_sender_id === session.authUserId ? 'Tu' : row.last_sender_name || '',
      lastMessageSenderId: row.last_sender_id ? legacyIdFromAuthUserId(row.last_sender_id) : null,
      lastTs: row.last_message_at || row.joined_at || row.starts_at || nowIso(),
      unreadCount: Number(row.unread_count || 0)
    };
  });
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
    lastTs,
    lastMessageSenderName: latest?.senderName || thread.lastMessageSenderName || '',
    lastMessageSenderId: latest?.senderId || thread.lastMessageSenderId || null
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
      {
        id: 'm_ev_1',
        threadId: 'event_101',
        senderId: 4,
        senderName: 'Luca',
        text: 'Ragazzi oggi campo 2.',
        ts: ts(25 * 60 * 1000),
        status: 'sent'
      },
      {
        id: 'm_ev_2',
        threadId: 'event_101',
        senderId: 2,
        senderName: 'Andrea',
        text: 'Io arrivo 10 min prima.',
        ts: ts(22 * 60 * 1000),
        status: 'sent'
      },
      {
        id: 'm_ev_3',
        threadId: 'event_101',
        senderId: currentUserId,
        senderName: 'Tu',
        text: 'Perfetto, ci vediamo li.',
        ts: ts(20 * 60 * 1000),
        status: 'sent'
      }
    ]
  };

  const lastReadByUserThread = {
    [String(currentUserId)]: {
      event_101: ts(30 * 60 * 1000)
    }
  };

  return { threads, messagesByThread, lastReadByUserThread, deletedThreadsByUser: {} };
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
      lastReadByUserThread: parsed.lastReadByUserThread && typeof parsed.lastReadByUserThread === 'object' ? parsed.lastReadByUserThread : {},
      deletedThreadsByUser:
        parsed.deletedThreadsByUser && typeof parsed.deletedThreadsByUser === 'object'
          ? parsed.deletedThreadsByUser
          : {}
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
    senderAuthUserId: String(raw.senderAuthUserId || ''),
    senderName: String(raw.senderName || ''),
    senderAvatarUrl: String(raw.senderAvatarUrl || ''),
    text: String(raw.text || ''),
    ts: String(raw.ts || nowIso()),
    status: String(raw.status || 'sent')
  };
}

function normalizeParticipantProfile(profile = {}, fallback = {}) {
  const userId = Number(profile?.userId || fallback?.userId || 0);
  const authUserId = String(
    profile?.authUserId || profile?.id || fallback?.authUserId || ''
  ).trim();
  const displayName = String(
    profile?.display_name ||
      profile?.name ||
      fallback?.displayName ||
      (userId > 0 ? `Utente ${userId}` : 'Partecipante')
  ).trim();

  return {
    userId: Number.isInteger(userId) && userId > 0 ? userId : null,
    authUserId,
    display_name: displayName || 'Partecipante',
    avatar_url: String(profile?.avatar_url || fallback?.avatarUrl || '').trim(),
    bio: String(profile?.bio || '').trim(),
    city: String(profile?.city || '').trim(),
    level: String(profile?.level || '').trim(),
    reliability: Number(profile?.reliability ?? profile?.reliability_score ?? 0)
  };
}

async function hydrateLocalMessageProfiles(messages, currentUserId) {
  const items = Array.isArray(messages) ? messages : [];
  const senderIds = Array.from(
    new Set(
      items
        .map((message) => Number(message?.senderId || 0))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  const profiles = new Map();

  await Promise.all(
    senderIds.map(async (senderId) => {
      try {
        const profile =
          senderId === Number(currentUserId)
            ? await api.getLocalProfile()
            : await api.getAccountProfileByUserId(senderId);
        const configuredName = String(profile?.display_name || profile?.name || '').trim();
        if (senderId !== Number(currentUserId) && !configuredName && !profile?.avatar_url) {
          return;
        }
        profiles.set(senderId, normalizeParticipantProfile(profile, { userId: senderId }));
      } catch {
        // Mantiene il nome storico del messaggio se il profilo non è disponibile.
      }
    })
  );

  return items.map((message) => {
    const profile = profiles.get(Number(message?.senderId || 0));
    if (!profile) return message;
    return {
      ...message,
      senderName: profile.display_name || message.senderName,
      senderAvatarUrl: profile.avatar_url || message.senderAvatarUrl
    };
  });
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

function isThreadDeletedLocally(store, thread, currentUserId) {
  const record = store.deletedThreadsByUser?.[String(currentUserId)]?.[String(thread?.id || '')];
  if (!record || typeof record !== 'object') return false;

  return (
    String(record.lastTs || '') === String(thread?.lastTs || '') &&
    String(record.lastMessage || '') === String(thread?.lastMessage || '')
  );
}

function restoreThreadVisibility(store, threadId, currentUserId) {
  const userKey = String(currentUserId);
  const threadKey = String(threadId || '');
  const userRecords = store.deletedThreadsByUser?.[userKey];
  if (!userRecords?.[threadKey]) return false;

  const nextUserRecords = { ...userRecords };
  delete nextUserRecords[threadKey];
  store.deletedThreadsByUser = {
    ...(store.deletedThreadsByUser || {}),
    [userKey]: nextUserRecords
  };
  return true;
}

function getVisibleThreads(store, currentUserId, { includeDeleted = false } = {}) {
  return (Array.isArray(store.threads) ? store.threads : [])
    .filter((thread) => (Array.isArray(thread.participants) ? thread.participants : []).some((id) => Number(id) === Number(currentUserId)))
    .map((thread) => {
      const withMeta = ensureThreadMeta(thread, store);
      return {
        ...withMeta,
        unreadCount: computeUnreadCount(store, withMeta.id, currentUserId)
      };
    })
    .filter((thread) => includeDeleted || !isThreadDeletedLocally(store, thread, currentUserId))
    .sort((a, b) => parseIsoMs(b.lastTs) - parseIsoMs(a.lastTs));
}

function getThreadById(store, threadId, currentUserId) {
  const threads = getVisibleThreads(store, currentUserId, { includeDeleted: true });
  return threads.find((thread) => String(thread.id) === String(threadId)) || null;
}

export const chatApi = {
  async listThreads() {
    const store = loadStore();
    const currentUserId = resolveUserId();
    try {
      await ensureDmThreadsFromFriends(store, currentUserId);
    } catch {
      // La chat eventi resta disponibile anche se la rubrica locale non risponde.
    }
    saveStore(store);
    const localItems = getVisibleThreads(store, currentUserId);

    if (!canUseRemoteEventChat()) {
      return wait(clone(localItems));
    }

    const remoteEvents = await listRemoteEventThreads();
    const localDirectMessages = localItems.filter((thread) => String(thread.type) === 'dm');
    const items = [...remoteEvents, ...localDirectMessages]
      .filter((thread) => !isThreadDeletedLocally(store, thread, currentUserId))
      .sort((a, b) => parseIsoMs(b.lastTs) - parseIsoMs(a.lastTs));
    return clone(items);
  },

  async getThread(threadId) {
    const remoteEventId = parseEventThreadId(threadId);
    if (canUseRemoteEventChat() && remoteEventId) {
      const remoteThreads = await listRemoteEventThreads();
      const thread = remoteThreads.find((item) => String(item.eventId) === String(remoteEventId));
      if (!thread) {
        throw new Error('Partecipa all’evento per accedere alla chat');
      }
      const store = loadStore();
      if (restoreThreadVisibility(store, threadId, resolveUserId())) saveStore(store);
      return clone(thread);
    }

    const store = loadStore();
    const currentUserId = resolveUserId();
    await ensureDmThreadsFromFriends(store, currentUserId);
    saveStore(store);
    const thread = getThreadById(store, threadId, currentUserId);
    if (!thread) throw new Error('Chat non trovata');
    if (restoreThreadVisibility(store, threadId, currentUserId)) saveStore(store);
    return wait(clone(thread));
  },

  async listMessages(threadId, options = {}) {
    const remoteEventId = parseEventThreadId(threadId);
    if (canUseRemoteEventChat() && remoteEventId) {
      const client = requireSupabase();
      const thread = await this.getThread(threadId);
      const limit = Number.isInteger(Number(options.limit))
        ? Math.max(1, Math.min(200, Number(options.limit)))
        : DEFAULT_PAGE_LIMIT;
      let query = client
        .from('event_messages')
        .select(
          'id,event_id,sender_id,body,created_at,sender:profiles!event_messages_sender_id_fkey(id,display_name,avatar_url)'
        )
        .eq('event_id', remoteEventId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);

      if (options.before) {
        query = query.lt('created_at', String(options.before));
      }

      const { data, error } = await query;
      if (error) throw error;
      const descending = Array.isArray(data) ? data : [];
      const items = descending
        .slice()
        .reverse()
        .map((message) => normalizeRemoteMessage(message, String(threadId)));

      return {
        thread,
        items,
        hasMore: descending.length === limit,
        nextBefore: descending.length === limit && items.length ? items[0].ts : null
      };
    }

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
    const items = await hydrateLocalMessageProfiles(filtered.slice(sliceStart), currentUserId);
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
    const body = String(text || '').trim();
    if (!body) throw new Error('Messaggio vuoto');
    if (body.length > 1000) throw new Error('Messaggio troppo lungo (max 1000 caratteri)');

    const remoteEventId = parseEventThreadId(threadId);
    if (canUseRemoteEventChat() && remoteEventId) {
      const client = requireSupabase();
      const session = getAuthSession();
      await this.getThread(threadId);
      const { data, error } = await client
        .from('event_messages')
        .insert({
          event_id: remoteEventId,
          sender_id: session.authUserId,
          body
        })
        .select(
          'id,event_id,sender_id,body,created_at,sender:profiles!event_messages_sender_id_fkey(id,display_name,avatar_url)'
        )
        .single();
      if (error) throw error;
      return normalizeRemoteMessage(data, String(threadId));
    }

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

    let localProfile = null;
    try {
      localProfile = await api.getLocalProfile();
    } catch {
      localProfile = null;
    }
    const senderProfile = normalizeParticipantProfile(localProfile, {
      userId: currentUserId,
      displayName: 'Tu'
    });
    const created = normalizeMessage({
      id: `m_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      threadId: String(threadId),
      senderId: currentUserId,
      senderName: senderProfile.display_name,
      senderAvatarUrl: senderProfile.avatar_url,
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

  async deleteThread(threadId, threadSnapshot = null) {
    const key = String(threadId || '').trim();
    if (!key) throw new Error('Chat non valida');

    const store = loadStore();
    const currentUserId = resolveUserId();
    let thread =
      threadSnapshot && String(threadSnapshot?.id || '') === key
        ? threadSnapshot
        : null;

    if (!thread) {
      const remoteEventId = parseEventThreadId(key);
      if (canUseRemoteEventChat() && remoteEventId) {
        const remoteThreads = await listRemoteEventThreads();
        thread = remoteThreads.find((item) => String(item.id) === key) || null;
      } else {
        await ensureDmThreadsFromFriends(store, currentUserId);
        thread = getThreadById(store, key, currentUserId);
      }
    }

    if (!thread) throw new Error('Chat non trovata');

    store.deletedThreadsByUser = {
      ...(store.deletedThreadsByUser || {}),
      [String(currentUserId)]: {
        ...(store.deletedThreadsByUser?.[String(currentUserId)] || {}),
        [key]: {
          deletedAt: nowIso(),
          lastTs: String(thread.lastTs || ''),
          lastMessage: String(thread.lastMessage || '')
        }
      }
    };

    saveStore(store);
    return wait({ ok: true, threadId: key });
  },

  async getCurrentUserProfile() {
    const profile = await api.getLocalProfile();
    return normalizeParticipantProfile(profile, { userId: resolveUserId(), displayName: 'Tu' });
  },

  async getParticipantProfile(identity = {}) {
    const fallback = {
      userId: identity?.userId,
      authUserId: identity?.authUserId,
      displayName: identity?.displayName,
      avatarUrl: identity?.avatarUrl
    };
    const authUserId = String(identity?.authUserId || '').trim();
    const userId = Number(identity?.userId || 0);

    try {
      const profile = authUserId
        ? await api.getProfile(authUserId)
        : await api.getFocusProfile(userId);
      return normalizeParticipantProfile(profile, fallback);
    } catch {
      return normalizeParticipantProfile({}, fallback);
    }
  },

  async markThreadRead(threadId, readThrough = null) {
    const remoteEventId = parseEventThreadId(threadId);
    if (canUseRemoteEventChat() && remoteEventId) {
      const client = requireSupabase();
      const { error } = await client.rpc('mark_event_chat_read', {
        target_event_id: remoteEventId,
        read_through: readThrough || nowIso()
      });
      if (error) throw error;
      return { ok: true };
    }

    const store = loadStore();
    const currentUserId = resolveUserId();
    const key = String(threadId);
    const messages = Array.isArray(store.messagesByThread?.[key]) ? store.messagesByThread[key] : [];
    const latestTs = readThrough || (messages.length ? messages[messages.length - 1].ts : nowIso());

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
    if (canUseRemoteEventChat()) {
      const remoteThreads = await listRemoteEventThreads();
      const thread = remoteThreads.find((item) => String(item.eventId) === String(eventId));
      if (!thread) {
        throw new Error('Partecipa all’evento per accedere alla chat');
      }
      return clone(thread);
    }

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
  },

  subscribe(onChange) {
    if (!canUseRemoteEventChat() || typeof onChange !== 'function') {
      return () => {};
    }

    const client = requireSupabase();
    const session = getAuthSession();
    const channel = client
      .channel(`motrice-event-chat-${session.authUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_messages' },
        (payload) => onChange({ kind: 'message', payload })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_participants' },
        (payload) => onChange({ kind: 'participants', payload })
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }
};

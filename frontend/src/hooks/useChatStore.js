import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthSession } from '../services/authSession';
import { chatApi } from '../services/chatApi';

function resolveCurrentUserId() {
  const session = getAuthSession();
  const id = Number(session?.userId || 0);
  return Number.isInteger(id) && id > 0 ? id : 1;
}

export function useChatStore(initialThreadId = null) {
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState(initialThreadId ? String(initialThreadId) : null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);

  const currentUserId = useMemo(() => resolveCurrentUserId(), []);

  const selectedThread = useMemo(
    () => threads.find((thread) => String(thread.id) === String(selectedThreadId || '')) || null,
    [threads, selectedThreadId]
  );

  const filteredThreads = useMemo(() => {
    const text = String(query || '').trim().toLowerCase();
    if (!text) return threads;
    return threads.filter((item) => {
      const title = String(item.title || '').toLowerCase();
      const preview = String(item.lastMessage || '').toLowerCase();
      return title.includes(text) || preview.includes(text);
    });
  }, [threads, query]);

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const items = await chatApi.listThreads();
      setThreads(Array.isArray(items) ? items : []);
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (threadId, options = {}) => {
    if (!threadId) {
      setMessages([]);
      setHasMoreMessages(false);
      return;
    }

    setMessagesLoading(Boolean(options.showLoader));
    try {
      const payload = await chatApi.listMessages(threadId, { limit: 60 });
      const list = Array.isArray(payload?.items) ? payload.items : [];
      setMessages(list);
      setHasMoreMessages(Boolean(payload?.hasMore));
      await chatApi.markThreadRead(threadId);
      const threadsNext = await chatApi.listThreads();
      setThreads(Array.isArray(threadsNext) ? threadsNext : []);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const selectThread = useCallback(
    async (threadId, options = {}) => {
      const safeId = threadId ? String(threadId) : null;
      setSelectedThreadId(safeId);
      if (!safeId) {
        setMessages([]);
        setHasMoreMessages(false);
        return;
      }
      await loadMessages(safeId, { showLoader: Boolean(options.showLoader) });
    },
    [loadMessages]
  );

  const loadOlderMessages = useCallback(async () => {
    if (!selectedThreadId || !messages.length) return;
    const before = messages[0]?.ts;
    if (!before) return;
    const payload = await chatApi.listMessages(selectedThreadId, { before, limit: 60 });
    const older = Array.isArray(payload?.items) ? payload.items : [];
    if (!older.length) {
      setHasMoreMessages(false);
      return;
    }

    setMessages((prev) => {
      const prevIds = new Set((Array.isArray(prev) ? prev : []).map((item) => String(item.id)));
      const merged = [...older.filter((item) => !prevIds.has(String(item.id))), ...(Array.isArray(prev) ? prev : [])];
      return merged;
    });
    setHasMoreMessages(Boolean(payload?.hasMore));
  }, [messages, selectedThreadId]);

  const sendMessage = useCallback(
    async (text) => {
      if (!selectedThreadId) return { ok: false };
      const body = String(text || '').trim();
      if (!body) return { ok: false };

      const tempId = `temp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const tempMessage = {
        id: tempId,
        threadId: selectedThreadId,
        senderId: currentUserId,
        text: body,
        ts: new Date().toISOString(),
        status: 'sending'
      };

      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), tempMessage]);
      setSending(true);

      try {
        const created = await chatApi.sendMessage(selectedThreadId, body);
        setMessages((prev) =>
          (Array.isArray(prev) ? prev : []).map((item) =>
            String(item.id) === tempId
              ? {
                  ...created,
                  status: 'sent'
                }
              : item
          )
        );
        const nextThreads = await chatApi.listThreads();
        setThreads(Array.isArray(nextThreads) ? nextThreads : []);
        return { ok: true, message: created };
      } catch (error) {
        setMessages((prev) =>
          (Array.isArray(prev) ? prev : []).map((item) =>
            String(item.id) === tempId
              ? {
                  ...item,
                  status: 'failed'
                }
              : item
          )
        );
        return { ok: false, error };
      } finally {
        setSending(false);
      }
    },
    [currentUserId, selectedThreadId]
  );

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!initialThreadId) return;
    const safeId = String(initialThreadId);
    if (safeId === String(selectedThreadId || '')) return;
    selectThread(safeId, { showLoader: true });
  }, [initialThreadId, selectedThreadId, selectThread]);

  return {
    currentUserId,
    threadsLoading,
    messagesLoading,
    sending,
    threads,
    filteredThreads,
    query,
    setQuery,
    selectedThreadId,
    selectedThread,
    messages,
    hasMoreMessages,
    loadThreads,
    selectThread,
    sendMessage,
    loadOlderMessages
  };
}

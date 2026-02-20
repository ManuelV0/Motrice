import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatThread from '../components/chat/ChatThread';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import { useChatStore } from '../hooks/useChatStore';
import styles from '../styles/pages/chatThreadPage.module.css';

function useIsMobileLayout() {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 767px)');
    const onChange = (event) => setMobile(event.matches);
    if (media.addEventListener) {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return mobile;
}

function ChatThreadPage() {
  const navigate = useNavigate();
  const { threadId } = useParams();
  const mobile = useIsMobileLayout();
  const {
    currentUserId,
    messagesLoading,
    sending,
    selectedThread,
    messages,
    hasMoreMessages,
    selectThread,
    sendMessage,
    loadOlderMessages
  } = useChatStore(threadId || null);

  const [draft, setDraft] = useState('');

  usePageMeta({
    title: 'Conversazione | Motrice',
    description: 'Thread chat full-screen su mobile con composer e back dedicato.'
  });

  useEffect(() => {
    if (!threadId) return;
    selectThread(String(threadId), { showLoader: true });
  }, [threadId, selectThread]);

  async function handleSend() {
    const text = String(draft || '').trim();
    if (!text) return;
    const result = await sendMessage(text);
    if (result?.ok) {
      setDraft('');
    }
  }

  if (!threadId) return <LoadingSkeleton rows={3} variant="detail" />;

  return (
    <section className={styles.page}>
      <ChatThread
        thread={selectedThread}
        messages={messages}
        loading={messagesLoading}
        hasMore={hasMoreMessages}
        onLoadMore={loadOlderMessages}
        draft={draft}
        onDraftChange={setDraft}
        onSend={handleSend}
        sending={sending}
        currentUserId={currentUserId}
        onBack={() => navigate('/chat/inbox')}
        onOpenProfile={(userId) => navigate(`/chat/focus/${userId}`)}
        mobile={mobile}
        fullScreenMobile
      />
    </section>
  );
}

export default ChatThreadPage;

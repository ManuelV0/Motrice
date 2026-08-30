import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatThread from '../components/chat/ChatThread';
import ChatUserProfileCard from '../components/chat/ChatUserProfileCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useChatStore } from '../hooks/useChatStore';
import { chatApi } from '../services/chatApi';
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
  const { showToast } = useToast();
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
  const [profileCard, setProfileCard] = useState({
    open: false,
    loading: false,
    profile: null,
    error: ''
  });

  usePageMeta({
    title: 'Conversazione | Motrice',
    description: 'Thread chat full-screen su mobile con composer e back dedicato.'
  });

  useEffect(() => {
    if (!threadId) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    selectThread(String(threadId), { showLoader: true }).catch((error) => {
      showToast(error.message || 'Impossibile aprire la chat', 'error');
      navigate('/chat', { replace: true });
    });
  }, [threadId, navigate, selectThread, showToast]);

  async function handleSend() {
    const text = String(draft || '').trim();
    if (!text) return;
    const result = await sendMessage(text);
    if (result?.ok) {
      setDraft('');
    } else {
      showToast(result?.error?.message || 'Invio non riuscito', 'error');
    }
  }

  async function handleOpenProfile(identity) {
    const fallback = {
      userId: identity?.userId || null,
      authUserId: identity?.authUserId || '',
      display_name: identity?.displayName || 'Partecipante',
      avatar_url: identity?.avatarUrl || '',
      bio: '',
      city: '',
      level: '',
      reliability: 0
    };
    setProfileCard({ open: true, loading: true, profile: fallback, error: '' });
    try {
      const profile = await chatApi.getParticipantProfile(identity);
      setProfileCard({ open: true, loading: false, profile, error: '' });
    } catch (error) {
      setProfileCard({
        open: true,
        loading: false,
        profile: fallback,
        error: error?.message || 'Profilo non disponibile'
      });
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
        onBack={() => navigate('/chat')}
        onOpenProfile={handleOpenProfile}
        onOpenEvent={(eventId) => navigate(`/events/${eventId}`)}
        mobile={mobile}
        fullScreenMobile
      />
      <ChatUserProfileCard
        open={profileCard.open}
        loading={profileCard.loading}
        profile={profileCard.profile}
        error={profileCard.error}
        onClose={() => setProfileCard((current) => ({ ...current, open: false }))}
      />
    </section>
  );
}

export default ChatThreadPage;

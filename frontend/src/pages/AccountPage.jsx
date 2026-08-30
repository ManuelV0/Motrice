import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSkeleton from '../components/LoadingSkeleton';
import MotriceProfileV3 from '../components/profile/MotriceProfileV3';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import {
  createEmptyProfileV3,
  getProfileV3State
} from '../services/profileV3';
import { uploadProfileMedia } from '../services/profileMedia';

function AccountPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [profileV3, setProfileV3] = useState(() => createEmptyProfileV3());
  const [mode, setMode] = useState('mine');
  const [loading, setLoading] = useState(true);

  usePageMeta({
    title: 'Profilo Motrice | Motrice',
    description: 'Carta identità sportiva, presenza verificata, reputazione e progressione Motrice.'
  });

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const identity = await api.getLocalProfile();
      setProfile(identity);
      setProfileV3(await getProfileV3State(identity));
    } catch (error) {
      showToast(error.message || 'Impossibile caricare il profilo', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  async function saveProfile(form) {
    try {
      const saved = await api.updateLocalProfile(form);
      const identity = { ...(profile || {}), ...(saved || {}), ...form };
      setProfile(identity);
      setProfileV3((current) => ({
        ...current,
        identity: {
          ...current.identity,
          display_name: identity.display_name,
          avatar_url: identity.avatar_url,
          cover_url: identity.cover_url,
          bio: identity.bio,
          city: identity.city
        }
      }));
      showToast('Profilo unificato aggiornato', 'success');
      return true;
    } catch (error) {
      showToast(error.message || 'Salvataggio non riuscito', 'error');
      return false;
    }
  }

  if (loading || !profile) {
    return <LoadingSkeleton rows={6} variant="detail" />;
  }

  return (
    <MotriceProfileV3
      profile={profile}
      state={profileV3}
      mode={mode}
      onModeChange={setMode}
      onSaveProfile={saveProfile}
      onUploadMedia={uploadProfileMedia}
      onVerify={() => navigate('/verify-profile')}
      onInvite={() => {
        showToast('Scegli un evento per invitare questo profilo', 'info');
        navigate('/agenda');
      }}
    />
  );
}

export default AccountPage;

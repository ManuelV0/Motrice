import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSkeleton from '../components/LoadingSkeleton';
import MotriceProfileV3 from '../components/profile/MotriceProfileV3';
import { useBilling } from '../context/BillingContext';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import {
  createEmptyProfileV3,
  getProfileV3State
} from '../services/profileV3';
import { uploadProfileMedia } from '../services/profileMedia';
import {
  deleteProfileMoment,
  getProfileMoments,
  uploadProfileMoment
} from '../services/profileMoments';
import {
  getMyProfilePhotoChange,
  submitProfilePhotoChange
} from '../services/profilePhotoVerification';

function AccountPage() {
  const navigate = useNavigate();
  const { isPremium } = useBilling();
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [profileV3, setProfileV3] = useState(() => createEmptyProfileV3());
  const [mode, setMode] = useState('mine');
  const [photoReview, setPhotoReview] = useState({ status: 'none' });
  const [moments, setMoments] = useState([]);
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
      const [nextProfileV3, nextPhotoReview, nextMoments] = await Promise.all([
        getProfileV3State(identity),
        getMyProfilePhotoChange(),
        getProfileMoments(identity?.id)
      ]);
      setProfileV3(nextProfileV3);
      setPhotoReview(nextPhotoReview);
      setMoments(nextMoments);
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

  async function uploadMedia(file, kind) {
    if (kind === 'cover') return uploadProfileMedia(file, 'cover');

    const result = await submitProfilePhotoChange(file);
    setPhotoReview(result);

    if (result.local && result.approved_avatar_url) {
      return result.approved_avatar_url;
    }

    showToast('Foto inviata al confronto. L’avatar attuale resta visibile fino all’approvazione.', 'success');
    return result;
  }

  async function addMoment(file) {
    const created = await uploadProfileMoment(file);
    setMoments((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    showToast('Momento aggiunto al profilo', 'success');
    return created;
  }

  async function removeMoment(moment) {
    await deleteProfileMoment(moment);
    setMoments((current) => current.filter((item) => item.id !== moment.id));
    showToast('Momento rimosso', 'success');
    return true;
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
      onUploadMedia={uploadMedia}
      photoReview={photoReview}
      moments={moments}
      onUploadMoment={addMoment}
      onDeleteMoment={removeMoment}
      isPremium={isPremium}
      onVerify={() => navigate('/verify-profile')}
      onInvite={() => {
        showToast('Scegli un evento per invitare questo profilo', 'info');
        navigate('/agenda');
      }}
    />
  );
}

export default AccountPage;

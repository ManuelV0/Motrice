import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import LoadingSkeleton from '../components/LoadingSkeleton';
import MotriceProfileV3 from '../components/profile/MotriceProfileV3';
import EmptyState from '../components/EmptyState';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import { createEmptyProfileV3, getPublicProfileV3State } from '../services/profileV3';

function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const sourceEventId = String(searchParams.get('event') || '').trim();
  const [profile, setProfile] = useState(null);
  const [profileV3, setProfileV3] = useState(() => createEmptyProfileV3());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const displayName = profile?.display_name || profile?.name || '';

  usePageMeta({
    title: displayName ? `${displayName} | Profilo pubblico Motrice` : 'Profilo pubblico | Motrice',
    description: 'Carta identità sportiva pubblica con presenza verificata, reputazione, MOT e progressione.'
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    api.getProfile(id)
      .catch((identityError) => {
        const fallback = location.state?.publicProfile;
        if (fallback && String(fallback.id || '') === String(id || '')) return fallback;
        throw identityError;
      })
      .then(async (identity) => {
        const state = await getPublicProfileV3State(id, identity);
        if (!active) return;
        setProfile(identity);
        setProfileV3(state);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError?.message || 'Profilo non disponibile');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, location.state]);

  if (loading) return <LoadingSkeleton rows={6} variant="detail" />;

  if (error || !profile) {
    return (
      <EmptyState
        title="Profilo non trovato"
        description={error || 'Il profilo pubblico non è disponibile.'}
        imageSrc="/images/default-sport.svg"
        imageAlt="Profilo Motrice"
        primaryActionLabel={sourceEventId ? 'Torna all’evento' : 'Apri i miei eventi'}
        onPrimaryAction={() => navigate(sourceEventId ? `/events/${sourceEventId}` : '/agenda')}
      />
    );
  }

  return (
    <MotriceProfileV3
      profile={profile}
      state={profileV3}
      mode="public"
      onModeChange={(nextMode) => {
        if (nextMode === 'mine') navigate('/account');
      }}
      onSaveProfile={() => false}
      isPremium={profile?.plan === 'premium' || profile?.subscription_plan === 'premium'}
      onInvite={() => navigate(sourceEventId ? `/events/${sourceEventId}` : '/agenda')}
      publicActionLabel={sourceEventId ? 'TORNA ALL’EVENTO' : 'INVITA AD EVENTO'}
    />
  );
}

export default ProfilePage;

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import MotriceProfileV2 from '../components/profile/MotriceProfileV2';

function ProfilePage() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  usePageMeta({
    title: profile ? `${profile.name} | Profilo Motrice` : 'Profilo | Motrice',
    description: 'Profilo pubblico atleta con sport praticati, disponibilita e affidabilita.'
  });

  useEffect(() => {
    api
      .getProfile(id)
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return <EmptyState title="Profilo non trovato" description={error} imageSrc="/images/default-sport.svg" imageAlt="Sport" />;
  }

  if (!profile) {
    return <LoadingSkeleton rows={2} variant="detail" />;
  }

  return <MotriceProfileV2 profile={profile} initialView="public" publicActionLabel="VISUALIZZA EVENTO" />;
}

export default ProfilePage;

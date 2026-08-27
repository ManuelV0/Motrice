import { useEffect, useState } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import LoadingSkeleton from '../components/LoadingSkeleton';
import MotriceProfileV2 from '../components/profile/MotriceProfileV2';

function AccountPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  usePageMeta({
    title: 'Il tuo profilo Motrice',
    description: 'Carta d’identità sportiva e reputazione verificata Motrice.'
  });

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setLoading(true);
      const profileRes = await Promise.allSettled([api.getLocalProfile()]);
      if (!active) return;
      setProfile(profileRes[0].status === 'fulfilled' ? profileRes[0].value : {});
      setLoading(false);
    }
    hydrate();
    return () => { active = false; };
  }, []);

  if (loading) return <LoadingSkeleton rows={5} variant="detail" />;
  return <MotriceProfileV2 profile={profile} isOwner />;
}

export default AccountPage;

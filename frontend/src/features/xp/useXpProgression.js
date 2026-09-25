import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { getProfileV3State } from '../../services/profileV3';
import { buildCanonicalXpDetails } from '../../utils/xpDetails';

const EMPTY_PROFILE_STATS = Object.freeze({
  reliability: 0,
  attended: 0,
  no_show: 0,
  cancelled: 0
});

export function useXpProgression() {
  const [state, setState] = useState({
    loading: true,
    error: '',
    xpState: null,
    profileStats: EMPTY_PROFILE_STATS,
    sportsCatalog: []
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    const profileRes = await Promise.resolve()
      .then(() => api.getLocalProfile())
      .then((value) => ({ status: 'fulfilled', value }))
      .catch((reason) => ({ status: 'rejected', reason }));
    const localProfile = profileRes.status === 'fulfilled' ? profileRes.value : {};
    const [xpRes, profileV3Res, sportsRes] = await Promise.allSettled([
      api.getXpState(),
      getProfileV3State(localProfile),
      api.listSports()
    ]);
    const hasXpData = xpRes.status === 'fulfilled' || profileV3Res.status === 'fulfilled';
    const xpState = hasXpData
      ? buildCanonicalXpDetails(
          xpRes.status === 'fulfilled' ? xpRes.value : {},
          profileV3Res.status === 'fulfilled' ? profileV3Res.value : null
        )
      : null;
    const fallbackStats = profileRes.status === 'fulfilled'
      ? {
          reliability: Number(localProfile?.reliability || localProfile?.reliability_score || 0),
          attended: Number(localProfile?.attended || 0),
          no_show: Number(localProfile?.no_show || 0),
          cancelled: Number(localProfile?.cancelled || 0)
        }
      : EMPTY_PROFILE_STATS;
    const remoteStats = xpRes.status === 'fulfilled' ? xpRes.value?.stats : null;
    const profileStats = remoteStats
      ? {
          reliability: Number(remoteStats?.reliability || 0),
          attended: Number(remoteStats?.attended || 0),
          no_show: Number(remoteStats?.no_show || 0),
          cancelled: Number(remoteStats?.cancelled || 0)
        }
      : fallbackStats;

    setState({
      loading: false,
      error: hasXpData ? '' : 'Non è stato possibile caricare la progressione XP.',
      xpState,
      profileStats,
      sportsCatalog: sportsRes.status === 'fulfilled' ? sportsRes.value : []
    });
  }, []);

  useEffect(() => {
    let active = true;
    load().catch(() => {
      if (!active) return;
      setState((current) => ({ ...current, loading: false, error: 'Non è stato possibile caricare la progressione XP.' }));
    });
    return () => { active = false; };
  }, [load]);

  return { ...state, refresh: load };
}


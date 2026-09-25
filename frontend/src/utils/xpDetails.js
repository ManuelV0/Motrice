const BADGE_LEVELS = [
  { key: 'rame', label: 'Rame', min: 0, max: 99 },
  { key: 'bronzo', label: 'Bronzo', min: 100, max: 249 },
  { key: 'argento', label: 'Argento', min: 250, max: 499 },
  { key: 'oro', label: 'Oro', min: 500, max: 999 },
  { key: 'diamante', label: 'Diamante', min: 1000, max: null }
];

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function totalSportXp(rows) {
  if (!rows || typeof rows !== 'object') return 0;
  return Object.values(rows).reduce((total, value) => total + nonNegativeInteger(value), 0);
}

function canonicalHistory(logs) {
  return logs.map((log) => ({
    id: `profile-v3-${log.id}`,
    type: 'xp_award',
    label: String(log.motivo || 'Aggiornamento XP'),
    points: Number(log.xp || 0),
    sportId: 'generic',
    refId: '',
    ts: log.created_at
  }));
}

export function buildCanonicalXpDetails(detailState = {}, profileState = null) {
  const hasCanonicalTotal = Number.isFinite(Number(profileState?.xp?.total));
  const canonicalTotal = hasCanonicalTotal
    ? nonNegativeInteger(profileState.xp.total)
    : nonNegativeInteger(detailState?.xp_global);
  const badge = BADGE_LEVELS.find((item) => canonicalTotal >= item.min && (item.max === null || canonicalTotal <= item.max))
    || BADGE_LEVELS[0];
  const level = Math.floor(canonicalTotal / 250) + 1;
  const currentThreshold = (level - 1) * 250;
  const nextThreshold = level * 250;
  const progressPct = Math.min(100, Math.round(((canonicalTotal - currentThreshold) / 250) * 100));
  const detailSports = detailState?.xp_by_sport && typeof detailState.xp_by_sport === 'object'
    ? detailState.xp_by_sport
    : {};
  const alignedSports = totalSportXp(detailSports) === canonicalTotal;
  const profileLogs = Array.isArray(profileState?.xp?.logs) ? profileState.xp.logs : [];
  const detailHistoryMatches = nonNegativeInteger(detailState?.xp_global) === canonicalTotal;

  return {
    ...detailState,
    source: hasCanonicalTotal ? 'supabase' : detailState?.source,
    xp_global: canonicalTotal,
    xp_by_sport: alignedSports
      ? detailSports
      : (canonicalTotal > 0 ? { generic: canonicalTotal } : {}),
    xp_history: profileLogs.length > 0
      ? canonicalHistory(profileLogs)
      : (detailHistoryMatches && Array.isArray(detailState?.xp_history) ? detailState.xp_history : []),
    badge: { ...badge },
    progress: {
      currentXp: canonicalTotal,
      currentThreshold,
      nextThreshold,
      progressPct,
      level
    }
  };
}


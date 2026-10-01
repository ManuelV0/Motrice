const ACHIEVEMENT_DEFINITIONS = Object.freeze([
  {
    id: 'presente',
    icon: '✅',
    label: 'Presente',
    target: 1,
    unit: 'check-in verificato',
    selectCurrent: (state) => state.verifiedCheckins
  },
  {
    id: 'costante',
    icon: '🔥',
    label: 'Costante',
    target: 3,
    unit: 'presenze verificate',
    selectCurrent: (state) => state.verifiedCheckins
  },
  {
    id: 'team',
    icon: '🤝',
    label: 'Team',
    target: 1,
    unit: 'persona ospitata',
    selectCurrent: (state) => state.hostParticipants
  },
  {
    id: 'host',
    icon: '🏅',
    label: 'Host',
    target: 1,
    unit: 'evento di gruppo organizzato',
    selectCurrent: (state) => state.hostEvents
  }
]);

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function activityTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function motActivityTitle(reason) {
  const normalized = String(reason || '').toLowerCase();
  if (normalized.includes('gps')) return 'Check-in GPS';
  if (normalized.includes('qr') || normalized.includes('checkin')) return 'Check-in verificato';
  if (normalized.includes('workout')) return 'Allenamento verificato';
  return 'MOT ottenuti';
}

export function resolveProfileAchievements({
  verifiedCheckins = 0,
  hostEvents = 0,
  hostParticipants = 0
} = {}) {
  const state = {
    verifiedCheckins: safeNumber(verifiedCheckins),
    hostEvents: safeNumber(hostEvents),
    hostParticipants: safeNumber(hostParticipants)
  };

  return ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const current = Math.min(definition.target, safeNumber(definition.selectCurrent(state)));
    const unlocked = current >= definition.target;
    return {
      id: definition.id,
      icon: definition.icon,
      label: definition.label,
      current,
      target: definition.target,
      unlocked,
      detail: unlocked ? 'Sbloccato' : `${current}/${definition.target} ${definition.unit}`
    };
  });
}

export function buildProfileRecentActivity({ motLogs = [], xpLogs = [], fallback = [] } = {}) {
  const safeMotLogs = Array.isArray(motLogs) ? motLogs : [];
  const safeXpLogs = Array.isArray(xpLogs) ? xpLogs : [];
  if (!safeMotLogs.length && !safeXpLogs.length) {
    return Array.isArray(fallback) ? fallback : [];
  }

  const xpByRef = new Map();
  safeXpLogs.forEach((log) => {
    const ref = String(log?.ref_key || '').trim();
    if (ref) xpByRef.set(ref, log);
  });
  const mergedXpIds = new Set();

  const activities = safeMotLogs.map((log, index) => {
    const ref = String(log?.ref_key || '').trim();
    const matchingXp = ref ? xpByRef.get(ref) : null;
    if (matchingXp) mergedXpIds.add(String(matchingXp.id ?? ref));
    const mot = safeNumber(log?.mot);
    const xp = matchingXp ? safeNumber(matchingXp.xp) : 0;
    return {
      id: `mot-${log?.id ?? (ref || index)}`,
      title: motActivityTitle(log?.motivo),
      subtitle: `+${mot} MOT${xp > 0 ? ` · +${xp} XP` : ''}`,
      created_at: log?.created_at || matchingXp?.created_at || null
    };
  });

  safeXpLogs.forEach((log, index) => {
    const logId = String(log?.id ?? log?.ref_key ?? index);
    if (mergedXpIds.has(logId)) return;
    activities.push({
      id: `xp-${logId}`,
      title: String(log?.motivo || 'XP ottenuti'),
      subtitle: `+${safeNumber(log?.xp)} XP`,
      created_at: log?.created_at || null
    });
  });

  return activities
    .sort((first, second) => activityTimestamp(second.created_at) - activityTimestamp(first.created_at))
    .slice(0, 8);
}

const PERIOD_DAYS = Object.freeze({
  '4w': 28,
  '3m': 90
});

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function exerciseKey(entry) {
  return String(entry?.exerciseKey || entry?.exerciseName || 'esercizio');
}

function normalizedRecord(entry) {
  const weightKg = number(entry?.weightKg);
  const reps = number(entry?.reps);
  return {
    ...entry,
    eventId: String(entry?.eventId || 'sessione-sconosciuta'),
    exerciseKey: exerciseKey(entry),
    exerciseName: String(entry?.exerciseName || 'Esercizio'),
    weightKg,
    reps,
    rir: number(entry?.rir),
    completedAt: entry?.completedAt || null,
    hasValidReps: reps > 0,
    estimatedMax: weightKg > 0 && reps > 0 ? weightKg * (1 + reps / 30) : 0,
    volume: weightKg * reps
  };
}

function performanceScore(record) {
  if (!record?.hasValidReps) return 0;
  return record.estimatedMax || record.reps || 0;
}

function isBetterSet(record, best) {
  if (!best) return true;
  const score = performanceScore(record);
  const bestScore = performanceScore(best);
  if (score !== bestScore) return score > bestScore;
  if (score === 0 && record.weightKg !== best.weightKg) return record.weightKg > best.weightKg;
  return false;
}

function dateBounds(period, now = new Date()) {
  const end = new Date(now).getTime();
  const days = PERIOD_DAYS[period];
  if (!days) return { start: 0, end, previousStart: 0, previousEnd: 0 };
  const duration = days * 24 * 60 * 60 * 1000;
  return {
    start: end - duration,
    end,
    previousStart: end - duration * 2,
    previousEnd: end - duration
  };
}

export function filterExerciseHistory(history = [], period = '4w', now = new Date()) {
  const { start, end } = dateBounds(period, now);
  return (Array.isArray(history) ? history : [])
    .map(normalizedRecord)
    .filter((entry) => {
      const completedAt = timestamp(entry.completedAt);
      return completedAt >= start && completedAt <= end;
    });
}

function buildSessions(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = record.eventId || String(record.completedAt || 'sessione');
    const current = groups.get(key) || [];
    current.push(record);
    groups.set(key, current);
  });

  return [...groups.entries()]
    .map(([eventId, sessionRecords]) => {
      const sorted = [...sessionRecords].sort((a, b) => timestamp(a.completedAt) - timestamp(b.completedAt));
      const bestSet = sorted.reduce((best, record) => (isBetterSet(record, best) ? record : best), null);
      return {
        eventId,
        completedAt: sorted[sorted.length - 1]?.completedAt || null,
        records: sorted,
        sets: sorted.length,
        bestWeight: Math.max(0, ...sorted.map((record) => record.weightKg)),
        bestReps: Math.max(0, ...sorted.map((record) => record.reps)),
        bestEstimatedMax: Math.max(0, ...sorted.map((record) => record.estimatedMax)),
        volume: sorted.reduce((sum, record) => sum + record.volume, 0),
        totalReps: sorted.reduce((sum, record) => sum + record.reps, 0),
        bestSet
      };
    })
    .sort((a, b) => timestamp(a.completedAt) - timestamp(b.completedAt));
}

export function summarizeExerciseHistory(history = [], period = '4w', now = new Date()) {
  const filtered = filterExerciseHistory(history, period, now);
  const groups = new Map();
  filtered.forEach((entry) => {
    const current = groups.get(entry.exerciseKey) || [];
    current.push(entry);
    groups.set(entry.exerciseKey, current);
  });

  return [...groups.entries()]
    .map(([key, records]) => {
      const sorted = [...records].sort((a, b) => timestamp(a.completedAt) - timestamp(b.completedAt));
      const sessions = buildSessions(sorted);
      const latestSession = sessions[sessions.length - 1];
      const bodyweight = !sorted.some((record) => record.weightKg > 0);
      const sessionMetric = (session) => bodyweight ? session?.bestReps || 0 : session?.bestEstimatedMax || 0;
      const latestMetric = sessionMetric(latestSession);
      const previousSession = [...sessions]
        .slice(0, -1)
        .reverse()
        .find((session) => sessionMetric(session) > 0) || null;
      const previousMetric = sessionMetric(previousSession);
      const trendPercent = previousMetric > 0
        ? Math.round(((latestMetric - previousMetric) / previousMetric) * 100)
        : 0;
      const trendStatus = latestMetric <= 0
        ? 'incomplete'
        : !previousSession
          ? 'new'
        : Math.abs(trendPercent) < 1
          ? 'stable'
          : trendPercent > 0 ? 'up' : 'down';
      const previousBest = sessions.slice(0, -1).reduce(
        (best, session) => Math.max(best, sessionMetric(session)),
        0
      );
      const isRecord = Boolean(previousSession) && latestMetric > previousBest;
      const bestSet = sorted.reduce((best, record) => (isBetterSet(record, best) ? record : best), null);
      const chartSessions = sessions.filter((session) => sessionMetric(session) > 0);

      return {
        key,
        name: sorted[sorted.length - 1]?.exerciseName || 'Esercizio',
        equipment: sorted[sorted.length - 1]?.equipment || '',
        bodyweight,
        records: [...sorted].reverse(),
        sessions: [...sessions].reverse(),
        chartSessions,
        sessionCount: sessions.length,
        totalSets: sorted.length,
        totalVolume: sorted.reduce((sum, record) => sum + record.volume, 0),
        totalReps: sorted.reduce((sum, record) => sum + record.reps, 0),
        maxWeight: Math.max(0, ...sorted.map((record) => record.weightKg)),
        bestEstimatedMax: Math.max(0, ...sorted.map((record) => record.estimatedMax)),
        bestReps: Math.max(0, ...sorted.map((record) => record.reps)),
        bestSet,
        hasValidPerformance: performanceScore(bestSet) > 0,
        latestSession,
        previousSession,
        trendPercent,
        trendStatus,
        isRecord,
        lastCompletedAt: latestSession?.completedAt || null
      };
    })
    .sort((a, b) => timestamp(b.lastCompletedAt) - timestamp(a.lastCompletedAt));
}

export function summarizeProgressDashboard(history = [], period = '4w', now = new Date()) {
  const current = filterExerciseHistory(history, period, now);
  const summaries = summarizeExerciseHistory(history, period, now);
  const { previousStart, previousEnd } = dateBounds(period, now);
  const previous = period === 'all'
    ? []
    : (Array.isArray(history) ? history : [])
      .map(normalizedRecord)
      .filter((entry) => {
        const completedAt = timestamp(entry.completedAt);
        return completedAt >= previousStart && completedAt < previousEnd;
      });
  const totalVolume = current.reduce((sum, record) => sum + record.volume, 0);
  const previousVolume = previous.reduce((sum, record) => sum + record.volume, 0);
  const volumeDeltaPercent = previousVolume > 0
    ? Math.round(((totalVolume - previousVolume) / previousVolume) * 100)
    : null;

  return {
    summaries,
    exerciseCount: summaries.length,
    totalSets: current.length,
    totalVolume,
    totalReps: current.reduce((sum, record) => sum + record.reps, 0),
    sessionCount: new Set(current.map((record) => record.eventId)).size,
    recordCount: summaries.filter((summary) => summary.isRecord).length,
    volumeDeltaPercent
  };
}

export function sortExerciseSummaries(summaries = [], sortBy = 'recent') {
  const next = [...summaries];
  if (sortBy === 'improvement') {
    return next.sort((a, b) => b.trendPercent - a.trendPercent || timestamp(b.lastCompletedAt) - timestamp(a.lastCompletedAt));
  }
  if (sortBy === 'records') {
    return next.sort((a, b) => Number(b.isRecord) - Number(a.isRecord) || timestamp(b.lastCompletedAt) - timestamp(a.lastCompletedAt));
  }
  if (sortBy === 'alphabetical') {
    return next.sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }
  return next.sort((a, b) => timestamp(b.lastCompletedAt) - timestamp(a.lastCompletedAt));
}

export const EXERCISE_PROGRESS_PERIODS = PERIOD_DAYS;

import { safeStorageGet, safeStorageSet } from '../../../utils/safeStorage';
import { awardXp } from '../../../services/xp';

const COACH_PROFILE_KEY = 'motrice.coachProfile';
const CHECKINS_KEY = 'motrice.checkins';
const STATS_KEY = 'motrice.coachStats';

const goalConfig = {
  fitness: { sessions: 3 },
  performance: { sessions: 4 },
  social: { sessions: 2 },
  weight_loss: { sessions: 4 }
};

function safeRead(key, fallback) {
  const raw = safeStorageGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  safeStorageSet(key, JSON.stringify(value));
}

function toDateOnly(input) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayIndexToLabel(day) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
}

export function getWeekStart(referenceDate = new Date()) {
  const d = new Date(referenceDate);
  const currentDay = d.getDay();
  const diff = currentDay === 0 ? -6 : 1 - currentDay;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function getPlanKey(weekStart) {
  return `motrice.coachPlan.${weekStart}`;
}

function slotMatchesHour(slot, date) {
  const hour = date.getHours();
  const [startHour] = String(slot.start || '00:00').split(':').map(Number);
  const [endHour] = String(slot.end || '23:59').split(':').map(Number);
  return hour >= startHour && hour <= endHour;
}

function levelToScore(level) {
  if (level === 'advanced') return 3;
  if (level === 'intermediate') return 2;
  return 1;
}

function goalAlignment(goal, event) {
  if (goal === 'performance') return event.level === 'advanced' ? 1 : 0.5;
  if (goal === 'social') return event.participants_count >= Math.ceil(event.max_participants * 0.5) ? 1 : 0.6;
  if (goal === 'weight_loss') return ['running', 'bici', 'trekking'].includes(String(event.sport_name).toLowerCase()) ? 1 : 0.6;
  return 0.8;
}

export function getCoachProfile() {
  return safeRead(COACH_PROFILE_KEY, null);
}

export function saveCoachProfile(profile) {
  const normalized = {
    goal: profile.goal,
    sports: Array.isArray(profile.sports) ? profile.sports : [],
    availability: Array.isArray(profile.availability) ? profile.availability : []
  };

  safeWrite(COACH_PROFILE_KEY, normalized);
  return normalized;
}

export function generatePlan({ coachProfile, events = [], weekStart = getWeekStart() }) {
  const profile = coachProfile || getCoachProfile();
  if (!profile) return null;

  const targetSessions = goalConfig[profile.goal]?.sessions || 3;
  const monday = new Date(`${weekStart}T00:00:00`);

  const matchingEvents = events
    .filter((event) => profile.sports.includes(event.sport_id))
    .filter((event) => {
      const date = new Date(event.event_datetime);
      const delta = (date.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24);
      return delta >= 0 && delta < 7;
    })
    .sort((a, b) => Date.parse(a.event_datetime) - Date.parse(b.event_datetime));

  const items = [];
  for (let i = 0; i < targetSessions; i += 1) {
    const event = matchingEvents[i];
    if (event) {
      items.push({
        id: `event-${event.id}`,
        type: 'event',
        title: `${event.sport_name} @ ${event.location_name}`,
        sport_id: event.sport_id,
        datetime: event.event_datetime,
        completed: false,
        source_event_id: event.id
      });
    } else {
      const slot = profile.availability[i % Math.max(1, profile.availability.length)];
      const fallbackDate = new Date(monday);
      fallbackDate.setDate(fallbackDate.getDate() + (i % 6));
      fallbackDate.setHours(18, 0, 0, 0);
      if (slot && slot.start) {
        const [h, m] = slot.start.split(':').map(Number);
        fallbackDate.setHours(h, m || 0, 0, 0);
      }

      items.push({
        id: `solo-${weekStart}-${i}`,
        type: 'solo',
        title: `Allenamento ${i + 1}`,
        sport_id: profile.sports[i % Math.max(1, profile.sports.length)] || 1,
        datetime: fallbackDate.toISOString(),
        completed: false,
        source_event_id: null
      });
    }
  }

  const plan = {
    weekStart,
    goal: profile.goal,
    targetSessions,
    items
  };

  safeWrite(getPlanKey(weekStart), plan);
  return plan;
}

export function getPlan(weekStart = getWeekStart()) {
  return safeRead(getPlanKey(weekStart), null);
}

export function completePlanItem({ weekStart = getWeekStart(), itemId }) {
  const plan = getPlan(weekStart);
  if (!plan) return null;

  plan.items = plan.items.map((item) => (item.id === itemId ? { ...item, completed: true } : item));
  safeWrite(getPlanKey(weekStart), plan);
  return plan;
}

export function reschedulePlanItem({ weekStart = getWeekStart(), itemId, nextDatetime }) {
  const plan = getPlan(weekStart);
  if (!plan) return null;

  plan.items = plan.items.map((item) =>
    item.id === itemId ? { ...item, datetime: nextDatetime, completed: false } : item
  );
  safeWrite(getPlanKey(weekStart), plan);
  return plan;
}

export function addCustomSession({ weekStart = getWeekStart(), payload }) {
  const plan = getPlan(weekStart);
  if (!plan) return null;

  const item = {
    id: `custom-${Date.now()}`,
    type: 'custom',
    title: payload.title,
    sport_id: payload.sport_id,
    datetime: payload.datetime,
    completed: false,
    source_event_id: null
  };

  plan.items.push(item);
  safeWrite(getPlanKey(weekStart), plan);
  return plan;
}

export function getCheckins() {
  return safeRead(CHECKINS_KEY, []);
}

export function getStats() {
  return safeRead(STATS_KEY, { streak: 0, completedSessions: 0, lastCheckinDate: null, weeklyCompletion: {} });
}

export function logCheckIn(payload) {
  const checkins = getCheckins();
  const checkinId = `checkin-${Date.now()}`;
  checkins.unshift({ id: checkinId, ...payload });
  safeWrite(CHECKINS_KEY, checkins);

  const stats = getStats();
  const today = toDateOnly(payload.date || new Date());
  const last = stats.lastCheckinDate ? toDateOnly(stats.lastCheckinDate) : null;

  let streak = stats.streak || 0;
  if (!last) {
    streak = 1;
  } else {
    const diffDays = Math.round((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) streak += 1;
    if (diffDays > 1) streak = 1;
  }

  const nextStats = {
    streak,
    completedSessions: (stats.completedSessions || 0) + 1,
    lastCheckinDate: payload.date,
    weeklyCompletion: { ...(stats.weeklyCompletion || {}) }
  };

  const weekStart = getWeekStart(payload.date);
  nextStats.weeklyCompletion[weekStart] = (nextStats.weeklyCompletion[weekStart] || 0) + 1;

  const weeklyPlan = getPlan(weekStart);
  if (weeklyPlan) {
    const firstOpen = weeklyPlan.items.find((item) => !item.completed);
    if (firstOpen) {
      weeklyPlan.items = weeklyPlan.items.map((item) =>
        item.id === firstOpen.id ? { ...item, completed: true } : item
      );
      safeWrite(getPlanKey(weekStart), weeklyPlan);
    }
  }

  safeWrite(STATS_KEY, nextStats);
  awardXp({
    type: 'coach_checkin',
    pointsGlobal: 15,
    pointsSport: 15,
    sportId: payload?.sport || 'generic',
    refId: checkinId,
    meta: {
      duration: Number(payload?.duration || 0),
      intensity: String(payload?.intensity || ''),
      mood: Number(payload?.mood || 0)
    }
  });
  return { checkins, stats: nextStats };
}

export function calculateCompatibility(event, coachProfile) {
  if (!coachProfile) {
    return {
      score: 0,
      recommended: false,
      explanation: 'Attiva Coach per ricevere suggerimenti personalizzati.'
    };
  }

  const sportMatch = coachProfile.sports.includes(event.sport_id) ? 1 : 0;

  const profileLevel = coachProfile.goal === 'performance' ? 3 : coachProfile.goal === 'fitness' ? 2 : 1;
  const eventLevel = levelToScore(event.level);
  const levelDiff = Math.abs(profileLevel - eventLevel);
  const levelScore = Math.max(0, 1 - levelDiff * 0.35);

  const eventDate = new Date(event.event_datetime);
  const eventDay = dayIndexToLabel(eventDate.getDay());
  const availabilityMatch = coachProfile.availability.some(
    (slot) => String(slot.day || '').toLowerCase() === eventDay.toLowerCase() && slotMatchesHour(slot, eventDate)
  );

  const goalScore = goalAlignment(coachProfile.goal, event);

  const score = Math.round(sportMatch * 45 + levelScore * 25 + (availabilityMatch ? 1 : 0) * 20 + goalScore * 10);

  let explanation = 'Buona scelta per mantenere costanza.';
  if (score >= 85) explanation = 'Perfetto per il tuo obiettivo di costanza.';
  else if (score < 55) explanation = 'Leggermente sopra il tuo livello attuale.';

  return {
    score,
    recommended: score >= 70,
    explanation
  };
}

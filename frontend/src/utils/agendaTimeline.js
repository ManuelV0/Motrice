import { getEventTiming } from './eventLifecycle.js';
import { getEventSessionTimeline } from './sessionTimeline.js';

function referenceTimestamp(referenceTime) {
  if (referenceTime instanceof Date) return referenceTime.getTime();
  const value = Number(referenceTime);
  return Number.isFinite(value) ? value : Date.now();
}

export function isAgendaEventCancelled(event = {}) {
  return String(event?.status || '').trim().toLowerCase() === 'cancelled'
    || String(event?.lifecycle_state || '').trim().toLowerCase() === 'cancelled';
}

export function isHistoricalAgendaEvent(event, referenceTime = Date.now()) {
  const nowMs = referenceTimestamp(referenceTime);
  const timing = getEventTiming(event, nowMs);

  if (isAgendaEventCancelled(event)) {
    return Number.isFinite(timing.startsAtMs) ? nowMs >= timing.startsAtMs : true;
  }

  return getEventSessionTimeline(event, timing, nowMs).hasEnded;
}

export function isUpcomingAgendaEvent(event, referenceTime = Date.now()) {
  if (isAgendaEventCancelled(event)) return false;
  return !isHistoricalAgendaEvent(event, referenceTime);
}

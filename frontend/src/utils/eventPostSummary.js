import { resolveParticipantOutcome } from './eventParticipationState.js';

function toCount(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function firstCount(...values) {
  for (const value of values) {
    const parsed = toCount(value);
    if (parsed != null) return parsed;
  }
  return null;
}

/**
 * Builds the attendance totals shown after an event from one canonical source.
 * A completed money settlement wins because it is calculated from verified
 * presence and is the same source used to release or forfeit deposits.
 */
export function resolveEventPostSummary(event = {}) {
  const settlementPresent = toCount(event?.money_settlement?.attendee_count);
  const settlementNoShow = toCount(event?.money_settlement?.no_show_count);
  const hasSettlementCounts = settlementPresent != null && settlementNoShow != null;
  const outcome = resolveParticipantOutcome(event);

  let presentCount;
  let noShowCount;
  let totalCount;
  let source;

  if (hasSettlementCounts) {
    presentCount = settlementPresent;
    noShowCount = settlementNoShow;
    totalCount = presentCount + noShowCount;
    source = 'settlement';
  } else {
    presentCount = firstCount(
      event?.participant_stats?.present,
      event?.participants_present_count
    ) ?? 0;
    totalCount = firstCount(
      event?.participant_stats?.total,
      event?.participants_total_count,
      event?.participants_count
    );
    noShowCount = firstCount(
      event?.participant_stats?.no_show,
      event?.participants_no_show_count
    );

    if (totalCount == null) {
      totalCount = presentCount + (noShowCount ?? 0);
    }
    if (noShowCount == null) {
      noShowCount = Math.max(0, totalCount - presentCount);
    }

    // Older events may only have the viewer's terminal result. Keep the
    // aggregate coherent without inventing a full group attendance list.
    if (outcome.id === 'completed' && presentCount === 0 && totalCount === 0) {
      presentCount = 1;
      totalCount = 1;
    } else if (outcome.id === 'no_show' && noShowCount === 0 && totalCount === 0) {
      noShowCount = 1;
      totalCount = 1;
    }

    totalCount = Math.max(totalCount, presentCount + noShowCount);
    noShowCount = Math.max(0, totalCount - presentCount);
    source = 'participants';
  }

  return {
    presentCount,
    noShowCount,
    totalCount,
    outcome,
    source
  };
}

export function resolvePersonalVerificationProgress(event = {}) {
  const outcome = resolveParticipantOutcome(event);
  const verified = ['checked_in', 'completed'].includes(outcome.id);

  return {
    current: verified ? 1 : 0,
    total: 1,
    percent: verified ? 100 : 0,
    outcome
  };
}

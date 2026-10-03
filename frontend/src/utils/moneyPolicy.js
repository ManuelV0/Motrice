export const EVENT_DEPOSIT_CENTS = 1000;
export const INITIAL_TRIAL_EVENTS = 2;
export const MONEY_DISPUTE_HOURS = 48;
export const PLATFORM_NO_SHOW_PERCENT = 30;
export const ATTENDEE_NO_SHOW_PERCENT = 70;
export const MIN_WITHDRAWAL_CENTS = 1000;
export const REQUIRED_RESERVE_CENTS = 1000;

function cents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}
export function splitNoShowDeposit(
  amountCents = EVENT_DEPOSIT_CENTS,
  attendeeIds = []
) {
  const amount = cents(amountCents);
  const eligibleIds = [...new Set(
    (Array.isArray(attendeeIds) ? attendeeIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const platformCents = eligibleIds.length
    ? Math.floor((amount * PLATFORM_NO_SHOW_PERCENT) / 100)
    : amount;
  const distributableCents = amount - platformCents;

  if (!eligibleIds.length) {
    return { platformCents, distributableCents: 0, allocations: [] };
  }

  const base = Math.floor(distributableCents / eligibleIds.length);
  let remainder = distributableCents - base * eligibleIds.length;
  const allocations = eligibleIds.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { userId, amountCents: base + extra };
  });

  return { platformCents, distributableCents, allocations };
}

export function getWalletTotal(wallet = {}) {
  return ['available_cents', 'locked_cents', 'pending_cents', 'withdrawable_cents']
    .reduce((total, key) => total + cents(wallet?.[key]), 0);
}

export function getParticipationEligibility(wallet = {}) {
  const trialsRemaining = cents(wallet?.trial_events_remaining);
  const availableCents = cents(wallet?.available_cents);
  const eligibleByTrial = trialsRemaining > 0;
  const eligibleByReserve = availableCents >= EVENT_DEPOSIT_CENTS;

  return {
    canParticipate: eligibleByTrial || eligibleByReserve,
    fundingSource: eligibleByTrial ? 'trial' : eligibleByReserve ? 'balance' : 'none',
    trialsRemaining,
    amountMissingCents: eligibleByTrial
      ? 0
      : Math.max(0, EVENT_DEPOSIT_CENTS - availableCents)
  };
}

export function getWithdrawalEligibility(wallet = {}) {
  const availableCents = cents(wallet?.available_cents);
  const withdrawableCents = cents(wallet?.withdrawable_cents);
  const settledCents = availableCents + withdrawableCents;
  const standardMaximumCents = Math.max(0, settledCents - REQUIRED_RESERVE_CENTS);

  return {
    settledCents,
    standardMaximumCents,
    canWithdrawStandard:
      settledCents >= REQUIRED_RESERVE_CENTS + MIN_WITHDRAWAL_CENTS &&
      standardMaximumCents >= MIN_WITHDRAWAL_CENTS,
    canWithdrawAll: settledCents > 0,
    reserveAfterStandardCents: Math.min(REQUIRED_RESERVE_CENTS, settledCents)
  };
}

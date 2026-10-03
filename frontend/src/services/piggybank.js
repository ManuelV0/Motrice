import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/safeStorage.js';

const LEGACY_STORAGE_KEY = 'motrice_piggybank_v1';
const STORAGE_PREFIX = 'motrice_virtual_wallet_v1.';
const CURRENT_SCHEMA_VERSION = 5;
const EVENT_STAKE_CENTS = 1000;
const INITIAL_VIRTUAL_CREDIT_CENTS = 3000;
const INITIAL_TRIAL_EVENTS = 2;
const AUTH_STORAGE_KEY = 'motrice_auth_session_v1';

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeAmountCents(amountCents) {
  const n = Number(amountCents);
  if (n === 500 || n === 1000) return n;
  return null;
}

function normalizePositiveCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function buildDefaultState() {
  const createdAt = nowIso();
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    available_cents: INITIAL_VIRTUAL_CREDIT_CENTS,
    pending_cents: 0,
    withdrawable_cents: 0,
    reinvested_cents: 0,
    trial_events_remaining: INITIAL_TRIAL_EVENTS,
    trial_events_used: 0,
    rewarded_event_ids: [],
    entries: [],
    history: [{
      id: `hist_opening_${Date.now()}`,
      entry_type: 'virtual_opening_credit',
      type: 'virtual_opening_credit',
      amount_cents: INITIAL_VIRTUAL_CREDIT_CENTS,
      available_delta: INITIAL_VIRTUAL_CREDIT_CENTS,
      locked_delta: 0,
      pending_delta: 0,
      withdrawable_delta: 0,
      event_id: null,
      idempotency_key: 'virtual-opening-credit:v1',
      note: 'Credito iniziale beta assegnato dal sistema',
      created_at: createdAt
    }]
  };
}

function migrateState(parsed) {
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const history = Array.isArray(parsed.history) ? parsed.history : [];
  const schemaVersion = Number(parsed.schema_version || 1);

  if (schemaVersion >= CURRENT_SCHEMA_VERSION) {
    return {
      schema_version: CURRENT_SCHEMA_VERSION,
      available_cents: Math.max(0, Number(parsed.available_cents) || 0),
      pending_cents: Math.max(0, Number(parsed.pending_cents) || 0),
      withdrawable_cents: Math.max(0, Number(parsed.withdrawable_cents) || 0),
      reinvested_cents: Math.max(0, Number(parsed.reinvested_cents) || 0),
      trial_events_remaining: Math.max(
        0,
        Math.min(INITIAL_TRIAL_EVENTS, Number(parsed.trial_events_remaining) || 0)
      ),
      trial_events_used: Math.max(0, Number(parsed.trial_events_used) || 0),
      rewarded_event_ids: Array.isArray(parsed.rewarded_event_ids) ? parsed.rewarded_event_ids : [],
      entries,
      history
    };
  }

  // Legacy migration: preserve every existing movement, then bring the whole
  // beta wallet up to the new 30 EUR opening balance exactly once.
  const releasedTotal = entries
    .filter((entry) => entry.status === 'released')
    .reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0);

  const availableCents = schemaVersion >= 4
    ? Math.max(0, Number(parsed.available_cents) || 0)
    : Math.max(0, releasedTotal);
  const pendingCents = Math.max(0, Number(parsed.pending_cents) || 0);
  const withdrawableCents = Math.max(0, Number(parsed.withdrawable_cents) || 0);
  const lockedCents = entries
    .filter((entry) => ['frozen', 'frozen_until_next_participation'].includes(entry.status))
    .reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0);
  const openingDelta = Math.max(
    0,
    INITIAL_VIRTUAL_CREDIT_CENTS - availableCents - pendingCents - withdrawableCents - lockedCents
  );
  const nextHistory = openingDelta > 0
    ? [{
        id: `hist_opening_${Date.now()}`,
        entry_type: 'virtual_opening_credit',
        type: 'virtual_opening_credit',
        amount_cents: openingDelta,
        available_delta: openingDelta,
        locked_delta: 0,
        pending_delta: 0,
        withdrawable_delta: 0,
        event_id: null,
        idempotency_key: 'virtual-opening-credit:v1',
        note: 'Adeguamento al credito iniziale beta di 30 EUR',
        created_at: nowIso()
      }, ...history]
    : history;

  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    available_cents: availableCents + openingDelta,
    pending_cents: pendingCents,
    withdrawable_cents: withdrawableCents,
    reinvested_cents: Math.max(0, Number(parsed.reinvested_cents) || 0),
    trial_events_remaining: Math.max(
      0,
      Math.min(INITIAL_TRIAL_EVENTS, Number(parsed.trial_events_remaining ?? INITIAL_TRIAL_EVENTS))
    ),
    trial_events_used: Math.max(0, Number(parsed.trial_events_used) || 0),
    rewarded_event_ids: Array.isArray(parsed.rewarded_event_ids) ? parsed.rewarded_event_ids : [],
    entries,
    history: nextHistory
  };
}

function hasLocalAdminSession() {
  try {
    const session = JSON.parse(safeStorageGet(AUTH_STORAGE_KEY) || 'null');
    const role = String(session?.role || '').trim().toLowerCase();
    const email = String(session?.email || '').trim().toLowerCase();
    return role === 'admin' || email === 'aletarqui@libero.it';
  } catch {
    return false;
  }
}

function storageKey(accountId = null) {
  const explicitAccountId = String(accountId ?? '').trim();
  if (explicitAccountId) return `${STORAGE_PREFIX}${explicitAccountId}`;
  try {
    const session = JSON.parse(safeStorageGet(AUTH_STORAGE_KEY) || 'null');
    return `${STORAGE_PREFIX}${session?.authUserId || session?.userId || 'guest'}`;
  } catch {
    return `${STORAGE_PREFIX}guest`;
  }
}

function loadState(accountId = null) {
  const key = storageKey(accountId);
  let raw = safeStorageGet(key);
  if (!raw) {
    raw = safeStorageGet(LEGACY_STORAGE_KEY);
    if (raw) safeStorageRemove(LEGACY_STORAGE_KEY);
  }
  if (!raw) {
    const initialState = buildDefaultState();
    saveState(initialState, accountId);
    return initialState;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return buildDefaultState();
    const migrated = migrateState(parsed);
    if (Number(parsed.schema_version || 1) !== CURRENT_SCHEMA_VERSION) {
      saveState(migrated, accountId);
    } else if (!safeStorageGet(key)) {
      saveState(migrated, accountId);
    }
    return migrated;
  } catch {
    return buildDefaultState();
  }
}

function saveState(state, accountId = null) {
  safeStorageSet(storageKey(accountId), JSON.stringify(state));
}

function summarize(state) {
  const frozen = (state.entries || [])
    .filter((entry) => entry.status === 'frozen')
    .reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0);
  const deferred = (state.entries || [])
    .filter((entry) => entry.status === 'frozen_until_next_participation')
    .reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0);

  return {
    available_cents: state.available_cents,
    locked_cents: frozen + deferred,
    pending_cents: Number(state.pending_cents || 0),
    withdrawable_cents: Number(state.withdrawable_cents || 0),
    reinvested_cents: Number(state.reinvested_cents || 0),
    total_cents:
      Number(state.available_cents || 0) +
      frozen +
      deferred +
      Number(state.pending_cents || 0) +
      Number(state.withdrawable_cents || 0),
    frozen_cents: frozen,
    deferred_cents: deferred,
    trial_events_remaining: Number(state.trial_events_remaining || 0),
    trial_events_used: Number(state.trial_events_used || 0),
    can_participate:
      Number(state.trial_events_remaining || 0) > 0 ||
      Number(state.available_cents || 0) >= EVENT_STAKE_CENTS,
    funding_source:
      Number(state.trial_events_remaining || 0) > 0
        ? 'trial'
        : Number(state.available_cents || 0) >= EVENT_STAKE_CENTS
          ? 'balance'
          : 'none',
    amount_missing_cents:
      Number(state.trial_events_remaining || 0) > 0
        ? 0
        : Math.max(0, EVENT_STAKE_CENTS - Number(state.available_cents || 0)),
    provider_mode: 'virtual_beta',
    deposits_enabled: false,
    withdrawals_enabled: false,
    withdrawal: {
      settled_cents: Number(state.available_cents || 0) + Number(state.withdrawable_cents || 0),
      minimum_cents: 1000,
      required_reserve_cents: 1000,
      standard_maximum_cents: 0,
      can_withdraw_standard: false,
      can_withdraw_all: false
    },
    entries: clone(state.entries),
    history: clone(state.history)
  };
}

export const piggybank = {
  getWallet() {
    return summarize(loadState());
  },

  listLedger({ limit = 50 } = {}) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    return clone(loadState().history.slice(0, safeLimit));
  },

  adminIncreaseVirtualCredit({ accountId, amountCents, requestId, reason } = {}) {
    if (!hasLocalAdminSession()) throw new Error('Accesso amministratore richiesto');
    const safeAmount = normalizePositiveCents(amountCents);
    if (!safeAmount || safeAmount > 100000) throw new Error('Importo credito non valido');

    const state = loadState(accountId);
    const safeRequestId = String(requestId || `admin-credit-${Date.now()}`).trim().slice(0, 120);
    const idempotencyKey = `admin-virtual-credit:${String(accountId || 'current')}:${safeRequestId}`;
    const existing = state.history.find((entry) => entry.idempotency_key === idempotencyKey);
    if (existing) return summarize(state);

    state.available_cents += safeAmount;
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      entry_type: 'admin_virtual_credit_added',
      type: 'admin_virtual_credit_added',
      amount_cents: safeAmount,
      available_delta: safeAmount,
      locked_delta: 0,
      pending_delta: 0,
      withdrawable_delta: 0,
      event_id: null,
      idempotency_key: idempotencyKey,
      note: String(reason || 'Credito virtuale assegnato dall’amministratore').slice(0, 240),
      created_at: nowIso()
    });
    saveState(state, accountId);
    return summarize(state);
  },

  freezeStake({ eventId, eventTitle, amountCents, accountId = null }) {
    const safeAmount = normalizeAmountCents(amountCents);
    if (!safeAmount) throw new Error('Quota non valida: scegli 5 EUR o 10 EUR');
    const safeEventId = String(eventId || '').trim();
    if (!safeEventId) throw new Error('Evento non valido');

    const state = loadState(accountId);
    const alreadyActive = state.entries.some(
      (entry) =>
        String(entry.event_id) === safeEventId &&
        ['trial', 'frozen', 'frozen_until_next_participation'].includes(entry.status)
    );
    if (alreadyActive) throw new Error('Hai gia una quota congelata per questo evento');

    const useTrial = Number(state.trial_events_remaining || 0) > 0;
    if (!useTrial && Number(state.available_cents || 0) < safeAmount) {
      throw new Error('DEPOSIT_REQUIRED: aggiungi 10 € virtuali per continuare');
    }

    if (useTrial) {
      state.trial_events_remaining = Math.max(0, Number(state.trial_events_remaining || 0) - 1);
      state.trial_events_used = Number(state.trial_events_used || 0) + 1;
    } else {
      state.available_cents = Math.max(0, Number(state.available_cents || 0) - safeAmount);
    }
    state.entries.unshift({
      id: `stake_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      event_id: safeEventId,
      event_title: String(eventTitle || 'Evento'),
      amount_cents: useTrial ? 0 : safeAmount,
      funding_source: useTrial ? 'trial' : 'balance',
      status: useTrial ? 'trial' : 'frozen',
      created_at: nowIso(),
      updated_at: nowIso()
    });
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      entry_type: useTrial ? 'trial_event_used' : 'event_deposit_locked',
      type: useTrial ? 'trial_event_used' : 'freeze',
      amount_cents: useTrial ? 0 : safeAmount,
      available_delta: useTrial ? 0 : -safeAmount,
      locked_delta: useTrial ? 0 : safeAmount,
      pending_delta: 0,
      withdrawable_delta: 0,
      event_id: safeEventId,
      note: useTrial ? 'Evento prova utilizzato' : 'Quota virtuale partecipazione bloccata',
      created_at: nowIso()
    });

    saveState(state, accountId);
    return summarize(state);
  },

  unlockByGathering({ eventId }) {
    const safeEventId = String(eventId || '').trim();
    const state = loadState();
    const entry = state.entries.find(
      (item) => String(item.event_id) === safeEventId && item.status === 'frozen'
    );
    if (!entry) throw new Error('Nessuna quota congelata da sbloccare per questo evento');

    entry.status = 'released';
    entry.updated_at = nowIso();
    state.available_cents += Number(entry.amount_cents || 0);
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type: 'unlock',
      amount_cents: Number(entry.amount_cents || 0),
      event_id: safeEventId,
      note: 'Quota sbloccata: raduno confermato in posizione',
      created_at: nowIso()
    });

    saveState(state);
    return summarize(state);
  },

  deferUntilNextParticipation({ eventId }) {
    const safeEventId = String(eventId || '').trim();
    const state = loadState();
    const entry = state.entries.find(
      (item) => String(item.event_id) === safeEventId && item.status === 'frozen'
    );
    if (!entry) throw new Error('Nessuna quota congelata da aggiornare');

    entry.status = 'frozen_until_next_participation';
    entry.updated_at = nowIso();
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type: 'defer',
      amount_cents: Number(entry.amount_cents || 0),
      event_id: safeEventId,
      note: 'Quota congelata fino alla prossima partecipazione evento',
      created_at: nowIso()
    });

    saveState(state);
    return summarize(state);
  },

  releaseStake({ eventId, note }) {
    const safeEventId = String(eventId || '').trim();
    if (!safeEventId) throw new Error('Evento non valido');
    const state = loadState();
    const entry = state.entries.find(
      (item) =>
        String(item.event_id) === safeEventId &&
        (item.status === 'trial' || item.status === 'frozen' || item.status === 'frozen_until_next_participation')
    );
    if (!entry) return summarize(state);

    entry.status = 'released';
    entry.updated_at = nowIso();
    const unlockedAmount = Number(entry.amount_cents || 0);
    state.available_cents += unlockedAmount;
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      entry_type: unlockedAmount > 0 ? 'event_hold_released' : 'trial_event_completed',
      type: 'release',
      amount_cents: unlockedAmount,
      available_delta: unlockedAmount,
      locked_delta: -unlockedAmount,
      pending_delta: 0,
      withdrawable_delta: 0,
      event_id: safeEventId,
      note: String(note || 'Quota rilasciata'),
      created_at: nowIso()
    });

    saveState(state);
    return summarize(state);
  },

  cancelStake({ eventId, note = 'Quota ripristinata: evento annullato', accountId = null }) {
    const safeEventId = String(eventId || '').trim();
    if (!safeEventId) throw new Error('Evento non valido');
    const state = loadState(accountId);
    const entry = state.entries.find(
      (item) =>
        String(item.event_id) === safeEventId &&
        ['trial', 'frozen', 'frozen_until_next_participation'].includes(item.status)
    );
    if (!entry) return summarize(state);

    const amount = Number(entry.amount_cents || 0);
    const restoresTrial = entry.funding_source === 'trial';
    entry.status = 'cancelled';
    entry.updated_at = nowIso();
    if (restoresTrial) {
      state.trial_events_remaining = Math.min(
        INITIAL_TRIAL_EVENTS,
        Number(state.trial_events_remaining || 0) + 1
      );
      state.trial_events_used = Math.max(0, Number(state.trial_events_used || 0) - 1);
    } else {
      state.available_cents += amount;
    }
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      entry_type: restoresTrial ? 'trial_event_restored' : 'event_hold_cancelled',
      type: 'cancel',
      amount_cents: amount,
      available_delta: restoresTrial ? 0 : amount,
      locked_delta: restoresTrial ? 0 : -amount,
      pending_delta: 0,
      withdrawable_delta: 0,
      event_id: safeEventId,
      note,
      created_at: nowIso()
    });
    saveState(state, accountId);
    return summarize(state);
  },

  forfeitStake({ eventId, note = 'Quota virtuale persa per no-show' }) {
    const safeEventId = String(eventId || '').trim();
    if (!safeEventId) throw new Error('Evento non valido');
    const state = loadState();
    const entry = state.entries.find(
      (item) => String(item.event_id) === safeEventId && ['trial', 'frozen'].includes(item.status)
    );
    if (!entry) return summarize(state);
    const amount = Number(entry.amount_cents || 0);
    entry.status = 'forfeited';
    entry.updated_at = nowIso();
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      entry_type: 'no_show_forfeited',
      type: 'no_show_forfeited',
      amount_cents: amount,
      available_delta: 0,
      locked_delta: -amount,
      pending_delta: 0,
      withdrawable_delta: 0,
      event_id: safeEventId,
      note,
      created_at: nowIso()
    });
    saveState(state);
    return summarize(state);
  },

  unlockDeferredOnParticipation() {
    const state = loadState();
    const deferredEntries = state.entries.filter(
      (entry) => entry.status === 'frozen_until_next_participation'
    );
    if (!deferredEntries.length) return summarize(state);

    let unlockedTotal = 0;
    deferredEntries.forEach((entry) => {
      entry.status = 'released';
      entry.updated_at = nowIso();
      unlockedTotal += Number(entry.amount_cents || 0);
    });
    state.available_cents += unlockedTotal;
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type: 'unlock_deferred',
      amount_cents: unlockedTotal,
      event_id: null,
      note: 'Quote sbloccate dopo partecipazione evento',
      created_at: nowIso()
    });

    saveState(state);
    return summarize(state);
  },

  rewardParticipation({ eventId, eventTitle, amountCents = 200 }) {
    const safeAmount = normalizePositiveCents(amountCents);
    if (!safeAmount) throw new Error('Importo reward non valido');
    const safeEventId = String(eventId || '').trim();
    if (!safeEventId) throw new Error('Evento non valido');

    const state = loadState();
    const rewardedIds = Array.isArray(state.rewarded_event_ids) ? state.rewarded_event_ids : [];
    if (rewardedIds.includes(safeEventId)) {
      return summarize(state);
    }

    state.available_cents += safeAmount;
    state.rewarded_event_ids = [safeEventId, ...rewardedIds].slice(0, 800);
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type: 'participation_reward',
      amount_cents: safeAmount,
      event_id: safeEventId,
      note: `Reward presenza evento: ${String(eventTitle || 'Evento')}`,
      created_at: nowIso()
    });

    saveState(state);
    return summarize(state);
  },

  investAvailableBalance() {
    const state = loadState();
    const amount = Number(state.available_cents || 0);
    if (amount <= 0) return summarize(state);
    state.available_cents = 0;
    state.reinvested_cents = Number(state.reinvested_cents || 0) + amount;
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type: 'invest',
      amount_cents: amount,
      event_id: null,
      note: 'Credito spostato in budget reinvestimento',
      created_at: nowIso()
    });
    saveState(state);
    return summarize(state);
  },

  withdrawReinvestedBalance() {
    const state = loadState();
    const amount = Number(state.reinvested_cents || 0);
    if (amount <= 0) return summarize(state);
    state.reinvested_cents = 0;
    state.available_cents = Number(state.available_cents || 0) + amount;
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type: 'withdraw_investment',
      amount_cents: amount,
      event_id: null,
      note: 'Credito reinvestito riportato su disponibile',
      created_at: nowIso()
    });
    saveState(state);
    return summarize(state);
  },

  spendForConventionVoucher({ voucherId, partnerName, amountCents }) {
    const safeAmount = normalizePositiveCents(amountCents);
    if (!safeAmount) throw new Error('Costo buono non valido');
    const state = loadState();
    const reinvested = Number(state.reinvested_cents || 0);
    if (reinvested < safeAmount) {
      throw new Error('Non hai abbastanza soldi nel salvadanaio');
    }

    state.reinvested_cents = Math.max(0, reinvested - safeAmount);
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type: 'voucher_spend',
      amount_cents: safeAmount,
      event_id: null,
      note: `Buono convenzione (saldo reinvestito): ${String(partnerName || 'Partner')} (${String(voucherId || 'n/d')})`,
      created_at: nowIso()
    });

    saveState(state);
    return summarize(state);
  }
};

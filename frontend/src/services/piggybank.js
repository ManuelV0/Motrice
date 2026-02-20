import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';

const STORAGE_KEY = 'motrice_piggybank_v1';
const CURRENT_SCHEMA_VERSION = 3;

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
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    available_cents: 0,
    reinvested_cents: 0,
    rewarded_event_ids: [],
    entries: [],
    history: []
  };
}

function migrateState(parsed) {
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const history = Array.isArray(parsed.history) ? parsed.history : [];
  const schemaVersion = Number(parsed.schema_version || 1);

  if (schemaVersion >= CURRENT_SCHEMA_VERSION) {
    return {
      schema_version: CURRENT_SCHEMA_VERSION,
      available_cents: Number.isFinite(Number(parsed.available_cents)) ? Number(parsed.available_cents) : 0,
      reinvested_cents: Number.isFinite(Number(parsed.reinvested_cents)) ? Number(parsed.reinvested_cents) : 0,
      rewarded_event_ids: Array.isArray(parsed.rewarded_event_ids) ? parsed.rewarded_event_ids : [],
      entries,
      history
    };
  }

  // Legacy migration: old model started from a preloaded amount (30 EUR) and subtracted freezes.
  // New model starts at 0 and credits only when stakes are unlocked.
  const releasedTotal = entries
    .filter((entry) => entry.status === 'released')
    .reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0);

  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    available_cents: Math.max(0, releasedTotal),
    reinvested_cents: 0,
    rewarded_event_ids: [],
    entries,
    history
  };
}

function loadState() {
  const raw = safeStorageGet(STORAGE_KEY);
  if (!raw) return buildDefaultState();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return buildDefaultState();
    const migrated = migrateState(parsed);
    if (Number(parsed.schema_version || 1) !== CURRENT_SCHEMA_VERSION) {
      saveState(migrated);
    }
    return migrated;
  } catch {
    return buildDefaultState();
  }
}

function saveState(state) {
  safeStorageSet(STORAGE_KEY, JSON.stringify(state));
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
    reinvested_cents: Number(state.reinvested_cents || 0),
    total_cents: Number(state.available_cents || 0) + Number(state.reinvested_cents || 0),
    frozen_cents: frozen,
    deferred_cents: deferred,
    entries: clone(state.entries),
    history: clone(state.history)
  };
}

export const piggybank = {
  getWallet() {
    return summarize(loadState());
  },

  freezeStake({ eventId, eventTitle, amountCents }) {
    const safeAmount = normalizeAmountCents(amountCents);
    if (!safeAmount) throw new Error('Quota non valida: scegli 5 EUR o 10 EUR');
    const safeEventId = String(eventId || '').trim();
    if (!safeEventId) throw new Error('Evento non valido');

    const state = loadState();
    const alreadyActive = state.entries.some(
      (entry) =>
        String(entry.event_id) === safeEventId &&
        (entry.status === 'frozen' || entry.status === 'frozen_until_next_participation')
    );
    if (alreadyActive) throw new Error('Hai gia una quota congelata per questo evento');
    state.entries.unshift({
      id: `stake_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      event_id: safeEventId,
      event_title: String(eventTitle || 'Evento'),
      amount_cents: safeAmount,
      status: 'frozen',
      created_at: nowIso(),
      updated_at: nowIso()
    });
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type: 'freeze',
      amount_cents: safeAmount,
      event_id: safeEventId,
      note: 'Quota partecipazione congelata',
      created_at: nowIso()
    });

    saveState(state);
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
        (item.status === 'frozen' || item.status === 'frozen_until_next_participation')
    );
    if (!entry) return summarize(state);

    entry.status = 'released';
    entry.updated_at = nowIso();
    const unlockedAmount = Number(entry.amount_cents || 0);
    state.available_cents += unlockedAmount;
    state.history.unshift({
      id: `hist_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type: 'release',
      amount_cents: unlockedAmount,
      event_id: safeEventId,
      note: String(note || 'Quota rilasciata'),
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

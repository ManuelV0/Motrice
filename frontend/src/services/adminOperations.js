import { api } from './api';
import { getAuthSession } from './authSession';
import { isSupabaseConfigured, requireSupabase } from './supabaseClient';

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissingSnapshotRpc(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42883' ||
    error?.code === 'PGRST202' ||
    message.includes('get_admin_operations_snapshot')
  );
}

function normalizeSnapshot(raw = {}) {
  const metrics = raw.metrics || {};
  const verification = raw.verification || {};
  const wallet = raw.wallet || {};

  return {
    source: String(raw.source || 'admin_rpc'),
    generated_at: raw.generated_at || new Date().toISOString(),
    metrics: {
      users_total: numberOrZero(metrics.users_total),
      users_verified: numberOrZero(metrics.users_verified),
      verification_pending: numberOrZero(metrics.verification_pending),
      events_total: numberOrZero(metrics.events_total),
      events_today: numberOrZero(metrics.events_today),
      events_active: numberOrZero(metrics.events_active),
      events_attention: numberOrZero(metrics.events_attention)
    },
    verification: {
      pending: numberOrZero(verification.pending),
      verified: numberOrZero(verification.verified),
      suspended: numberOrZero(verification.suspended),
      rejected: numberOrZero(verification.rejected)
    },
    wallet: {
      available_cents: numberOrZero(wallet.available_cents),
      locked_cents: numberOrZero(wallet.locked_cents),
      pending_cents: numberOrZero(wallet.pending_cents),
      withdrawable_cents: numberOrZero(wallet.withdrawable_cents),
      active_holds: numberOrZero(wallet.active_holds),
      active_holds_cents: numberOrZero(wallet.active_holds_cents)
    },
    users: Array.isArray(raw.users) ? raw.users : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
    audit: Array.isArray(raw.audit) ? raw.audit : []
  };
}

function eventStart(event) {
  return event?.event_datetime || event?.starts_at || null;
}

function eventLifecycle(event) {
  if (event?.status === 'cancelled' || event?.lifecycle_state === 'cancelled') return 'cancelled';
  if (event?.status === 'completed' || ['completed', 'archived'].includes(event?.lifecycle_state)) {
    return 'completed';
  }

  const startsAt = Date.parse(eventStart(event));
  if (!Number.isFinite(startsAt)) return 'published';
  const durationMs = Math.max(15, numberOrZero(event?.duration_minutes) || 120) * 60 * 1000;
  const now = Date.now();
  if (startsAt <= now && startsAt + durationMs >= now) return 'active';
  if (startsAt + durationMs < now) return 'attention';
  return 'published';
}

function organizerFromEvent(event) {
  const organizer = event?.organizer || {};
  return {
    id: organizer.id || event?.creator_id || `organizer-${event?.id}`,
    display_name: organizer.display_name || organizer.name || 'Organizzatore',
    email: '',
    city: event?.city || '',
    avatar_url: organizer.avatar_url || '',
    reliability_score: numberOrZero(organizer.reliability_score),
    verification_status: organizer.is_verified ? 'verified' : 'unverified',
    events_created: 1,
    balance_cents: 0,
    account_status: 'active'
  };
}

async function buildLocalSnapshot() {
  const [eventsResult, profileResult, walletResult, ledgerResult] = await Promise.allSettled([
    api.listEvents({ dateRange: 'all', includePast: true, includeCancelled: true, sortBy: 'soonest' }),
    api.getLocalProfile(),
    api.getMoneyWallet(),
    api.listMoneyLedger({ limit: 30 })
  ]);

  const events = eventsResult.status === 'fulfilled' && Array.isArray(eventsResult.value)
    ? eventsResult.value
    : [];
  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
  const wallet = walletResult.status === 'fulfilled' ? walletResult.value || {} : {};
  const ledger = ledgerResult.status === 'fulfilled' && Array.isArray(ledgerResult.value)
    ? ledgerResult.value
    : [];
  const session = getAuthSession();
  const usersById = new Map();

  events.forEach((event) => {
    const organizer = organizerFromEvent(event);
    const key = String(organizer.id);
    const existing = usersById.get(key);
    usersById.set(key, {
      ...organizer,
      events_created: numberOrZero(existing?.events_created) + 1
    });
  });

  if (profile || session?.isAuthenticated) {
    const currentId = session?.authUserId || session?.userId || 'current-user';
    const currentName = profile?.display_name || profile?.name || 'Profilo amministratore';
    const matchingOrganizer = [...usersById.entries()].find(([, user]) => (
      String(user.display_name || '').trim().toLowerCase() === String(currentName).trim().toLowerCase()
    ));
    if (matchingOrganizer) usersById.delete(matchingOrganizer[0]);
    usersById.set(String(currentId), {
      id: currentId,
      display_name: currentName,
      email: session?.email || '',
      city: profile?.city || '',
      avatar_url: profile?.avatar_url || '',
      reliability_score: numberOrZero(profile?.reliability_score ?? profile?.reliability),
      verification_status: 'verified',
      events_created: Math.max(
        numberOrZero(matchingOrganizer?.[1]?.events_created),
        events.filter((event) => event?.is_organizer).length
      ),
      balance_cents:
        numberOrZero(wallet.available_cents) + numberOrZero(wallet.withdrawable_cents),
      account_status: 'active'
    });
  }

  const normalizedEvents = events
    .map((event) => ({
      id: event.id,
      creator_id: event.creator_id || event?.organizer?.id || null,
      title: event.title || event.sport_name || 'Evento',
      sport_name: event.sport_name || event.sport?.name || '',
      city: event.city || '',
      location_name: event.location_name || event.city || '',
      starts_at: eventStart(event),
      duration_minutes: numberOrZero(event.duration_minutes) || 120,
      lifecycle_state: eventLifecycle(event),
      status: event.status || 'scheduled',
      creator_name: event?.organizer?.display_name || event?.organizer?.name || 'Organizzatore',
      participants_count: numberOrZero(event.participants_count),
      checked_in_count: numberOrZero(event.checked_in_count),
      no_show_count: numberOrZero(event.no_show_count),
      max_participants: numberOrZero(event.max_participants)
    }))
    .sort((left, right) => Date.parse(right.starts_at) - Date.parse(left.starts_at));

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  return normalizeSnapshot({
    source: 'local_preview',
    generated_at: new Date().toISOString(),
    metrics: {
      users_total: usersById.size,
      users_verified: [...usersById.values()].filter((user) => user.verification_status === 'verified').length,
      verification_pending: 0,
      events_total: normalizedEvents.length,
      events_today: normalizedEvents.filter((event) => {
        const value = Date.parse(event.starts_at);
        return value >= startOfToday.getTime() && value < endOfToday.getTime();
      }).length,
      events_active: normalizedEvents.filter((event) => event.lifecycle_state === 'active').length,
      events_attention: normalizedEvents.filter((event) => event.lifecycle_state === 'attention').length
    },
    verification: { pending: 0, verified: 1, suspended: 0, rejected: 0 },
    wallet: {
      available_cents: wallet.available_cents,
      locked_cents: wallet.locked_cents,
      pending_cents: wallet.pending_cents,
      withdrawable_cents: wallet.withdrawable_cents,
      active_holds: numberOrZero(wallet.locked_cents) > 0 ? 1 : 0,
      active_holds_cents: wallet.locked_cents
    },
    users: [...usersById.values()],
    events: normalizedEvents,
    ledger
  });
}

export async function getAdminOperationsSnapshot() {
  const session = getAuthSession();
  if (!isSupabaseConfigured || !session?.authUserId) return buildLocalSnapshot();

  const client = requireSupabase();
  const { data, error } = await client.rpc('get_admin_operations_snapshot');
  if (!error) return normalizeSnapshot(data);
  if (isMissingSnapshotRpc(error)) return buildLocalSnapshot();
  throw new Error(error.message || 'Impossibile caricare il centro operativo');
}

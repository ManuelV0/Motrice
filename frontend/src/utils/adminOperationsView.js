function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function startOfLocalDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isSameLocalDay(left, right) {
  const leftDay = startOfLocalDay(left);
  const rightDay = startOfLocalDay(right);
  return Boolean(leftDay && rightDay && leftDay.getTime() === rightDay.getTime());
}

export function filterAdminUsers(users = [], { query = '', status = 'all' } = {}) {
  const token = normalize(query);
  return users.filter((user) => {
    const verification = normalize(user?.verification_status || 'unverified');
    const account = normalize(user?.account_status || 'active');
    const matchesStatus =
      status === 'all' ||
      verification === status ||
      (status === 'attention' && (
        ['pending', 'unverified', 'rejected', 'suspended'].includes(verification) || account !== 'active'
      ));
    if (!matchesStatus) return false;
    if (!token) return true;
    return normalize(`${user?.display_name || ''} ${user?.email || ''} ${user?.city || ''}`).includes(token);
  });
}

export function filterAdminEvents(
  events = [],
  { query = '', status = 'all', date = 'all', sport = 'all', city = 'all' } = {},
  now = new Date()
) {
  const token = normalize(query);
  const today = startOfLocalDay(now) || new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return events.filter((event) => {
    const eventState = normalize(event?.lifecycle_state || event?.status || 'published');
    const start = new Date(event?.starts_at);
    const hasDate = !Number.isNaN(start.getTime());
    const matchesStatus = status === 'all' || eventState === status;
    const matchesSport = sport === 'all' || normalize(event?.sport_name) === normalize(sport);
    const matchesCity = city === 'all' || normalize(event?.city) === normalize(city);
    const matchesDate =
      date === 'all' ||
      (date === 'today' && isSameLocalDay(start, today)) ||
      (date === 'week' && hasDate && start >= today && start < weekEnd) ||
      (date === 'upcoming' && hasDate && start >= now) ||
      (date === 'past' && hasDate && start < now);
    const matchesQuery = !token || normalize(
      `${event?.title || ''} ${event?.sport_name || ''} ${event?.location_name || ''} ${event?.city || ''} ${event?.creator_name || ''}`
    ).includes(token);
    return matchesStatus && matchesSport && matchesCity && matchesDate && matchesQuery;
  });
}

export function buildAdminAlerts(data = {}) {
  const alerts = [];
  const eventsAttention = Number(data?.metrics?.events_attention || 0);
  const verificationPending = Number(data?.verification?.pending || 0);
  const activeHolds = Number(data?.wallet?.active_holds || 0);
  const activeHoldsCents = Number(data?.wallet?.active_holds_cents || data?.wallet?.locked_cents || 0);

  if (eventsAttention > 0) {
    alerts.push({
      id: 'events_attention',
      severity: 'critical',
      title: `${eventsAttention} eventi richiedono controllo`,
      description: 'Sono terminati ma il loro ciclo operativo non risulta ancora chiuso.',
      tab: 'events',
      filter: 'attention'
    });
  }
  if (verificationPending > 0) {
    alerts.push({
      id: 'verification_pending',
      severity: 'attention',
      title: `${verificationPending} verifiche in attesa`,
      description: 'Le richieste di identità devono essere esaminate dal centro verifiche.',
      tab: 'verifications',
      filter: 'pending'
    });
  }
  if (activeHolds > 0) {
    alerts.push({
      id: 'active_holds',
      severity: 'info',
      title: `${activeHolds} caparre attive`,
      description: `Somme vincolate agli eventi in corso: ${(activeHoldsCents / 100).toFixed(2).replace('.', ',')} €`,
      tab: 'wallet',
      filter: 'locked'
    });
  }
  return alerts;
}

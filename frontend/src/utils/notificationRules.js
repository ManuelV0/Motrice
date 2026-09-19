const EVENT_SECURITY_TYPES = new Set([
  'rsvp_confirmed',
  'event_join_requested',
  'event_join_approved',
  'event_join_declined',
  'event_cancelled',
  'event_updated',
  'event_minimum_reached',
  'event_checkin_verified',
  'event_checkin_reminder',
  'event_arrival_detected',
  'event_checkin_closing',
  'event_starting_soon',
  'event_presence_warning',
  'event_workout_milestone',
  'event_workout_completed',
  'personal_event_completed',
  'participant_joined',
  'participant_left',
  'attendance_confirmed',
  'attendance_no_show',
  'cancel_late'
]);

const CHAT_SOCIAL_TYPES = new Set([
  'event_group_message',
  'coach_chat_booking',
  'coach_chat_cancelled',
  'coach_chat_message',
  'coach_chat_ended',
  'coach_chat_rating',
  'friend_request',
  'event_invite',
  'event_review_received'
]);

const WALLET_ACCOUNT_TYPES = new Set([
  'wallet_deposit_locked',
  'wallet_deposit_returned',
  'wallet_no_show_bonus',
  'wallet_topup_completed',
  'wallet_withdrawal_requested',
  'wallet_withdrawal_paid',
  'wallet_withdrawal_failed',
  'profile_verification_submitted',
  'profile_verified',
  'profile_verification_rejected',
  'profile_suspended',
  'xp_badge_earned'
]);

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  event_security: true,
  chat_social: true,
  wallet_account: true,
  promotions: false
});

export function getNotificationCategory(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (CHAT_SOCIAL_TYPES.has(normalized) || normalized.includes('chat') || normalized.includes('message')) {
    return 'chat_social';
  }
  if (EVENT_SECURITY_TYPES.has(normalized) || normalized.startsWith('event_') || normalized.startsWith('rsvp_')) {
    return 'event_security';
  }
  if (
    WALLET_ACCOUNT_TYPES.has(normalized) ||
    normalized.startsWith('wallet_') ||
    normalized.startsWith('profile_') ||
    normalized.startsWith('xp_')
  ) {
    return 'wallet_account';
  }
  return 'promotions';
}

export function isNotificationEnabled(type, preferences = DEFAULT_NOTIFICATION_PREFERENCES) {
  const category = getNotificationCategory(type);
  if (category === 'event_security') return true;
  return preferences?.[category] !== false;
}

export function getNotificationPath(notification = {}) {
  const payload = notification?.payload && typeof notification.payload === 'object'
    ? notification.payload
    : notification?.data && typeof notification.data === 'object' ? notification.data : {};
  const explicit = payload.action_path || payload.actionPath || notification.action_path || notification.actionPath;
  if (typeof explicit === 'string' && explicit.startsWith('/')) return explicit;
  const eventId = notification.event_id || notification.eventId || payload.event_id || payload.eventId;
  const category = getNotificationCategory(notification.type || payload.type);
  if (eventId && category === 'chat_social') return `/chat/event_${eventId}`;
  if (eventId) return `/events/${eventId}`;
  if (category === 'chat_social') return '/chat';
  if (category === 'wallet_account') {
    return String(notification.type || payload.type || '').startsWith('profile_') ? '/verify-profile' : '/wallet/credit';
  }
  return '/notifications';
}

export function stableNotificationId(value) {
  const source = String(value || 'motrice');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 100000 + (Math.abs(hash) % 2000000000);
}

export function buildEventReminderPlan(events, nowMs = Date.now()) {
  const now = Number(nowMs);
  const reminders = [];
  const seen = new Set();
  const push = (event, key, atMs, title, body, type) => {
    if (!Number.isFinite(atMs) || atMs <= now + 5000 || atMs > now + 45 * 24 * 60 * 60 * 1000) return;
    const fingerprint = `${event.id}:${key}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    reminders.push({
      id: stableNotificationId(fingerprint),
      eventId: String(event.id),
      type,
      atMs,
      title,
      body,
      path: `/events/${event.id}`
    });
  };

  (Array.isArray(events) ? events : []).forEach((event) => {
    const relevant = event?.created_by === 'me' || event?.is_personal || event?.is_going || Boolean(event?.user_rsvp);
    if (!event?.id || !relevant || String(event?.status || '').toLowerCase() === 'cancelled') return;
    const startsAtMs = Date.parse(event.event_datetime || event.starts_at || '');
    if (!Number.isFinite(startsAtMs)) return;
    const graceMinutes = Math.min(30, Math.max(15, Number(event.checkin_grace_minutes || 15)));
    const eventName = event.title || event.sport_name || 'Il tuo evento';
    push(event, '24h', startsAtMs - 24 * 60 * 60 * 1000, 'Evento domani', `${eventName} inizia tra 24 ore.`, 'event_reminder_24h');
    push(event, '2h', startsAtMs - 2 * 60 * 60 * 1000, 'Evento tra 2 ore', `Controlla luogo e dettagli di ${eventName}.`, 'event_reminder_2h');
    push(event, 'checkin', startsAtMs - 30 * 60 * 1000, 'Check-in disponibile', `Puoi verificare la presenza per ${eventName}.`, 'event_checkin_reminder');
    push(
      event,
      'closing',
      startsAtMs + Math.max(5, graceMinutes - 5) * 60 * 1000,
      'Check-in in chiusura',
      `Restano circa 5 minuti per verificare la presenza a ${eventName}.`,
      'event_checkin_closing'
    );
  });

  return reminders.sort((left, right) => left.atMs - right.atMs);
}

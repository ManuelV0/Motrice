import { localUserSeed, seededEvents, seededHotspots, seededProfiles, seededSports } from '../data/mockData';
import { loadSubscription, getSubscriptionWithEntitlements } from './subscriptionStore';
import { getAuthSession } from './authSession';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/safeStorage';
import { piggybank } from './piggybank';
import { buildGroupOrganizerWelcome } from '../utils/chatWelcome';
import { awardXp, getXpState as getUserXpState } from './xp';
import {
  awardPartnerScore,
  computePartnerRollingStats,
  ensurePartnerBadgeFields,
  getPartnerBadgeFromScore,
  updatePartnerBadge
} from './partnerBadge';

const STORAGE_KEY = 'motrice_operational_store_v2';
const EVENT_DURATION_HOURS = 2;
const DEFAULT_ACCOUNT_PROFILE = { display_name: '', bio: '', avatar_url: '', chat_slots: [] };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withDelay(payload, ms = 120) {
  return new Promise((resolve) => setTimeout(() => resolve(payload), ms));
}

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

const CHAT_SESSION_MINUTES = 45;
const EVENT_JOIN_STAKE_CENTS = 500;
const EVENT_CHECKIN_LEAD_MINUTES = 15;
const EVENT_CHECKIN_TAIL_MINUTES = 15;
const EVENT_CHECKIN_FALLBACK_MINUTES = 90;
const CONVENTION_VOUCHER_VALIDITY_MINUTES = 90;
const CONVENTION_SUBSCRIPTION_DAYS = 365;
const CONVENTION_VOUCHER_COST_CENTS = 200;
const CONVENTION_PREMIUM_VOUCHER_SHARE_RATE = 0.3;
const CONVENTION_COURSE_CASHBACK_CENTS = 100;
const CONVENTION_MAX_COURSES = 5;
const DEACTIVATED_CONVENTION_PROVINCES = new Set(['ascoli piceno']);

const IT_WEEKDAY_TO_JS_DAY = {
  lunedi: 1,
  martedi: 2,
  mercoledi: 3,
  giovedi: 4,
  venerdi: 5,
  sabato: 6,
  domenica: 0
};

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseCoachSlotLabel(slotLabel, baseMs = nowMs()) {
  const text = String(slotLabel || '').trim();
  const match = text.match(/^([A-Za-zÀ-ÿ]+)\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error('Formato fascia oraria non valido');
  }

  const [, dayToken, startHourRaw, startMinuteRaw, endHourRaw, endMinuteRaw] = match;
  const dayKey = normalizeToken(dayToken);
  const targetDay = IT_WEEKDAY_TO_JS_DAY[dayKey];
  if (targetDay == null) {
    throw new Error('Giorno della fascia oraria non valido');
  }

  const startHour = Number(startHourRaw);
  const startMinute = Number(startMinuteRaw);
  const endHour = Number(endHourRaw);
  const endMinute = Number(endMinuteRaw);
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(endMinute) ||
    startHour < 0 ||
    startHour > 23 ||
    endHour < 0 ||
    endHour > 23 ||
    startMinute < 0 ||
    startMinute > 59 ||
    endMinute < 0 ||
    endMinute > 59
  ) {
    throw new Error('Orario fascia non valido');
  }

  const now = new Date(baseMs);
  const todayDay = now.getDay();
  let dayOffset = (targetDay - todayDay + 7) % 7;
  let start = new Date(now);
  start.setSeconds(0, 0);
  start.setDate(now.getDate() + dayOffset);
  start.setHours(startHour, startMinute, 0, 0);

  // If today's slot start is already past, move to next week.
  if (dayOffset === 0 && start.getTime() <= baseMs + 5 * 60 * 1000) {
    dayOffset = 7;
    start = new Date(now);
    start.setSeconds(0, 0);
    start.setDate(now.getDate() + dayOffset);
    start.setHours(startHour, startMinute, 0, 0);
  }

  const slotEnd = new Date(start);
  slotEnd.setHours(endHour, endMinute, 0, 0);
  if (slotEnd.getTime() <= start.getTime()) {
    throw new Error('La fascia selezionata ha orari non validi');
  }

  const windowMinutes = Math.floor((slotEnd.getTime() - start.getTime()) / (60 * 1000));
  if (windowMinutes < CHAT_SESSION_MINUTES) {
    throw new Error('La fascia selezionata e troppo corta per una sessione da 45 minuti');
  }

  return {
    startsAtIso: start.toISOString(),
    endsAtIso: new Date(start.getTime() + CHAT_SESSION_MINUTES * 60 * 1000).toISOString(),
    windowMinutes
  };
}

function isChatBookingActive(booking, referenceMs = nowMs()) {
  if (!booking || booking.status === 'cancelled') return false;
  const endMs = Date.parse(booking.ends_at);
  return Number.isFinite(endMs) && endMs > referenceMs;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function getChatBookingView(item, now = nowMs()) {
  const startAt = Date.parse(item.starts_at);
  const endAt = Date.parse(item.ends_at);
  const hasStarted = Number.isFinite(startAt) ? startAt <= now : false;
  const ended = Number.isFinite(endAt) ? endAt <= now : false;
  let status = item.status || 'booked';
  if (status !== 'cancelled') {
    if (item.rating_stars) status = 'rated';
    else if (ended) status = 'completed';
    else if (hasStarted) status = 'live';
    else status = 'booked';
  }
  return {
    ...item,
    status,
    can_rate: status === 'completed' && !item.rating_stars,
    can_cancel: status === 'booked'
  };
}

function canSendChatMessage(booking, now = nowMs()) {
  if (!booking || booking.status === 'cancelled') return false;
  const startAt = Date.parse(booking.starts_at);
  const endAt = Date.parse(booking.ends_at);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return false;
  return now >= startAt && now <= endAt;
}

function isProfileCompleteForGroup(profile) {
  if (!profile || typeof profile !== 'object') return false;
  const username = String(profile.display_name || '').trim();
  const bio = String(profile.bio || '').trim();
  const avatar = String(profile.avatar_url || '').trim();
  return username.length >= 2 && bio.length >= 8 && avatar.length > 0;
}

function canAccessEventGroupChat({ rsvp, subscription }) {
  if (!rsvp || rsvp.status !== 'going') return false;
  if (subscription?.plan === 'premium') return true;
  const fee = Number(rsvp.participation_fee_cents || 0);
  return fee === 500 || fee === 1000;
}

function getEventGroupReadKey(userId, eventId) {
  return `${Number(userId)}:${Number(eventId)}`;
}

function getEventGroupUnreadCount(store, eventId, userId) {
  const key = String(eventId);
  const messages = Array.isArray(store.eventGroupMessagesByEvent?.[key])
    ? store.eventGroupMessagesByEvent[key]
    : [];
  if (!messages.length) return 0;

  const readKey = getEventGroupReadKey(userId, eventId);
  const lastReadIso = store.eventGroupLastReadByUserEvent?.[readKey] || null;
  const lastReadMs = Date.parse(lastReadIso || '');

  return messages.filter((msg) => {
    if (Number(msg.sender_user_id) === Number(userId)) return false;
    const createdMs = Date.parse(msg.created_at || '');
    if (!Number.isFinite(createdMs)) return true;
    if (!Number.isFinite(lastReadMs)) return true;
    return createdMs > lastReadMs;
  }).length;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function toTimeOfDay(dateIso) {
  const hour = new Date(dateIso).getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function safeString(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeDisplayName(value, fallback = '') {
  const raw = String(value || '').trim();
  if (!raw) return String(fallback || '').trim();
  if (raw.toLowerCase() === 'tu') {
    const safeFallback = String(fallback || '').trim();
    return safeFallback && safeFallback.toLowerCase() !== 'tu' ? safeFallback : 'Me';
  }
  return raw;
}

function normalizeNameToken(value) {
  return normalizeDisplayName(value, '')
    .trim()
    .toLowerCase();
}

function normalizeRouteInfo(input) {
  if (!input || typeof input !== 'object') return null;

  const name = String(input.name || '').trim();
  const fromLabel = String(input.from_label || '').trim();
  const toLabel = String(input.to_label || '').trim();
  const distanceRaw = Number(input.distance_km);
  const elevationRaw = Number(input.elevation_gain_m);
  const mapUrl = String(input.map_url || '').trim();
  const fromLatRaw = Number(input.from_lat);
  const fromLngRaw = Number(input.from_lng);
  const toLatRaw = Number(input.to_lat);
  const toLngRaw = Number(input.to_lng);
  const routePointsRaw = Array.isArray(input.route_points) ? input.route_points : [];

  if (!name) return null;
  if (!fromLabel || !toLabel) return null;
  if (!Number.isFinite(distanceRaw) || distanceRaw <= 0) return null;

  let normalizedMapUrl = '';
  if (mapUrl) {
    if (!/^https?:\/\//i.test(mapUrl)) return null;
    normalizedMapUrl = mapUrl;
  }

  const hasFromCoords = Number.isFinite(fromLatRaw) && Number.isFinite(fromLngRaw);
  const hasToCoords = Number.isFinite(toLatRaw) && Number.isFinite(toLngRaw);

  const normalizedRoutePoints = routePointsRaw
    .filter((pair) => Array.isArray(pair) && pair.length >= 2)
    .map((pair) => [Number(pair[0]), Number(pair[1])])
    .filter(
      (pair) =>
        Number.isFinite(pair[0]) &&
        Number.isFinite(pair[1]) &&
        pair[0] >= -90 &&
        pair[0] <= 90 &&
        pair[1] >= -180 &&
        pair[1] <= 180
    )
    .slice(0, 3000);

  return {
    name: name.slice(0, 120),
    from_label: fromLabel.slice(0, 120),
    to_label: toLabel.slice(0, 120),
    from_lat: hasFromCoords ? Number(fromLatRaw.toFixed(6)) : null,
    from_lng: hasFromCoords ? Number(fromLngRaw.toFixed(6)) : null,
    to_lat: hasToCoords ? Number(toLatRaw.toFixed(6)) : null,
    to_lng: hasToCoords ? Number(toLngRaw.toFixed(6)) : null,
    distance_km: Number(distanceRaw.toFixed(1)),
    elevation_gain_m: Number.isFinite(elevationRaw) && elevationRaw > 0 ? Math.round(elevationRaw) : null,
    map_url: normalizedMapUrl,
    route_points: normalizedRoutePoints
  };
}

function isConventionProvinceDeactivated(city) {
  const key = safeString(city);
  if (!key) return false;
  return DEACTIVATED_CONVENTION_PROVINCES.has(key);
}

function normalizePartnerEarnings(profile = {}) {
  return {
    earnings_voucher_gross_cents: Number(profile.earnings_voucher_gross_cents || 0),
    earnings_voucher_share_cents: Number(profile.earnings_voucher_share_cents || 0),
    cashback_course_cents: Number(profile.cashback_course_cents || 0),
    earnings_total_cents: Number(profile.earnings_total_cents || 0),
    earnings_history: Array.isArray(profile.earnings_history) ? profile.earnings_history : []
  };
}

function extractPartnerProfileId(partnerPayload = {}) {
  const raw = String(partnerPayload?.id || '').trim();
  const match = raw.match(/^partner_profile_(.+)$/);
  return match?.[1] ? String(match[1]) : '';
}

function findPartnerProfileIndexForVoucher(store, voucher = {}) {
  const profiles = Array.isArray(store.partnerProfiles) ? store.partnerProfiles : [];
  if (!profiles.length) return -1;

  const partnerProfileId = extractPartnerProfileId(voucher.partner || {});
  if (partnerProfileId) {
    const byId = profiles.findIndex((item) => String(item.id) === partnerProfileId);
    if (byId >= 0) return byId;
  }

  const partnerName = safeString(voucher.partner?.name);
  const partnerCity = safeString(voucher.partner?.city);
  if (!partnerName || !partnerCity) return -1;
  return profiles.findIndex(
    (item) => safeString(item.organization) === partnerName && safeString(item.city) === partnerCity
  );
}

function pushPartnerEarningsEvent(profile, event) {
  const current = normalizePartnerEarnings(profile);
  return {
    ...profile,
    ...current,
    earnings_history: [event, ...current.earnings_history].slice(0, 200)
  };
}

function isVoucherExpired(voucher, referenceMs = nowMs()) {
  if (!voucher || !voucher.expires_at) return true;
  const expiresMs = Date.parse(voucher.expires_at);
  return !Number.isFinite(expiresMs) || expiresMs <= referenceMs;
}

function resolveVoucherStatus(voucher, referenceMs = nowMs()) {
  if (!voucher) return 'expired';
  if (String(voucher.status || '').toLowerCase() === 'redeemed') return 'redeemed';
  return isVoucherExpired(voucher, referenceMs) ? 'expired' : 'active';
}

function extractVoucherId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const fromPath = raw.match(/\/convenzioni\/voucher\/([A-Za-z0-9_-]+)/);
  if (fromPath?.[1]) return fromPath[1];
  return raw;
}

function parseDurationDays(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 0;

  const match = raw.match(/^(\d+)\s*(giorno|giorni|day|days|anno|anni|year|years)?$/);
  if (!match) return 0;

  const amount = Number(match[1] || 0);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  const unit = match[2] || 'days';
  if (unit === 'anno' || unit === 'anni' || unit === 'year' || unit === 'years') {
    return amount * 365;
  }
  return amount;
}

function addDaysIso(startIso, days) {
  const baseMs = Date.parse(startIso || '');
  const safeBase = Number.isFinite(baseMs) ? baseMs : nowMs();
  const safeDays = parseDurationDays(days);
  const targetMs = safeBase + safeDays * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(targetMs)) return new Date(safeBase).toISOString();
  return new Date(targetMs).toISOString();
}

function buildConventionContractText(application, templateOverrides = {}) {
  const todayLabel = new Date().toLocaleDateString('it-IT');
  const organization = String(application?.organization || templateOverrides.organization || '').trim();
  const city = String(application?.city || templateOverrides.city || '').trim();
  const type = String(application?.type || templateOverrides.type || '').trim();
  const contact = String(application?.contact || '').trim();
  const plan = String(application?.partner_plan || 'free').toLowerCase();
  const promoLimit = Number(application?.promo_limit || 0);
  const coursesCount = Number(application?.courses_count || 0);
  const durationMonths = Number(templateOverrides.duration_months || 12);
  const extraTerms = String(templateOverrides.extra_terms || '').trim();
  const spidReady = templateOverrides.spid_ready == null ? true : Boolean(templateOverrides.spid_ready);

  return `CONVENZIONE DI COLLABORAZIONE
Data emissione: ${todayLabel}

Parte A (Piattaforma): Motrice
Parte B (Partner): ${organization || 'n/d'}
Tipologia partner: ${type || 'n/d'}
Citta: ${city || 'n/d'}
Contatto partner: ${contact || 'n/d'}

Oggetto
La presente convenzione disciplina la collaborazione tra Motrice e il Partner per iniziative sportive, promozioni e voucher digitali.

Clausole individuali partner
${extraTerms || 'Nessuna clausola individuale aggiuntiva.'}

Condizioni operative
1. Il Partner aderisce al piano ${plan === 'premium' ? 'Premium' : 'Free'}.
2. Numero promo disponibili: ${promoLimit}${plan === 'premium' ? ` (corsi dichiarati: ${coursesCount} × 7)` : ' (fisse)'}.
3. Il Partner accetta le regole di verifica voucher e i controlli antifrode previsti dalla piattaforma.

Durata
La convenzione ha durata di ${durationMonths} mesi dalla data di accettazione e firma.

Termini e condizioni
1. Le Parti dichiarano di aver letto e compreso tutti i termini della convenzione.
2. Eventuali modifiche sono valide solo se formalizzate per iscritto.
3. La validita legale della firma elettronica resta subordinata alla normativa applicabile.
4. Predisposizione SPID: ${spidReady ? 'attiva (quando tecnicamente applicabile)' : 'non prevista in questa versione'}.
Foro e legge applicabile
Salvo diverso accordo scritto, si applica la legge italiana e foro competente indicato nella versione firmata.`;
}

function isPartnerSubscriptionExpired(profile, referenceMs = nowMs()) {
  if (!profile) return true;
  const expiresMs = Date.parse(profile.subscription_expires_at || '');
  return !Number.isFinite(expiresMs) || expiresMs <= referenceMs;
}

function getPartnerSubscriptionStatus(profile, referenceMs = nowMs()) {
  if (!profile) return 'inactive';
  const rawStatus = String(profile.status || '').toLowerCase();
  if (rawStatus === 'expired') return 'expired';
  if (rawStatus !== 'active') return 'inactive';
  return isPartnerSubscriptionExpired(profile, referenceMs) ? 'expired' : 'active';
}

function ensurePartnerProfileLifecycle(store) {
  const profiles = Array.isArray(store.partnerProfiles) ? store.partnerProfiles : [];
  let changed = false;
  for (let i = 0; i < profiles.length; i += 1) {
    const current = profiles[i];
    if (!current) continue;
    if (
      isConventionProvinceDeactivated(current.city) &&
      String(current.status || '').toLowerCase() === 'active'
    ) {
      profiles[i] = {
        ...current,
        status: 'expired',
        expired_at: nowIso(),
        updated_at: nowIso()
      };
      changed = true;
      continue;
    }
    const status = getPartnerSubscriptionStatus(current);
    if (status === 'expired' && String(current.status || '').toLowerCase() !== 'expired') {
      profiles[i] = {
        ...current,
        status: 'expired',
        expired_at: nowIso(),
        updated_at: nowIso()
      };
      changed = true;
    }
  }
  if (changed) {
    store.partnerProfiles = profiles;
  }
  return changed;
}

function refreshPartnerBadgeSnapshots(store, referenceMs = nowMs()) {
  if (!Array.isArray(store.partnerProfiles)) return false;
  let changed = ensurePartnerBadgeFields(store);

  for (let i = 0; i < store.partnerProfiles.length; i += 1) {
    const current = store.partnerProfiles[i];
    const beforeBadge = String(current?.badge_level || '');
    const beforeScoreRolling = Number(current?.score_rolling_30d || 0);
    const beforeMetrics = JSON.stringify(current?.metrics_rolling_30d || {});
    const updated = updatePartnerBadge(String(current?.id || ''), store, referenceMs);
    if (!updated) continue;
    const afterMetrics = JSON.stringify(updated.metrics_rolling_30d || {});
    if (
      beforeBadge !== String(updated.badge_level || '') ||
      beforeScoreRolling !== Number(updated.score_rolling_30d || 0) ||
      beforeMetrics !== afterMetrics
    ) {
      changed = true;
    }
  }

  return changed;
}

function resolveOrigin(input = {}) {
  const lat = Number(input.originLat);
  const lng = Number(input.originLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

function resolveAuthUserId() {
  const session = getAuthSession();
  const id = Number(session.userId);
  return Number.isInteger(id) && id > 0 ? id : 1;
}

function getEventDurationMs(event) {
  const minutes = Number(event.duration_minutes);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : EVENT_DURATION_HOURS * 60;
  return safeMinutes * 60 * 1000;
}

function getEventCheckInDurationMs(event) {
  const minutes = Number(event?.duration_minutes);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : EVENT_CHECKIN_FALLBACK_MINUTES;
  return safeMinutes * 60 * 1000;
}

function buildEventCheckInWindow(event, issuedAtMs = nowMs()) {
  const startMs = Date.parse(event?.event_datetime || '');
  if (!Number.isFinite(startMs)) {
    return {
      startsAtMs: issuedAtMs,
      expiresAtMs: issuedAtMs + EVENT_CHECKIN_FALLBACK_MINUTES * 60 * 1000
    };
  }

  return {
    startsAtMs: startMs - EVENT_CHECKIN_LEAD_MINUTES * 60 * 1000,
    expiresAtMs: startMs + getEventCheckInDurationMs(event) + EVENT_CHECKIN_TAIL_MINUTES * 60 * 1000
  };
}

function buildCheckInToken(eventId) {
  const prefix = `evt_${String(eventId)}_`;
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    const random = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `${prefix}${random}`;
  }
  return `${prefix}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function extractCheckInToken(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const tokenQueryMatch = raw.match(/[?&]token=([^&]+)/i);
  if (tokenQueryMatch?.[1]) {
    try {
      return decodeURIComponent(tokenQueryMatch[1]);
    } catch {
      return tokenQueryMatch[1];
    }
  }

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    const token = String(parsed?.token || '').trim();
    if (token) return token;
  } catch {
    // Ignore parse errors and continue with raw token fallback.
  }

  return raw;
}

function isEventOrganizerForUser(store, event, userId) {
  const organizerRawId = String(event?.organizer?.id || '').trim();
  const normalizedOrganizerId = organizerRawId === 'me' ? String(userId) : organizerRawId;
  if (normalizedOrganizerId && normalizedOrganizerId === String(userId)) return true;

  const profile = store.accountProfiles?.[String(userId)] || DEFAULT_ACCOUNT_PROFILE;
  const profileName = normalizeNameToken(profile?.display_name || '');
  const organizerName = normalizeNameToken(event?.organizer?.name || '');
  return Boolean(profileName && organizerName && profileName === organizerName);
}

function resolveOrganizerUserIdForEvent(store, event) {
  const organizerRawId = String(event?.organizer?.id || '').trim();
  if (/^\d+$/.test(organizerRawId)) return Number(organizerRawId);
  if (organizerRawId === 'me') return resolveAuthUserId();

  const organizerName = normalizeNameToken(event?.organizer?.name || '');
  if (!organizerName) return null;
  const byName = Object.entries(store.accountProfiles || {}).find(([, profile]) => {
    return normalizeNameToken(profile?.display_name || '') === organizerName;
  })?.[0];
  if (/^\d+$/.test(String(byName || ''))) return Number(byName);
  return null;
}

function getFriendMap(store) {
  const legacy = store.friendsByUser && typeof store.friendsByUser === 'object' ? store.friendsByUser : {};
  const byId = store.friendsByUserId && typeof store.friendsByUserId === 'object' ? store.friendsByUserId : {};
  return { ...legacy, ...byId };
}

function getFriendPairKey(userA, userB) {
  const a = Number(userA);
  const b = Number(userB);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return `${min}_${max}`;
}

function getDmThreadIdForPair(userA, userB) {
  const a = Number(userA);
  const b = Number(userB);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return `dm_${min}_${max}`;
}

function resolveEventMeetingMeta(store, eventId) {
  const event = (store.events || []).find((item) => Number(item.id) === Number(eventId));
  const place = String(event?.location_name || event?.route_info?.to_label || event?.route_info?.from_label || 'Luogo evento').trim() || 'Luogo evento';
  return {
    eventPlace: place,
    eventStartsAt: String(event?.event_datetime || '')
  };
}

function isUserAttendanceConfirmedAtEvent(store, userId, eventId) {
  const safeUserId = Number(userId);
  const safeEventId = Number(eventId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0 || !Number.isInteger(safeEventId) || safeEventId <= 0) {
    return false;
  }

  const eventKey = String(safeEventId);
  const checkins = store.checkinRecordsByEvent?.[eventKey] || {};
  if (checkins[String(safeUserId)]) return true;

  // Fallback: local RSVP attendance is only available for current auth user.
  if (safeUserId === Number(resolveAuthUserId())) {
    const rsvp = store.rsvps?.[eventKey];
    if (String(rsvp?.attendance || '') === 'attended') return true;
  }

  return false;
}

function resolveMeetingContext(store, currentUserId, otherUserId, eventId = null) {
  const safeCurrent = Number(currentUserId);
  const safeOther = Number(otherUserId);
  if (!Number.isInteger(safeCurrent) || safeCurrent <= 0 || !Number.isInteger(safeOther) || safeOther <= 0) {
    return null;
  }

  const eventCandidates = eventId == null
    ? (store.events || []).slice().sort((a, b) => Date.parse(b?.event_datetime || '') - Date.parse(a?.event_datetime || ''))
    : (store.events || []).filter((item) => Number(item.id) === Number(eventId));

  for (const event of eventCandidates) {
    const safeEventId = Number(event?.id || 0);
    if (!Number.isInteger(safeEventId) || safeEventId <= 0) continue;
    const currentConfirmed = isUserAttendanceConfirmedAtEvent(store, safeCurrent, safeEventId);
    const otherConfirmed = isUserAttendanceConfirmedAtEvent(store, safeOther, safeEventId);
    if (!currentConfirmed || !otherConfirmed) continue;
    return {
      eventId: safeEventId,
      eventPlace: String(event?.location_name || '').trim() || 'Luogo evento',
      eventStartsAt: String(event?.event_datetime || ''),
      metAt: nowIso()
    };
  }

  return null;
}

function linkFriends(store, userA, userB) {
  const a = Number(userA);
  const b = Number(userB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0 || a === b) return;
  const map = getFriendMap(store);
  const listA = Array.isArray(map[String(a)]) ? map[String(a)] : [];
  const listB = Array.isArray(map[String(b)]) ? map[String(b)] : [];
  const nextA = Array.from(new Set([...listA, b]));
  const nextB = Array.from(new Set([...listB, a]));
  const merged = {
    ...map,
    [String(a)]: nextA,
    [String(b)]: nextB
  };
  store.friendsByUser = merged;
  store.friendsByUserId = merged;
}

function addMetPersonRecord(store, userId, payload) {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) return;
  const current = store.metByUserId?.[String(safeUserId)] || [];
  const eventId = Number(payload?.eventId || 0);
  const otherUserId = Number(payload?.otherUserId || 0);
  if (!Number.isInteger(eventId) || !Number.isInteger(otherUserId) || otherUserId <= 0) return;

  const exists = current.some(
    (item) => Number(item?.eventId) === eventId && Number(item?.otherUserId) === otherUserId
  );
  if (exists) return;

  store.metByUserId = {
    ...(store.metByUserId || {}),
    [String(safeUserId)]: [
      {
        otherUserId,
        eventId,
        eventPlace: String(payload?.eventPlace || ''),
        eventStartsAt: String(payload?.eventStartsAt || ''),
        metAt: String(payload?.metAt || nowIso())
      },
      ...current
    ].slice(0, 600)
  };
}

function seedMetFromCheckins(store, userId) {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) return;
  Object.entries(store.checkinRecordsByEvent || {}).forEach(([eventId, records]) => {
    if (!records || typeof records !== 'object') return;
    if (!records[String(safeUserId)]) return;
    const eventMeta = resolveEventMeetingMeta(store, eventId);
    Object.keys(records).forEach((otherIdRaw) => {
      const otherUserId = Number(otherIdRaw);
      if (!Number.isInteger(otherUserId) || otherUserId <= 0 || otherUserId === safeUserId) return;
      addMetPersonRecord(store, safeUserId, {
        otherUserId,
        eventId: Number(eventId),
        eventPlace: eventMeta.eventPlace,
        eventStartsAt: eventMeta.eventStartsAt,
        metAt: String(records[String(otherUserId)]?.ts || nowIso())
      });
    });
  });
}

function getFriendshipStatus(store, viewerUserId, targetUserId) {
  const safeViewer = Number(viewerUserId);
  const safeTarget = Number(targetUserId);
  if (!Number.isInteger(safeViewer) || !Number.isInteger(safeTarget) || safeViewer <= 0 || safeTarget <= 0) {
    return 'none';
  }
  if (safeViewer === safeTarget) return 'self';

  const friends = getFriendMap(store);
  const viewerFriends = Array.isArray(friends[String(safeViewer)]) ? friends[String(safeViewer)] : [];
  if (viewerFriends.some((id) => Number(id) === safeTarget)) return 'friends';

  const requests = Array.isArray(store.friendRequests) ? store.friendRequests : [];
  const pending = requests.find(
    (item) =>
      String(item.status || '') === 'pending' &&
      (
        (Number(item.from_user_id) === safeViewer && Number(item.to_user_id) === safeTarget) ||
        (Number(item.fromUserId) === safeViewer && Number(item.toUserId) === safeTarget) ||
        (Number(item.from_user_id) === safeTarget && Number(item.to_user_id) === safeViewer) ||
        (Number(item.fromUserId) === safeTarget && Number(item.toUserId) === safeViewer)
      )
  );
  if (pending) return 'requested';
  return 'none';
}

function isEventExpired(event, now = nowMs()) {
  const startMs = Date.parse(event.event_datetime);
  if (!Number.isFinite(startMs)) return false;
  return startMs + getEventDurationMs(event) < now;
}

function seedCreatorPlan(event, index) {
  if (event.creator_plan) return event;
  if (index % 2 === 0) return { ...event, creator_plan: 'premium', featured_boost: true };
  return { ...event, creator_plan: 'free', featured_boost: false };
}

function buildInitialStore() {
  return {
    sports: seededSports,
    events: seededEvents.map(seedCreatorPlan),
    profiles: seededProfiles,
    hotspots: seededHotspots,
    localUser: localUserSeed,
    rsvps: {},
    savedEvents: {},
    accountProfiles: {
      '1': { ...DEFAULT_ACCOUNT_PROFILE, display_name: '' },
      '2': { ...DEFAULT_ACCOUNT_PROFILE, display_name: 'Utente 2' }
    },
    chatBookings: [],
    chatMessagesByBooking: {},
    eventGroupMessagesByEvent: {},
    eventGroupLastReadByUserEvent: {},
    coachRatings: {},
    conventionApplications: [],
    partnerProfiles: [],
    conventionVouchers: [],
    conventionCoursePromos: [],
    conventionAgreementRecords: [],
    conventionContractTemplates: [],
    revokedAuthUserIds: [],
    notifications: [],
    monthlyEventCreations: {},
    generatedFlags: {
      startingSoonByEvent: {},
      similarCreatedCount: 0
    },
    checkinSessionsByEvent: {},
    checkinRecordsByEvent: {},
    checkinOrganizerAwardByEvent: {},
    friendRequests: [],
    friendsByUser: {},
    friendsByUserId: {},
    metByUserId: {},
    dmThreadsByPair: {},
    xp: {
      by_user: {}
    }
  };
}

function purgeExpiredEvents(store) {
  const expiredIds = new Set(
    (store.events || []).filter((event) => isEventExpired(event)).map((event) => String(event.id))
  );

  if (expiredIds.size === 0) return false;

  store.events = (store.events || []).filter((event) => !expiredIds.has(String(event.id)));

  const nextRsvps = {};
  Object.entries(store.rsvps || {}).forEach(([eventId, value]) => {
    if (!expiredIds.has(String(eventId))) nextRsvps[eventId] = value;
  });
  store.rsvps = nextRsvps;

  const nextSavedEvents = {};
  Object.entries(store.savedEvents || {}).forEach(([eventId, value]) => {
    if (!expiredIds.has(String(eventId))) nextSavedEvents[eventId] = value;
  });
  store.savedEvents = nextSavedEvents;

  const nextStartingSoon = {};
  Object.entries(store.generatedFlags?.startingSoonByEvent || {}).forEach(([eventId, value]) => {
    if (!expiredIds.has(String(eventId))) nextStartingSoon[eventId] = value;
  });
  store.generatedFlags = {
    ...(store.generatedFlags || {}),
    startingSoonByEvent: nextStartingSoon
  };

  return true;
}

function ensureSeededEvents(store) {
  const existing = new Set((store.events || []).map((event) => String(event.id)));
  let changed = false;

  seededEvents.forEach((seedEvent, index) => {
    const normalized = seedCreatorPlan(seedEvent, index);
    const eventId = String(normalized.id);
    if (existing.has(eventId)) return;
    if (isEventExpired(normalized)) return;
    store.events.push(clone(normalized));
    existing.add(eventId);
    changed = true;
  });

  if (changed) {
    store.events.sort((a, b) => Date.parse(a.event_datetime) - Date.parse(b.event_datetime));
  }

  return changed;
}

function loadStore() {
  const raw = safeStorageGet(STORAGE_KEY);
  if (!raw) {
    const initial = buildInitialStore();
    purgeExpiredEvents(initial);
    ensureSeededEvents(initial);
    safeStorageSet(STORAGE_KEY, JSON.stringify(initial));
    return clone(initial);
  }

  try {
    const parsed = JSON.parse(raw);
    const merged = {
      ...buildInitialStore(),
      ...parsed,
      events: (parsed.events || buildInitialStore().events).map(seedCreatorPlan),
      generatedFlags: {
        ...buildInitialStore().generatedFlags,
        ...(parsed.generatedFlags || {})
      }
    };

    if (!merged.accountProfiles || typeof merged.accountProfiles !== 'object') {
      merged.accountProfiles = { ...buildInitialStore().accountProfiles };
    }
    if (!merged.chatMessagesByBooking || typeof merged.chatMessagesByBooking !== 'object') {
      merged.chatMessagesByBooking = {};
    }
    if (!merged.eventGroupMessagesByEvent || typeof merged.eventGroupMessagesByEvent !== 'object') {
      merged.eventGroupMessagesByEvent = {};
    }
    if (!merged.eventGroupLastReadByUserEvent || typeof merged.eventGroupLastReadByUserEvent !== 'object') {
      merged.eventGroupLastReadByUserEvent = {};
    }
    if (!Array.isArray(merged.conventionApplications)) {
      merged.conventionApplications = [];
    }
    if (!Array.isArray(merged.partnerProfiles)) {
      merged.partnerProfiles = [];
    }
    if (!Array.isArray(merged.conventionVouchers)) {
      merged.conventionVouchers = [];
    }
    if (!Array.isArray(merged.conventionCoursePromos)) {
      merged.conventionCoursePromos = [];
    }
    if (!Array.isArray(merged.conventionAgreementRecords)) {
      merged.conventionAgreementRecords = [];
    }
    if (!Array.isArray(merged.conventionContractTemplates)) {
      merged.conventionContractTemplates = [];
    }
    if (!Array.isArray(merged.revokedAuthUserIds)) {
      merged.revokedAuthUserIds = [];
    }
    if (!merged.checkinSessionsByEvent || typeof merged.checkinSessionsByEvent !== 'object') {
      merged.checkinSessionsByEvent = {};
    }
    if (!merged.checkinRecordsByEvent || typeof merged.checkinRecordsByEvent !== 'object') {
      merged.checkinRecordsByEvent = {};
    }
    if (!merged.checkinOrganizerAwardByEvent || typeof merged.checkinOrganizerAwardByEvent !== 'object') {
      merged.checkinOrganizerAwardByEvent = {};
    }
    if (!Array.isArray(merged.friendRequests)) {
      merged.friendRequests = [];
    }
    if (!merged.friendsByUser || typeof merged.friendsByUser !== 'object') {
      merged.friendsByUser = {};
    }
    if (!merged.friendsByUserId || typeof merged.friendsByUserId !== 'object') {
      merged.friendsByUserId = { ...(merged.friendsByUser || {}) };
    }
    if (!merged.metByUserId || typeof merged.metByUserId !== 'object') {
      merged.metByUserId = {};
    }
    if (!merged.dmThreadsByPair || typeof merged.dmThreadsByPair !== 'object') {
      merged.dmThreadsByPair = {};
    }
    merged.friendsByUser = { ...(merged.friendsByUser || {}), ...(merged.friendsByUserId || {}) };
    merged.friendsByUserId = { ...merged.friendsByUser };

    // Legacy migration: move old localUser bio/avatar into account profile key "1" if present.
    if ((merged.localUser?.bio || merged.localUser?.avatar_url) && !merged.accountProfiles['1']?.bio && !merged.accountProfiles['1']?.avatar_url) {
      merged.accountProfiles['1'] = {
        display_name: normalizeDisplayName(merged.localUser?.name || '', 'Me'),
        bio: String(merged.localUser.bio || ''),
        avatar_url: String(merged.localUser.avatar_url || ''),
        chat_slots: []
      };
    }

    Object.keys(merged.accountProfiles || {}).forEach((key) => {
      const profile = merged.accountProfiles[key] || {};
      merged.accountProfiles[key] = {
        ...DEFAULT_ACCOUNT_PROFILE,
        ...profile,
        display_name: normalizeDisplayName(
          profile.display_name || profile.name || (key === '1' ? merged.localUser?.name || '' : ''),
          key === '1' ? 'Me' : ''
        )
      };
    });

    const changedPartnerLifecycle = ensurePartnerProfileLifecycle(merged);
    const changedPartnerBadges = refreshPartnerBadgeSnapshots(merged);

    const removedExpiredEvents = purgeExpiredEvents(merged);
    const restoredSeededEvents = ensureSeededEvents(merged);
    if (removedExpiredEvents || restoredSeededEvents || changedPartnerLifecycle || changedPartnerBadges) {
      saveStore(merged);
    }
    return merged;
  } catch {
    const initial = buildInitialStore();
    safeStorageSet(STORAGE_KEY, JSON.stringify(initial));
    return clone(initial);
  }
}

function saveStore(store) {
  safeStorageSet(STORAGE_KEY, JSON.stringify(store));
}

function addNotification(store, payload) {
  const currentUserId = resolveAuthUserId();
  const item = {
    id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    created_at: nowIso(),
    read: false,
    target_user_id: payload.target_user_id || currentUserId,
    ...payload
  };

  store.notifications.unshift(item);
  store.notifications = store.notifications.slice(0, 120);
}

function computeReliability(localUser) {
  const denominator = localUser.attended + localUser.no_show + localUser.cancelled;
  if (denominator <= 0) return 0;
  return Number(((localUser.attended / denominator) * 100).toFixed(1));
}

function enrichEvent(event, store, origin) {
  const currentUserId = resolveAuthUserId();
  const rsvp = store.rsvps[String(event.id)] || null;
  const isSaved = Boolean(store.savedEvents && store.savedEvents[String(event.id)]);
  const eventMs = Date.parse(event.event_datetime);
  const hasPassed = eventMs + getEventDurationMs(event) < nowMs();
  const distance_km =
    origin && event.lat != null && event.lng != null
      ? Number(haversineKm(origin.lat, origin.lng, event.lat, event.lng).toFixed(1))
      : null;

  const analytics = {
    views: Math.max(10, Math.round(event.popularity * 8 + event.participants_count * 3)),
    rsvps: event.participants_count,
    conversion_rate: Number(
      ((event.participants_count / Math.max(1, event.popularity * 8 + event.participants_count * 3)) * 100).toFixed(1)
    )
  };
  const groupChatUnreadCount = getEventGroupUnreadCount(store, event.id, currentUserId);

  return {
    ...event,
    distance_km,
    analytics,
    is_going: Boolean(rsvp && rsvp.status === 'going'),
    is_saved: isSaved,
    user_rsvp: rsvp,
    group_chat_unread_count: groupChatUnreadCount,
    has_new_group_messages: groupChatUnreadCount > 0,
    has_passed: hasPassed,
    can_confirm_attendance: Boolean(rsvp && rsvp.status === 'going' && hasPassed && !rsvp.attendance)
  };
}

function ensureStartingSoonNotifications(store) {
  const now = nowMs();

  for (const event of store.events) {
    const eventMs = Date.parse(event.event_datetime);
    const delta = eventMs - now;
    const rsvp = store.rsvps[String(event.id)];

    if (!rsvp || rsvp.status !== 'going') continue;
    if (delta < 0 || delta > 2 * 60 * 60 * 1000) continue;

    if (!store.generatedFlags.startingSoonByEvent[String(event.id)]) {
      addNotification(store, {
        type: 'event_starting_soon',
        title: 'Evento in partenza',
        message: `${event.sport_name} inizia entro 2 ore: ${event.location_name}`,
        event_id: event.id
      });
      store.generatedFlags.startingSoonByEvent[String(event.id)] = true;
    }
  }
}

function applyDateRange(events, dateRange) {
  if (!dateRange || dateRange === 'all') return events;

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  let end = null;

  if (dateRange === 'today') {
    end = new Date(start);
    end.setDate(start.getDate() + 1);
  }

  if (dateRange === 'week') {
    end = new Date(start);
    end.setDate(start.getDate() + 7);
  }

  if (dateRange === 'month') {
    end = new Date(start);
    end.setMonth(start.getMonth() + 1);
  }

  return events.filter((event) => {
    const date = new Date(event.event_datetime);
    return date >= start && (!end || date <= end);
  });
}

function applySort(events, sortBy) {
  const copy = [...events];

  if (sortBy === 'closest') {
    copy.sort((a, b) => {
      const da = a.distance_km == null ? Number.MAX_VALUE : a.distance_km;
      const db = b.distance_km == null ? Number.MAX_VALUE : b.distance_km;
      return da - db;
    });
    return copy;
  }

  if (sortBy === 'popular') {
    copy.sort((a, b) => {
      if ((b.featured_boost ? 1 : 0) !== (a.featured_boost ? 1 : 0)) {
        return (b.featured_boost ? 1 : 0) - (a.featured_boost ? 1 : 0);
      }
      return b.popularity - a.popularity || b.participants_count - a.participants_count;
    });
    return copy;
  }

  copy.sort((a, b) => Date.parse(a.event_datetime) - Date.parse(b.event_datetime));
  return copy;
}

function applyFilters(events, filters) {
  let result = [...events];
  const q = normalizeSearchText(filters.q);

  if (filters.sport && filters.sport !== 'all') {
    result = result.filter((event) => String(event.sport_id) === String(filters.sport));
  }

  if (filters.level && filters.level !== 'all') {
    result = result.filter((event) => event.level === filters.level);
  }

  if (filters.timeOfDay && filters.timeOfDay !== 'all') {
    result = result.filter((event) => toTimeOfDay(event.event_datetime) === filters.timeOfDay);
  }

  if (q) {
    const qTokens = q.split(/\s+/).filter(Boolean);
    result = result.filter((event) => {
      const hay = normalizeSearchText(
        `${event.title} ${event.sport_name} ${event.location_name} ${event.city} ${event.route_info?.name || ''} ${event.description || ''}`
      );
      return qTokens.every((token) => hay.includes(token));
    });
  }

  result = applyDateRange(result, filters.dateRange);

  if (filters.distance && filters.distance !== 'all') {
    const limit = Number(filters.distance);
    result = result.filter((event) => event.distance_km != null && event.distance_km <= limit);
  }

  return applySort(result, filters.sortBy || 'soonest');
}

function aggregateByWindow(events, view) {
  const groups = {};

  for (const event of events) {
    const date = new Date(event.event_datetime);
    let key;

    if (view === 'today') {
      key = date.toLocaleDateString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } else if (view === 'week') {
      key = date.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'short' });
    } else {
      key = date.toLocaleDateString('it-IT', { month: 'long', day: '2-digit' });
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(event);
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

function updateProfileReliability(store) {
  store.localUser.reliability = computeReliability(store.localUser);
}

function ensureEventExists(store, id) {
  const event = store.events.find((item) => Number(item.id) === Number(id));
  if (!event) throw new Error('Evento non trovato');
  return event;
}

function getCreationStats(store) {
  const month = currentMonthKey();
  return {
    month,
    created_this_month: Number(store.monthlyEventCreations[month] || 0)
  };
}

export const api = {
  async listEvents(filters = {}) {
    const store = loadStore();
    ensureStartingSoonNotifications(store);

    const origin = resolveOrigin(filters);

    const enriched = store.events.map((event) => enrichEvent(event, store, origin));
    const filtered = applyFilters(enriched, filters);

    saveStore(store);
    return withDelay(clone(filtered));
  },

  async getEvent(id, options = {}) {
    const store = loadStore();
    ensureStartingSoonNotifications(store);

    const origin = resolveOrigin(options);

    const event = ensureEventExists(store, id);
    saveStore(store);
    return withDelay(clone(enrichEvent(event, store, origin)));
  },

  async createEvent(payload) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const creatorProfile = store.accountProfiles?.[String(currentUserId)] || DEFAULT_ACCOUNT_PROFILE;
    const sport = store.sports.find((item) => Number(item.id) === Number(payload.sport_id));
    if (!sport) throw new Error('Sport non valido');

    const subscription = getSubscriptionWithEntitlements(loadSubscription());
    const entitlements = subscription.entitlements;
    const stats = getCreationStats(store);

    if (stats.created_this_month >= entitlements.maxEventsPerMonth) {
      throw new Error(`Piano Free: massimo ${entitlements.maxEventsPerMonth} eventi al mese`);
    }

    const nextId = store.events.reduce((max, event) => Math.max(max, Number(event.id)), 0) + 1;

    const normalizedRouteInfo = normalizeRouteInfo(payload.route_info);
    if (payload.route_info && !normalizedRouteInfo) {
      throw new Error('Dati percorso non validi');
    }

    const creatorDisplayName = normalizeDisplayName(
      creatorProfile.display_name || store.localUser?.name || '',
      'Me'
    );
    const event = {
      id: nextId,
      title: payload.title || `${sport.name} Meetup`,
      city: payload.city || 'Italia',
      sport_id: sport.id,
      sport_name: sport.name,
      level: payload.level,
      event_datetime: payload.event_datetime,
      location_name: payload.location_name,
      lat: payload.lat ?? null,
      lng: payload.lng ?? null,
      max_participants: Number(payload.max_participants),
      duration_minutes: Number(payload.duration_minutes) > 0 ? Number(payload.duration_minutes) : EVENT_DURATION_HOURS * 60,
      participants_count: 1,
      popularity: 70,
      description: payload.description,
      organizer: {
        id: String(currentUserId),
        name: creatorDisplayName,
        reliability_score: Math.max(40, store.localUser.reliability || 80)
      },
      participants_preview: [creatorDisplayName],
      etiquette: ['Puntualita', 'Comunicazione', 'Rispetto del gruppo'],
      route_info: normalizedRouteInfo,
      created_by: 'me',
      creator_plan: subscription.effective_plan || subscription.plan,
      featured_boost: subscription.effective_plan === 'premium'
    };

    store.events.unshift(event);
    store.monthlyEventCreations[stats.month] = stats.created_this_month + 1;

    addNotification(store, {
      type: 'event_created',
      title: 'Evento creato',
      message: `${sport.name} pubblicato con successo.`,
      event_id: event.id
    });

    addNotification(store, {
      type: 'similar_event',
      title: 'Nuovo evento simile',
      message: `Nuova sessione ${sport.name} disponibile nella tua area.`,
      event_id: event.id
    });

    saveStore(store);
    return withDelay(clone(event));
  },

  async joinEvent(id, payload) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const event = ensureEventExists(store, id);
    const key = String(id);
    const accountProfile = store.accountProfiles?.[String(currentUserId)] || DEFAULT_ACCOUNT_PROFILE;
    if (!isProfileCompleteForGroup(accountProfile)) {
      throw new Error('Completa profilo (nome utente, bio e immagine) prima di prenotare un gruppo');
    }
    const existingRsvp = store.rsvps[key];
    const isAlreadyGoing = Boolean(existingRsvp && existingRsvp.status === 'going');
    const maxParticipants = Number(event.max_participants || 0);
    const isFull = Number(event.participants_count || 0) >= maxParticipants;

    if (!isAlreadyGoing && Number.isFinite(maxParticipants) && maxParticipants > 0 && isFull) {
      throw new Error('Evento completo: posti disponibili terminati');
    }

    if (!isAlreadyGoing) {
      event.participants_count = Math.min(event.max_participants, event.participants_count + 1);

      try {
        piggybank.freezeStake({
          eventId: event.id,
          eventTitle: payload?.event_title || event.title || `${event.sport_name} @ ${event.location_name}`,
          amountCents: EVENT_JOIN_STAKE_CENTS
        });
      } catch (error) {
        const message = String(error?.message || '');
        // Idempotent freeze per eventId: do not block flow on duplicate stake.
        if (!message.includes('gia una quota congelata')) {
          throw error;
        }
      }

      const eventGroupKey = String(event.id);
      const existingGroupMessages = Array.isArray(store.eventGroupMessagesByEvent?.[eventGroupKey])
        ? store.eventGroupMessagesByEvent[eventGroupKey]
        : [];
      if (existingGroupMessages.length === 0) {
        const organizerRawId = String(event.organizer?.id || '').trim();
        const organizerKey =
          organizerRawId === 'me'
            ? String(resolveAuthUserId())
            : (/^\d+$/.test(organizerRawId) ? organizerRawId : '');
        const organizerUserId = Number(organizerKey || 0);
        const organizerProfile = organizerKey
          ? (store.accountProfiles?.[organizerKey] || DEFAULT_ACCOUNT_PROFILE)
          : DEFAULT_ACCOUNT_PROFILE;
        const organizerName = String(
          normalizeDisplayName(event.organizer?.name || organizerProfile.display_name || '', 'Organizzatore')
        );
        const organizerBio = String(organizerProfile.bio || '').trim();
        const organizerAvatarUrl = String(organizerProfile.avatar_url || '').trim();
        const starter = {
          id: `egm_${Date.now()}_welcome`,
          event_id: Number(event.id),
          sender_user_id: Number.isFinite(organizerUserId) ? organizerUserId : 0,
          sender_name: organizerName || 'Organizer',
          sender_avatar_url: organizerAvatarUrl,
          text: buildGroupOrganizerWelcome({
            organizerName,
            organizerBio,
            participationFeeStatus: 'frozen',
            participationFeeCents: EVENT_JOIN_STAKE_CENTS
          }),
          created_at: nowIso()
        };
        store.eventGroupMessagesByEvent = {
          ...(store.eventGroupMessagesByEvent || {}),
          [eventGroupKey]: [starter]
        };
      }
    }

    const participantName = normalizeDisplayName(
      accountProfile.display_name || payload?.name || '',
      'Partecipante'
    );

    store.rsvps[key] = {
      event_id: event.id,
      status: 'going',
      name: participantName,
      skill_level: payload.skill_level,
      note: payload.note || '',
      participation_fee_cents: EVENT_JOIN_STAKE_CENTS,
      participation_fee_status: 'frozen',
      attendance: null,
      updated_at: nowIso()
    };

    if (participantName && !event.participants_preview.includes(participantName)) {
      event.participants_preview = [participantName, ...event.participants_preview].slice(0, 5);
    }

    addNotification(store, {
      type: 'rsvp_confirmed',
      title: 'RSVP confermato',
      message: `Iscrizione confermata per ${event.sport_name} a ${event.location_name}.`,
      event_id: event.id
    });
    saveStore(store);
    return withDelay({ success: true, event: clone(event), rsvp: clone(store.rsvps[key]) });
  },

  async leaveEvent(id) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const event = ensureEventExists(store, id);
    const key = String(id);
    const existing = store.rsvps[key];
    let penaltyApplied = false;
    let penaltyNote = '';
    let stakeReleased = false;
    let stakeReleaseNote = '';
    let lateCancel = false;

    if (existing && existing.status === 'going') {
      const eventStartMs = Date.parse(event.event_datetime || '');
      const minutesToStart = Number.isFinite(eventStartMs)
        ? Math.floor((eventStartMs - nowMs()) / (60 * 1000))
        : null;
      lateCancel = Number.isFinite(minutesToStart) && minutesToStart < 30;

      const leftBeforeStart = Number.isFinite(eventStartMs) && eventStartMs > nowMs();
      if (leftBeforeStart && String(existing.participation_fee_status || '') === 'frozen') {
        try {
          piggybank.releaseStake({
            eventId: event.id,
            note: 'Quota rilasciata: cancellazione prima dell inizio evento'
          });
          stakeReleased = true;
          stakeReleaseNote = 'Quota rilasciata: cancellazione prima dell inizio evento.';
        } catch {
          // Do not block leave flow if wallet update fails.
        }
      } else if (lateCancel && String(existing.participation_fee_status || '') === 'frozen') {
        try {
          piggybank.deferUntilNextParticipation({ eventId: event.id });
          penaltyApplied = true;
          penaltyNote = 'Penale applicata: quota congelata fino alla prossima partecipazione.';
        } catch {
          // If stake is not available, do not block cancellation flow.
        }
      }

      const currentProfile = store.accountProfiles?.[String(currentUserId)] || DEFAULT_ACCOUNT_PROFILE;
      const leavingName = normalizeDisplayName(
        existing.name || currentProfile.display_name || store.localUser?.name || '',
        'Partecipante'
      );
      const organizerRawId = String(event.organizer?.id || '').trim();
      const normalizedOrganizerId = organizerRawId === 'me' ? String(currentUserId) : organizerRawId;
      const isOrganizerLeaving =
        (normalizedOrganizerId && normalizedOrganizerId === String(currentUserId)) ||
        normalizeNameToken(event.organizer?.name) === normalizeNameToken(leavingName);

      event.participants_preview = (Array.isArray(event.participants_preview) ? event.participants_preview : [])
        .filter((name) => normalizeNameToken(name) !== normalizeNameToken(leavingName))
        .slice(0, 5);

      if (isOrganizerLeaving) {
        const nextLeaderName = String(event.participants_preview?.[0] || '').trim();
        if (nextLeaderName) {
          const previousLeaderName = String(event.organizer?.name || leavingName || 'Organizzatore').trim();
          const nextLeaderUserId = Object.entries(store.accountProfiles || {}).find(([, profile]) =>
            normalizeNameToken(profile?.display_name) === normalizeNameToken(nextLeaderName)
          )?.[0];
          event.organizer = {
            ...(event.organizer || {}),
            id: nextLeaderUserId ? String(nextLeaderUserId) : String(event.organizer?.id || ''),
            name: normalizeDisplayName(nextLeaderName, 'Organizzatore')
          };
          const systemMessage = {
            id: `egm_${Date.now()}_leader_shift`,
            event_id: Number(event.id),
            sender_user_id: 0,
            sender_name: 'Motrice',
            sender_avatar_url: '',
            text: `👑 Cambio organizzatore: ${previousLeaderName} ha lasciato il gruppo. La corona passa a ${nextLeaderName} (primo iscritto successivo).`,
            created_at: nowIso()
          };
          const prevMessages = Array.isArray(store.eventGroupMessagesByEvent?.[key])
            ? store.eventGroupMessagesByEvent[key]
            : [];
          store.eventGroupMessagesByEvent = {
            ...(store.eventGroupMessagesByEvent || {}),
            [key]: [...prevMessages, systemMessage].slice(-400)
          };
        }
      }

      event.participants_count = Math.max(0, event.participants_count - 1);
      store.rsvps[key] = {
        ...existing,
        status: 'cancelled',
        cancel_penalty_applied: penaltyApplied,
        cancel_penalty_note: penaltyNote,
        stake_released: stakeReleased,
        stake_release_note: stakeReleaseNote,
        updated_at: nowIso()
      };
      store.localUser.cancelled += 1;
      updateProfileReliability(store);

      if (lateCancel) {
        awardXp(
          {
            userId: currentUserId,
            type: 'cancel_late',
            pointsGlobal: -20,
            pointsSport: -10,
            sportId: event.sport_id || event.sport_name || 'generic',
            refId: `event_${event.id}_late_cancel`,
            meta: {
              eventId: Number(event.id),
              attendance: 'cancelled_late'
            }
          },
          store
        );
      }
    }

    saveStore(store);
    return withDelay({
      success: true,
      event: clone(event),
      penalty_applied: penaltyApplied,
      penalty_note: penaltyNote,
      stake_released: stakeReleased,
      stake_release_note: stakeReleaseNote
    });
  },

  async confirmAttendance(id, attendance) {
    const store = loadStore();
    const event = ensureEventExists(store, id);
    const key = String(id);
    const rsvp = store.rsvps[key];

    if (!rsvp || rsvp.status !== 'going') {
      throw new Error('Nessuna partecipazione da confermare');
    }

    if (rsvp.attendance) {
      return withDelay({ success: true, event: clone(event), rsvp: clone(rsvp) });
    }

    if (attendance === 'attended') {
      store.localUser.attended += 1;
      const eventLabel = event.title || `${event.sport_name} @ ${event.location_name}`;
      try {
        piggybank.rewardParticipation({
          eventId: event.id,
          eventTitle: eventLabel,
          amountCents: 200
        });
      } catch {
        // Wallet reward must not block attendance confirmation flow.
      }
      try {
        piggybank.unlockDeferredOnParticipation();
      } catch {
        // No-op
      }
      awardXp(
        {
          userId: resolveAuthUserId(),
          type: 'attendance_confirmed',
          pointsGlobal: 30,
          pointsSport: 20,
          sportId: event.sport_id || event.sport_name || 'generic',
          refId: `event_${event.id}_attendance_attended`,
          meta: {
            eventId: Number(event.id),
            attendance: 'attended'
          }
        },
        store
      );
    } else {
      store.localUser.no_show += 1;
      awardXp(
        {
          userId: resolveAuthUserId(),
          type: 'attendance_no_show',
          pointsGlobal: -50,
          pointsSport: -30,
          sportId: event.sport_id || event.sport_name || 'generic',
          refId: `event_${event.id}_attendance_no_show`,
          meta: {
            eventId: Number(event.id),
            attendance: 'no_show'
          }
        },
        store
      );
    }

    store.rsvps[key] = {
      ...rsvp,
      attendance,
      updated_at: nowIso()
    };

    updateProfileReliability(store);
    saveStore(store);

    return withDelay({ success: true, event: clone(event), rsvp: clone(store.rsvps[key]) });
  },

  async startEventCheckInSession(eventId) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const event = ensureEventExists(store, eventId);

    if (!isEventOrganizerForUser(store, event, currentUserId)) {
      throw new Error('Solo l organizzatore puo avviare il check-in');
    }

    const issuedAtMs = nowMs();
    const window = buildEventCheckInWindow(event, issuedAtMs);
    const token = buildCheckInToken(event.id);
    const payload = encodeURIComponent(JSON.stringify({ eventId: Number(event.id), token }));
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${payload}`;

    const session = {
      event_id: Number(event.id),
      organizer_user_id: Number(currentUserId),
      token,
      issued_at: new Date(issuedAtMs).toISOString(),
      starts_at: new Date(window.startsAtMs).toISOString(),
      expires_at: new Date(window.expiresAtMs).toISOString(),
      qr_url: qrUrl,
      status: 'active'
    };

    store.checkinSessionsByEvent = {
      ...(store.checkinSessionsByEvent || {}),
      [String(event.id)]: session
    };
    saveStore(store);
    return withDelay(clone(session));
  },

  async getEventCheckInSession(eventId) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const event = ensureEventExists(store, eventId);
    const key = String(event.id);
    const session = store.checkinSessionsByEvent?.[key];
    if (!session) return withDelay(null);

    const now = nowMs();
    const startsMs = Date.parse(session.starts_at || '');
    const expiresMs = Date.parse(session.expires_at || '');
    const isActive = Number.isFinite(startsMs) && Number.isFinite(expiresMs) && now >= startsMs && now <= expiresMs;
    const canManage = isEventOrganizerForUser(store, event, currentUserId);

    return withDelay(
      clone({
        ...session,
        status: isActive ? 'active' : now < startsMs ? 'scheduled' : 'expired',
        can_manage: canManage,
        token: canManage ? session.token : undefined
      })
    );
  },

  async checkInToEvent({ eventId, token }) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const event = ensureEventExists(store, eventId);
    const eventKey = String(event.id);
    const session = store.checkinSessionsByEvent?.[eventKey];

    if (!session) throw new Error('Sessione check-in non trovata');

    const rsvp = store.rsvps[eventKey];
    if (!rsvp || rsvp.status !== 'going') {
      throw new Error('Devi essere tra i partecipanti per fare check-in');
    }

    const now = nowMs();
    const startsMs = Date.parse(session.starts_at || '');
    const expiresMs = Date.parse(session.expires_at || '');
    const inWindow = Number.isFinite(startsMs) && Number.isFinite(expiresMs) && now >= startsMs && now <= expiresMs;
    if (!inWindow) {
      throw new Error('Sessione check-in non valida o scaduta');
    }

    const submittedToken = extractCheckInToken(token);
    if (!submittedToken || submittedToken !== String(session.token || '')) {
      throw new Error('Token check-in non valido');
    }

    const recordsByEvent = store.checkinRecordsByEvent?.[eventKey] || {};
    const alreadyChecked = Boolean(recordsByEvent[String(currentUserId)]);
    if (alreadyChecked) {
      return withDelay(
        clone({
          ok: true,
          alreadyChecked: true,
          unlockedStake: false,
          attendanceConfirmed: String(rsvp.attendance || '') === 'attended',
          xpAwarded: {
            participant: 0,
            organizer: 0
          }
        })
      );
    }

    let unlockedStake = false;
    try {
      piggybank.releaseStake({
        eventId: event.id,
        note: 'Quota sbloccata: check-in QR confermato'
      });
      unlockedStake = true;
    } catch {
      unlockedStake = false;
    }

    let attendanceConfirmed = false;
    const currentRsvp = store.rsvps[eventKey] || rsvp;
    if (String(currentRsvp.attendance || '') !== 'attended') {
      store.localUser.attended += 1;
      store.rsvps[eventKey] = {
        ...currentRsvp,
        attendance: 'attended',
        updated_at: nowIso()
      };
      updateProfileReliability(store);
      attendanceConfirmed = true;
    }

    const participantXp = awardXp(
      {
        userId: currentUserId,
        type: 'event_checkin',
        pointsGlobal: 30,
        pointsSport: 0,
        sportId: event.sport_id || event.sport_name || 'generic',
        refId: `event_${event.id}_checkin_user_${currentUserId}`,
        meta: {
          eventId: Number(event.id),
          source: 'qr'
        }
      },
      store
    );

    let organizerXpPoints = 0;
    const organizerUserId = resolveOrganizerUserIdForEvent(store, event);
    const isSelfOrganizer = Number(organizerUserId || 0) === Number(currentUserId);
    if (Number.isInteger(organizerUserId) && organizerUserId > 0 && !isSelfOrganizer) {
      const currentAwardState = store.checkinOrganizerAwardByEvent?.[eventKey] || {
        organizer_user_id: organizerUserId,
        awarded_count: 0
      };
      const awardedCount = Number(currentAwardState.awarded_count || 0);
      const canAwardOrganizer = awardedCount < 15;
      if (canAwardOrganizer) {
        const organizerXp = awardXp(
          {
            userId: organizerUserId,
            type: 'event_checkin_organizer',
            pointsGlobal: 20,
            pointsSport: 0,
            sportId: event.sport_id || event.sport_name || 'generic',
            refId: `event_${event.id}_organizer_from_user_${currentUserId}`,
            meta: {
              eventId: Number(event.id),
              attendeeUserId: Number(currentUserId),
              source: 'qr'
            }
          },
          store
        );
        if (organizerXp?.applied) {
          organizerXpPoints = Number(organizerXp?.event?.points || 0);
          store.checkinOrganizerAwardByEvent = {
            ...(store.checkinOrganizerAwardByEvent || {}),
            [eventKey]: {
              organizer_user_id: organizerUserId,
              awarded_count: awardedCount + 1
            }
          };
        }
      }
    }

    store.checkinRecordsByEvent = {
      ...(store.checkinRecordsByEvent || {}),
      [eventKey]: {
        ...recordsByEvent,
        [String(currentUserId)]: {
          ts: nowIso(),
          source: 'qr'
        }
      }
    };

    const eventMeta = resolveEventMeetingMeta(store, event.id);
    Object.keys(store.checkinRecordsByEvent?.[eventKey] || {}).forEach((userIdRaw) => {
      const otherUserId = Number(userIdRaw);
      if (!Number.isInteger(otherUserId) || otherUserId <= 0 || otherUserId === Number(currentUserId)) return;
      addMetPersonRecord(store, currentUserId, {
        otherUserId,
        eventId: Number(event.id),
        eventPlace: eventMeta.eventPlace,
        eventStartsAt: eventMeta.eventStartsAt,
        metAt: nowIso()
      });
      addMetPersonRecord(store, otherUserId, {
        otherUserId: Number(currentUserId),
        eventId: Number(event.id),
        eventPlace: eventMeta.eventPlace,
        eventStartsAt: eventMeta.eventStartsAt,
        metAt: nowIso()
      });
    });

    saveStore(store);
    return withDelay(
      clone({
        ok: true,
        alreadyChecked: false,
        unlockedStake,
        attendanceConfirmed,
        xpAwarded: {
          participant: Number(participantXp?.event?.points || 0),
          organizer: organizerXpPoints
        },
        checkinRecord: store.checkinRecordsByEvent[eventKey][String(currentUserId)]
      })
    );
  },

  async listEventCheckInParticipants(eventId) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const event = ensureEventExists(store, eventId);
    const eventKey = String(event.id);
    const recordsByEvent = store.checkinRecordsByEvent?.[eventKey] || {};

    const participants = Object.entries(recordsByEvent)
      .filter(([userId]) => Number.isInteger(Number(userId)) && Number(userId) > 0)
      .map(([userId, record]) => {
        const numericUserId = Number(userId);
        const profile = store.accountProfiles?.[String(userId)] || DEFAULT_ACCOUNT_PROFILE;
        const displayName = normalizeDisplayName(profile.display_name || `Utente ${userId}`, `Utente ${userId}`);
        const avatarUrl = String(profile.avatar_url || '').trim();
        return {
          user_id: numericUserId,
          display_name: displayName,
          avatar_url: avatarUrl,
          checked_in_at: String(record?.ts || ''),
          friendship_status: getFriendshipStatus(store, currentUserId, numericUserId)
        };
      })
      .sort((a, b) => Date.parse(b.checked_in_at || '') - Date.parse(a.checked_in_at || ''));

    return withDelay(clone(participants));
  },

  async requestFriendship(targetUserId) {
    // Backward compatibility wrapper used by existing UI.
    return this.sendFriendRequest({ toUserId: targetUserId });
  },

  async isValidMeeting(currentUserId, otherUserId, eventId) {
    const store = loadStore();
    const context = resolveMeetingContext(store, currentUserId, otherUserId, eventId);
    return withDelay({ valid: Boolean(context), context: context ? clone(context) : null });
  },

  async listMetPeople(filters = {}) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const eventIdFilter = filters?.eventId == null ? null : Number(filters.eventId);
    seedMetFromCheckins(store, currentUserId);

    const items = Array.isArray(store.metByUserId?.[String(currentUserId)])
      ? store.metByUserId[String(currentUserId)]
      : [];

    const enriched = items
      .filter((item) => {
        if (eventIdFilter == null) return true;
        return Number(item?.eventId) === eventIdFilter;
      })
      .map((item) => {
        const otherUserId = Number(item?.otherUserId || 0);
        const profile = store.accountProfiles?.[String(otherUserId)] || DEFAULT_ACCOUNT_PROFILE;
        const displayName = normalizeDisplayName(profile.display_name || `Utente ${otherUserId}`, `Utente ${otherUserId}`);
        const avatarUrl = String(profile.avatar_url || '').trim();
        const bio = String(profile.bio || '').trim();
        const status = getFriendshipStatus(store, currentUserId, otherUserId);
        return {
          otherUserId,
          display_name: displayName,
          avatar_url: avatarUrl,
          bio,
          eventId: Number(item?.eventId || 0),
          eventPlace: String(item?.eventPlace || ''),
          eventStartsAt: String(item?.eventStartsAt || ''),
          metAt: String(item?.metAt || ''),
          friendship_status: status
        };
      })
      .filter((item) => Number.isInteger(item.otherUserId) && item.otherUserId > 0 && item.otherUserId !== Number(currentUserId))
      .sort((a, b) => Date.parse(b.metAt || '') - Date.parse(a.metAt || ''));

    saveStore(store);
    return withDelay(clone(enriched));
  },

  async sendFriendRequest({ toUserId, eventId = null }) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const target = Number(toUserId);
    if (!Number.isInteger(target) || target <= 0) throw new Error('Utente non valido');
    if (target === Number(currentUserId)) throw new Error('Non puoi richiedere amicizia a te stesso');

    seedMetFromCheckins(store, currentUserId);
    const status = getFriendshipStatus(store, currentUserId, target);
    if (status === 'friends') {
      return withDelay({ ok: true, status: 'friends' });
    }
    if (status === 'requested') {
      return withDelay({ ok: true, status: 'requested' });
    }

    const context = resolveMeetingContext(store, currentUserId, target, eventId);
    if (!context) {
      throw new Error('Puoi aggiungere solo persone con cui hai completato un allenamento');
    }

    const duplicate = (Array.isArray(store.friendRequests) ? store.friendRequests : []).find((item) => {
      const fromId = Number(item?.fromUserId ?? item?.from_user_id);
      const toId = Number(item?.toUserId ?? item?.to_user_id);
      const sameDirection = fromId === Number(currentUserId) && toId === target;
      const sameEvent = Number(item?.eventId ?? item?.event_id) === Number(context.eventId);
      return sameDirection && sameEvent && String(item?.status || '') === 'pending';
    });
    if (duplicate) {
      return withDelay({ ok: true, status: 'requested', request: clone(duplicate) });
    }

    const request = {
      id: `fr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      fromUserId: Number(currentUserId),
      toUserId: target,
      from_user_id: Number(currentUserId),
      to_user_id: target,
      eventId: Number(context.eventId),
      event_id: Number(context.eventId),
      eventPlace: String(context.eventPlace || ''),
      event_place: String(context.eventPlace || ''),
      eventStartsAt: String(context.eventStartsAt || ''),
      event_starts_at: String(context.eventStartsAt || ''),
      status: 'pending',
      createdAt: nowIso(),
      created_at: nowIso()
    };
    store.friendRequests = [request, ...(Array.isArray(store.friendRequests) ? store.friendRequests : [])].slice(0, 600);
    addMetPersonRecord(store, currentUserId, {
      otherUserId: target,
      eventId: Number(context.eventId),
      eventPlace: context.eventPlace,
      eventStartsAt: context.eventStartsAt,
      metAt: nowIso()
    });
    addMetPersonRecord(store, target, {
      otherUserId: Number(currentUserId),
      eventId: Number(context.eventId),
      eventPlace: context.eventPlace,
      eventStartsAt: context.eventStartsAt,
      metAt: nowIso()
    });
    saveStore(store);
    return withDelay({ ok: true, status: 'requested', request: clone(request) });
  },

  async listFriendRequests() {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const requests = (Array.isArray(store.friendRequests) ? store.friendRequests : [])
      .map((item) => {
        const fromUserId = Number(item?.fromUserId ?? item?.from_user_id);
        const toUserId = Number(item?.toUserId ?? item?.to_user_id);
        const eventId = Number(item?.eventId ?? item?.event_id);
        const fromProfile = store.accountProfiles?.[String(fromUserId)] || DEFAULT_ACCOUNT_PROFILE;
        const toProfile = store.accountProfiles?.[String(toUserId)] || DEFAULT_ACCOUNT_PROFILE;
        return {
          id: String(item?.id || ''),
          fromUserId,
          toUserId,
          eventId,
          eventPlace: String((item?.eventPlace ?? item?.event_place) || ''),
          eventStartsAt: String((item?.eventStartsAt ?? item?.event_starts_at) || ''),
          status: String(item?.status || 'pending'),
          createdAt: String((item?.createdAt ?? item?.created_at) || ''),
          respondedAt: String((item?.respondedAt ?? item?.responded_at) || ''),
          fromDisplayName: normalizeDisplayName(fromProfile?.display_name || `Utente ${fromUserId}`, `Utente ${fromUserId}`),
          fromAvatarUrl: String(fromProfile?.avatar_url || '').trim(),
          toDisplayName: normalizeDisplayName(toProfile?.display_name || `Utente ${toUserId}`, `Utente ${toUserId}`),
          toAvatarUrl: String(toProfile?.avatar_url || '').trim()
        };
      })
      .filter((item) => item.fromUserId > 0 && item.toUserId > 0)
      .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));

    return withDelay(
      clone({
        inbound: requests.filter((item) => item.toUserId === Number(currentUserId)),
        outbound: requests.filter((item) => item.fromUserId === Number(currentUserId))
      })
    );
  },

  async respondFriendRequest({ requestId, decision }) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const safeDecision = String(decision || '').toLowerCase();
    if (!['accepted', 'rejected'].includes(safeDecision)) {
      throw new Error('Decisione non valida');
    }

    const index = (Array.isArray(store.friendRequests) ? store.friendRequests : []).findIndex(
      (item) => String(item?.id || '') === String(requestId || '')
    );
    if (index < 0) throw new Error('Richiesta non trovata');

    const current = store.friendRequests[index];
    const toUserId = Number(current?.toUserId ?? current?.to_user_id);
    const fromUserId = Number(current?.fromUserId ?? current?.from_user_id);
    if (toUserId !== Number(currentUserId)) {
      throw new Error('Non puoi rispondere a questa richiesta');
    }
    if (String(current?.status || '') !== 'pending') {
      return withDelay({ ok: true, status: String(current?.status || 'pending') });
    }

    const respondedAt = nowIso();
    const nextRequest = {
      ...current,
      status: safeDecision,
      respondedAt,
      responded_at: respondedAt
    };
    store.friendRequests = store.friendRequests.map((item, itemIndex) => (itemIndex === index ? nextRequest : item));

    let dmThreadId = null;
    if (safeDecision === 'accepted') {
      linkFriends(store, fromUserId, toUserId);
      const pairKey = getFriendPairKey(fromUserId, toUserId);
      const existingThread = String(store.dmThreadsByPair?.[pairKey] || '');
      dmThreadId = existingThread || getDmThreadIdForPair(fromUserId, toUserId);
      store.dmThreadsByPair = {
        ...(store.dmThreadsByPair || {}),
        [pairKey]: dmThreadId
      };
    }

    saveStore(store);
    return withDelay({ ok: true, status: safeDecision, dmThreadId });
  },

  async listFriends() {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const friendsMap = getFriendMap(store);
    const ids = Array.isArray(friendsMap[String(currentUserId)]) ? friendsMap[String(currentUserId)] : [];
    const items = ids
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
      .map((id) => {
        const profile = store.accountProfiles?.[String(id)] || DEFAULT_ACCOUNT_PROFILE;
        const metItems = Array.isArray(store.metByUserId?.[String(currentUserId)]) ? store.metByUserId[String(currentUserId)] : [];
        const latestMet = metItems
          .filter((item) => Number(item?.otherUserId) === id)
          .sort((a, b) => Date.parse(b?.metAt || '') - Date.parse(a?.metAt || ''))[0] || null;
        return {
          userId: id,
          display_name: normalizeDisplayName(profile.display_name || `Utente ${id}`, `Utente ${id}`),
          avatar_url: String(profile.avatar_url || '').trim(),
          bio: String(profile.bio || '').trim(),
          metContext: latestMet
            ? {
                eventId: Number(latestMet.eventId || 0),
                eventPlace: String(latestMet.eventPlace || ''),
                eventStartsAt: String(latestMet.eventStartsAt || '')
              }
            : null
        };
      });

    return withDelay(clone(items));
  },

  async getFocusProfile(userId, options = {}) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const targetUserId = Number(userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) throw new Error('Utente non valido');

    seedMetFromCheckins(store, currentUserId);
    const profile = store.accountProfiles?.[String(targetUserId)] || DEFAULT_ACCOUNT_PROFILE;
    const displayName = normalizeDisplayName(profile.display_name || `Utente ${targetUserId}`, `Utente ${targetUserId}`);
    const metItems = Array.isArray(store.metByUserId?.[String(currentUserId)]) ? store.metByUserId[String(currentUserId)] : [];
    const eventIdHint = options?.eventId == null ? null : Number(options.eventId);
    const metContext = metItems
      .filter((item) => Number(item?.otherUserId) === targetUserId && (eventIdHint == null || Number(item?.eventId) === eventIdHint))
      .sort((a, b) => Date.parse(b?.metAt || '') - Date.parse(a?.metAt || ''))[0] || null;
    const friendshipStatus = getFriendshipStatus(store, currentUserId, targetUserId);
    const canDm = friendshipStatus === 'friends';

    return withDelay(
      clone({
        userId: targetUserId,
        display_name: displayName,
        avatar_url: String(profile.avatar_url || '').trim(),
        bio: String(profile.bio || '').trim(),
        friendshipStatus,
        canDm,
        metContext: metContext
          ? {
              eventId: Number(metContext.eventId || 0),
              eventPlace: String(metContext.eventPlace || ''),
              eventStartsAt: String(metContext.eventStartsAt || '')
            }
          : null
      })
    );
  },

  async canDM(userId) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const targetUserId = Number(userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return withDelay({ canDM: false });
    }
    const status = getFriendshipStatus(store, currentUserId, targetUserId);
    return withDelay({ canDM: status === 'friends' });
  },

  async getOrCreateDMThread(userId) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const targetUserId = Number(userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) throw new Error('Utente non valido');

    const status = getFriendshipStatus(store, currentUserId, targetUserId);
    if (status !== 'friends') {
      throw new Error('Devi essere amico per aprire una chat 1:1');
    }

    const pairKey = getFriendPairKey(currentUserId, targetUserId);
    const existingThread = String(store.dmThreadsByPair?.[pairKey] || '');
    const threadId = existingThread || getDmThreadIdForPair(currentUserId, targetUserId);
    store.dmThreadsByPair = {
      ...(store.dmThreadsByPair || {}),
      [pairKey]: threadId
    };
    saveStore(store);

    return withDelay({
      threadId,
      pairKey,
      userId: targetUserId
    });
  },

  async saveEvent(id) {
    const store = loadStore();
    const event = ensureEventExists(store, id);
    const key = String(id);

    store.savedEvents[key] = {
      event_id: event.id,
      saved_at: nowIso()
    };

    saveStore(store);
    return withDelay({ success: true, event_id: event.id });
  },

  async unsaveEvent(id) {
    const store = loadStore();
    const event = ensureEventExists(store, id);
    const key = String(id);

    if (store.savedEvents && store.savedEvents[key]) {
      delete store.savedEvents[key];
    }

    saveStore(store);
    return withDelay({ success: true, event_id: event.id });
  },

  async listSports() {
    const store = loadStore();
    return withDelay(clone(store.sports));
  },

  async listHotspots() {
    const store = loadStore();
    return withDelay(clone(store.hotspots));
  },

  async getProfile(id) {
    const store = loadStore();
    const profile = store.profiles.find((item) => Number(item.id) === Number(id));
    if (!profile) throw new Error('Profilo non trovato');
    return withDelay(clone(profile));
  },

  async getLocalProfile() {
    const store = loadStore();
    const userId = resolveAuthUserId();
    const accountProfile = store.accountProfiles?.[String(userId)] || DEFAULT_ACCOUNT_PROFILE;
    updateProfileReliability(store);
    saveStore(store);
    return withDelay(
      clone({
        ...store.localUser,
        display_name: normalizeDisplayName(accountProfile.display_name || store.localUser?.name || '', 'Me'),
        bio: accountProfile.bio || '',
        avatar_url: accountProfile.avatar_url || '',
        chat_slots: Array.isArray(accountProfile.chat_slots) ? accountProfile.chat_slots : []
      })
    );
  },

  async updateLocalProfile(payload = {}) {
    const store = loadStore();
    const userId = resolveAuthUserId();
    const key = String(userId);
    const current = store.accountProfiles?.[key] || DEFAULT_ACCOUNT_PROFILE;

    const nextDisplayName =
      payload.display_name == null
        ? String(current.display_name || store.localUser?.name || '')
        : String(payload.display_name).trim().slice(0, 40);
    const nextBio = payload.bio == null ? current.bio : String(payload.bio).trim().slice(0, 600);
    const nextAvatar = payload.avatar_url == null ? current.avatar_url : String(payload.avatar_url);
    const nextSlots =
      payload.chat_slots == null
        ? Array.isArray(current.chat_slots) ? current.chat_slots : []
        : Array.from(
            new Set(
              (Array.isArray(payload.chat_slots) ? payload.chat_slots : [])
                .map((item) => String(item).trim())
                .filter(Boolean)
            )
          ).slice(0, 24);

    store.accountProfiles = {
      ...(store.accountProfiles || {}),
      [key]: {
        display_name: nextDisplayName,
        bio: nextBio,
        avatar_url: nextAvatar,
        chat_slots: nextSlots
      }
    };
    if (String(userId) === '1') {
      store.localUser = {
        ...store.localUser,
        name: nextDisplayName || store.localUser?.name || 'Tu'
      };
    }

    saveStore(store);
    return withDelay(clone(store.accountProfiles[key]));
  },

  async getAccountProfileByUserId(userId) {
    const store = loadStore();
    const key = String(Number(userId));
    const profile = store.accountProfiles?.[key] || DEFAULT_ACCOUNT_PROFILE;
    return withDelay(clone(profile));
  },

  async getEventCreationStats() {
    const store = loadStore();
    return withDelay(getCreationStats(store));
  },

  async getEventAnalytics(id) {
    const store = loadStore();
    const event = ensureEventExists(store, id);
    const enriched = enrichEvent(event, store, null);
    return withDelay(clone(enriched.analytics));
  },

  async exportParticipantsCsv(id) {
    const store = loadStore();
    const event = ensureEventExists(store, id);
    const rows = [
      'name,skill_level,status,note',
      ...(event.participants_preview || []).map((name) => `${name},n/a,joined,`)
    ];

    const rsvp = store.rsvps[String(id)];
    if (rsvp && rsvp.name) {
      rows.push(`${rsvp.name},${rsvp.skill_level},${rsvp.status},"${(rsvp.note || '').replace(/"/g, '""')}"`);
    }

    return withDelay(rows.join('\n'));
  },

  async listAgenda(view = 'today', filters = {}) {
    const store = loadStore();
    const origin = resolveOrigin(filters);
    const enriched = store.events.map((event) => enrichEvent(event, store, origin));

    const mappedDateRange = view === 'today' ? 'today' : view === 'week' ? 'week' : 'month';
    const filtered = applyFilters(enriched, {
      ...filters,
      dateRange: mappedDateRange,
      sortBy: 'soonest'
    });
    const agendaItems = filtered.filter((event) => event.is_saved || event.is_going);
    return withDelay(clone(aggregateByWindow(agendaItems, view)));
  },

  async listNotifications() {
    const store = loadStore();
    ensureStartingSoonNotifications(store);
    saveStore(store);
    const currentUserId = resolveAuthUserId();
    const scoped = (store.notifications || []).filter(
      (item) => {
        const visibleForUser = !item.target_user_id || Number(item.target_user_id) === Number(currentUserId);
        const dismissedBy = Array.isArray(item.dismissed_by_user_ids) ? item.dismissed_by_user_ids : [];
        const hiddenForUser = dismissedBy.some((id) => Number(id) === Number(currentUserId));
        return visibleForUser && !hiddenForUser;
      }
    );
    return withDelay(clone(scoped));
  },

  async listEventGroupMessages(eventId) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const event = ensureEventExists(store, eventId);
    const key = String(event.id);
    const rsvp = store.rsvps[key];
    const subscription = getSubscriptionWithEntitlements(loadSubscription());

    if (!canAccessEventGroupChat({ rsvp, subscription })) {
      throw new Error('Chat di gruppo disponibile dopo prenotazione valida (quota o Premium)');
    }

    const rawItems = Array.isArray(store.eventGroupMessagesByEvent?.[key])
      ? store.eventGroupMessagesByEvent[key]
      : [];
    const items = rawItems.map((item) => {
      const senderUserId = Number(item?.sender_user_id || 0);
      if (!Number.isFinite(senderUserId) || senderUserId <= 0) {
        return {
          ...item,
          sender_name: normalizeDisplayName(item?.sender_name || '', 'Motrice'),
          sender_avatar_url: String(item?.sender_avatar_url || '').trim()
        };
      }
      const senderProfile = store.accountProfiles?.[String(senderUserId)] || DEFAULT_ACCOUNT_PROFILE;
      const senderName = normalizeDisplayName(
        senderProfile.display_name || item?.sender_name || '',
        `Utente ${senderUserId}`
      );
      return {
        ...item,
        sender_name: senderName,
        sender_avatar_url: String(senderProfile.avatar_url || item?.sender_avatar_url || '').trim()
      };
    });
    const latestCreatedAt = items.length ? items[items.length - 1].created_at : nowIso();
    const readKey = getEventGroupReadKey(currentUserId, event.id);
    store.eventGroupLastReadByUserEvent = {
      ...(store.eventGroupLastReadByUserEvent || {}),
      [readKey]: latestCreatedAt
    };
    saveStore(store);
    return withDelay(
      clone({
        event_id: event.id,
        can_send: true,
        items
      })
    );
  },

  async sendEventGroupMessage({ eventId, text }) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const event = ensureEventExists(store, eventId);
    const key = String(event.id);
    const messageText = String(text || '').trim();
    if (!messageText) throw new Error('Scrivi un messaggio prima di inviare');
    if (messageText.length > 1000) throw new Error('Messaggio troppo lungo (max 1000 caratteri)');

    const rsvp = store.rsvps[key];
    const subscription = getSubscriptionWithEntitlements(loadSubscription());
    if (!canAccessEventGroupChat({ rsvp, subscription })) {
      throw new Error('Chat di gruppo disponibile dopo prenotazione valida (quota o Premium)');
    }

    const accountProfile = store.accountProfiles?.[String(currentUserId)] || DEFAULT_ACCOUNT_PROFILE;
    const senderName = String(accountProfile.display_name || store.localUser?.name || 'Partecipante').trim();
    const next = {
      id: `egm_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      event_id: Number(event.id),
      sender_user_id: Number(currentUserId),
      sender_name: normalizeDisplayName(senderName || '', 'Partecipante'),
      sender_avatar_url: String(accountProfile.avatar_url || '').trim(),
      text: messageText,
      created_at: nowIso()
    };

    const prev = Array.isArray(store.eventGroupMessagesByEvent?.[key])
      ? store.eventGroupMessagesByEvent[key]
      : [];
    store.eventGroupMessagesByEvent = {
      ...(store.eventGroupMessagesByEvent || {}),
      [key]: [...prev, next].slice(-400)
    };
    const readKey = getEventGroupReadKey(currentUserId, event.id);
    store.eventGroupLastReadByUserEvent = {
      ...(store.eventGroupLastReadByUserEvent || {}),
      [readKey]: next.created_at
    };
    saveStore(store);
    return withDelay(clone(next));
  },

  async markNotificationRead(id) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    store.notifications = store.notifications.map((item) =>
      item.id === id &&
      (!item.target_user_id || Number(item.target_user_id) === Number(currentUserId)) &&
      !(Array.isArray(item.dismissed_by_user_ids) && item.dismissed_by_user_ids.some((userId) => Number(userId) === Number(currentUserId)))
        ? { ...item, read: true }
        : item
    );
    saveStore(store);
    return withDelay({ success: true });
  },

  async markAllNotificationsRead() {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    store.notifications = store.notifications.map((item) =>
      (!item.target_user_id || Number(item.target_user_id) === Number(currentUserId)) &&
      !(Array.isArray(item.dismissed_by_user_ids) && item.dismissed_by_user_ids.some((userId) => Number(userId) === Number(currentUserId)))
        ? { ...item, read: true }
        : item
    );
    saveStore(store);
    return withDelay({ success: true });
  },

  async clearNotifications() {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    store.notifications = store.notifications.map((item) => {
      const visibleForUser = !item.target_user_id || Number(item.target_user_id) === Number(currentUserId);
      if (!visibleForUser) return item;
      const dismissedBy = Array.isArray(item.dismissed_by_user_ids) ? item.dismissed_by_user_ids : [];
      if (dismissedBy.some((id) => Number(id) === Number(currentUserId))) return item;
      return { ...item, dismissed_by_user_ids: [...dismissedBy, Number(currentUserId)] };
    });
    saveStore(store);
    return withDelay({ success: true });
  },

  async getUnreadCount() {
    const store = loadStore();
    ensureStartingSoonNotifications(store);
    saveStore(store);
    const currentUserId = resolveAuthUserId();
    return withDelay(
      store.notifications.filter((item) => {
        if (item.read) return false;
        const visibleForUser = !item.target_user_id || Number(item.target_user_id) === Number(currentUserId);
        if (!visibleForUser) return false;
        const dismissedBy = Array.isArray(item.dismissed_by_user_ids) ? item.dismissed_by_user_ids : [];
        return !dismissedBy.some((id) => Number(id) === Number(currentUserId));
      }).length
    );
  },

  async bookCoachChat({ planId, coachUserId, coachName, slotLabel }) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const subscription = getSubscriptionWithEntitlements(loadSubscription());
    const entitlements = subscription.entitlements;

    if (!entitlements.canUseCoachChat) {
      throw new Error('La chat coach e disponibile solo con Premium');
    }

    const safePlanId = Number(planId);
    const safeCoachUserId = Number(coachUserId);
    const safeSlot = String(slotLabel || '').trim();
    if (!Number.isFinite(safePlanId) || safePlanId <= 0) {
      throw new Error('Plan non valido');
    }
    if (!Number.isFinite(safeCoachUserId) || safeCoachUserId <= 0) {
      throw new Error('Coach non valido');
    }
    if (!safeSlot) {
      throw new Error('Seleziona una fascia oraria');
    }

    const profile = store.accountProfiles?.[String(safeCoachUserId)] || DEFAULT_ACCOUNT_PROFILE;
    const coachSlots = Array.isArray(profile.chat_slots) ? profile.chat_slots : [];
    if (!coachSlots.includes(safeSlot)) {
      throw new Error('La fascia oraria selezionata non e piu disponibile');
    }

    const slotWindow = parseCoachSlotLabel(safeSlot);
    const startsMs = Date.parse(slotWindow.startsAtIso);
    const endsMs = Date.parse(slotWindow.endsAtIso);

    const duplicate = (store.chatBookings || []).find(
      (item) =>
        Number(item.plan_id) === safePlanId &&
        Number(item.client_user_id) === Number(currentUserId) &&
        isChatBookingActive(item)
    );
    if (duplicate) {
      throw new Error('Hai gia una prenotazione chat attiva per questa scheda');
    }

    const coachConflict = (store.chatBookings || []).find((item) => {
      if (Number(item.coach_user_id) !== safeCoachUserId) return false;
      if (item.status === 'cancelled') return false;
      const otherStart = Date.parse(item.starts_at);
      const otherEnd = Date.parse(item.ends_at);
      if (!Number.isFinite(otherStart) || !Number.isFinite(otherEnd)) return false;
      return rangesOverlap(startsMs, endsMs, otherStart, otherEnd);
    });
    if (coachConflict) {
      throw new Error('La fascia selezionata e appena stata prenotata. Scegli un altra fascia.');
    }

    const booking = {
      id: `chat_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      plan_id: safePlanId,
      coach_user_id: safeCoachUserId,
      client_user_id: currentUserId,
      coach_name: coachName || 'Coach',
      slot_label: safeSlot,
      duration_minutes: CHAT_SESSION_MINUTES,
      status: 'booked',
      created_at: nowIso(),
      starts_at: slotWindow.startsAtIso,
      ends_at: slotWindow.endsAtIso,
      rating_stars: null,
      rating_note: ''
    };

    store.chatBookings = [booking, ...(store.chatBookings || [])];

    addNotification(store, {
      type: 'coach_chat_booking',
      title: 'Prenotazione chat coach',
      message: `Nuova prenotazione chat 45 min (${safeSlot}) per la scheda #${safePlanId}.`,
      plan_id: safePlanId,
      target_user_id: safeCoachUserId
    });

    addNotification(store, {
      type: 'coach_chat_booking',
      title: 'Chat prenotata',
      message: `Hai prenotato 45 min con ${coachName || 'il coach'} (${safeSlot}).`,
      plan_id: safePlanId,
      target_user_id: currentUserId
    });

    saveStore(store);
    return withDelay(clone(booking));
  },

  async listMyChatBookings() {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const now = nowMs();
    const items = (store.chatBookings || [])
      .filter((item) => Number(item.client_user_id) === Number(currentUserId))
      .map((item) => getChatBookingView(item, now))
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
    return withDelay(clone(items));
  },

  async listCoachChatBookings() {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const now = nowMs();

    const items = (store.chatBookings || [])
      .filter((item) => Number(item.coach_user_id) === Number(currentUserId))
      .map((item) => getChatBookingView(item, now))
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

    return withDelay(clone(items));
  },

  async listBookingChatMessages(bookingId) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const key = String(bookingId || '').trim();
    if (!key) throw new Error('Booking non valida');

    const booking = (store.chatBookings || []).find((item) => item.id === key);
    if (!booking) throw new Error('Prenotazione chat non trovata');

    const isCoach = Number(booking.coach_user_id) === Number(currentUserId);
    const isClient = Number(booking.client_user_id) === Number(currentUserId);
    if (!isCoach && !isClient) throw new Error('Accesso chat non autorizzato');

    const messages = Array.isArray(store.chatMessagesByBooking?.[key])
      ? store.chatMessagesByBooking[key]
      : [];
    const now = nowMs();
    return withDelay(
      clone({
        booking: getChatBookingView(booking, now),
        can_send: canSendChatMessage(booking, now),
        items: messages
      })
    );
  },

  async sendBookingChatMessage({ bookingId, text }) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const key = String(bookingId || '').trim();
    const messageText = String(text || '').trim();
    if (!key) throw new Error('Booking non valida');
    if (!messageText) throw new Error('Scrivi un messaggio prima di inviare');
    if (messageText.length > 1000) throw new Error('Messaggio troppo lungo (max 1000 caratteri)');

    const booking = (store.chatBookings || []).find((item) => item.id === key);
    if (!booking) throw new Error('Prenotazione chat non trovata');

    const isCoach = Number(booking.coach_user_id) === Number(currentUserId);
    const isClient = Number(booking.client_user_id) === Number(currentUserId);
    if (!isCoach && !isClient) throw new Error('Accesso chat non autorizzato');

    if (isClient) {
      const subscription = getSubscriptionWithEntitlements(loadSubscription());
      const entitlements = subscription.entitlements;
      if (!entitlements.canUseCoachChat) {
        throw new Error('La chat coach e disponibile solo con Premium');
      }
    }

    if (!canSendChatMessage(booking)) {
      throw new Error('La chat e disponibile solo durante la sessione live');
    }

    const nextMessage = {
      id: `m_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      booking_id: key,
      sender_user_id: Number(currentUserId),
      text: messageText,
      created_at: nowIso()
    };

    const prev = Array.isArray(store.chatMessagesByBooking?.[key])
      ? store.chatMessagesByBooking[key]
      : [];
    store.chatMessagesByBooking = {
      ...(store.chatMessagesByBooking || {}),
      [key]: [...prev, nextMessage].slice(-300)
    };

    const targetUserId = isCoach ? booking.client_user_id : booking.coach_user_id;
    addNotification(store, {
      type: 'coach_chat_message',
      title: 'Nuovo messaggio chat',
      message: `Hai un nuovo messaggio nella chat della scheda #${booking.plan_id}.`,
      plan_id: booking.plan_id,
      target_user_id: targetUserId
    });

    saveStore(store);
    return withDelay(clone(nextMessage));
  },

  async cancelCoachChat(bookingId) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const booking = (store.chatBookings || []).find((item) => item.id === bookingId);
    if (!booking) throw new Error('Prenotazione chat non trovata');
    if (Number(booking.client_user_id) !== Number(currentUserId)) {
      throw new Error('Non puoi annullare questa prenotazione');
    }
    if (booking.status === 'cancelled') {
      throw new Error('Prenotazione gia annullata');
    }

    const startMs = Date.parse(booking.starts_at);
    if (!Number.isFinite(startMs) || startMs <= nowMs()) {
      throw new Error('Puoi annullare solo prima dell inizio sessione');
    }

    booking.status = 'cancelled';

    addNotification(store, {
      type: 'coach_chat_cancelled',
      title: 'Prenotazione chat annullata',
      message: `La sessione chat per la scheda #${booking.plan_id} e stata annullata dal cliente.`,
      plan_id: booking.plan_id,
      target_user_id: booking.coach_user_id
    });

    saveStore(store);
    return withDelay(clone(booking));
  },

  async endCoachChatSession(bookingId) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const key = String(bookingId || '').trim();
    if (!key) throw new Error('Prenotazione chat non trovata');

    const booking = (store.chatBookings || []).find((item) => item.id === key);
    if (!booking) throw new Error('Prenotazione chat non trovata');

    const isCoach = Number(booking.coach_user_id) === Number(currentUserId);
    const isClient = Number(booking.client_user_id) === Number(currentUserId);
    if (!isCoach && !isClient) {
      throw new Error('Non puoi terminare questa chat');
    }
    if (booking.status === 'cancelled') {
      throw new Error('Sessione gia annullata');
    }

    const now = nowMs();
    const startAt = Date.parse(booking.starts_at);
    const endAt = Date.parse(booking.ends_at);

    if (Number.isFinite(startAt) && now < startAt) {
      booking.status = 'cancelled';
    } else if (Number.isFinite(endAt) && now <= endAt) {
      booking.ends_at = new Date(now).toISOString();
      booking.status = booking.rating_stars ? 'rated' : 'completed';
    } else if (!booking.rating_stars) {
      booking.status = 'completed';
    }

    const actorLabel = isCoach ? 'coach' : 'cliente';
    const targetUserId = isCoach ? booking.client_user_id : booking.coach_user_id;
    addNotification(store, {
      type: 'coach_chat_ended',
      title: 'Sessione chat terminata',
      message: `La chat della scheda #${booking.plan_id} e stata terminata dal ${actorLabel}.`,
      plan_id: booking.plan_id,
      target_user_id: targetUserId
    });

    saveStore(store);
    return withDelay(clone(getChatBookingView(booking, now)));
  },

  async submitCoachRating({ bookingId, stars, note = '' }) {
    const store = loadStore();
    const currentUserId = resolveAuthUserId();
    const safeStars = Number(stars);
    if (!Number.isFinite(safeStars) || safeStars < 1 || safeStars > 5) {
      throw new Error('Valutazione non valida (1-5)');
    }

    const booking = (store.chatBookings || []).find((item) => item.id === bookingId);
    if (!booking) throw new Error('Prenotazione chat non trovata');
    if (Number(booking.client_user_id) !== Number(currentUserId)) {
      throw new Error('Non puoi valutare questa sessione');
    }
    if (booking.status === 'cancelled') {
      throw new Error('Sessione annullata: impossibile inviare valutazione');
    }
    if (booking.rating_stars) {
      throw new Error('Valutazione gia inviata');
    }
    if (Date.parse(booking.ends_at) > nowMs()) {
      throw new Error('Puoi valutare solo a fine sessione');
    }

    booking.rating_stars = safeStars;
    booking.rating_note = String(note || '').trim().slice(0, 400);
    booking.status = 'rated';

    const key = String(booking.coach_user_id);
    const current = store.coachRatings?.[key] || { total_stars: 0, ratings_count: 0 };
    store.coachRatings = {
      ...(store.coachRatings || {}),
      [key]: {
        total_stars: Number(current.total_stars || 0) + safeStars,
        ratings_count: Number(current.ratings_count || 0) + 1
      }
    };

    addNotification(store, {
      type: 'coach_chat_rating',
      title: 'Nuova valutazione coach',
      message: `Hai ricevuto ${safeStars}/5 stelle da una sessione chat.`,
      target_user_id: booking.coach_user_id
    });

    saveStore(store);
    return withDelay(clone(booking));
  },

  async getCoachRatingSummary(coachUserId) {
    const store = loadStore();
    const key = String(Number(coachUserId));
    const row = store.coachRatings?.[key] || { total_stars: 0, ratings_count: 0 };
    const count = Number(row.ratings_count || 0);
    const average = count > 0 ? Number((Number(row.total_stars || 0) / count).toFixed(2)) : 0;
    return withDelay(
      clone({
        coach_user_id: Number(coachUserId),
        average,
        count
      })
    );
  },

  async submitConventionApplication(payload = {}) {
    const store = loadStore();
    const session = getAuthSession();
    const submittedByUserId = Number(session.userId);
    if (!session.isAuthenticated || !Number.isInteger(submittedByUserId) || submittedByUserId <= 0) {
      throw new Error('Effettua il login per inviare una candidatura convenzioni');
    }

    const organization = String(payload.organization || '').trim().slice(0, 100);
    const type = String(payload.type || '').trim().slice(0, 40);
    const city = String(payload.city || '').trim().slice(0, 60);
    const contact = String(payload.contact || '').trim().slice(0, 120);
    const message = String(payload.message || '').trim().slice(0, 500);
    const partnerPlan = String(payload.partner_plan || 'free').trim().toLowerCase();
    const rawCourses = Number(payload.courses_count || 0);
    const coursesCount = Number.isFinite(rawCourses)
      ? Math.max(0, Math.min(CONVENTION_MAX_COURSES, Math.floor(rawCourses)))
      : 0;

    if (organization.length < 3) {
      throw new Error('Inserisci un nome struttura valido (min 3 caratteri)');
    }
    if (contact.length < 5) {
      throw new Error('Inserisci un contatto valido (email o telefono)');
    }
    if (!type) {
      throw new Error('Seleziona una tipologia');
    }
    if (!city) {
      throw new Error('Seleziona una citta');
    }
    if (partnerPlan !== 'free' && partnerPlan !== 'premium') {
      throw new Error('Piano partner non valido');
    }
    if (partnerPlan === 'premium' && coursesCount <= 0) {
      throw new Error('Con Premium indica almeno 1 corso disponibile');
    }
    if (partnerPlan === 'premium' && Number.isFinite(rawCourses) && rawCourses > CONVENTION_MAX_COURSES) {
      throw new Error(`Con Premium puoi impostare massimo ${CONVENTION_MAX_COURSES} corsi`);
    }

    const promoLimit = partnerPlan === 'free' ? 2 : coursesCount * 7;
    const promoRuleLabel =
      partnerPlan === 'free'
        ? 'Piano Free: 2 promo disponibili'
        : `Piano Premium: fino a 7 promo per corso (max ${promoLimit})`;

    const accountProfile = store.accountProfiles?.[String(submittedByUserId)] || DEFAULT_ACCOUNT_PROFILE;
    const submittedByDisplayName = String(
      accountProfile.display_name || store.localUser?.name || `User ${submittedByUserId}`
    )
      .trim()
      .slice(0, 80);

    const hasPending = (store.conventionApplications || []).some(
      (item) =>
        Number(item.submitted_by_user_id) === submittedByUserId &&
        String(item.status || '').toLowerCase() === 'pending'
    );
    if (hasPending) {
      throw new Error('Hai gia una candidatura convenzioni in pending');
    }

    const activeProfile = (store.partnerProfiles || []).find(
      (item) =>
        Number(item.owner_user_id) === submittedByUserId &&
        getPartnerSubscriptionStatus(item) === 'active'
    );
    if (activeProfile) {
      const expiry = Date.parse(activeProfile.subscription_expires_at || '');
      const expiryLabel = Number.isFinite(expiry)
        ? new Date(expiry).toLocaleDateString('it-IT')
        : 'n/d';
      throw new Error(`Hai gia un abbonamento convenzioni attivo fino al ${expiryLabel}`);
    }

    const application = {
      id: `conv_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      organization,
      type,
      city,
      contact,
      message,
      submitted_by_user_id: submittedByUserId,
      submitted_by_display_name: submittedByDisplayName,
      partner_plan: partnerPlan,
      courses_count: partnerPlan === 'premium' ? coursesCount : 0,
      promo_limit: promoLimit,
      promo_rule_label: promoRuleLabel,
      status: 'pending',
      created_at: nowIso(),
      reviewed_at: null,
      admin_note: '',
      contract_terms_accepted: false,
      contract_terms_accepted_at: null,
      signature_method: '',
      signature_provider: '',
      signature_declared_at: null,
      signed_contract_file_name: '',
      signed_contract_mime_type: '',
      signed_contract_data_url: '',
      signed_contract_uploaded_at: null
    };

    store.conventionApplications = [application, ...(store.conventionApplications || [])].slice(0, 500);
    saveStore(store);
    return withDelay(clone(application));
  },

  async listConventionApplications(status = 'pending') {
    const store = loadStore();
    const safeStatus = String(status || 'pending').toLowerCase();
    const applications = Array.isArray(store.conventionApplications) ? store.conventionApplications : [];
    const filtered = safeStatus === 'all' ? applications : applications.filter((item) => item.status === safeStatus);
    const sorted = [...filtered].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return withDelay(clone(sorted));
  },

  async getConventionApplicationById(applicationId) {
    const store = loadStore();
    const id = String(applicationId || '').trim();
    if (!id) throw new Error('Candidatura non valida');
    const item = (store.conventionApplications || []).find((application) => String(application.id) === id);
    if (!item) throw new Error('Candidatura non trovata');
    return withDelay(clone(item));
  },

  async reviewConventionApplication(applicationId, payload = {}) {
    const store = loadStore();
    ensurePartnerProfileLifecycle(store);
    const id = String(applicationId || '').trim();
    const decision = String(payload.decision || '').trim().toLowerCase();
    const note = String(payload.note || '').trim().slice(0, 400);
    if (!id) throw new Error('Candidatura non valida');
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new Error('Decisione non valida');
    }

    const index = (store.conventionApplications || []).findIndex((item) => String(item.id) === id);
    if (index < 0) throw new Error('Candidatura non trovata');

    const current = store.conventionApplications[index];
    const next = {
      ...current,
      status: decision,
      admin_note: note,
      reviewed_at: nowIso()
    };

    store.conventionApplications[index] = next;
    const ownerUserId = Number(current.submitted_by_user_id || 0);
    if (decision === 'approved') {
      if (isConventionProvinceDeactivated(current.city)) {
        throw new Error('Convenzioni attive disabilitate per la provincia di Ascoli Piceno');
      }
      const latestTemplate = (store.conventionContractTemplates || [])
        .filter((item) => String(item.application_id) === String(current.id))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
      if (!latestTemplate) {
        throw new Error('Genera prima il contratto predefinito per questa candidatura');
      }
      if (!current.contract_terms_accepted || !current.signed_contract_uploaded_at) {
        throw new Error('Il partner deve leggere, accettare e caricare il contratto firmato prima dell approvazione');
      }

      if (Number.isInteger(ownerUserId) && ownerUserId > 0) {
        const existingProfileIndex = (store.partnerProfiles || []).findIndex(
          (profile) => Number(profile.owner_user_id) === ownerUserId
        );
        const partnerProfile = {
          id:
            existingProfileIndex >= 0
              ? store.partnerProfiles[existingProfileIndex].id
              : `partner_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
          owner_user_id: ownerUserId,
          application_id: current.id,
          organization: current.organization,
          type: current.type,
          city: current.city,
          contact: current.contact,
          profile_tagline: '',
          profile_description: '',
          profile_address: '',
          profile_phone: '',
          profile_email: '',
          profile_website: '',
          offered_courses: [],
          profile_image_data_url: '',
          plan: current.partner_plan || 'free',
          courses_count: Number(current.courses_count || 0),
          promo_limit: Number(current.promo_limit || 0),
          status: 'active',
          subscription_started_at: nowIso(),
          subscription_expires_at: addDaysIso(nowIso(), CONVENTION_SUBSCRIPTION_DAYS),
          subscription_duration_days: CONVENTION_SUBSCRIPTION_DAYS,
          earnings_voucher_gross_cents: 0,
          earnings_voucher_share_cents: 0,
          cashback_course_cents: 0,
          earnings_total_cents: 0,
          earnings_history: [],
          badge_level: 'rame',
          score_total: 0,
          score_rolling_30d: 0,
          metrics_rolling_30d: {
            redeemed_count: 0,
            redeemed_amount_cents: 0,
            expired_count: 0,
            redeem_rate: 0
          },
          score_history: [],
          approved_at: nowIso(),
          updated_at: nowIso()
        };
        if (existingProfileIndex >= 0) {
          store.partnerProfiles[existingProfileIndex] = {
            ...store.partnerProfiles[existingProfileIndex],
            ...partnerProfile
          };
        } else {
          store.partnerProfiles.unshift(partnerProfile);
        }
        store.conventionApplications[index] = {
          ...store.conventionApplications[index],
          partner_profile_id: partnerProfile.id
        };

        addNotification(store, {
          type: 'convention_application_approved',
          title: 'Candidatura convenzioni approvata',
          message:
            'Il tuo account partner e attivo. Apri Convenzioni, entra nel Partner Portal e completa piano/promo.',
          action_path: '/convenzioni',
          target_user_id: ownerUserId
        });
      }
    } else if (decision === 'rejected' && Number.isInteger(ownerUserId) && ownerUserId > 0) {
      addNotification(store, {
        type: 'convention_application_rejected',
        title: 'Candidatura convenzioni non approvata',
        message: note
          ? `La candidatura e stata rifiutata. Nota admin: ${note}`
          : 'La candidatura e stata rifiutata. Aggiorna i dati e invia una nuova proposta.',
        action_path: '/convenzioni',
        target_user_id: ownerUserId
      });
    }
    saveStore(store);
    return withDelay(clone(store.conventionApplications[index]));
  },

  async createConventionAgreementRecord(payload = {}) {
    const store = loadStore();
    const session = getAuthSession();
    const createdByUserId = Number(session.userId);
    if (!session.isAuthenticated || !Number.isInteger(createdByUserId) || createdByUserId <= 0) {
      throw new Error('Effettua il login per registrare la convenzione');
    }

    const partyAName = String(payload?.party_a?.name || '').trim().slice(0, 140);
    const partyBName = String(payload?.party_b?.name || '').trim().slice(0, 140);
    const signerName = String(payload?.signer?.name || '').trim().slice(0, 120);
    const signerEmail = String(payload?.signer?.email || '').trim().slice(0, 120);
    const certificateType = String(payload?.certificate?.type || '').trim().toUpperCase().slice(0, 30);
    const certificateAuthority = String(payload?.certificate?.authority || '').trim().slice(0, 140);
    const certificateSerial = String(payload?.certificate?.serial || '').trim().slice(0, 120);
    const documentText = String(payload.document_text || '').trim().slice(0, 60000);
    const documentHash = String(payload.document_hash_sha256 || '').trim().toLowerCase();
    const accepted = Boolean(payload.terms_accepted);
    const acceptedAt = String(payload.terms_accepted_at || '').trim() || nowIso();

    if (partyAName.length < 2 || partyBName.length < 2) {
      throw new Error('Indica entrambe le parti contrattuali');
    }
    if (documentText.length < 120) {
      throw new Error('Testo convenzione troppo breve');
    }
    if (!accepted) {
      throw new Error('Devi confermare accettazione termini e condizioni');
    }
    if (!/^[a-f0-9]{64}$/.test(documentHash)) {
      throw new Error('Hash documento non valido (SHA-256 richiesto)');
    }
    if (!signerName || !signerEmail) {
      throw new Error('Dati firmatario incompleti');
    }
    if (!certificateType || !certificateAuthority || !certificateSerial) {
      throw new Error('Dati certificato elettronico incompleti');
    }

    const record = {
      id: `agr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      created_at: nowIso(),
      created_by_user_id: createdByUserId,
      terms_accepted: true,
      terms_accepted_at: acceptedAt,
      legal_notice:
        'Validita legale subordinata a normativa applicabile, identificazione firmatari e uso di firma elettronica conforme.',
      party_a: {
        name: partyAName,
        vat_or_tax_code: String(payload?.party_a?.vat_or_tax_code || '').trim().slice(0, 40),
        address: String(payload?.party_a?.address || '').trim().slice(0, 200)
      },
      party_b: {
        name: partyBName,
        vat_or_tax_code: String(payload?.party_b?.vat_or_tax_code || '').trim().slice(0, 40),
        address: String(payload?.party_b?.address || '').trim().slice(0, 200)
      },
      signer: {
        name: signerName,
        role: String(payload?.signer?.role || '').trim().slice(0, 80),
        email: signerEmail
      },
      certificate: {
        type: certificateType,
        authority: certificateAuthority,
        serial: certificateSerial,
        issued_country: String(payload?.certificate?.issued_country || '').trim().slice(0, 60)
      },
      document_hash_sha256: documentHash,
      document_text: documentText
    };

    store.conventionAgreementRecords = [record, ...(store.conventionAgreementRecords || [])].slice(0, 400);
    saveStore(store);
    return withDelay(clone(record));
  },

  async listConventionAgreementRecords() {
    const store = loadStore();
    const session = getAuthSession();
    const userId = Number(session.userId);
    if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
      throw new Error('Login richiesto');
    }

    const items = (store.conventionAgreementRecords || [])
      .filter((item) => Number(item.created_by_user_id) === userId)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return withDelay(clone(items));
  },

  async createConventionContractTemplate(payload = {}) {
    const store = loadStore();
    const session = getAuthSession();
    const userId = Number(session.userId);
    if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
      throw new Error('Login admin richiesto');
    }

    const applicationId = String(payload.application_id || '').trim();
    if (!applicationId) throw new Error('application_id richiesto');
    const application = (store.conventionApplications || []).find((item) => String(item.id) === applicationId);
    if (!application) throw new Error('Candidatura non trovata');

    const durationMonths = Math.max(1, Math.min(60, Number(payload.duration_months || 12)));
    const extraTerms = String(payload.extra_terms || '').trim().slice(0, 4000);
    const spidReady = payload.spid_ready == null ? true : Boolean(payload.spid_ready);
    const customText = String(payload.contract_text || '').trim();
    const contractText =
      customText ||
      buildConventionContractText(application, {
        duration_months: durationMonths,
        extra_terms: extraTerms,
        spid_ready: spidReady
      });

    if (contractText.length < 120) {
      throw new Error('Testo contratto troppo breve');
    }

    const template = {
      id: `ctpl_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      application_id: application.id,
      organization: application.organization,
      type: application.type,
      city: application.city,
      created_by_user_id: userId,
      created_at: nowIso(),
      duration_months: durationMonths,
      extra_terms: extraTerms,
      spid_ready: spidReady,
      contract_text: contractText
    };

    store.conventionContractTemplates = [template, ...(store.conventionContractTemplates || [])].slice(0, 600);
    saveStore(store);
    return withDelay(clone(template));
  },

  async listConventionContractTemplates(filters = {}) {
    const store = loadStore();
    const applicationId = String(filters?.application_id || '').trim();
    const organization = String(filters?.organization || '').trim().toLowerCase();
    let rows = Array.isArray(store.conventionContractTemplates) ? store.conventionContractTemplates : [];
    if (applicationId) {
      rows = rows.filter((item) => String(item.application_id) === applicationId);
    }
    if (organization) {
      rows = rows.filter((item) => String(item.organization || '').trim().toLowerCase() === organization);
    }
    rows = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return withDelay(clone(rows));
  },

  async getMyConventionContractContext() {
    const store = loadStore();
    const session = getAuthSession();
    const userId = Number(session.userId);
    const isAuthenticated = Boolean(session.isAuthenticated && Number.isInteger(userId) && userId > 0);
    if (!isAuthenticated) {
      return withDelay(
        clone({
          is_authenticated: false,
          application: null,
          template: null
        })
      );
    }

    const application = (store.conventionApplications || [])
      .filter((item) => Number(item.submitted_by_user_id) === userId)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;

    if (!application) {
      return withDelay(
        clone({
          is_authenticated: true,
          application: null,
          template: null
        })
      );
    }

    const template = (store.conventionContractTemplates || [])
      .filter((item) => String(item.application_id) === String(application.id))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;

    return withDelay(
      clone({
        is_authenticated: true,
        application,
        template
      })
    );
  },

  async submitSignedConventionContract(payload = {}) {
    const store = loadStore();
    const session = getAuthSession();
    const userId = Number(session.userId);
    if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
      throw new Error('Login richiesto');
    }

    const applicationId = String(payload.application_id || '').trim();
    const termsAccepted = Boolean(payload.terms_accepted);
    const signatureMethod = String(payload.signature_method || '').trim().toLowerCase();
    const signatureProvider = String(payload.signature_provider || '').trim().slice(0, 120);
    const fileName = String(payload.file_name || '').trim().slice(0, 160);
    const mimeType = String(payload.mime_type || '').trim().slice(0, 120);
    const dataUrl = String(payload.file_data_url || '').trim();
    if (!applicationId) throw new Error('application_id richiesto');
    if (!termsAccepted) throw new Error('Devi accettare i termini e condizioni');
    if (!['spid', 'qes', 'fea', 'other'].includes(signatureMethod)) {
      throw new Error('Metodo firma non valido');
    }
    if (signatureMethod === 'spid' && signatureProvider.length < 2) {
      throw new Error('Inserisci il provider SPID');
    }
    if (!fileName) throw new Error('Inserisci un documento firmato');
    if (!dataUrl.startsWith('data:')) throw new Error('Documento non valido');
    if (dataUrl.length > 8 * 1024 * 1024) throw new Error('Documento troppo grande');

    const index = (store.conventionApplications || []).findIndex((item) => String(item.id) === applicationId);
    if (index < 0) throw new Error('Candidatura non trovata');
    const current = store.conventionApplications[index];
    if (Number(current.submitted_by_user_id) !== userId) {
      throw new Error('Non puoi caricare documenti per questa candidatura');
    }

    const next = {
      ...current,
      contract_terms_accepted: true,
      contract_terms_accepted_at: nowIso(),
      signature_method: signatureMethod,
      signature_provider: signatureProvider,
      signature_declared_at: nowIso(),
      signed_contract_file_name: fileName,
      signed_contract_mime_type: mimeType || 'application/octet-stream',
      signed_contract_data_url: dataUrl,
      signed_contract_uploaded_at: nowIso()
    };
    store.conventionApplications[index] = next;
    saveStore(store);
    return withDelay(clone(next));
  },

  async getMyConventionPartnerContext() {
    const store = loadStore();
    ensurePartnerProfileLifecycle(store);
    if (refreshPartnerBadgeSnapshots(store)) {
      saveStore(store);
    }
    const session = getAuthSession();
    const userId = Number(session.userId);
    const isAuthenticated = Boolean(session.isAuthenticated && Number.isInteger(userId) && userId > 0);
    if (!isAuthenticated) {
      return withDelay(
        clone({
          is_authenticated: false,
          has_application: false,
          application: null,
          activation_status: 'inactive',
          partner_profile: null
        })
      );
    }

    const applications = (store.conventionApplications || [])
      .filter((item) => Number(item.submitted_by_user_id) === userId)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const latestApplication = applications[0] || null;

    const partnerProfile =
      (store.partnerProfiles || []).find((item) => Number(item.owner_user_id) === userId) || null;

    let activationStatus = 'inactive';
    const partnerStatus = getPartnerSubscriptionStatus(partnerProfile);
    if (partnerStatus === 'active') {
      activationStatus = 'active';
    } else if (partnerStatus === 'expired') {
      activationStatus = 'expired';
    } else if (latestApplication && String(latestApplication.status || '').toLowerCase() === 'pending') {
      activationStatus = 'pending';
    }

    return withDelay(
      clone({
        is_authenticated: true,
        has_application: Boolean(latestApplication),
        application: latestApplication,
        activation_status: activationStatus,
        partner_profile: partnerProfile
      })
    );
  },

  async getPartnerPortalHandoffData() {
    const store = loadStore();
    ensurePartnerProfileLifecycle(store);
    if (refreshPartnerBadgeSnapshots(store)) {
      saveStore(store);
    }
    const session = getAuthSession();
    const userId = Number(session.userId);
    const isAuthenticated = Boolean(session.isAuthenticated && Number.isInteger(userId) && userId > 0);
    if (!isAuthenticated) {
      throw new Error('Login richiesto');
    }

    const applications = (store.conventionApplications || [])
      .filter((item) => Number(item.submitted_by_user_id) === userId)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const latestApplication = applications[0] || null;
    const partnerProfile =
      (store.partnerProfiles || []).find((item) => Number(item.owner_user_id) === userId) || null;
    const city = String(partnerProfile?.city || '').toLowerCase();
    const vouchers =
      city.length > 0
        ? (store.conventionVouchers || []).filter(
            (item) => String(item.partner?.city || '').toLowerCase() === city
          )
        : [];
    const coursePromos =
      city.length > 0
        ? (store.conventionCoursePromos || []).filter(
            (item) => String(item.city || '').toLowerCase() === city
          )
        : [];

    const activationStatus =
      getPartnerSubscriptionStatus(partnerProfile) === 'active'
        ? 'active'
        : getPartnerSubscriptionStatus(partnerProfile) === 'expired'
          ? 'expired'
        : latestApplication && String(latestApplication.status || '').toLowerCase() === 'pending'
          ? 'pending'
          : 'inactive';

    return withDelay(
      clone({
        auth: {
          provider: session.provider || null,
          accessToken: session.accessToken || null,
          userId,
          isAuthenticated: true
        },
        activation_status: activationStatus,
        application: latestApplication,
        applications,
        partner_profile: partnerProfile,
        partner_profiles: partnerProfile ? [partnerProfile] : [],
        convention_vouchers: vouchers,
        convention_course_promos: coursePromos
      })
    );
  },

  async listApprovedConventionPartners() {
    const store = loadStore();
    ensurePartnerProfileLifecycle(store);
    if (refreshPartnerBadgeSnapshots(store)) {
      saveStore(store);
    }
    const now = nowMs();
    const rows = (store.partnerProfiles || [])
      .filter((item) => getPartnerSubscriptionStatus(item) === 'active')
      .map((item) => {
        const profileId = String(item.id || '');
        const promos = (store.conventionCoursePromos || [])
          .filter((promo) => {
            if (String(promo.partner_profile_id || '') !== profileId) return false;
            if (String(promo.status || '').toLowerCase() === 'inactive') return false;
            const expiresMs = Date.parse(String(promo.expires_at || ''));
            if (Number.isFinite(expiresMs) && expiresMs <= now) return false;
            return true;
          })
          .slice(0, 40)
          .map((promo) => ({
            id: promo.id,
            promo_code: promo.promo_code,
            course_type: promo.course_type,
            discounted_price_eur: Number(promo.discounted_price_eur || 0),
            status: 'active',
            expires_at: promo.expires_at || null
          }));

        return {
          id: `partner_profile_${item.id}`,
          source: 'approved_partner_profile',
          name: String(item.organization || 'Partner convenzione'),
          city: String(item.city || 'Italia'),
          kind: String(item.type || 'Partner'),
          plan: String(item.plan || 'free'),
          benefit: `Partner approvato Motrice · Piano ${String(item.plan || 'free').toUpperCase()} · Promo fino a ${Number(item.promo_limit || 0)} disponibili.`,
          profile_tagline: String(item.profile_tagline || ''),
          profile_description: String(item.profile_description || ''),
          profile_address: String(item.profile_address || ''),
          profile_phone: String(item.profile_phone || ''),
          profile_email: String(item.profile_email || ''),
          profile_website: String(item.profile_website || ''),
          offered_courses: Array.isArray(item.offered_courses) ? item.offered_courses.slice(0, 24) : [],
          profile_image_data_url: String(item.profile_image_data_url || ''),
          status: 'Partner attivo',
          badge_level: getPartnerBadgeFromScore(Number(item.score_rolling_30d || 0)),
          score_total: Number(item.score_total || 0),
          score_rolling_30d: Number(item.score_rolling_30d || 0),
          metrics_rolling_30d: computePartnerRollingStats(String(item.id || ''), now, store),
          promo_expires_at: null,
          lat: null,
          lng: null,
          course_promos: promos
        };
      });
    return withDelay(clone(rows));
  },

  async listConventionPartnerSubscriptions(status = 'all') {
    const store = loadStore();
    ensurePartnerProfileLifecycle(store);
    if (refreshPartnerBadgeSnapshots(store)) {
      saveStore(store);
    }
    const safeStatus = String(status || 'all').toLowerCase();
    const rows = (store.partnerProfiles || []).map((item) => {
      const computedStatus = getPartnerSubscriptionStatus(item);
      const expiresMs = Date.parse(item.subscription_expires_at || '');
      const daysLeft = Number.isFinite(expiresMs)
        ? Math.max(0, Math.ceil((expiresMs - nowMs()) / (24 * 60 * 60 * 1000)))
        : 0;
      return {
        ...item,
        computed_status: computedStatus,
        days_left: daysLeft
      };
    });
    const filtered =
      safeStatus === 'all' ? rows : rows.filter((item) => String(item.computed_status) === safeStatus);
    const sorted = [...filtered].sort((a, b) => Date.parse(b.updated_at || b.approved_at || '') - Date.parse(a.updated_at || a.approved_at || ''));
    return withDelay(clone(sorted));
  },

  async issueConventionVoucher(partnerPayload = {}) {
    const store = loadStore();
    const session = getAuthSession();
    const userId = Number(session.userId);
    if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
      throw new Error('Buono disponibile solo per utenti registrati');
    }

    const partnerId = String(partnerPayload.id || '').trim();
    const partnerName = String(partnerPayload.name || '').trim().slice(0, 120);
    const partnerCity = String(partnerPayload.city || '').trim().slice(0, 80);
    const partnerKind = String(partnerPayload.kind || '').trim().slice(0, 40);
    const partnerPromoExpiresAt = String(partnerPayload.promo_expires_at || '').trim();
    const partnerLat = Number(partnerPayload.lat);
    const partnerLng = Number(partnerPayload.lng);
    if (!partnerId || !partnerName) {
      throw new Error('Partner convenzione non valido');
    }
    if (partnerPromoExpiresAt) {
      const promoExpiryMs = Date.parse(partnerPromoExpiresAt);
      if (Number.isFinite(promoExpiryMs) && promoExpiryMs <= nowMs()) {
        throw new Error('Promozione partner scaduta: impossibile generare nuovo buono');
      }
    }
    const voucherCostCents = CONVENTION_VOUCHER_COST_CENTS;

    const activeExisting = store.conventionVouchers.find(
      (item) =>
        Number(item.user_id) === userId &&
        String(item.partner?.id || '') === partnerId &&
        resolveVoucherStatus(item) === 'active'
    );
    if (activeExisting) {
      saveStore(store);
      return withDelay(clone(activeExisting));
    }

    const createdAtMs = nowMs();
    const expiresAtMs = createdAtMs + CONVENTION_VOUCHER_VALIDITY_MINUTES * 60 * 1000;
    const voucherId = `cv_${createdAtMs}_${Math.random().toString(16).slice(2, 8)}`;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://motrice.local';
    const voucherUrl = `${origin}/convenzioni/voucher/${voucherId}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(voucherUrl)}`;

    const voucher = {
      id: voucherId,
      user_id: userId,
      created_at: new Date(createdAtMs).toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      status: 'active',
      cost_cents: voucherCostCents,
      billing_mode: 'piggybank',
      voucher_url: voucherUrl,
      qr_url: qrUrl,
      partner: {
        id: partnerId,
        name: partnerName,
        city: partnerCity,
        kind: partnerKind,
        promo_expires_at: partnerPromoExpiresAt || null,
        lat: Number.isFinite(partnerLat) ? partnerLat : null,
        lng: Number.isFinite(partnerLng) ? partnerLng : null
      }
    };

    if (voucherCostCents > 0) {
      piggybank.spendForConventionVoucher({
        voucherId,
        partnerName,
        amountCents: voucherCostCents
      });
    }

    const partnerProfileIndex = findPartnerProfileIndexForVoucher(store, voucher);
    if (partnerProfileIndex >= 0) {
      const currentProfile = store.partnerProfiles[partnerProfileIndex];
      const plan = String(currentProfile?.plan || '').toLowerCase();
      if (plan === 'premium') {
        const currentEarnings = normalizePartnerEarnings(currentProfile);
        const voucherShare = Math.round(voucherCostCents * CONVENTION_PREMIUM_VOUCHER_SHARE_RATE);
        const nextProfile = pushPartnerEarningsEvent(
          {
            ...currentProfile,
            earnings_voucher_gross_cents: currentEarnings.earnings_voucher_gross_cents + voucherCostCents,
            earnings_voucher_share_cents: currentEarnings.earnings_voucher_share_cents + voucherShare,
            earnings_total_cents: currentEarnings.earnings_total_cents + voucherShare,
            updated_at: nowIso()
          },
          {
            id: `pe_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
            type: 'voucher_share',
            amount_cents: voucherShare,
            gross_cents: voucherCostCents,
            voucher_id: voucher.id,
            created_at: nowIso(),
            note: `Revenue share ${Math.round(CONVENTION_PREMIUM_VOUCHER_SHARE_RATE * 100)}% su voucher`
          }
        );
        store.partnerProfiles[partnerProfileIndex] = nextProfile;
      }
    }

    store.conventionVouchers.unshift(voucher);
    store.conventionVouchers = store.conventionVouchers.slice(0, 200);
    saveStore(store);
    return withDelay(clone(voucher));
  },

  async getConventionVoucher(voucherId) {
    const store = loadStore();
    const session = getAuthSession();
    const userId = Number(session.userId);
    if (!session.isAuthenticated || !Number.isInteger(userId) || userId <= 0) {
      throw new Error('Per verificare il buono devi essere registrato');
    }

    const id = String(voucherId || '').trim();
    const voucher = (store.conventionVouchers || []).find((item) => String(item.id) === id);
    if (!voucher) {
      throw new Error('Buono non trovato o scaduto');
    }
    if (Number(voucher.user_id) !== userId) {
      throw new Error('Questo buono appartiene a un altro account');
    }

    const status = resolveVoucherStatus(voucher);
    const nextVoucher = status === voucher.status ? voucher : { ...voucher, status };
    if (status !== voucher.status) {
      const index = store.conventionVouchers.findIndex((item) => String(item.id) === String(voucher.id));
      if (index >= 0) {
        store.conventionVouchers[index] = nextVoucher;
      }
    }
    saveStore(store);
    return withDelay(clone(nextVoucher));
  },

  async listConventionVouchers(status = 'all') {
    const store = loadStore();
    const safeStatus = String(status || 'all').toLowerCase();
    const normalized = (store.conventionVouchers || []).map((item) => {
      const computed = resolveVoucherStatus(item);
      return computed === item.status ? item : { ...item, status: computed };
    });
    store.conventionVouchers = normalized;
    saveStore(store);

    const filtered =
      safeStatus === 'all' ? normalized : normalized.filter((item) => String(item.status) === safeStatus);
    const sorted = [...filtered].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return withDelay(clone(sorted));
  },

  async redeemConventionVoucher(input, payload = {}) {
    const store = loadStore();
    const voucherId = extractVoucherId(input);
    if (!voucherId) throw new Error('Inserisci un codice o URL voucher valido');

    const index = (store.conventionVouchers || []).findIndex((item) => String(item.id) === voucherId);
    if (index < 0) throw new Error('Voucher non trovato');

    const current = store.conventionVouchers[index];
    const resolvedStatus = resolveVoucherStatus(current);
    if (resolvedStatus === 'expired') throw new Error('Voucher scaduto, impossibile riscattare');
    if (resolvedStatus === 'redeemed') throw new Error('Voucher gia riscattato');

    const note = String(payload.note || '').trim().slice(0, 240);
    const source = String(payload.source || 'manual').trim().slice(0, 40) || 'manual';
    const reviewerUserId = resolveAuthUserId();
    const next = {
      ...current,
      status: 'redeemed',
      redeemed_at: nowIso(),
      redeemed_by_user_id: reviewerUserId,
      redeemed_note: note,
      redeemed_source: source
    };
    store.conventionVouchers[index] = next;

    const partnerProfileIndex = findPartnerProfileIndexForVoucher(store, next);
    const partnerProfileIdFromPayload = String(payload.partner_profile_id || '').trim();
    let partnerScoreAward = null;
    if (partnerProfileIndex >= 0) {
      const currentProfile = store.partnerProfiles[partnerProfileIndex];
      const plan = String(currentProfile?.plan || '').toLowerCase();
      if (plan === 'premium') {
        const currentEarnings = normalizePartnerEarnings(currentProfile);
        const cashback = CONVENTION_COURSE_CASHBACK_CENTS;
        const nextProfile = pushPartnerEarningsEvent(
          {
            ...currentProfile,
            cashback_course_cents: currentEarnings.cashback_course_cents + cashback,
            earnings_total_cents: currentEarnings.earnings_total_cents + cashback,
            updated_at: nowIso()
          },
          {
            id: `pe_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
            type: 'course_cashback',
            amount_cents: cashback,
            voucher_id: next.id,
            created_at: nowIso(),
            note: 'Cashback iscrizione corso da voucher riscattato'
          }
        );
        store.partnerProfiles[partnerProfileIndex] = nextProfile;
      }
    }

    if (Number.isInteger(Number(next.user_id)) && Number(next.user_id) > 0) {
      const targetUserId = Number(next.user_id);
      const revoked = Array.isArray(store.revokedAuthUserIds) ? store.revokedAuthUserIds : [];
      if (!revoked.some((value) => Number(value) === targetUserId)) {
        store.revokedAuthUserIds = [...revoked, targetUserId];
      }
    }

    addNotification(store, {
      type: 'convention_voucher_redeemed',
      title: 'Buono convenzione utilizzato',
      message: `Il tuo buono per ${next.partner?.name || 'partner'} e stato verificato.`,
      target_user_id: next.user_id
    });

    awardXp(
      {
        userId: Number(next.user_id),
        type: 'voucher_redeemed',
        pointsGlobal: 40,
        pointsSport: 25,
        sportId: next.partner?.kind || 'fitness',
        refId: `voucher_${next.id}_redeemed`,
        meta: {
          voucherId: String(next.id),
          partnerId: String(next.partner?.id || ''),
          source
        }
      },
      store
    );

    const safeSource = String(source || '').toLowerCase();
    const isPartnerSource = safeSource === 'partner_portal';
    const isAdminSource = safeSource.includes('admin');
    const resolvedPartnerProfile =
      partnerProfileIndex >= 0 && store.partnerProfiles?.[partnerProfileIndex]
        ? store.partnerProfiles[partnerProfileIndex]
        : null;
    const resolvedPartnerProfileId = String(resolvedPartnerProfile?.id || '');
    const isAuthenticatedPartnerActor =
      isPartnerSource &&
      resolvedPartnerProfile &&
      Number(resolvedPartnerProfile.owner_user_id) === Number(reviewerUserId);
    const canAwardPartnerScore =
      Boolean(resolvedPartnerProfileId) &&
      (isAuthenticatedPartnerActor ||
        (isAdminSource && partnerProfileIdFromPayload === resolvedPartnerProfileId));

    if (canAwardPartnerScore) {
      partnerScoreAward = awardPartnerScore(
        {
          partnerId: resolvedPartnerProfileId,
          voucherId: next.id,
          userId: next.user_id,
          issuedAt: next.created_at,
          redeemedAt: next.redeemed_at,
          source: safeSource
        },
        store
      );
    }

    saveStore(store);
    return withDelay(
      clone({
        ...next,
        partner_score_award: partnerScoreAward
      })
    );
  },

  async getXpState(userId) {
    const store = loadStore();
    const targetUserId = Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : resolveAuthUserId();
    return withDelay(clone(getUserXpState(targetUserId, store)));
  },

  async resetMockData() {
    safeStorageRemove(STORAGE_KEY);
    return withDelay({ success: true });
  }
};

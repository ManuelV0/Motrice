import { Capacitor } from '@capacitor/core';
import { getAuthSession, legacyIdFromAuthUserId } from './authSession';
import { isSupabaseConfigured, requireSupabase } from './supabaseClient';
import { assertProfileVerified } from './profileVerification';

const profileUuidByLegacyId = new Map();
const profileByUuid = new Map();

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSearchText(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function withCheckInQr(session) {
  if (!session || typeof session !== 'object') return session || null;
  const token = normalizeText(session.token);
  if (!token) return session;
  const payload = encodeURIComponent(
    JSON.stringify({
      eventId: session.event_id,
      token
    })
  );
  return {
    ...session,
    qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${payload}`
  };
}

function currentAuthUserId() {
  return normalizeText(getAuthSession()?.authUserId);
}

function requireAuthUserId() {
  const userId = currentAuthUserId();
  if (!userId) {
    throw new Error('Accedi per usare questa funzione');
  }
  return userId;
}

function rememberProfile(profile) {
  if (!profile?.id) return profile || null;
  const uuid = String(profile.id);
  const legacyId = legacyIdFromAuthUserId(uuid);
  profileUuidByLegacyId.set(String(legacyId), uuid);
  profileByUuid.set(uuid, profile);
  return profile;
}

function legacyProfileId(uuid) {
  if (!uuid) return null;
  const legacyId = legacyIdFromAuthUserId(uuid);
  profileUuidByLegacyId.set(String(legacyId), String(uuid));
  return legacyId;
}

function resolveProfileUuid(value) {
  const raw = normalizeText(value);
  if (/^[0-9a-f-]{36}$/i.test(raw)) return raw;
  return profileUuidByLegacyId.get(raw) || null;
}

function throwIfError(error) {
  if (!error) return;
  const message = normalizeText(error.message) || 'Operazione Supabase non riuscita';
  throw new Error(message);
}

function toTimeOfDay(dateIso) {
  const hour = new Date(dateIso).getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveOrigin(filters = {}) {
  const lat = Number(filters.originLat ?? filters.lat);
  const lng = Number(filters.originLng ?? filters.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function applyDateRange(events, dateRange) {
  if (!dateRange || dateRange === 'all') return events;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (dateRange === 'today') end.setDate(end.getDate() + 1);
  else if (dateRange === 'week') end.setDate(end.getDate() + 7);
  else if (dateRange === 'month') end.setMonth(end.getMonth() + 1);
  else return events;
  return events.filter((event) => {
    const eventDate = new Date(event.event_datetime);
    return eventDate >= start && eventDate < end;
  });
}

function filterAndSortEvents(events, filters = {}) {
  let result = [...events];
  const query = normalizeSearchText(filters.q);

  if (filters.sport && filters.sport !== 'all') {
    result = result.filter((event) => String(event.sport_id) === String(filters.sport));
  }
  if (filters.level && filters.level !== 'all') {
    result = result.filter((event) => event.level === filters.level);
  }
  if (filters.timeOfDay && filters.timeOfDay !== 'all') {
    result = result.filter((event) => toTimeOfDay(event.event_datetime) === filters.timeOfDay);
  }
  if (query) {
    const tokens = query.split(/\s+/).filter(Boolean);
    result = result.filter((event) => {
      const haystack = normalizeSearchText(
        `${event.title} ${event.sport_name} ${event.location_name} ${event.city} ${event.description} ${event.route_info?.name || ''}`
      );
      return tokens.every((token) => haystack.includes(token));
    });
  }

  result = applyDateRange(result, filters.dateRange);

  if (filters.distance && filters.distance !== 'all') {
    const distanceLimit = Number(filters.distance);
    result = result.filter(
      (event) => event.distance_km != null && Number(event.distance_km) <= distanceLimit
    );
  }

  if (filters.sortBy === 'closest') {
    return result.sort(
      (a, b) => (a.distance_km ?? Number.MAX_VALUE) - (b.distance_km ?? Number.MAX_VALUE)
    );
  }
  if (filters.sortBy === 'popular') {
    return result.sort(
      (a, b) => Number(b.popularity || 0) - Number(a.popularity || 0)
    );
  }
  return result.sort(
    (a, b) => Date.parse(a.event_datetime) - Date.parse(b.event_datetime)
  );
}

function aggregateByWindow(events, view) {
  const groups = {};
  events.forEach((event) => {
    const date = new Date(event.event_datetime);
    const label =
      view === 'today'
        ? date.toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : view === 'week'
          ? date.toLocaleDateString('it-IT', {
              weekday: 'long',
              day: '2-digit',
              month: 'short'
            })
          : date.toLocaleDateString('it-IT', { month: 'long', day: '2-digit' });
    groups[label] = [...(groups[label] || []), event];
  });
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

async function ensureMyProfile(client) {
  const session = getAuthSession();
  const userId = requireAuthUserId();
  const existing = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  throwIfError(existing.error);
  if (existing.data) return rememberProfile(existing.data);

  const displayName =
    normalizeText(session?.email).split('@')[0] ||
    'Atleta';
  const { data, error } = await client
    .from('profiles')
    .insert({
      id: userId,
      display_name: displayName.length >= 2 ? displayName.slice(0, 40) : 'Atleta'
    })
    .select()
    .single();
  throwIfError(error);
  return rememberProfile(data);
}

async function loadEventContext(client, rawEvents, { includeWorkoutPlans = false } = {}) {
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  const eventIds = events.map((event) => event.id);
  const creatorIds = [...new Set(events.map((event) => event.creator_id).filter(Boolean))];
  const workoutPlanIds = includeWorkoutPlans
    ? [...new Set(events.map((event) => event.scheda_id).filter(Boolean))]
    : [];
  const authUserId = currentAuthUserId();

  if (!eventIds.length) {
    return { participants: [], savedEventIds: new Set(), organizers: new Map(), joinRequests: new Map(), workoutPlans: new Map() };
  }

  if (!authUserId) {
    return { participants: [], savedEventIds: new Set(), organizers: new Map(), joinRequests: new Map(), workoutPlans: new Map() };
  }

  const [participantsResult, savedResult, organizersResult, joinRequestsResult, workoutPlansResult] = await Promise.all([
    client
      .from('event_participants')
      .select(
        'event_id,user_id,status,skill_level,note,joined_at,stake_cents,stake_status,cashback_percent,checked_in_at,minimum_reached_at,completed_at,review_bonus_awarded,profile:profiles!event_participants_user_id_fkey(id,display_name,avatar_url,bio,reliability_score)'
      )
      .in('event_id', eventIds),
    client
      .from('saved_events')
      .select('event_id')
      .eq('user_id', authUserId)
      .in('event_id', eventIds),
    creatorIds.length
      ? client
          .from('profiles')
          .select('id,display_name,avatar_url,bio,reliability_score')
          .in('id', creatorIds)
      : Promise.resolve({ data: [], error: null }),
    client
      .from('event_join_requests')
      .select('event_id,status,requested_at')
      .eq('user_id', authUserId)
      .in('event_id', eventIds),
    workoutPlanIds.length
      ? client
          .from('personal_workout_plans')
          .select('id,client_id,title,sport_id,workout_type,duration_minutes,level,equipment,exercises')
          .in('id', workoutPlanIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  throwIfError(participantsResult.error);
  throwIfError(savedResult.error);
  throwIfError(organizersResult.error);
  throwIfError(joinRequestsResult.error);
  throwIfError(workoutPlansResult.error);

  const participants = participantsResult.data || [];
  participants.forEach((participant) => rememberProfile(participant.profile));
  const organizerRows = organizersResult.data || [];
  organizerRows.forEach(rememberProfile);

  return {
    participants,
    savedEventIds: new Set((savedResult.data || []).map((item) => String(item.event_id))),
    organizers: new Map(organizerRows.map((profile) => [String(profile.id), profile])),
    joinRequests: new Map(
      (joinRequestsResult.data || []).map((request) => [String(request.event_id), request])
    ),
    workoutPlans: new Map(
      (workoutPlansResult.data || []).map((plan) => [String(plan.id), {
        id: plan.client_id || plan.id,
        remoteId: plan.id,
        title: plan.title,
        sportId: plan.sport_id,
        type: plan.workout_type,
        duration: Number(plan.duration_minutes || 60),
        level: plan.level,
        equipment: Array.isArray(plan.equipment) ? plan.equipment : [],
        exercises: Array.isArray(plan.exercises) ? plan.exercises : []
      }])
    )
  };
}

function normalizeEvent(rawEvent, context, filters = {}) {
  const authUserId = currentAuthUserId();
  const eventParticipants = context.participants.filter(
    (participant) => String(participant.event_id) === String(rawEvent.id)
  );
  const participants = eventParticipants.filter((participant) =>
    ['going', 'completed'].includes(String(participant.status || ''))
  );
  const checkedInParticipants = eventParticipants.filter((participant) =>
    Boolean(participant.checked_in_at)
  );
  const ownParticipation =
    eventParticipants.find((participant) => String(participant.user_id) === authUserId) || null;
  const presentParticipants = eventParticipants.filter((participant) => participant.status === 'completed');
  const concludedParticipants = eventParticipants.filter((participant) =>
    ['completed', 'no_show'].includes(String(participant.status || ''))
  );
  const refundableParticipants = eventParticipants.filter((participant) =>
    ['going', 'completed'].includes(String(participant.status || '')) &&
    Number(participant.stake_cents || 0) > 0 &&
    ['locked', 'verified'].includes(String(participant.stake_status || ''))
  );
  const ownJoinRequest = context.joinRequests.get(String(rawEvent.id)) || null;
  const organizer = context.organizers.get(String(rawEvent.creator_id)) || null;
  if (organizer) rememberProfile(organizer);
  const origin = resolveOrigin(filters);
  const distanceKm =
    origin && rawEvent.lat != null && rawEvent.lng != null
      ? Number(haversineKm(origin.lat, origin.lng, rawEvent.lat, rawEvent.lng).toFixed(1))
      : null;
  const startsAt = rawEvent.starts_at;
  const durationMinutes = Number(rawEvent.duration_minutes || 120);
  const hasPassed =
    Date.parse(startsAt) + durationMinutes * 60 * 1000 < Date.now();

  return {
    id: rawEvent.id,
    organizerId: rawEvent.creator_id,
    title: rawEvent.title,
    city: rawEvent.city,
    sport_id: rawEvent.sport_id,
    sport_name: rawEvent.sport?.name || 'Sport',
    level: rawEvent.required_level,
    event_datetime: startsAt,
    location_name: rawEvent.location_name,
    lat: rawEvent.lat,
    lng: rawEvent.lng,
    max_participants: Number(rawEvent.max_participants),
    duration_minutes: durationMinutes,
    participants_count: participants.length || 1,
    participants_checked_in_count: checkedInParticipants.length,
    participants_present_count: presentParticipants.length,
    participants_total_count: concludedParticipants.length || participants.length,
    participant_stats: {
      present: presentParticipants.length,
      total: concludedParticipants.length || participants.length
    },
    popularity: Math.max(20, participants.length * 14),
    description: rawEvent.description,
    scheda_id: rawEvent.scheda_id || null,
    workout_plan: rawEvent.scheda_id
      ? context.workoutPlans.get(String(rawEvent.scheda_id)) || null
      : null,
    organizer: {
      id: legacyProfileId(rawEvent.creator_id),
      auth_user_id: rawEvent.creator_id,
      name: organizer?.display_name || 'Organizzatore',
      reliability_score: Number(organizer?.reliability_score ?? 100)
    },
    participants_preview: participants
      .map((participant) => participant.profile?.display_name)
      .filter(Boolean)
      .slice(0, 8),
    etiquette: ['Puntualita', 'Comunicazione', 'Rispetto del gruppo'],
    route_info: rawEvent.route_info,
    deposit_cents: Number(rawEvent.deposit_cents ?? 500),
    minimum_presence_minutes: Number(rawEvent.minimum_presence_minutes ?? 45),
    verification_mode: rawEvent.verification_mode || 'both',
    geofence_radius_m: Number(rawEvent.geofence_radius_m ?? 250),
    completion_xp: Number(rawEvent.completion_xp ?? 50),
    review_bonus_xp: Number(rawEvent.review_bonus_xp ?? 25),
    status: rawEvent.status || 'scheduled',
    cancelled_at: rawEvent.cancelled_at || null,
    cancelled_by: rawEvent.cancelled_by || null,
    cancellation_reason: rawEvent.cancellation_reason || null,
    cancellation_note: rawEvent.cancellation_note || '',
    cancellation_is_late: Boolean(rawEvent.cancellation_is_late),
    refundable_participants_count: refundableParticipants.length,
    refundable_deposit_cents: refundableParticipants.reduce(
      (total, participant) => total + Math.max(0, Number(participant.stake_cents || 0)),
      0
    ),
    audience: rawEvent.audience || 'mixed',
    participation_protection: rawEvent.participation_protection !== false,
    visibility: rawEvent.visibility || 'public',
    join_policy: rawEvent.join_policy || 'open',
    is_personal: Boolean(rawEvent.is_personal),
    created_by: rawEvent.creator_id === authUserId ? 'me' : rawEvent.creator_id,
    creator_plan: 'free',
    featured_boost: false,
    distance_km: distanceKm,
    participant_status: ownParticipation?.status || null,
    is_going: ['going', 'completed'].includes(String(ownParticipation?.status || '')),
    is_join_pending: ownJoinRequest?.status === 'pending',
    join_request_status: ownJoinRequest?.status || null,
    is_saved: context.savedEventIds.has(String(rawEvent.id)),
    user_rsvp: ownParticipation
      ? {
          ...ownParticipation,
          participation_fee_cents: Number(ownParticipation.stake_cents ?? rawEvent.deposit_cents ?? 500),
          participation_fee_status: ownParticipation.stake_status || 'locked',
          cashback_percent: Number(ownParticipation.cashback_percent || 0),
          attendance:
            ownParticipation.status === 'completed'
              ? 'attended'
              : ownParticipation.status === 'no_show'
                ? 'no_show'
                : null,
          earned_xp:
            ownParticipation.status === 'completed'
              ? Number(rawEvent.completion_xp ?? 50) + (ownParticipation.review_bonus_awarded ? Number(rawEvent.review_bonus_xp ?? 25) : 0)
              : 0
        }
      : null,
    group_chat_unread_count: 0,
    has_new_group_messages: false,
    has_passed: hasPassed,
    can_confirm_attendance: false,
    source: 'supabase'
  };
}

async function fetchEvents(filters = {}) {
  const client = requireSupabase();
  let query = client
    .from('events')
    .select('*,sport:sports(id,slug,name)')
    .order('starts_at', { ascending: true });

  if (filters.includeCancelled !== true) {
    query = query.neq('status', 'cancelled');
  }

  if (filters.includePast !== true) {
    query = query.gte('starts_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString());
  }

  const { data, error } = await query;
  throwIfError(error);
  const context = await loadEventContext(client, data, { includeWorkoutPlans: true });
  const authUserId = currentAuthUserId();
  const visibleEvents = (data || []).filter((event) => {
    if (event.visibility !== 'private') return true;
    if (event.creator_id === authUserId) return true;
    const participant = context.participants.some(
      (item) => String(item.event_id) === String(event.id) && String(item.user_id) === authUserId
    );
    return participant || context.joinRequests.has(String(event.id));
  });
  return filterAndSortEvents(
    visibleEvents.map((event) => normalizeEvent(event, context, filters)),
    filters
  );
}

async function fetchEvent(id, filters = {}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('events')
    .select('*,sport:sports(id,slug,name)')
    .eq('id', String(id))
    .single();
  throwIfError(error);
  const context = await loadEventContext(client, [data], { includeWorkoutPlans: true });
  return normalizeEvent(data, context, filters);
}

function createRemoteMethods(localApi) {
  return {
    async listEvents(filters = {}) {
      return fetchEvents(filters);
    },

    async getEvent(id, options = {}) {
      return fetchEvent(id, options);
    },

    async createEvent(payload) {
      const client = requireSupabase();
      const creatorId = requireAuthUserId();
      await ensureMyProfile(client);
      await assertProfileVerified('creare un evento.');
      const { data, error } = await client
        .from('events')
        .insert({
          creator_id: creatorId,
          sport_id: Number(payload.sport_id),
          title: normalizeText(payload.title),
          description: normalizeText(payload.description),
          city: normalizeText(payload.city),
          location_name: normalizeText(payload.location_name),
          lat: payload.lat ?? null,
          lng: payload.lng ?? null,
          starts_at: new Date(payload.event_datetime).toISOString(),
          duration_minutes: Number(payload.duration_minutes || 120),
          max_participants: Number(payload.max_participants),
          required_level: payload.level || 'beginner',
          route_info: payload.route_info || null,
          deposit_cents: Number(payload.deposit_cents ?? 500),
          minimum_presence_minutes: Number(payload.minimum_presence_minutes ?? 45),
          verification_mode: payload.verification_mode || 'both',
          geofence_radius_m: Number(payload.geofence_radius_m ?? 250),
          completion_xp: Number(payload.completion_xp ?? 50),
          review_bonus_xp: Number(payload.review_bonus_xp ?? 25),
          audience: payload.audience || 'mixed',
          participation_protection: payload.participation_protection !== false,
          visibility: payload.visibility || 'public',
          join_policy: payload.join_policy || 'open',
          is_personal: Boolean(payload.is_personal),
          scheda_id: payload.scheda_id || null
        })
        .select('id')
        .single();
      throwIfError(error);
      return fetchEvent(data.id);
    },

    async updateEventCoordinates(eventId, coordinates = {}) {
      const client = requireSupabase();
      const creatorId = requireAuthUserId();
      const lat = Number(coordinates.lat);
      const lng = Number(coordinates.lng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error('Latitudine evento non valida');
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        throw new Error('Longitudine evento non valida');
      }

      const { data, error } = await client
        .from('events')
        .update({ lat, lng })
        .eq('id', String(eventId))
        .eq('creator_id', creatorId)
        .select('id,lat,lng')
        .maybeSingle();
      throwIfError(error);
      return data ? { ...data, updated: true } : { id: eventId, lat, lng, updated: false };
    },

    async joinEvent(id, payload = {}) {
      const client = requireSupabase();
      await ensureMyProfile(client);
      await assertProfileVerified('partecipare a un evento.');
      const eventResult = await client
        .from('events')
        .select('id,join_policy,is_personal')
        .eq('id', String(id))
        .single();
      throwIfError(eventResult.error);
      if (eventResult.data?.is_personal) {
        throw new Error('Questo evento e un promemoria personale');
      }
      const rpcName = eventResult.data?.join_policy === 'approval' ? 'request_event_join' : 'join_event';
      const { data, error } = await client.rpc(rpcName, {
        target_event_id: String(id),
        participant_skill_level: payload.skill_level || 'beginner',
        participant_note: normalizeText(payload.note)
      });
      throwIfError(error);
      return data;
    },

    async listEventJoinRequests(eventId) {
      const client = requireSupabase();
      requireAuthUserId();
      const { data, error } = await client
        .from('event_join_requests')
        .select(
          'event_id,user_id,status,skill_level,note,requested_at,profile:profiles!event_join_requests_user_id_fkey(id,display_name,avatar_url,bio,reliability_score)'
        )
        .eq('event_id', String(eventId))
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });
      throwIfError(error);
      return (data || []).map((request) => {
        rememberProfile(request.profile);
        return {
          ...request,
          user_id: legacyProfileId(request.user_id),
          auth_user_id: request.user_id,
          display_name: request.profile?.display_name || 'Partecipante',
          avatar_url: request.profile?.avatar_url || '',
          bio: request.profile?.bio || ''
        };
      });
    },

    async approveEventJoinRequest(eventId, userId) {
      const client = requireSupabase();
      const targetUserId = resolveProfileUuid(userId);
      if (!targetUserId) throw new Error('Partecipante non valido');
      const { data, error } = await client.rpc('approve_event_join_request', {
        target_event_id: String(eventId),
        target_user_id: targetUserId
      });
      throwIfError(error);
      return data;
    },

    async declineEventJoinRequest(eventId, userId) {
      const client = requireSupabase();
      const targetUserId = resolveProfileUuid(userId);
      if (!targetUserId) throw new Error('Partecipante non valido');
      const { data, error } = await client.rpc('decline_event_join_request', {
        target_event_id: String(eventId),
        target_user_id: targetUserId
      });
      throwIfError(error);
      return data;
    },

    async completePersonalEvent(eventId) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('complete_personal_event', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return data;
    },

    async leaveEvent(id) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('leave_event', {
        target_event_id: String(id)
      });
      throwIfError(error);
      return data;
    },

    async cancelEvent(id, { reasonCode, note = '' } = {}) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('cancel_event', {
        target_event_id: String(id),
        reason_code: normalizeText(reasonCode),
        organizer_note: normalizeText(note)
      });
      throwIfError(error);
      return data;
    },

    async startEventCheckInSession(eventId) {
      const client = requireSupabase();
      await assertProfileVerified('gestire il check-in.');
      const { data, error } = await client.rpc('start_event_checkin', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return withCheckInQr(data);
    },

    async getEventCheckInSession(eventId) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('get_event_checkin_session', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return withCheckInQr(data);
    },

    async checkInToEvent({ eventId, token }) {
      const client = requireSupabase();
      await assertProfileVerified('effettuare il check-in.');
      const submittedToken = (() => {
        const raw = normalizeText(token);
        if (!raw) return '';
        try {
          const decoded = decodeURIComponent(raw);
          const parsed = JSON.parse(decoded);
          return normalizeText(parsed?.token);
        } catch {
          return raw;
        }
      })();
      const { data, error } = await client.rpc('check_in_to_event', {
        target_event_id: String(eventId),
        submitted_token: submittedToken
      });
      throwIfError(error);
      return data;
    },

    async listEventCheckInParticipants(eventId) {
      const client = requireSupabase();
      const authUserId = requireAuthUserId();
      const { data, error } = await client.rpc('list_event_checkin_participants', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return (data || []).map((participant) => ({
        user_id: legacyProfileId(participant.user_id),
        auth_user_id: participant.user_id,
        display_name: participant.display_name || 'Partecipante',
        avatar_url: participant.avatar_url || '',
        checked_in_at: participant.checked_in_at,
        friendship_status: participant.user_id === authUserId ? 'self' : 'none'
      }));
    },

    async getEventParticipationProgress(eventId) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('get_event_participation_progress', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return data;
    },

    async scanEventParticipantQr({
      eventId,
      token,
      lat = null,
      lng = null,
      accuracyM = null
    }) {
      const client = requireSupabase();
      await assertProfileVerified('scansionare i partecipanti.');
      const submittedToken = (() => {
        const raw = normalizeText(token);
        if (!raw) return '';
        try {
          const parsed = JSON.parse(raw);
          return normalizeText(parsed?.token);
        } catch {
          try {
            const decoded = decodeURIComponent(raw);
            const parsed = JSON.parse(decoded);
            return normalizeText(parsed?.token);
          } catch {
            try {
              const url = new URL(raw);
              return normalizeText(url.searchParams.get('token'));
            } catch {
              return raw;
            }
          }
        }
      })();
      const { data, error } = await client.rpc('scan_event_participant_qr', {
        target_event_id: String(eventId),
        submitted_token: submittedToken,
        organizer_lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
        organizer_lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
        organizer_accuracy_m: Number.isFinite(Number(accuracyM)) ? Number(accuracyM) : null
      });
      throwIfError(error);
      const alreadyChecked = Boolean(data?.already_checked || data?.status === 'already_checked');
      return {
        ...data,
        xp_awarded: alreadyChecked ? 0 : 25,
        mot_awarded: alreadyChecked ? 0 : 5
      };
    },

    async issueEventHostQr(eventId) {
      const client = requireSupabase();
      await assertProfileVerified('mostrare il QR organizer.');
      const { data, error } = await client.rpc('issue_event_host_qr', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return data;
    },

    async scanEventHostQr({ eventId, token }) {
      const client = requireSupabase();
      await assertProfileVerified('effettuare il check-in.');
      const submittedToken = (() => {
        const raw = normalizeText(token);
        if (!raw) return '';
        try {
          const parsed = JSON.parse(raw);
          return normalizeText(parsed?.token);
        } catch {
          try {
            const decoded = decodeURIComponent(raw);
            const parsed = JSON.parse(decoded);
            return normalizeText(parsed?.token);
          } catch {
            return raw;
          }
        }
      })();
      const { data, error } = await client.rpc('scan_event_host_qr', {
        target_event_id: String(eventId),
        submitted_token: submittedToken
      });
      throwIfError(error);
      return data;
    },

    async recordEventPresence({
      eventId,
      lat,
      lng,
      accuracyM = null,
      speedMps = null
    }) {
      const client = requireSupabase();
      await assertProfileVerified('registrare la presenza.');
      const { data, error } = await client.rpc('record_event_presence', {
        target_event_id: String(eventId),
        sample_lat: Number.isFinite(Number(lat)) && lat !== null ? Number(lat) : null,
        sample_lng: Number.isFinite(Number(lng)) && lng !== null ? Number(lng) : null,
        sample_accuracy_m: Number.isFinite(Number(accuracyM)) ? Number(accuracyM) : null,
        sample_speed_mps: Number.isFinite(Number(speedMps)) ? Number(speedMps) : null
      });
      throwIfError(error);
      return data;
    },

    async startEventGpsCheckIn({ eventId, lat, lng, accuracyM = null }) {
      const client = requireSupabase();
      await assertProfileVerified('verificare la presenza con la posizione.');
      const { data, error } = await client.rpc('start_event_gps_checkin', {
        target_event_id: String(eventId),
        sample_lat: Number(lat),
        sample_lng: Number(lng),
        sample_accuracy_m: Number.isFinite(Number(accuracyM)) ? Number(accuracyM) : null
      });
      throwIfError(error);
      return data;
    },

    async startEventWorkout(eventId) {
      const client = requireSupabase();
      await assertProfileVerified('avviare l allenamento.');
      const { data, error } = await client.rpc('start_event_workout', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return data;
    },

    async recordEventWorkoutProgress(eventId, progressPercent) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('record_event_workout_progress', {
        target_event_id: String(eventId),
        progress_percent_value: Math.max(0, Math.min(100, Number(progressPercent) || 0))
      });
      throwIfError(error);
      return data;
    },

    async completeEventWorkout(eventId) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('complete_event_workout', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return data;
    },

    async listEventValidationStatus(eventId) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('list_event_validation_status', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return (data || []).map((participant) => ({
        ...participant,
        user_id: legacyProfileId(participant.user_id),
        auth_user_id: participant.user_id
      }));
    },

    async submitEventReview({
      eventId,
      partnerRating,
      organizerPunctuality,
      descriptionAccuracy,
      wouldJoinAgain,
      note = ''
    }) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('submit_event_review', {
        target_event_id: String(eventId),
        partner_stars: Number(partnerRating),
        organizer_stars: Number(organizerPunctuality),
        description_stars: Number(descriptionAccuracy),
        join_again: Boolean(wouldJoinAgain),
        review_note: normalizeText(note)
      });
      throwIfError(error);
      return data;
    },

    async finalizeEventOutcomes(eventId) {
      const client = requireSupabase();
      const { data, error } = await client.rpc('finalize_event_outcomes', {
        target_event_id: String(eventId)
      });
      throwIfError(error);
      return data;
    },

    async saveEvent(id) {
      const client = requireSupabase();
      const userId = requireAuthUserId();
      const { error } = await client
        .from('saved_events')
        .upsert({ user_id: userId, event_id: String(id) }, { onConflict: 'user_id,event_id' });
      throwIfError(error);
      return { success: true, event_id: id };
    },

    async unsaveEvent(id) {
      const client = requireSupabase();
      const userId = requireAuthUserId();
      const { error } = await client
        .from('saved_events')
        .delete()
        .eq('user_id', userId)
        .eq('event_id', String(id));
      throwIfError(error);
      return { success: true, event_id: id };
    },

    async listSports() {
      const client = requireSupabase();
      const { data, error } = await client.from('sports').select('id,slug,name').order('id');
      throwIfError(error);
      return data || [];
    },

    async getLocalProfile() {
      if (!currentAuthUserId()) {
        return localApi.getLocalProfile();
      }
      const client = requireSupabase();
      const userId = requireAuthUserId();
      const [{ data, error }, participantResult] = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).single(),
        client.from('event_participants').select('status').eq('user_id', userId)
      ]);
      if (error?.code === 'PGRST116') {
        return ensureMyProfile(client);
      }
      throwIfError(error);
      throwIfError(participantResult.error);
      rememberProfile(data);
      let localStats = {};
      try {
        localStats = await localApi.getLocalProfile();
      } catch {
        localStats = {};
      }
      const participantRows = participantResult.data || [];
      const attended = participantRows.filter((item) => item.status === 'completed').length;
      const noShow = participantRows.filter((item) => item.status === 'no_show').length;
      const cancelled = participantRows.filter((item) => item.status === 'cancelled').length;
      return {
        ...localStats,
        ...data,
        name: data.display_name,
        reliability: Number(data.reliability_score ?? localStats.reliability ?? 100),
        attended,
        no_show: noShow,
        cancelled,
        chat_slots: localStats.chat_slots || []
      };
    },

    async getProfile(userId) {
      const client = requireSupabase();
      const uuid = resolveProfileUuid(userId);
      if (!uuid) return localApi.getProfile(userId);
      const cached = profileByUuid.get(uuid);
      const result = cached
        ? { data: cached, error: null }
        : await client.from('profiles').select('*').eq('id', uuid).single();
      throwIfError(result.error);
      const profile = rememberProfile(result.data);
      return {
        ...profile,
        name: profile.display_name,
        sports_practiced: [],
        availability: [],
        goal: profile.bio || 'Allenarsi insieme e migliorare.',
        no_show_count: 0
      };
    },

    async updateLocalProfile(payload = {}) {
      const client = requireSupabase();
      const userId = requireAuthUserId();
      const updates = {};
      if (payload.display_name != null) {
        updates.display_name = normalizeText(payload.display_name).slice(0, 40);
      }
      if (payload.bio != null) updates.bio = normalizeText(payload.bio).slice(0, 600);
      if (payload.avatar_url != null) updates.avatar_url = normalizeText(payload.avatar_url);
      if (payload.cover_url != null) updates.cover_url = normalizeText(payload.cover_url);
      if (payload.city != null) updates.city = normalizeText(payload.city).slice(0, 80);
      if (payload.level != null) updates.level = payload.level;
      const { data, error } = await client
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      throwIfError(error);
      return rememberProfile(data);
    },

    async getAccountProfileByUserId(userId) {
      const client = requireSupabase();
      const uuid = resolveProfileUuid(userId);
      if (!uuid) return localApi.getAccountProfileByUserId(userId);
      if (profileByUuid.has(uuid)) return profileByUuid.get(uuid);
      const { data, error } = await client.from('profiles').select('*').eq('id', uuid).single();
      throwIfError(error);
      return rememberProfile(data);
    },

    async getEventCreationStats() {
      if (!currentAuthUserId()) {
        return { month: '', created_this_month: 0 };
      }
      const client = requireSupabase();
      const userId = requireAuthUserId();
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { count, error } = await client
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', userId)
        .gte('created_at', start.toISOString());
      throwIfError(error);
      return {
        month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
        created_this_month: Number(count || 0)
      };
    },

    async listAgenda(view = 'today', filters = {}) {
      const dateRange = view === 'today' ? 'today' : view === 'week' ? 'week' : 'month';
      const events = await fetchEvents({ ...filters, dateRange, sortBy: 'soonest' });
      return aggregateByWindow(
        events.filter((event) => event.is_saved || event.is_going),
        view
      );
    },

    async listEventGroupMessages(eventId) {
      const client = requireSupabase();
      requireAuthUserId();
      const [messagesResult, eventResult] = await Promise.all([
        client
          .from('event_messages')
          .select(
            'id,event_id,sender_id,body,created_at,sender:profiles!event_messages_sender_id_fkey(id,display_name,avatar_url)'
          )
          .eq('event_id', String(eventId))
          .order('created_at', { ascending: true })
          .limit(400),
        client
          .from('events')
          .select('status')
          .eq('id', String(eventId))
          .single()
      ]);
      throwIfError(messagesResult.error);
      throwIfError(eventResult.error);
      const data = messagesResult.data;
      const items = (data || []).map((message) => {
        rememberProfile(message.sender);
        return {
          id: String(message.id),
          event_id: message.event_id,
          sender_user_id: legacyProfileId(message.sender_id),
          sender_auth_user_id: message.sender_id,
          sender_name: message.sender?.display_name || 'Partecipante',
          sender_avatar_url: message.sender?.avatar_url || '',
          text: message.body,
          created_at: message.created_at
        };
      });
      return { event_id: eventId, can_send: eventResult.data?.status !== 'cancelled', items };
    },

    async sendEventGroupMessage({ eventId, text }) {
      const client = requireSupabase();
      const senderId = requireAuthUserId();
      await assertProfileVerified('scrivere nella chat evento.');
      const body = normalizeText(text);
      if (!body) throw new Error('Scrivi un messaggio prima di inviare');
      const eventResult = await client
        .from('events')
        .select('status')
        .eq('id', String(eventId))
        .single();
      throwIfError(eventResult.error);
      if (eventResult.data?.status === 'cancelled') {
        throw new Error('La chat di questo evento e in sola lettura');
      }
      const { data, error } = await client
        .from('event_messages')
        .insert({ event_id: String(eventId), sender_id: senderId, body })
        .select(
          'id,event_id,sender_id,body,created_at,sender:profiles!event_messages_sender_id_fkey(id,display_name,avatar_url)'
        )
        .single();
      throwIfError(error);
      rememberProfile(data.sender);
      return {
        id: String(data.id),
        event_id: data.event_id,
        sender_user_id: legacyProfileId(data.sender_id),
        sender_auth_user_id: data.sender_id,
        sender_name: data.sender?.display_name || 'Partecipante',
        sender_avatar_url: data.sender?.avatar_url || '',
        text: data.body,
        created_at: data.created_at
      };
    },

    async listNotifications() {
      const client = requireSupabase();
      const userId = requireAuthUserId();
      const { data, error } = await client
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(120);
      throwIfError(error);
      return (data || []).map((item) => ({
        ...item,
        message: item.body,
        read: Boolean(item.read_at)
      }));
    },

    async markNotificationRead(id) {
      const client = requireSupabase();
      const userId = requireAuthUserId();
      const { error } = await client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      throwIfError(error);
      return { success: true };
    },

    async markAllNotificationsRead() {
      const client = requireSupabase();
      const userId = requireAuthUserId();
      const { error } = await client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);
      throwIfError(error);
      return { success: true };
    },

    async clearNotifications() {
      const client = requireSupabase();
      const userId = requireAuthUserId();
      const { error } = await client.from('notifications').delete().eq('user_id', userId);
      throwIfError(error);
      return { success: true };
    },

    async getUnreadCount() {
      if (!currentAuthUserId()) return 0;
      const client = requireSupabase();
      const { count, error } = await client
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', currentAuthUserId())
        .is('read_at', null);
      throwIfError(error);
      return Number(count || 0);
    },

    async getXpState(userId) {
      if (!currentAuthUserId()) {
        return localApi.getXpState(userId);
      }
      const client = requireSupabase();
      const { data, error } = await client.rpc('get_my_xp_state');
      throwIfError(error);
      return data;
    }
  };
}

export function createSupabaseApi(localApi) {
  if (!isSupabaseConfigured) {
    if (!Capacitor.isNativePlatform()) return localApi;

    const requireSecureBackend = async () => {
      throw new Error('Connessione sicura non disponibile. Aggiorna o riavvia Motrice prima di eseguire questa azione.');
    };

    return {
      ...localApi,
      createEvent: requireSecureBackend,
      joinEvent: requireSecureBackend,
      approveEventJoinRequest: requireSecureBackend,
      declineEventJoinRequest: requireSecureBackend,
      cancelEvent: requireSecureBackend,
      completePersonalEvent: requireSecureBackend,
      startEventCheckInSession: requireSecureBackend,
      checkInToEvent: requireSecureBackend,
      scanEventParticipantQr: requireSecureBackend,
      recordEventPresence: requireSecureBackend,
      startEventGpsCheckIn: requireSecureBackend,
      startEventWorkout: requireSecureBackend,
      recordEventWorkoutProgress: requireSecureBackend,
      completeEventWorkout: requireSecureBackend,
      submitEventReview: requireSecureBackend,
      finalizeEventOutcomes: requireSecureBackend,
      sendEventGroupMessage: requireSecureBackend
    };
  }
  return {
    ...localApi,
    ...createRemoteMethods(localApi)
  };
}

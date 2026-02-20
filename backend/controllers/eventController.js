const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const eventModel = require('../models/eventModel');
const eventMemberModel = require('../models/eventMemberModel');
const eventService = require('../services/eventService');
const { haversineKm } = require('../utils/geo');
const {
  LEVELS,
  EVENT_STATUSES,
  ATTENDANCE_STATUSES,
  assertCoordinates,
  assertDateString,
  assertEnum,
  assertInteger,
  assertRequired
} = require('../utils/validators');

function normalizeEvent(event) {
  return {
    ...event,
    going_count: Number(event.going_count || 0),
    waitlist_count: Number(event.waitlist_count || 0),
    creator_reliability: Number(event.creator_reliability || 0)
  };
}

const listEvents = asyncHandler(async (req, res) => {
  const filters = {
    sportId: req.query.sport_id ? assertInteger(req.query.sport_id, 'sport_id', 1) : null,
    requiredLevel: req.query.level || null,
    dateFrom: req.query.date_from || null,
    dateTo: req.query.date_to || null
  };

  if (filters.requiredLevel) {
    assertEnum(filters.requiredLevel, LEVELS, 'level');
  }

  if (filters.dateFrom) assertDateString(filters.dateFrom, 'date_from');
  if (filters.dateTo) assertDateString(filters.dateTo, 'date_to');

  let events = await eventModel.listEvents(filters);
  events = events.map(normalizeEvent);

  const lat = req.query.lat ? Number(req.query.lat) : null;
  const lng = req.query.lng ? Number(req.query.lng) : null;
  const distanceKm = req.query.distance_km ? Number(req.query.distance_km) : null;

  if (lat !== null || lng !== null || distanceKm !== null) {
    const validated = assertCoordinates(lat, lng);

    if (distanceKm === null || Number.isNaN(distanceKm) || distanceKm <= 0) {
      throw new HttpError(400, 'distance_km must be a positive number when distance filter is used');
    }

    events = events
      .filter((event) => event.lat !== null && event.lng !== null)
      .map((event) => ({
        ...event,
        distance_km: Number(haversineKm(validated.lat, validated.lng, event.lat, event.lng).toFixed(2))
      }))
      .filter((event) => event.distance_km <= distanceKm)
      .sort((a, b) => a.distance_km - b.distance_km || Date.parse(a.event_datetime) - Date.parse(b.event_datetime));
  }

  res.json(events);
});

const getEventById = asyncHandler(async (req, res) => {
  const eventId = assertInteger(req.params.id, 'event_id', 1);
  const event = await eventService.getEventOrThrow(eventId);
  const members = await eventMemberModel.listEventMembers(eventId);
  res.json({ ...normalizeEvent(event), members });
});

const createEvent = asyncHandler(async (req, res) => {
  assertRequired(
    ['sport_id', 'location_name', 'event_datetime', 'max_participants', 'required_level', 'description'],
    req.body
  );

  const sportId = assertInteger(req.body.sport_id, 'sport_id', 1);
  const maxParticipants = assertInteger(req.body.max_participants, 'max_participants', 1);
  assertEnum(req.body.required_level, LEVELS, 'required_level');
  assertDateString(req.body.event_datetime, 'event_datetime');

  if (!req.body.location_name || req.body.location_name.trim().length < 2) {
    throw new HttpError(400, 'location_name must be at least 2 characters');
  }

  const coordinates = assertCoordinates(req.body.lat, req.body.lng);

  const event = await eventService.createEventAndEnrollOwner({
    creatorId: req.user.id,
    sportId,
    locationName: req.body.location_name.trim(),
    lat: coordinates.lat,
    lng: coordinates.lng,
    eventDateTime: req.body.event_datetime,
    maxParticipants,
    requiredLevel: req.body.required_level,
    description: String(req.body.description || '').trim()
  });

  res.status(201).json(normalizeEvent(event));
});

const joinEvent = asyncHandler(async (req, res) => {
  const eventId = assertInteger(req.params.id, 'event_id', 1);
  const result = await eventService.joinEvent({ eventId, userId: req.user.id });
  res.json({ ...normalizeEvent(result.event), membership_status: result.joinStatus });
});

const leaveEvent = asyncHandler(async (req, res) => {
  const eventId = assertInteger(req.params.id, 'event_id', 1);
  const event = await eventService.leaveEvent({ eventId, userId: req.user.id });
  res.json(normalizeEvent(event));
});

const confirmAttendance = asyncHandler(async (req, res) => {
  assertRequired(['user_id', 'status'], req.body);

  const eventId = assertInteger(req.params.id, 'event_id', 1);
  const targetUserId = assertInteger(req.body.user_id, 'user_id', 1);
  assertEnum(req.body.status, ATTENDANCE_STATUSES, 'status');

  const event = await eventService.markAttendance({
    eventId,
    ownerId: req.user.id,
    targetUserId,
    status: req.body.status
  });

  res.json(normalizeEvent(event));
});

const patchEventStatus = asyncHandler(async (req, res) => {
  assertRequired(['status'], req.body);

  const eventId = assertInteger(req.params.id, 'event_id', 1);
  assertEnum(req.body.status, EVENT_STATUSES, 'status');

  const event = await eventService.setEventStatus({
    eventId,
    ownerId: req.user.id,
    status: req.body.status
  });

  res.json(normalizeEvent(event));
});

const deleteEvent = asyncHandler(async (req, res) => {
  const eventId = assertInteger(req.params.id, 'event_id', 1);
  await eventService.deleteEvent({ eventId, ownerId: req.user.id });
  res.status(204).send();
});

module.exports = {
  listEvents,
  getEventById,
  createEvent,
  joinEvent,
  leaveEvent,
  confirmAttendance,
  patchEventStatus,
  deleteEvent
};

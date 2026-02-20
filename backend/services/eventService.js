const { transaction } = require('../config/db');
const HttpError = require('../utils/httpError');
const eventModel = require('../models/eventModel');
const eventMemberModel = require('../models/eventMemberModel');
const reliabilityService = require('./reliabilityService');

async function getEventOrThrow(eventId) {
  const event = await eventModel.getEventById(eventId);
  if (!event) {
    throw new HttpError(404, 'Event not found');
  }
  return event;
}

async function createEventAndEnrollOwner(payload) {
  return transaction(async () => {
    const created = await eventModel.createEvent(payload);
    await eventMemberModel.addMember({
      eventId: created.id,
      userId: payload.creatorId,
      status: 'going'
    });
    return getEventOrThrow(created.id);
  });
}

async function joinEvent({ eventId, userId }) {
  return transaction(async () => {
    const event = await getEventOrThrow(eventId);

    if (event.status !== 'scheduled') {
      throw new HttpError(400, 'Only scheduled events can be joined');
    }

    const existingMember = await eventMemberModel.getMember(eventId, userId);
    if (existingMember && ['going', 'waitlist'].includes(existingMember.status)) {
      return { event: await getEventOrThrow(eventId), joinStatus: existingMember.status };
    }

    const goingStats = await eventMemberModel.countByStatus(eventId, 'going');
    const goingCount = Number(goingStats.total || 0);

    const nextStatus = goingCount >= event.max_participants ? 'waitlist' : 'going';

    await eventMemberModel.addMember({ eventId, userId, status: nextStatus });
    return { event: await getEventOrThrow(eventId), joinStatus: nextStatus };
  });
}

async function leaveEvent({ eventId, userId }) {
  return transaction(async () => {
    const event = await getEventOrThrow(eventId);
    if (event.status !== 'scheduled') {
      throw new HttpError(400, 'Only scheduled events can be left');
    }

    const member = await eventMemberModel.getMember(eventId, userId);
    if (!member || member.status === 'cancelled') {
      throw new HttpError(400, 'User is not an active member of this event');
    }

    const wasGoing = member.status === 'going';
    await eventMemberModel.updateMemberStatus({ eventId, userId, status: 'cancelled' });

    if (wasGoing) {
      const nextWaitlisted = await eventMemberModel.findNextWaitlisted(eventId);
      if (nextWaitlisted) {
        await eventMemberModel.updateMemberStatus({
          eventId,
          userId: nextWaitlisted.user_id,
          status: 'going'
        });
      }
    }

    return getEventOrThrow(eventId);
  });
}

async function markAttendance({ eventId, ownerId, targetUserId, status }) {
  return transaction(async () => {
    const event = await getEventOrThrow(eventId);

    if (event.creator_id !== ownerId) {
      throw new HttpError(403, 'Only event creator can confirm attendance');
    }

    const member = await eventMemberModel.getMember(eventId, targetUserId);
    if (!member) {
      throw new HttpError(404, 'Target user is not a member of this event');
    }

    if (!['going', 'completed', 'no_show'].includes(member.status)) {
      throw new HttpError(400, 'Attendance can only be confirmed for active participants');
    }

    await eventMemberModel.updateMemberStatus({
      eventId,
      userId: targetUserId,
      status,
      confirmedBy: ownerId
    });

    await reliabilityService.recalculateReliability(targetUserId);

    return getEventOrThrow(eventId);
  });
}

async function setEventStatus({ eventId, ownerId, status }) {
  return transaction(async () => {
    const event = await getEventOrThrow(eventId);

    if (event.creator_id !== ownerId) {
      throw new HttpError(403, 'Only event creator can update event status');
    }

    await eventModel.updateEventStatus(eventId, status);

    if (status === 'cancelled') {
      await eventMemberModel.setEventMemberStatusBulk(eventId, ['going', 'waitlist'], 'cancelled');
    }

    return getEventOrThrow(eventId);
  });
}

async function deleteEvent({ eventId, ownerId }) {
  return transaction(async () => {
    const event = await getEventOrThrow(eventId);

    if (event.creator_id !== ownerId) {
      throw new HttpError(403, 'Only event creator can delete event');
    }

    await eventModel.deleteEvent(eventId);
  });
}

module.exports = {
  createEventAndEnrollOwner,
  joinEvent,
  leaveEvent,
  markAttendance,
  setEventStatus,
  deleteEvent,
  getEventOrThrow
};

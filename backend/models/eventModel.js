const { all, get, run } = require('../config/db');

function createEvent({ creatorId, sportId, locationName, lat, lng, eventDateTime, maxParticipants, requiredLevel, description }) {
  return run(
    `INSERT INTO events
      (creator_id, sport_id, location_name, lat, lng, event_datetime, max_participants, required_level, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [creatorId, sportId, locationName, lat, lng, eventDateTime, maxParticipants, requiredLevel, description]
  );
}

function getEventById(eventId) {
  return get(
    `SELECT
      e.id,
      e.creator_id,
      e.sport_id,
      s.name AS sport_name,
      s.slug AS sport_slug,
      e.location_name,
      e.lat,
      e.lng,
      e.event_datetime,
      e.max_participants,
      e.required_level,
      e.description,
      e.status,
      e.created_at,
      e.updated_at,
      u.name AS creator_name,
      u.reliability_score AS creator_reliability,
      SUM(CASE WHEN em.status = 'going' THEN 1 ELSE 0 END) AS going_count,
      SUM(CASE WHEN em.status = 'waitlist' THEN 1 ELSE 0 END) AS waitlist_count
     FROM events e
     INNER JOIN users u ON u.id = e.creator_id
     INNER JOIN sports s ON s.id = e.sport_id
     LEFT JOIN event_members em ON em.event_id = e.id
     WHERE e.id = ?
     GROUP BY e.id`,
    [eventId]
  );
}

function listEvents({ sportId, requiredLevel, dateFrom, dateTo }) {
  const conditions = ["e.status = 'scheduled'", "datetime(e.event_datetime) >= datetime('now')"];
  const params = [];

  if (sportId) {
    conditions.push('e.sport_id = ?');
    params.push(sportId);
  }

  if (requiredLevel) {
    conditions.push('e.required_level = ?');
    params.push(requiredLevel);
  }

  if (dateFrom) {
    conditions.push('datetime(e.event_datetime) >= datetime(?)');
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push('datetime(e.event_datetime) <= datetime(?)');
    params.push(dateTo);
  }

  return all(
    `SELECT
      e.id,
      e.creator_id,
      e.sport_id,
      s.name AS sport_name,
      s.slug AS sport_slug,
      e.location_name,
      e.lat,
      e.lng,
      e.event_datetime,
      e.max_participants,
      e.required_level,
      e.description,
      e.status,
      e.created_at,
      e.updated_at,
      u.name AS creator_name,
      u.reliability_score AS creator_reliability,
      SUM(CASE WHEN em.status = 'going' THEN 1 ELSE 0 END) AS going_count,
      SUM(CASE WHEN em.status = 'waitlist' THEN 1 ELSE 0 END) AS waitlist_count
     FROM events e
     INNER JOIN users u ON u.id = e.creator_id
     INNER JOIN sports s ON s.id = e.sport_id
     LEFT JOIN event_members em ON em.event_id = e.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY e.id
     ORDER BY datetime(e.event_datetime) ASC`,
    params
  );
}

function updateEventStatus(eventId, status) {
  return run('UPDATE events SET status = ? WHERE id = ?', [status, eventId]);
}

function deleteEvent(eventId) {
  return run('DELETE FROM events WHERE id = ?', [eventId]);
}

module.exports = {
  createEvent,
  getEventById,
  listEvents,
  updateEventStatus,
  deleteEvent
};

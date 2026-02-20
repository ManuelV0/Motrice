const { all, get, run } = require('../config/db');

function addMember({ eventId, userId, status }) {
  return run(
    `INSERT INTO event_members (event_id, user_id, status)
     VALUES (?, ?, ?)
     ON CONFLICT(event_id, user_id)
     DO UPDATE SET status = excluded.status`,
    [eventId, userId, status]
  );
}

function getMember(eventId, userId) {
  return get(
    `SELECT id, event_id, user_id, status, attendance_confirmed_by, created_at, updated_at
     FROM event_members
     WHERE event_id = ? AND user_id = ?`,
    [eventId, userId]
  );
}

function countByStatus(eventId, status) {
  return get(
    `SELECT COUNT(*) AS total
     FROM event_members
     WHERE event_id = ? AND status = ?`,
    [eventId, status]
  );
}

function findNextWaitlisted(eventId) {
  return get(
    `SELECT id, user_id
     FROM event_members
     WHERE event_id = ? AND status = 'waitlist'
     ORDER BY created_at ASC
     LIMIT 1`,
    [eventId]
  );
}

function updateMemberStatus({ eventId, userId, status, confirmedBy = null }) {
  return run(
    `UPDATE event_members
     SET status = ?, attendance_confirmed_by = ?
     WHERE event_id = ? AND user_id = ?`,
    [status, confirmedBy, eventId, userId]
  );
}

function setEventMemberStatusBulk(eventId, fromStatuses, toStatus) {
  const placeholders = fromStatuses.map(() => '?').join(',');
  return run(
    `UPDATE event_members
     SET status = ?
     WHERE event_id = ? AND status IN (${placeholders})`,
    [toStatus, eventId, ...fromStatuses]
  );
}

function getUserAttendanceStats(userId) {
  return get(
    `SELECT
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
     FROM event_members
     WHERE user_id = ?`,
    [userId]
  );
}

function listEventMembers(eventId) {
  return all(
    `SELECT em.user_id, em.status, u.name, u.reliability_score
     FROM event_members em
     INNER JOIN users u ON u.id = em.user_id
     WHERE em.event_id = ?
     ORDER BY em.created_at ASC`,
    [eventId]
  );
}

module.exports = {
  addMember,
  getMember,
  countByStatus,
  findNextWaitlisted,
  updateMemberStatus,
  setEventMemberStatusBulk,
  getUserAttendanceStats,
  listEventMembers
};

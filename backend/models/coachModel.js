const { all, get, run } = require('../config/db');

function getCoachByUserId(userId) {
  return get('SELECT * FROM coach_profiles WHERE user_id = ?', [userId]);
}

function getCoachById(id) {
  return get('SELECT * FROM coach_profiles WHERE id = ?', [id]);
}

function upsertCoachApplication({
  userId,
  primarySportId,
  bio,
  contactEmail,
  hourlyRate,
  certificationFileName,
  certificationFilePath,
  certificationMimeType
}) {
  return run(
    `INSERT INTO coach_profiles
      (user_id, primary_sport_id, bio, contact_email, hourly_rate, certification_file_name, certification_file_path, certification_mime_type, status, review_notes, reviewed_at, reviewed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL)
     ON CONFLICT(user_id) DO UPDATE SET
      primary_sport_id = excluded.primary_sport_id,
      bio = excluded.bio,
      contact_email = excluded.contact_email,
      hourly_rate = excluded.hourly_rate,
      certification_file_name = excluded.certification_file_name,
      certification_file_path = excluded.certification_file_path,
      certification_mime_type = excluded.certification_mime_type,
      status = 'pending',
      review_notes = NULL,
      reviewed_at = NULL,
      reviewed_by = NULL`,
    [userId, primarySportId, bio, contactEmail, hourlyRate, certificationFileName, certificationFilePath, certificationMimeType]
  );
}

function listApprovedCoaches() {
  return all(
    `SELECT
      cp.id,
      cp.user_id,
      u.name,
      cp.primary_sport_id,
      ps.name AS primary_sport_name,
      ps.slug AS primary_sport_slug,
      cp.bio,
      cp.contact_email,
      cp.hourly_rate,
      cp.status,
      cp.created_at,
      cp.updated_at
     FROM coach_profiles cp
     INNER JOIN users u ON u.id = cp.user_id
     LEFT JOIN sports ps ON ps.id = cp.primary_sport_id
     WHERE cp.status = 'approved'
     ORDER BY cp.updated_at DESC`
  );
}

function getApprovedCoachPublicById(id) {
  return get(
    `SELECT
      cp.id,
      cp.user_id,
      u.name,
      cp.primary_sport_id,
      ps.name AS primary_sport_name,
      ps.slug AS primary_sport_slug,
      cp.bio,
      cp.contact_email,
      cp.hourly_rate,
      cp.status,
      cp.created_at,
      cp.updated_at
     FROM coach_profiles cp
     INNER JOIN users u ON u.id = cp.user_id
     LEFT JOIN sports ps ON ps.id = cp.primary_sport_id
     WHERE cp.id = ? AND cp.status = 'approved'`,
    [id]
  );
}

function listCoachSports(userId) {
  return all(
    `SELECT us.sport_id, s.name AS sport_name, s.slug AS sport_slug, us.level
     FROM user_sports us
     INNER JOIN sports s ON s.id = us.sport_id
     WHERE us.user_id = ?
     ORDER BY s.name ASC`,
    [userId]
  );
}

function listCoachTrainingLocations(userId, limit = 3) {
  return all(
    `SELECT
      e.id AS event_id,
      e.location_name,
      e.lat,
      e.lng,
      e.event_datetime
     FROM events e
     WHERE e.creator_id = ?
       AND e.lat IS NOT NULL
       AND e.lng IS NOT NULL
     ORDER BY datetime(e.event_datetime) DESC
     LIMIT ?`,
    [userId, limit]
  );
}

function listCoachApplications({ status = null } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('cp.status = ?');
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  return all(
    `SELECT
      cp.id,
      cp.user_id,
      u.name,
      u.email AS user_email,
      cp.primary_sport_id,
      ps.name AS primary_sport_name,
      ps.slug AS primary_sport_slug,
      cp.bio,
      cp.contact_email,
      cp.hourly_rate,
      cp.certification_file_name,
      cp.certification_file_path,
      cp.certification_mime_type,
      cp.status,
      cp.review_notes,
      cp.reviewed_at,
      cp.reviewed_by,
      cp.created_at,
      cp.updated_at
     FROM coach_profiles cp
     INNER JOIN users u ON u.id = cp.user_id
     LEFT JOIN sports ps ON ps.id = cp.primary_sport_id
     ${where}
     ORDER BY
      CASE cp.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
      datetime(cp.created_at) DESC`,
    params
  );
}

function getCoachApplicationById(id) {
  return get(
    `SELECT
      cp.id,
      cp.user_id,
      u.name,
      u.email AS user_email,
      cp.primary_sport_id,
      ps.name AS primary_sport_name,
      ps.slug AS primary_sport_slug,
      cp.bio,
      cp.contact_email,
      cp.hourly_rate,
      cp.certification_file_name,
      cp.certification_file_path,
      cp.certification_mime_type,
      cp.status,
      cp.review_notes,
      cp.reviewed_at,
      cp.reviewed_by,
      cp.created_at,
      cp.updated_at
     FROM coach_profiles cp
     INNER JOIN users u ON u.id = cp.user_id
     LEFT JOIN sports ps ON ps.id = cp.primary_sport_id
     WHERE cp.id = ?`,
    [id]
  );
}

function reviewCoachApplication({ coachId, status, reviewNotes, reviewedBy }) {
  return run(
    `UPDATE coach_profiles
     SET status = ?, review_notes = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
     WHERE id = ?`,
    [status, reviewNotes || null, reviewedBy, coachId]
  );
}

module.exports = {
  getCoachByUserId,
  getCoachById,
  upsertCoachApplication,
  listApprovedCoaches,
  getApprovedCoachPublicById,
  listCoachSports,
  listCoachTrainingLocations,
  listCoachApplications,
  getCoachApplicationById,
  reviewCoachApplication
};

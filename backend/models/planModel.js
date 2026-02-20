const { all, get, run } = require('../config/db');

function createPlanRequest({ coachId, clientUserId, goal, notes }) {
  return run(
    `INSERT INTO plan_requests (coach_id, client_user_id, goal, notes, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [coachId, clientUserId, goal, notes]
  );
}

function getPendingRequestForClientAndCoach({ coachId, clientUserId }) {
  return get(
    `SELECT *
     FROM plan_requests
     WHERE coach_id = ? AND client_user_id = ? AND status = 'pending'
     ORDER BY datetime(created_at) DESC
     LIMIT 1`,
    [coachId, clientUserId]
  );
}

function getPlanRequestById(id) {
  return get('SELECT * FROM plan_requests WHERE id = ?', [id]);
}

function listRequestsForCoach(coachId) {
  return all(
    `SELECT
      pr.id,
      pr.coach_id,
      pr.client_user_id,
      pr.goal,
      pr.notes,
      pr.status,
      pr.created_at,
      pr.updated_at,
      u.name AS client_name,
      u.email AS client_email,
      p.id AS plan_id,
      p.title AS plan_title,
      p.delivered_at
     FROM plan_requests pr
     INNER JOIN users u ON u.id = pr.client_user_id
     LEFT JOIN plans p ON p.request_id = pr.id
     WHERE pr.coach_id = ?
     ORDER BY
      CASE pr.status WHEN 'pending' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
      datetime(pr.created_at) DESC`,
    [coachId]
  );
}

function createPlan({ requestId, coachId, clientUserId, title, content }) {
  return run(
    `INSERT INTO plans (request_id, coach_id, client_user_id, title, content, coach_note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [requestId, coachId, clientUserId, title, content, '']
  );
}

function createPlanWithNote({ requestId, coachId, clientUserId, title, content, coachNote }) {
  return run(
    `INSERT INTO plans (request_id, coach_id, client_user_id, title, content, coach_note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [requestId, coachId, clientUserId, title, content, coachNote || '']
  );
}

function markRequestCompleted(requestId) {
  return run(`UPDATE plan_requests SET status = 'completed' WHERE id = ?`, [requestId]);
}

function getPlanByRequestId(requestId) {
  return get('SELECT * FROM plans WHERE request_id = ?', [requestId]);
}

function updatePlanByRequestId({ requestId, title, content, coachNote }) {
  return run(
    `UPDATE plans
     SET title = ?, content = ?, coach_note = ?, delivered_at = CURRENT_TIMESTAMP
     WHERE request_id = ?`,
    [title, content, coachNote || '', requestId]
  );
}

function getPlanById(planId) {
  return get('SELECT * FROM plans WHERE id = ?', [planId]);
}

function getPlanByIdWithOwnership(planId) {
  return get(
    `SELECT
      p.*,
      cp.user_id AS coach_user_id
     FROM plans p
     INNER JOIN coach_profiles cp ON cp.id = p.coach_id
     WHERE p.id = ?`,
    [planId]
  );
}

function createPlanAttachment({ planId, fileName, filePath, mimeType, fileSize }) {
  return run(
    `INSERT INTO plan_attachments (plan_id, file_name, file_path, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?)`,
    [planId, fileName, filePath, mimeType, fileSize]
  );
}

function listPlanAttachmentsByPlanId(planId) {
  return all(
    `SELECT id, plan_id, file_name, file_path, mime_type, file_size, created_at
     FROM plan_attachments
     WHERE plan_id = ?
     ORDER BY datetime(created_at) DESC`,
    [planId]
  );
}

function getPlanAttachmentById(attachmentId) {
  return get(
    `SELECT id, plan_id, file_name, file_path, mime_type, file_size, created_at
     FROM plan_attachments
     WHERE id = ?`,
    [attachmentId]
  );
}

function listPlansForClient(clientUserId) {
  return all(
    `SELECT
      p.id,
      p.request_id,
      p.title,
      p.content,
      p.coach_note,
      p.delivered_at,
      p.created_at,
      cp.id AS coach_id,
      u.name AS coach_name,
      cp.contact_email AS coach_contact_email,
      cp.hourly_rate,
      s.name AS coach_primary_sport_name,
      pr.goal AS request_goal,
      pr.notes AS request_notes
     FROM plans p
     INNER JOIN coach_profiles cp ON cp.id = p.coach_id
     INNER JOIN users u ON u.id = cp.user_id
     LEFT JOIN sports s ON s.id = cp.primary_sport_id
     INNER JOIN plan_requests pr ON pr.id = p.request_id
     WHERE p.client_user_id = ?
     ORDER BY datetime(p.delivered_at) DESC`,
    [clientUserId]
  );
}

function listPlansForCoach(coachId) {
  return all(
    `SELECT
      p.id,
      p.request_id,
      p.title,
      p.content,
      p.coach_note,
      p.delivered_at,
      p.created_at,
      p.client_user_id,
      u.name AS client_name,
      u.email AS client_email,
      pr.goal AS request_goal,
      pr.notes AS request_notes
     FROM plans p
     INNER JOIN users u ON u.id = p.client_user_id
     INNER JOIN plan_requests pr ON pr.id = p.request_id
     WHERE p.coach_id = ?
     ORDER BY datetime(p.delivered_at) DESC`,
    [coachId]
  );
}

module.exports = {
  createPlanRequest,
  getPendingRequestForClientAndCoach,
  getPlanRequestById,
  listRequestsForCoach,
  createPlan,
  createPlanWithNote,
  markRequestCompleted,
  getPlanByRequestId,
  updatePlanByRequestId,
  getPlanById,
  getPlanByIdWithOwnership,
  createPlanAttachment,
  listPlanAttachmentsByPlanId,
  getPlanAttachmentById,
  listPlansForClient,
  listPlansForCoach
};

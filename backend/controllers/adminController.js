const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const fs = require('fs');
const path = require('path');
const { assertInteger, assertRequired } = require('../utils/validators');
const coachModel = require('../models/coachModel');
const {
  getRejectionReasons,
  resolveReasonText,
  buildRejectionEmail,
  sendRejectionEmail
} = require('../services/rejectionMailer');

function normalizeApplication(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    candidate_name: row.name,
    candidate_email: row.user_email,
    primary_sport: row.primary_sport_id
      ? {
          sport_id: Number(row.primary_sport_id),
          sport_name: row.primary_sport_name,
          sport_slug: row.primary_sport_slug
        }
      : null,
    bio: row.bio,
    contact_email: row.contact_email,
    hourly_rate: Number(row.hourly_rate),
    certification_file_name: row.certification_file_name,
    certification_mime_type: row.certification_mime_type,
    status: row.status,
    review_notes: row.review_notes,
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewed_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

const listCoachApplications = asyncHandler(async (req, res) => {
  const statusFilter = req.query.status ? String(req.query.status).trim() : null;
  const validStatuses = new Set(['pending', 'approved', 'rejected']);

  if (statusFilter && !validStatuses.has(statusFilter)) {
    throw new HttpError(400, 'Invalid status filter');
  }

  const applications = await coachModel.listCoachApplications({ status: statusFilter });
  res.json(applications.map(normalizeApplication));
});

const listRejectionReasons = asyncHandler(async (req, res) => {
  res.json(getRejectionReasons());
});

const reviewCoachApplication = asyncHandler(async (req, res) => {
  const coachId = assertInteger(req.params.id, 'coach_id', 1);
  assertRequired(['decision'], req.body || {});

  const decision = String(req.body.decision || '').trim();
  if (!['approved', 'rejected'].includes(decision)) {
    throw new HttpError(400, 'decision must be approved or rejected');
  }

  const application = await coachModel.getCoachApplicationById(coachId);
  if (!application) {
    throw new HttpError(404, 'Coach application not found');
  }

  if (application.status !== 'pending') {
    throw new HttpError(409, `Application already reviewed with status: ${application.status}`);
  }

  if (decision === 'approved') {
    await coachModel.reviewCoachApplication({
      coachId,
      status: 'approved',
      reviewNotes: 'Candidatura approvata.',
      reviewedBy: req.user.id
    });

    const updated = await coachModel.getCoachApplicationById(coachId);
    return res.json({ application: normalizeApplication(updated), mail: null });
  }

  const reasonCode = String(req.body.reason_code || '').trim();
  const customReason = String(req.body.custom_reason || '').trim();
  const reasonText = resolveReasonText(reasonCode, customReason);

  if (!reasonText) {
    throw new HttpError(400, 'A rejection reason is required');
  }

  await coachModel.reviewCoachApplication({
    coachId,
    status: 'rejected',
    reviewNotes: reasonText,
    reviewedBy: req.user.id
  });

  const emailPayload = buildRejectionEmail({
    candidateName: application.name,
    toEmail: application.contact_email,
    reasonText
  });

  const mailResult = await sendRejectionEmail(emailPayload);
  const updated = await coachModel.getCoachApplicationById(coachId);

  return res.json({
    application: normalizeApplication(updated),
    mail: mailResult
  });
});

const streamCoachCertification = asyncHandler(async (req, res) => {
  const coachId = assertInteger(req.params.id, 'coach_id', 1);
  const application = await coachModel.getCoachApplicationById(coachId);
  if (!application) {
    throw new HttpError(404, 'Coach application not found');
  }

  const absolutePath = path.join(__dirname, '..', application.certification_file_path);
  if (!fs.existsSync(absolutePath)) {
    throw new HttpError(404, 'Certification file is missing');
  }

  const mode = String(req.query.mode || '').toLowerCase();
  const disposition = mode === 'download' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', application.certification_mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename=\"${application.certification_file_name}\"`);
  fs.createReadStream(absolutePath).pipe(res);
});

module.exports = {
  listCoachApplications,
  listRejectionReasons,
  reviewCoachApplication,
  streamCoachCertification
};

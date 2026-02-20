const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { isEmail, assertInteger, assertRequired } = require('../utils/validators');
const coachModel = require('../models/coachModel');
const planModel = require('../models/planModel');
const { parseMultipartForm } = require('../utils/multipart');
const sportModel = require('../models/sportModel');
const { MIME, validateUploadBuffer } = require('../utils/fileSecurity');
const { scanUploadBufferOrThrow } = require('../services/virusScanner');

const allowedMimeTypes = new Set([MIME.PDF, MIME.JPG, MIME.PNG]);
const uploadsDir = path.join(__dirname, '..', 'uploads', 'certifications');
const planUploadsDir = path.join(__dirname, '..', 'uploads', 'plans');

function fileExtensionFromMime(mimeType) {
  if (mimeType === MIME.PDF) return '.pdf';
  if (mimeType === MIME.JPG) return '.jpg';
  if (mimeType === MIME.PNG) return '.png';
  return '';
}

function normalizeCoach(coach, sports = []) {
  return {
    id: coach.id,
    user_id: coach.user_id,
    name: coach.name,
    primary_sport: coach.primary_sport_id
      ? {
          sport_id: Number(coach.primary_sport_id),
          sport_name: coach.primary_sport_name,
          sport_slug: coach.primary_sport_slug
        }
      : null,
    bio: coach.bio,
    contact_email: coach.contact_email,
    hourly_rate: Number(coach.hourly_rate),
    status: coach.status,
    approved_badge: coach.status === 'approved',
    sports_practiced: sports,
    training_locations: coach.training_locations || [],
    created_at: coach.created_at,
    updated_at: coach.updated_at
  };
}

const applyCoach = asyncHandler(async (req, res) => {
  const { fields, files } = await parseMultipartForm(req, { maxBytes: 8 * 1024 * 1024 });
  assertRequired(['contact_email', 'hourly_rate', 'primary_sport_id'], fields);

  const contactEmail = String(fields.contact_email || '').trim().toLowerCase();
  const bio = String(fields.bio || '').trim();
  const hourlyRate = Number(fields.hourly_rate);
  const primarySportId = assertInteger(fields.primary_sport_id, 'primary_sport_id', 1);
  const primarySport = await sportModel.getSportById(primarySportId);
  if (!primarySport) {
    throw new HttpError(400, 'primary_sport_id is invalid');
  }

  if (!isEmail(contactEmail)) {
    throw new HttpError(400, 'contact_email must be a valid email');
  }

  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    throw new HttpError(400, 'hourly_rate must be a positive number');
  }

  const certification = Array.isArray(files.certification) ? files.certification[0] : null;
  if (!certification) {
    throw new HttpError(400, 'certification file is required');
  }

  if (!allowedMimeTypes.has(certification.mimeType)) {
    throw new HttpError(400, 'certification must be PDF, JPG or PNG');
  }

  if (certification.size <= 0 || certification.size > 5 * 1024 * 1024) {
    throw new HttpError(400, 'certification file must be between 1 byte and 5MB');
  }

  const verifiedMimeType = validateUploadBuffer(certification.buffer, certification.mimeType, 'certification');
  await scanUploadBufferOrThrow(certification.buffer, { fieldLabel: 'certification' });
  fs.mkdirSync(uploadsDir, { recursive: true });
  const extension = fileExtensionFromMime(verifiedMimeType);
  const finalName = `coach-${req.user.id}-${Date.now()}${extension}`;
  const absolutePath = path.join(uploadsDir, finalName);
  fs.writeFileSync(absolutePath, certification.buffer);

  await coachModel.upsertCoachApplication({
    userId: req.user.id,
    primarySportId,
    bio,
    contactEmail,
    hourlyRate,
    certificationFileName: certification.originalName || finalName,
    certificationFilePath: path.join('uploads', 'certifications', finalName).replace(/\\/g, '/'),
    certificationMimeType: verifiedMimeType
  });

  const updated = await coachModel.getCoachByUserId(req.user.id);
  res.status(201).json({
    id: updated.id,
    user_id: updated.user_id,
    status: updated.status,
    primary_sport_id: updated.primary_sport_id ? Number(updated.primary_sport_id) : null,
    contact_email: updated.contact_email,
    hourly_rate: Number(updated.hourly_rate),
    message: 'Application submitted. Status is pending review.'
  });
});

const listApprovedCoaches = asyncHandler(async (req, res) => {
  const coaches = await coachModel.listApprovedCoaches();
  const items = await Promise.all(
    coaches.map(async (coach) => {
      const [sports, locations] = await Promise.all([
        coachModel.listCoachSports(coach.user_id),
        coachModel.listCoachTrainingLocations(coach.user_id, 3)
      ]);
      return normalizeCoach({ ...coach, training_locations: locations }, sports);
    })
  );

  res.json(items);
});

const getCoachPublicProfile = asyncHandler(async (req, res) => {
  const coachId = assertInteger(req.params.id, 'coach_id', 1);
  const coach = await coachModel.getApprovedCoachPublicById(coachId);

  if (!coach) {
    throw new HttpError(404, 'Coach profile not found');
  }

  const [sports, locations] = await Promise.all([
    coachModel.listCoachSports(coach.user_id),
    coachModel.listCoachTrainingLocations(coach.user_id, 6)
  ]);
  res.json(normalizeCoach({ ...coach, training_locations: locations }, sports));
});

const createPlanRequest = asyncHandler(async (req, res) => {
  const coachId = assertInteger(req.params.id, 'coach_id', 1);
  assertRequired(['goal'], req.body || {});

  const coach = await coachModel.getApprovedCoachPublicById(coachId);
  if (!coach) {
    throw new HttpError(404, 'Coach not found or not approved');
  }

  if (Number(coach.user_id) === Number(req.user.id)) {
    throw new HttpError(400, 'You cannot request a plan from your own coach profile');
  }

  const existingPending = await planModel.getPendingRequestForClientAndCoach({
    coachId,
    clientUserId: req.user.id
  });
  if (existingPending) {
    throw new HttpError(409, 'You already have a pending request for this coach');
  }

  const goal = String(req.body.goal || '').trim();
  const notes = String(req.body.notes || '').trim();

  if (goal.length < 4) {
    throw new HttpError(400, 'goal must be at least 4 characters');
  }

  const created = await planModel.createPlanRequest({
    coachId,
    clientUserId: req.user.id,
    goal,
    notes
  });

  const request = await planModel.getPlanRequestById(created.id);
  res.status(201).json(request);
});

const listCoachRequests = asyncHandler(async (req, res) => {
  const coachProfile = await coachModel.getCoachByUserId(req.user.id);

  if (!coachProfile || coachProfile.status !== 'approved') {
    throw new HttpError(403, 'Only approved coaches can access requests');
  }

  const requests = await planModel.listRequestsForCoach(coachProfile.id);
  res.json({ coach_id: coachProfile.id, items: requests });
});

const createPlanForRequest = asyncHandler(async (req, res) => {
  const requestId = assertInteger(req.params.requestId, 'request_id', 1);

  const coachProfile = await coachModel.getCoachByUserId(req.user.id);
  if (!coachProfile || coachProfile.status !== 'approved') {
    throw new HttpError(403, 'Only approved coaches can create plans');
  }

  const request = await planModel.getPlanRequestById(requestId);
  if (!request || Number(request.coach_id) !== Number(coachProfile.id)) {
    throw new HttpError(404, 'Plan request not found for this coach');
  }

  if (request.status !== 'pending') {
    throw new HttpError(409, `Cannot create plan for request in status: ${request.status}`);
  }

  const existingPlan = await planModel.getPlanByRequestId(requestId);
  if (existingPlan) {
    throw new HttpError(409, 'A plan already exists for this request');
  }

  const isMultipart = String(req.headers['content-type'] || '').includes('multipart/form-data');
  const parsed = isMultipart ? await parseMultipartForm(req, { maxBytes: 12 * 1024 * 1024 }) : null;
  const sourceBody = parsed ? parsed.fields : req.body || {};

  assertRequired(['title', 'content'], sourceBody);
  const title = String(sourceBody.title || '').trim();
  const content = String(sourceBody.content || '').trim();
  const coachNote = String(sourceBody.coach_note || '').trim();

  if (title.length < 4) {
    throw new HttpError(400, 'title must be at least 4 characters');
  }

  if (content.length < 12) {
    throw new HttpError(400, 'content must be at least 12 characters');
  }

  const created = await planModel.createPlanWithNote({
    requestId,
    coachId: coachProfile.id,
    clientUserId: request.client_user_id,
    title,
    content,
    coachNote
  });

  const attachments = parsed && Array.isArray(parsed.files.attachments) ? parsed.files.attachments : [];
  if (attachments.length > 5) {
    throw new HttpError(400, 'Maximum 5 attachments allowed');
  }

  if (attachments.length > 0) {
    fs.mkdirSync(planUploadsDir, { recursive: true });
  }

  for (const attachment of attachments) {
    if (!allowedMimeTypes.has(attachment.mimeType)) {
      throw new HttpError(400, 'attachments must be PDF, JPG or PNG');
    }
    if (attachment.size <= 0 || attachment.size > 5 * 1024 * 1024) {
      throw new HttpError(400, 'each attachment must be between 1 byte and 5MB');
    }

    const verifiedMimeType = validateUploadBuffer(attachment.buffer, attachment.mimeType, 'attachment');
    await scanUploadBufferOrThrow(attachment.buffer, { fieldLabel: 'attachment' });
    const extension = fileExtensionFromMime(verifiedMimeType);
    const finalName = `plan-${created.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}${extension}`;
    const absolutePath = path.join(planUploadsDir, finalName);
    fs.writeFileSync(absolutePath, attachment.buffer);

    await planModel.createPlanAttachment({
      planId: created.id,
      fileName: attachment.originalName || finalName,
      filePath: path.join('uploads', 'plans', finalName).replace(/\\/g, '/'),
      mimeType: verifiedMimeType,
      fileSize: attachment.size
    });
  }

  await planModel.markRequestCompleted(requestId);
  const plan = await planModel.getPlanByRequestId(requestId);
  const planAttachments = await planModel.listPlanAttachmentsByPlanId(plan.id);
  res.status(201).json({ id: created.id, ...plan, attachments: planAttachments });
});

const updatePlanForRequest = asyncHandler(async (req, res) => {
  const requestId = assertInteger(req.params.requestId, 'request_id', 1);
  const coachProfile = await coachModel.getCoachByUserId(req.user.id);
  if (!coachProfile || coachProfile.status !== 'approved') {
    throw new HttpError(403, 'Only approved coaches can update plans');
  }

  const request = await planModel.getPlanRequestById(requestId);
  if (!request || Number(request.coach_id) !== Number(coachProfile.id)) {
    throw new HttpError(404, 'Plan request not found for this coach');
  }

  const existingPlan = await planModel.getPlanByRequestId(requestId);
  if (!existingPlan) {
    throw new HttpError(404, 'No plan found for this request');
  }

  const isMultipart = String(req.headers['content-type'] || '').includes('multipart/form-data');
  const parsed = isMultipart ? await parseMultipartForm(req, { maxBytes: 12 * 1024 * 1024 }) : null;
  const sourceBody = parsed ? parsed.fields : req.body || {};

  assertRequired(['title', 'content'], sourceBody);
  const title = String(sourceBody.title || '').trim();
  const content = String(sourceBody.content || '').trim();
  const coachNote = String(sourceBody.coach_note || '').trim();

  if (title.length < 4) {
    throw new HttpError(400, 'title must be at least 4 characters');
  }

  if (content.length < 12) {
    throw new HttpError(400, 'content must be at least 12 characters');
  }

  await planModel.updatePlanByRequestId({
    requestId,
    title,
    content,
    coachNote
  });

  const attachments = parsed && Array.isArray(parsed.files.attachments) ? parsed.files.attachments : [];
  if (attachments.length > 5) {
    throw new HttpError(400, 'Maximum 5 attachments allowed');
  }
  if (attachments.length > 0) {
    fs.mkdirSync(planUploadsDir, { recursive: true });
  }

  for (const attachment of attachments) {
    if (!allowedMimeTypes.has(attachment.mimeType)) {
      throw new HttpError(400, 'attachments must be PDF, JPG or PNG');
    }
    if (attachment.size <= 0 || attachment.size > 5 * 1024 * 1024) {
      throw new HttpError(400, 'each attachment must be between 1 byte and 5MB');
    }

    const verifiedMimeType = validateUploadBuffer(attachment.buffer, attachment.mimeType, 'attachment');
    await scanUploadBufferOrThrow(attachment.buffer, { fieldLabel: 'attachment' });
    const extension = fileExtensionFromMime(verifiedMimeType);
    const finalName = `plan-${existingPlan.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}${extension}`;
    const absolutePath = path.join(planUploadsDir, finalName);
    fs.writeFileSync(absolutePath, attachment.buffer);

    await planModel.createPlanAttachment({
      planId: existingPlan.id,
      fileName: attachment.originalName || finalName,
      filePath: path.join('uploads', 'plans', finalName).replace(/\\/g, '/'),
      mimeType: verifiedMimeType,
      fileSize: attachment.size
    });
  }

  const plan = await planModel.getPlanByRequestId(requestId);
  const planAttachments = await planModel.listPlanAttachmentsByPlanId(plan.id);
  res.json({ ...plan, attachments: planAttachments });
});

const listCoachDeliveredPlans = asyncHandler(async (req, res) => {
  const coachProfile = await coachModel.getCoachByUserId(req.user.id);
  if (!coachProfile || coachProfile.status !== 'approved') {
    throw new HttpError(403, 'Only approved coaches can access delivered plans');
  }

  const plans = await planModel.listPlansForCoach(coachProfile.id);
  const withAttachments = await Promise.all(
    plans.map(async (plan) => ({
      ...plan,
      attachments: await planModel.listPlanAttachmentsByPlanId(plan.id)
    }))
  );

  res.json(withAttachments);
});

const getMyCoachApplication = asyncHandler(async (req, res) => {
  const application = await coachModel.getCoachByUserId(req.user.id);
  if (!application) {
    return res.json({ has_application: false, status: null });
  }

  return res.json({
    has_application: true,
    id: application.id,
    status: application.status,
    contact_email: application.contact_email,
    hourly_rate: Number(application.hourly_rate),
    review_notes: application.review_notes || null,
    reviewed_at: application.reviewed_at || null
  });
});

module.exports = {
  applyCoach,
  listApprovedCoaches,
  getCoachPublicProfile,
  createPlanRequest,
  listCoachRequests,
  createPlanForRequest,
  updatePlanForRequest,
  listCoachDeliveredPlans,
  getMyCoachApplication
};

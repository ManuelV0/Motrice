const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { assertInteger } = require('../utils/validators');
const planModel = require('../models/planModel');

const uploadsRoot = path.join(__dirname, '..');

const listMyPlans = asyncHandler(async (req, res) => {
  const plans = await planModel.listPlansForClient(req.user.id);
  const withAttachments = await Promise.all(
    plans.map(async (plan) => ({
      ...plan,
      attachments: await planModel.listPlanAttachmentsByPlanId(plan.id)
    }))
  );

  res.json(withAttachments);
});

const streamPlanAttachment = asyncHandler(async (req, res) => {
  const planId = assertInteger(req.params.planId, 'plan_id', 1);
  const attachmentId = assertInteger(req.params.attachmentId, 'attachment_id', 1);

  const plan = await planModel.getPlanByIdWithOwnership(planId);
  if (!plan) {
    throw new HttpError(404, 'Plan not found');
  }

  const isClientOwner = Number(plan.client_user_id) === Number(req.user.id);
  const isCoachOwner = Number(plan.coach_user_id) === Number(req.user.id);
  if (!isClientOwner && !isCoachOwner) {
    throw new HttpError(403, 'Not allowed to access this attachment');
  }

  const attachment = await planModel.getPlanAttachmentById(attachmentId);
  if (!attachment || Number(attachment.plan_id) !== Number(planId)) {
    throw new HttpError(404, 'Attachment not found');
  }

  const absolutePath = path.join(uploadsRoot, attachment.file_path);
  if (!fs.existsSync(absolutePath)) {
    throw new HttpError(404, 'Attachment file is missing');
  }

  const mode = String(req.query.mode || '').toLowerCase();
  const disposition = mode === 'download' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${disposition}; filename="${attachment.file_name}"`);
  fs.createReadStream(absolutePath).pipe(res);
});

module.exports = {
  listMyPlans,
  streamPlanAttachment
};

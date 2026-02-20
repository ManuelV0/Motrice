const express = require('express');
const auth = require('../middleware/auth');
const planController = require('../controllers/planController');

const router = express.Router();

router.get('/', auth, planController.listMyPlans);
router.get('/:planId/attachments/:attachmentId', auth, planController.streamPlanAttachment);

module.exports = router;

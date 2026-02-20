const express = require('express');
const auth = require('../middleware/auth');
const coachController = require('../controllers/coachController');

const router = express.Router();

router.post('/apply', auth, coachController.applyCoach);
router.get('/me/application', auth, coachController.getMyCoachApplication);
router.get('/requests', auth, coachController.listCoachRequests);
router.get('/plans', auth, coachController.listCoachDeliveredPlans);
router.post('/requests/:requestId/plans', auth, coachController.createPlanForRequest);
router.put('/requests/:requestId/plans', auth, coachController.updatePlanForRequest);
router.get('/', coachController.listApprovedCoaches);
router.get('/:id', coachController.getCoachPublicProfile);
router.post('/:id/requests', auth, coachController.createPlanRequest);

module.exports = router;

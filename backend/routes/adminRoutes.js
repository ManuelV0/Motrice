const express = require('express');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(auth, adminOnly);

router.get('/coach-applications', adminController.listCoachApplications);
router.get('/coach-rejection-reasons', adminController.listRejectionReasons);
router.get('/coach-applications/:id/certification', adminController.streamCoachCertification);
router.post('/coach-applications/:id/review', adminController.reviewCoachApplication);
router.post('/reset-credits', adminController.resetCredits);
router.post('/reset-mot', adminController.resetMot);
router.post('/reset-xp', adminController.resetXp);

module.exports = router;

const express = require('express');
const auth = require('../middleware/auth');
const billingController = require('../controllers/billingController');
const { billingRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const billingLimiter = billingRateLimiter();

router.get('/subscription', auth, billingLimiter, billingController.getSubscription);
router.post('/create-checkout-session', auth, billingLimiter, billingController.createCheckoutSession);
router.post('/create-portal-session', auth, billingLimiter, billingController.createPortalSession);
router.post('/webhook', billingLimiter, billingController.webhook);

module.exports = router;

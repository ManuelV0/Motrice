const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { getProvider, shouldUseStripe } = require('../services/billingProvider');

function getCurrentUserId(req) {
  if (!req.user || !Number.isInteger(Number(req.user.id)) || Number(req.user.id) < 1) {
    throw new HttpError(401, 'Authentication required');
  }

  return Number(req.user.id);
}

const getSubscription = asyncHandler(async (req, res) => {
  const provider = getProvider();
  const subscription = await provider.fetchSubscription({ userId: getCurrentUserId(req) });
  res.json({ subscription, mode: shouldUseStripe() ? 'stripe' : 'dev' });
});

const createCheckoutSession = asyncHandler(async (req, res) => {
  const plan = req.body?.plan;

  if (plan !== 'premium') {
    throw new HttpError(400, 'plan must be premium');
  }

  const provider = getProvider();
  const result = await provider.createCheckoutSession({ userId: getCurrentUserId(req), plan });
  res.status(201).json(result);
});

const createPortalSession = asyncHandler(async (req, res) => {
  const provider = getProvider();
  const result = await provider.createPortalSession({ userId: getCurrentUserId(req) });
  res.status(201).json(result);
});

const webhook = asyncHandler(async (req, res) => {
  const provider = getProvider();
  const signature = req.headers['stripe-signature'] || null;
  if (shouldUseStripe() && !signature) {
    throw new HttpError(400, 'Missing stripe-signature header');
  }

  const result = await provider.handleWebhook({ payload: req.body, signature });
  res.json(result);
});

module.exports = {
  getSubscription,
  createCheckoutSession,
  createPortalSession,
  webhook
};

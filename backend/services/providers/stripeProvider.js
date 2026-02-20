// Stripe provider skeleton. Integrate Stripe SDK here when enabling production billing.

async function fetchSubscription() {
  throw new Error('Stripe provider not implemented yet.');
}

async function createCheckoutSession() {
  throw new Error('Stripe checkout session creation not implemented yet.');
}

async function createPortalSession() {
  throw new Error('Stripe portal session creation not implemented yet.');
}

async function handleWebhook() {
  // Verify Stripe signature with STRIPE_WEBHOOK_SECRET and dispatch events.
  throw new Error('Stripe webhook handler not implemented yet.');
}

module.exports = {
  IS_IMPLEMENTED: false,
  fetchSubscription,
  createCheckoutSession,
  createPortalSession,
  handleWebhook
};

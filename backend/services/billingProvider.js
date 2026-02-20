const devProvider = require('./providers/devProvider');
const stripeProvider = require('./providers/stripeProvider');

function isStripeEnabledFlagOn() {
  return String(process.env.STRIPE_ENABLED || '').toLowerCase() === 'true';
}

function shouldUseStripe() {
  return (
    isStripeEnabledFlagOn() &&
    Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_PREMIUM
    )
  );
}

function getProvider() {
  return shouldUseStripe() ? stripeProvider : devProvider;
}

function assertBillingProviderConfigured() {
  if (isStripeEnabledFlagOn() && !shouldUseStripe()) {
    throw new Error('STRIPE_ENABLED=true but one or more required Stripe env vars are missing');
  }

  if (shouldUseStripe() && !stripeProvider.IS_IMPLEMENTED) {
    throw new Error('Stripe billing is enabled but stripe provider is not implemented');
  }
}

module.exports = {
  getProvider,
  shouldUseStripe,
  assertBillingProviderConfigured
};

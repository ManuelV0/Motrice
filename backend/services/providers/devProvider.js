const subscriptions = new Map();

function defaultSubscription() {
  return {
    plan: 'free',
    status: 'active',
    current_period_end: null,
    provider: 'dev'
  };
}

function getKey(userId) {
  return String(userId || 'dev-user');
}

function getSubscription(userId) {
  const key = getKey(userId);
  if (!subscriptions.has(key)) {
    subscriptions.set(key, defaultSubscription());
  }
  return subscriptions.get(key);
}

async function fetchSubscription({ userId }) {
  return getSubscription(userId);
}

async function createCheckoutSession({ userId, plan }) {
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const next = {
    plan,
    status: 'active',
    current_period_end: periodEnd,
    provider: 'dev'
  };

  subscriptions.set(getKey(userId), next);

  return {
    checkout_url: `http://localhost:5173/account?dev_checkout=success&plan=${plan}`,
    subscription: next,
    provider: 'dev'
  };
}

async function createPortalSession() {
  return {
    portal_url: 'http://localhost:5173/account?dev_portal=opened',
    provider: 'dev'
  };
}

async function handleWebhook({ payload }) {
  console.log('DEV billing webhook received:', payload?.type || 'unknown');
  return { received: true, provider: 'dev' };
}

module.exports = {
  IS_IMPLEMENTED: true,
  fetchSubscription,
  createCheckoutSession,
  createPortalSession,
  handleWebhook
};

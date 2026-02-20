const HttpError = require('../utils/httpError');

function parsePositiveInt(raw, fallback) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createRateLimiter({ windowMs, maxRequests, keyFn, message }) {
  const store = new Map();
  const safeWindowMs = parsePositiveInt(windowMs, 60 * 1000);
  const safeMaxRequests = parsePositiveInt(maxRequests, 60);
  const safeKeyFn = typeof keyFn === 'function' ? keyFn : (req) => String(req.ip || 'unknown');
  const safeMessage = message || 'Too many requests, retry later';

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = String(safeKeyFn(req) || 'unknown');
    const entry = store.get(key);

    if (!entry || now - entry.windowStart >= safeWindowMs) {
      store.set(key, { count: 1, windowStart: now });
      return next();
    }

    if (entry.count >= safeMaxRequests) {
      const retryAfterSeconds = Math.ceil((safeWindowMs - (now - entry.windowStart)) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSeconds)));
      return next(new HttpError(429, safeMessage));
    }

    entry.count += 1;
    return next();
  };
}

function authRateLimiter() {
  return createRateLimiter({
    windowMs: parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    maxRequests: parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 20),
    keyFn: (req) => `auth:${String(req.ip || 'unknown')}`,
    message: 'Too many authentication attempts, retry later'
  });
}

function billingRateLimiter() {
  return createRateLimiter({
    windowMs: parsePositiveInt(process.env.BILLING_RATE_LIMIT_WINDOW_MS, 60 * 1000),
    maxRequests: parsePositiveInt(process.env.BILLING_RATE_LIMIT_MAX, 30),
    keyFn: (req) => `billing:${String(req.ip || 'unknown')}:${String(req.user?.id || 'anonymous')}`,
    message: 'Too many billing requests, retry later'
  });
}

module.exports = {
  createRateLimiter,
  authRateLimiter,
  billingRateLimiter
};

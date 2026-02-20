const HttpError = require('../utils/httpError');

function parseAdminIds() {
  const raw = String(process.env.ADMIN_USER_IDS || '').trim();
  if (!raw) return [];

  return raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function adminOnly(req, res, next) {
  if (!req.user || !Number.isInteger(Number(req.user.id))) {
    return next(new HttpError(401, 'Authentication required'));
  }

  const adminIds = parseAdminIds();
  if (adminIds.length === 0) {
    return next(new HttpError(503, 'Admin access is not configured'));
  }

  if (!adminIds.includes(Number(req.user.id))) {
    return next(new HttpError(403, 'Admin access required'));
  }

  return next();
}

module.exports = adminOnly;

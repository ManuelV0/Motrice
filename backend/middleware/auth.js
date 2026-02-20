const jwt = require('jsonwebtoken');
const HttpError = require('../utils/httpError');
const userModel = require('../models/userModel');

function isLocalNodeEnv() {
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  return env === '' || env === 'development' || env === 'test';
}

function isLoopbackIp(ip) {
  const value = String(ip || '').trim().toLowerCase();
  return (
    value === '127.0.0.1' ||
    value === '::1' ||
    value === '::ffff:127.0.0.1' ||
    value === 'localhost'
  );
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const devUserHeader = req.headers['x-dev-user-id'];
    const allowDevHeader =
      String(process.env.ALLOW_DEV_AUTH_HEADER || '').toLowerCase() === 'true' && isLocalNodeEnv();

    if (!token && devUserHeader && allowDevHeader) {
      if (!isLoopbackIp(req.ip)) {
        return next(new HttpError(403, 'x-dev-user-id is allowed only from localhost'));
      }

      const devUserId = Number(devUserHeader);
      if (!Number.isInteger(devUserId) || devUserId < 1) {
        return next(new HttpError(401, 'Invalid x-dev-user-id header'));
      }

      await userModel.ensureDevUserById(devUserId);
      req.user = {
        id: devUserId,
        email: `dev-user-${devUserId}@local.motrice`,
        provider: 'dev'
      };
      return next();
    }

    if (!token && devUserHeader && !allowDevHeader) {
      return next(new HttpError(401, 'x-dev-user-id is not allowed in this environment'));
    }

    if (!token) {
      return next(new HttpError(401, 'Authentication token is required'));
    }

    const jwtSecret = String(process.env.JWT_SECRET || '').trim();
    if (!jwtSecret) {
      return next(new HttpError(500, 'JWT configuration is missing'));
    }

    const payload = jwt.verify(token, jwtSecret);
    req.user = { id: Number(payload.sub), email: payload.email, provider: 'jwt' };
    return next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    return next(new HttpError(401, 'Invalid or expired token'));
  }
}

module.exports = auth;

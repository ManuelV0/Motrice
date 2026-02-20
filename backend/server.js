require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { initDatabase } = require('./config/db');
const { assertBillingProviderConfigured } = require('./services/billingProvider');
const securityHeaders = require('./middleware/securityHeaders');
const HttpError = require('./utils/httpError');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const eventRoutes = require('./routes/eventRoutes');
const feedRoutes = require('./routes/feedRoutes');
const billingRoutes = require('./routes/billingRoutes');
const coachRoutes = require('./routes/coachRoutes');
const planRoutes = require('./routes/planRoutes');
const adminRoutes = require('./routes/adminRoutes');
const aiRoutes = require('./routes/aiRoutes');

const app = express();
const port = process.env.PORT || 4000;

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function assertSecurityConfiguration() {
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  if (isProduction() && ['replace_with_strong_secret', 'dev_jwt_secret'].includes(jwtSecret)) {
    throw new Error('JWT_SECRET is insecure for production');
  }

  const allowDevHeader = String(process.env.ALLOW_DEV_AUTH_HEADER || '').toLowerCase() === 'true';
  if (isProduction() && allowDevHeader) {
    throw new Error('ALLOW_DEV_AUTH_HEADER must be false in production');
  }

  const hasAdminIds = String(process.env.ADMIN_USER_IDS || '').trim().length > 0;
  if (isProduction() && !hasAdminIds) {
    throw new Error('ADMIN_USER_IDS is required in production');
  }
}

function parseTrustProxy() {
  const raw = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === '0' || raw === 'off') return false;
  if (raw === 'true' || raw === '1' || raw === 'on') return true;

  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;

  return false;
}

function parseCorsOrigins() {
  const raw = String(process.env.CORS_ORIGIN || '').trim();
  if (!raw) return ['http://localhost:5173'];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const allowedCorsOrigins = new Set(parseCorsOrigins());

app.disable('x-powered-by');
app.set('trust proxy', parseTrustProxy());
app.use(securityHeaders);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedCorsOrigins.has(origin)) return callback(null, true);
      return callback(new HttpError(403, 'CORS origin not allowed'));
    }
  })
);
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  assertSecurityConfiguration();
  assertBillingProviderConfigured();

  const shouldSeed = String(process.env.SEED_ON_BOOT || 'false').toLowerCase() === 'true';
  await initDatabase({ seed: shouldSeed });

  app.listen(port, () => {
    console.log(`Motrice backend running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});

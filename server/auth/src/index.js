require('dotenv').config();
require('./config');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { bootstrap } = require('./db/database');
const logger = require('./utils/logger');
const { getCorsOrigins } = require('./utils/cors');
const rateLimit = require('./middleware/rateLimit');

const developerRoutes = require('./routes/developers');
const projectRoutes = require('./routes/projects');
const apiKeyRoutes = require('./routes/apiKeys');
const sdkTokenRoutes = require('./routes/sdkTokens');
const livekitRoutes = require('./routes/livekitTokens');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: getCorsOrigins(),
  methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '32kb' }));

app.use('/auth/register', rateLimit.strict);
app.use('/auth/login', rateLimit.strict);
app.use('/sdk/token', rateLimit);
app.use('/sdk/refresh', rateLimit);

app.use('/auth', developerRoutes);
app.use('/projects', projectRoutes);
app.use('/projects/:projectId/keys', apiKeyRoutes);
app.use('/sdk', sdkTokenRoutes);
app.use('/sdk', livekitRoutes);

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'auth',
  uptime: Math.floor(process.uptime()),
}));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

const { RefreshTokenRepo } = require('./db/repositories');
setInterval(async () => {
  try {
    const count = await RefreshTokenRepo.deleteExpired(Date.now());
    if (count > 0) logger.info({ count }, 'cleaned up expired refresh tokens');
  } catch (err) {
    logger.error({ err }, 'refresh token cleanup error');
  }
}, 24 * 60 * 60 * 1000);

bootstrap().then(() => {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'auth server started');
  });
}).catch((err) => {
  logger.fatal({ err }, 'failed to start auth server');
  process.exit(1);
});

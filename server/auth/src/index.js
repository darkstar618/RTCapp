require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { bootstrap } = require('./db/database');

const developerRoutes = require('./routes/developers');
const projectRoutes   = require('./routes/projects');
const apiKeyRoutes    = require('./routes/apiKeys');
const sdkTokenRoutes  = require('./routes/sdkTokens');
const livekitRoutes   = require('./routes/livekitTokens');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '32kb' }));

app.use('/auth',     developerRoutes);
app.use('/projects', projectRoutes);
app.use('/projects/:projectId/keys', apiKeyRoutes);
app.use('/sdk',      sdkTokenRoutes);
app.use('/sdk',      livekitRoutes);

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'auth',
  uptime: Math.floor(process.uptime())
}));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error('[auth] unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Cleanup expired refresh tokens daily
const { RefreshTokenRepo } = require('./db/repositories');
setInterval(async () => {
  try {
    const count = await RefreshTokenRepo.deleteExpired(Date.now());
    if (count > 0) console.log(`[auth] cleaned up ${count} expired refresh tokens`);
  } catch(e) {
    console.error('[auth] cleanup error:', e.message);
  }
}, 24 * 60 * 60 * 1000);

bootstrap().then(() => {
  app.listen(PORT, () => {
    console.log(`[auth] server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('[auth] failed to start:', err);
  process.exit(1);
});
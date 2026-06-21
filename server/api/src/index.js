require('dotenv').config();
require('./config');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const { getCorsOrigins } = require('./utils/cors');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: getCorsOrigins(),
  methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
}));
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((req, res, next) => { res.setHeader('X-API-Version', 'v1'); next(); });

app.use('/v1/tokens', require('./routes/tokens'));
app.use('/v1/channels', require('./routes/channels'));
app.use('/v1/dashboard', require('./routes/dashboard'));
app.use('/v1/billing', require('./routes/billing'));
app.use('/v1/admin', require('./routes/admin'));
app.use('/v1/webhooks', require('./routes/webhooks'));
app.use('/v1/analytics', require('./routes/analytics'));

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'rtc-api',
  version: 'v1',
  uptime: Math.floor(process.uptime()),
}));

app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'unhandled error');
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'api server started');
});

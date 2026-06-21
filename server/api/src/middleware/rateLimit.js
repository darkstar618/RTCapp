const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

const rateLimitOptions = {
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => (req.sdk && req.sdk.app_id ? req.sdk.app_id : req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Rate limit exceeded' }),
};

let store;
try {
  const Redis = require('ioredis');
  const client = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    lazyConnect: true,
    connectTimeout: 500,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
  });
  client.on('error', () => {});

  store = {
    async increment(key) {
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, 60);
      return { totalHits: count, resetTime: new Date(Date.now() + 60000) };
    },
    async decrement(key) {
      await client.decr(key);
    },
    async resetKey(key) {
      await client.del(key);
    },
  };
  logger.info('rate limit using Redis store');
} catch (e) {
  logger.info('rate limit using in-memory store');
}

module.exports = rateLimit(store ? { ...rateLimitOptions, store } : rateLimitOptions);

module.exports.adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Rate limit exceeded' }),
  ...(store ? { store } : {}),
});

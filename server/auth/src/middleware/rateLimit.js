const rateLimit = require('express-rate-limit');

const defaultLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Rate limit exceeded' }),
});

const strictLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Rate limit exceeded' }),
});

module.exports = defaultLimit;
module.exports.strict = strictLimit;

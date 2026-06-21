const { JWT_SECRET, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = require('../config');
const jwt = require('jsonwebtoken');

// Validates SDK access tokens issued by server/auth POST /sdk/token
module.exports = function authenticateSdk(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'sdk_access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    req.sdk = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired SDK token' });
  }
};

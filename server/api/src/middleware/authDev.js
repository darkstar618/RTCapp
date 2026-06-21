const jwt = require('jsonwebtoken');
const { DEV_DASHBOARD_JWT_SECRET } = require('../config');

// Validates developer dashboard tokens from auth server register/login
module.exports = function authenticateDeveloper(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, DEV_DASHBOARD_JWT_SECRET);
    if (payload.type !== 'developer_dashboard') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    req.dev = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

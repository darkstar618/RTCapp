const crypto = require('crypto');
const { ADMIN_SECRET } = require('../config');

module.exports = function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || '';
  const expected = Buffer.from(ADMIN_SECRET);
  const provided = Buffer.from(key);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

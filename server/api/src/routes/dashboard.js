const router = require('express').Router();
const db = require('../db/database');
const jwt = require('jsonwebtoken');
const { SDK_JWT_SECRET } = require('../config');
function authDev(req, res, next) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try { req.dev = jwt.verify(token, SDK_JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}
router.get('/stats', authDev, (req, res) => {
  const appId = req.dev.app_id;
  const totalChannels = db.prepare('SELECT COUNT(*) as count FROM channels WHERE app_id = ?').get(appId);
  const activeChannels = db.prepare('SELECT COUNT(*) as count FROM channels WHERE app_id = ? AND closed_at IS NULL').get(appId);
  const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE app_id = ?').get(appId);
  const totalMinutes = db.prepare('SELECT SUM(duration_ms) as total FROM sessions WHERE app_id = ? AND duration_ms IS NOT NULL').get(appId);
  res.json({ total_channels: totalChannels.count, active_channels: activeChannels.count, total_sessions: totalSessions.count, total_minutes: totalMinutes.total ? Math.round(totalMinutes.total / 60000) : 0 });
});
router.get('/channels', authDev, (req, res) => {
  const appId = req.dev.app_id;
  const channels = db.prepare('SELECT * FROM channels WHERE app_id = ? ORDER BY created_at DESC LIMIT 50').all(appId);
  const result = channels.map(ch => {
    const participants = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE channel_id = ? AND left_at IS NULL').get(ch.id);
    const sessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE channel_id = ?').get(ch.id);
    return { ...ch, active_participants: participants.count, total_sessions: sessions.count };
  });
  res.json(result);
});
router.get('/sessions', authDev, (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions WHERE app_id = ? ORDER BY joined_at DESC LIMIT 100').all(req.dev.app_id);
  res.json(sessions);
});
module.exports = router;
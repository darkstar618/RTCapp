const router = require('express').Router();
const db = require('../db/database');
const authenticateDeveloper = require('../middleware/authDev');

router.get('/stats', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const totalChannels = db.prepare('SELECT COUNT(*) as count FROM channels WHERE app_id = ?').get(appId);
  const activeChannels = db.prepare('SELECT COUNT(*) as count FROM channels WHERE app_id = ? AND closed_at IS NULL').get(appId);
  const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE app_id = ?').get(appId);
  const totalMinutes = db.prepare('SELECT SUM(duration_ms) as total FROM sessions WHERE app_id = ? AND duration_ms IS NOT NULL').get(appId);
  res.json({
    total_channels: totalChannels.count,
    active_channels: activeChannels.count,
    total_sessions: totalSessions.count,
    total_minutes: totalMinutes.total ? Math.round(totalMinutes.total / 60000) : 0,
  });
});

router.get('/channels', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const channels = db.prepare('SELECT * FROM channels WHERE app_id = ? ORDER BY created_at DESC LIMIT 50').all(appId);
  const result = channels.map((ch) => {
    const participants = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE channel_id = ? AND left_at IS NULL').get(ch.id);
    const sessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE channel_id = ?').get(ch.id);
    return { ...ch, active_participants: participants.count, total_sessions: sessions.count };
  });
  res.json(result);
});

router.get('/sessions', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const sessions = db.prepare('SELECT * FROM sessions WHERE app_id = ? ORDER BY joined_at DESC LIMIT 100').all(appId);
  res.json(sessions);
});

module.exports = router;

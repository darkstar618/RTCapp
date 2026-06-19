const router = require('express').Router();
const db = require('../db/database');
const jwt = require('jsonwebtoken');
const { SDK_JWT_SECRET } = require('../config');
function auth(req, res, next) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try { req.dev = jwt.verify(token, SDK_JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}
// GET /v1/analytics/overview — key metrics for last 30 days
router.get('/overview', auth, (req, res) => {
  const appId = req.dev.app_id;
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const channels = db.prepare('SELECT COUNT(*) as count FROM channels WHERE app_id=? AND created_at>=?').get(appId, since);
  const sessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE app_id=? AND joined_at>=?').get(appId, since);
  const minutes = db.prepare('SELECT SUM(duration_ms) as total FROM sessions WHERE app_id=? AND joined_at>=? AND duration_ms IS NOT NULL').get(appId, since);
  const avgDuration = db.prepare('SELECT AVG(duration_ms) as avg FROM sessions WHERE app_id=? AND joined_at>=? AND duration_ms IS NOT NULL').get(appId, since);
  const peakChannel = db.prepare('SELECT channel_id, COUNT(*) as count FROM sessions WHERE app_id=? AND joined_at>=? GROUP BY channel_id ORDER BY count DESC LIMIT 1').get(appId, since);
  res.json({
    period: '30d',
    channels_created: channels.count,
    total_sessions: sessions.count,
    total_minutes: minutes.total ? Math.round(minutes.total / 60000) : 0,
    avg_session_duration_sec: avgDuration.avg ? Math.round(avgDuration.avg / 1000) : 0,
    peak_channel: peakChannel ? peakChannel.channel_id : null
  });
});
// GET /v1/analytics/channels/daily — channel creations per day last 14 days
router.get('/channels/daily', auth, (req, res) => {
  const appId = req.dev.app_id;
  const days = 14;
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - i);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const row = db.prepare('SELECT COUNT(*) as count FROM channels WHERE app_id=? AND created_at>=? AND created_at<?').get(appId, start.getTime(), end.getTime());
    result.push({ date: start.toISOString().slice(0,10), count: row.count });
  }
  res.json(result);
});
// GET /v1/analytics/sessions/daily — sessions per day last 14 days
router.get('/sessions/daily', auth, (req, res) => {
  const appId = req.dev.app_id;
  const days = 14;
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - i);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const row = db.prepare('SELECT COUNT(*) as count, SUM(duration_ms) as total_ms FROM sessions WHERE app_id=? AND joined_at>=? AND joined_at<?').get(appId, start.getTime(), end.getTime());
    result.push({ date: start.toISOString().slice(0,10), sessions: row.count, minutes: row.total_ms ? Math.round(row.total_ms / 60000) : 0 });
  }
  res.json(result);
});
// GET /v1/analytics/peak-hours — usage by hour of day
router.get('/peak-hours', auth, (req, res) => {
  const appId = req.dev.app_id;
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sessions = db.prepare('SELECT joined_at FROM sessions WHERE app_id=? AND joined_at>=?').all(appId, since);
  const hours = new Array(24).fill(0);
  sessions.forEach(s => { hours[new Date(s.joined_at).getHours()]++; });
  res.json(hours.map((count, hour) => ({ hour, count })));
});
// GET /v1/analytics/top-channels — most active channels
router.get('/top-channels', auth, (req, res) => {
  const appId = req.dev.app_id;
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = db.prepare('SELECT channel_id, COUNT(*) as session_count, SUM(duration_ms) as total_ms FROM sessions WHERE app_id=? AND joined_at>=? GROUP BY channel_id ORDER BY session_count DESC LIMIT 10').all(appId, since);
  res.json(rows.map(r => ({ channel_id: r.channel_id, session_count: r.session_count, total_minutes: r.total_ms ? Math.round(r.total_ms / 60000) : 0 })));
});
module.exports = router;
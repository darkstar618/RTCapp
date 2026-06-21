const router = require('express').Router();
const db = require('../db/billing');
const adminAuth = require('../middleware/adminAuth');
const { adminRateLimit } = require('../middleware/rateLimit');

router.use(adminAuth, adminRateLimit);

router.get('/stats', (req, res) => {
  const totalChannels = db.prepare('SELECT COUNT(*) as count FROM channels').get();
  const activeChannels = db.prepare('SELECT COUNT(*) as count FROM channels WHERE closed_at IS NULL').get();
  const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
  const totalMinutes = db.prepare('SELECT SUM(duration_ms) as total FROM sessions WHERE duration_ms IS NOT NULL').get();
  const totalApps = db.prepare('SELECT COUNT(DISTINCT app_id) as count FROM channels').get();
  const totalInvoices = db.prepare('SELECT COUNT(*) as count FROM invoices').get();
  const totalRevenue = db.prepare('SELECT SUM(total_cost) as total FROM invoices').get();
  res.json({
    total_channels: totalChannels.count,
    active_channels: activeChannels.count,
    total_sessions: totalSessions.count,
    total_minutes: totalMinutes.total ? Math.round(totalMinutes.total / 60000) : 0,
    total_apps: totalApps.count,
    total_invoices: totalInvoices.count,
    total_revenue: totalRevenue.total ? parseFloat(totalRevenue.total.toFixed(2)) : 0,
  });
});

router.get('/apps', (req, res) => {
  const apps = db.prepare('SELECT DISTINCT app_id FROM channels').all();
  const result = apps.map((a) => {
    const channels = db.prepare('SELECT COUNT(*) as count FROM channels WHERE app_id = ?').get(a.app_id);
    const sessions = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE app_id = ?').get(a.app_id);
    const minutes = db.prepare('SELECT SUM(duration_ms) as total FROM sessions WHERE app_id = ? AND duration_ms IS NOT NULL').get(a.app_id);
    const sub = db.prepare('SELECT plan_id FROM subscriptions WHERE app_id = ?').get(a.app_id);
    return {
      app_id: a.app_id,
      plan: sub ? sub.plan_id : 'free',
      total_channels: channels.count,
      total_sessions: sessions.count,
      total_minutes: minutes.total ? Math.round(minutes.total / 60000) : 0,
    };
  });
  res.json(result);
});

router.get('/invoices', (req, res) => {
  res.json(db.prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 100').all());
});

router.patch('/invoices/:id', (req, res) => {
  const { status } = req.body;
  if (!['draft', 'paid', 'void'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

router.patch('/apps/:appId/plan', (req, res) => {
  const { plan_id } = req.body;
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id);
  if (!plan) return res.status(400).json({ error: 'Invalid plan' });
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM subscriptions WHERE app_id = ?').get(req.params.appId);
  if (existing) {
    db.prepare('UPDATE subscriptions SET plan_id = ?, renewed_at = ? WHERE app_id = ?').run(plan_id, now, req.params.appId);
  } else {
    const { v4: uuidv4 } = require('uuid');
    db.prepare('INSERT INTO subscriptions (id,app_id,plan_id,started_at,renewed_at) VALUES (?,?,?,?,?)').run(uuidv4(), req.params.appId, plan_id, now, now);
  }
  res.json({ success: true, plan });
});

module.exports = router;

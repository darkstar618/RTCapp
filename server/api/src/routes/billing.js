const router = require('express').Router();
const db = require('../db/billing');
const { v4: uuidv4 } = require('uuid');
const authenticateDeveloper = require('../middleware/authDev');

router.get('/plans', (req, res) => {
  res.json(db.prepare('SELECT * FROM plans').all());
});

router.get('/subscription', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const sub = db.prepare('SELECT s.*, p.name as plan_name, p.monthly_minutes, p.price_usd, p.overage_rate FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.app_id = ?').get(appId);
  if (!sub) {
    const now = Date.now();
    db.prepare('INSERT OR IGNORE INTO subscriptions (id, app_id, plan_id, started_at, renewed_at) VALUES (?,?,?,?,?)').run(uuidv4(), appId, 'free', now, now);
    return res.json(db.prepare('SELECT s.*, p.name as plan_name, p.monthly_minutes, p.price_usd, p.overage_rate FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.app_id = ?').get(appId));
  }
  res.json(sub);
});

router.post('/subscription', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const { plan_id } = req.body;
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id);
  if (!plan) return res.status(400).json({ error: 'Invalid plan' });
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM subscriptions WHERE app_id = ?').get(appId);
  if (existing) {
    db.prepare('UPDATE subscriptions SET plan_id = ?, renewed_at = ? WHERE app_id = ?').run(plan_id, now, appId);
  } else {
    db.prepare('INSERT INTO subscriptions (id, app_id, plan_id, started_at, renewed_at) VALUES (?,?,?,?,?)').run(uuidv4(), appId, plan_id, now, now);
  }
  res.json({ success: true, plan });
});

router.get('/usage', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const sub = db.prepare('SELECT s.*, p.monthly_minutes, p.price_usd, p.overage_rate FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.app_id = ?').get(appId);
  const periodStart = sub ? sub.renewed_at : Date.now() - 30 * 24 * 60 * 60 * 1000;
  const result = db.prepare('SELECT SUM(duration_ms) as total FROM sessions WHERE app_id = ? AND joined_at >= ? AND duration_ms IS NOT NULL').get(appId, periodStart);
  const minutesUsed = result.total ? Math.round(result.total / 60000) : 0;
  const included = sub ? sub.monthly_minutes : 1000;
  const overage = Math.max(0, minutesUsed - included);
  const overageRate = sub ? sub.overage_rate : 0.01;
  res.json({
    minutes_used: minutesUsed,
    minutes_included: included,
    minutes_remaining: Math.max(0, included - minutesUsed),
    overage_minutes: overage,
    overage_cost: parseFloat((overage * overageRate).toFixed(2)),
    period_start: periodStart,
    usage_pct: Math.min(100, Math.round((minutesUsed / included) * 100)),
  });
});

router.post('/invoices/generate', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const sub = db.prepare('SELECT s.*, p.monthly_minutes, p.price_usd, p.overage_rate FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.app_id = ?').get(appId);
  if (!sub) return res.status(400).json({ error: 'No subscription found' });
  const periodStart = sub.renewed_at;
  const periodEnd = Date.now();
  const result = db.prepare('SELECT SUM(duration_ms) as total FROM sessions WHERE app_id = ? AND joined_at >= ? AND duration_ms IS NOT NULL').get(appId, periodStart);
  const minutesUsed = result.total ? Math.round(result.total / 60000) : 0;
  const overage = Math.max(0, minutesUsed - sub.monthly_minutes);
  const overageCost = parseFloat((overage * sub.overage_rate).toFixed(2));
  const totalCost = parseFloat((sub.price_usd + overageCost).toFixed(2));
  const invoice = {
    id: 'inv_' + uuidv4().replace(/-/g, '').slice(0, 12),
    app_id: appId,
    period_start: periodStart,
    period_end: periodEnd,
    minutes_used: minutesUsed,
    minutes_included: sub.monthly_minutes,
    overage_minutes: overage,
    base_cost: sub.price_usd,
    overage_cost: overageCost,
    total_cost: totalCost,
    status: 'draft',
    created_at: Date.now(),
  };
  db.prepare('INSERT INTO invoices (id,app_id,period_start,period_end,minutes_used,minutes_included,overage_minutes,base_cost,overage_cost,total_cost,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
    invoice.id, invoice.app_id, invoice.period_start, invoice.period_end, invoice.minutes_used,
    invoice.minutes_included, invoice.overage_minutes, invoice.base_cost, invoice.overage_cost,
    invoice.total_cost, invoice.status, invoice.created_at
  );
  res.json(invoice);
});

router.get('/invoices', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  res.json(db.prepare('SELECT * FROM invoices WHERE app_id = ? ORDER BY created_at DESC').all(appId));
});

module.exports = router;

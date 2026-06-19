const router = require('express').Router();
const db = require('../db/webhooks');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { SDK_JWT_SECRET } = require('../config');
const crypto = require('crypto');

function auth(req, res, next) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try { req.dev = jwt.verify(token, SDK_JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// POST /v1/webhooks — register endpoint
router.post('/', auth, (req, res) => {
  const { url, events = ['*'] } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  const id = uuidv4();
  const secret = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO webhook_endpoints (id,app_id,url,secret,events,is_active,created_at) VALUES (?,?,?,?,?,1,?)')
    .run(id, req.dev.app_id, url, secret, JSON.stringify(events), Date.now());
  console.log('[webhook] registered endpoint=%s app=%s url=%s', id, req.dev.app_id, url);
  res.status(201).json({ id, url, events, secret, message: 'Save this secret - it will not be shown again' });
});

// GET /v1/webhooks — list endpoints
router.get('/', auth, (req, res) => {
  const endpoints = db.prepare('SELECT id,app_id,url,events,is_active,created_at FROM webhook_endpoints WHERE app_id=?')
    .all(req.dev.app_id);
  res.json(endpoints.map(e => ({ ...e, events: JSON.parse(e.events) })));
});

// DELETE /v1/webhooks/:id — deactivate endpoint
router.delete('/:id', auth, (req, res) => {
  const ep = db.prepare('SELECT * FROM webhook_endpoints WHERE id=? AND app_id=?').get(req.params.id, req.dev.app_id);
  if (!ep) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE webhook_endpoints SET is_active=0 WHERE id=?').run(req.params.id);
  console.log('[webhook] deactivated endpoint=%s', req.params.id);
  res.status(204).send();
});

// GET /v1/webhooks/deliveries — delivery log
router.get('/deliveries', auth, (req, res) => {
  const eps = db.prepare('SELECT id FROM webhook_endpoints WHERE app_id=?')
    .all(req.dev.app_id).map(e => e.id);
  if (!eps.length) return res.json([]);
  const placeholders = eps.map(() => '?').join(',');
  const deliveries = db.prepare(
    'SELECT * FROM webhook_deliveries WHERE endpoint_id IN (' + placeholders + ') ORDER BY created_at DESC LIMIT 100'
  ).all(...eps);
  res.json(deliveries);
});

// GET /v1/webhooks/:id/deliveries — deliveries for specific endpoint
router.get('/:id/deliveries', auth, (req, res) => {
  const ep = db.prepare('SELECT * FROM webhook_endpoints WHERE id=? AND app_id=?').get(req.params.id, req.dev.app_id);
  if (!ep) return res.status(404).json({ error: 'Not found' });
  const deliveries = db.prepare('SELECT * FROM webhook_deliveries WHERE endpoint_id=? ORDER BY created_at DESC LIMIT 50')
    .all(req.params.id);
  res.json(deliveries);
});

// POST /v1/webhooks/:id/test — send a test event
router.post('/:id/test', auth, (req, res) => {
  const ep = db.prepare('SELECT * FROM webhook_endpoints WHERE id=? AND app_id=?').get(req.params.id, req.dev.app_id);
  if (!ep) return res.status(404).json({ error: 'Not found' });
  const { fire } = require('../services/webhooks');
  fire(req.dev.app_id, 'test', { message: 'This is a test event from RTC Platform' });
  res.json({ success: true, message: 'Test event fired' });
});

module.exports = router;
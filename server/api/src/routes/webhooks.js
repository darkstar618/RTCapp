const router = require('express').Router();
const db = require('../db/webhooks');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const authenticateDeveloper = require('../middleware/authDev');
const { isBlockedWebhookUrl } = require('../utils/webhookUrl');
const logger = require('../utils/logger');

router.post('/', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const { url, events = ['*'] } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (isBlockedWebhookUrl(url)) {
    return res.status(400).json({ error: 'Webhook URL must be a public http(s) endpoint' });
  }
  const id = uuidv4();
  const secret = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO webhook_endpoints (id,app_id,url,secret,events,is_active,created_at) VALUES (?,?,?,?,?,1,?)')
    .run(id, appId, url, secret, JSON.stringify(events), Date.now());
  logger.info({ endpointId: id, appId }, 'webhook endpoint registered');
  res.status(201).json({ id, url, events, secret, message: 'Save this secret - it will not be shown again' });
});

router.get('/', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const endpoints = db.prepare('SELECT id,app_id,url,events,is_active,created_at FROM webhook_endpoints WHERE app_id=?')
    .all(appId);
  res.json(endpoints.map((e) => ({ ...e, events: JSON.parse(e.events) })));
});

router.delete('/:id', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const ep = db.prepare('SELECT * FROM webhook_endpoints WHERE id=? AND app_id=?').get(req.params.id, appId);
  if (!ep) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE webhook_endpoints SET is_active=0 WHERE id=?').run(req.params.id);
  res.status(204).send();
});

router.get('/deliveries', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const eps = db.prepare('SELECT id FROM webhook_endpoints WHERE app_id=?')
    .all(appId).map((e) => e.id);
  if (!eps.length) return res.json([]);
  const placeholders = eps.map(() => '?').join(',');
  const deliveries = db.prepare(
    'SELECT * FROM webhook_deliveries WHERE endpoint_id IN (' + placeholders + ') ORDER BY created_at DESC LIMIT 100'
  ).all(...eps);
  res.json(deliveries);
});

router.get('/:id/deliveries', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const ep = db.prepare('SELECT * FROM webhook_endpoints WHERE id=? AND app_id=?').get(req.params.id, appId);
  if (!ep) return res.status(404).json({ error: 'Not found' });
  const deliveries = db.prepare('SELECT * FROM webhook_deliveries WHERE endpoint_id=? ORDER BY created_at DESC LIMIT 50')
    .all(req.params.id);
  res.json(deliveries);
});

router.post('/:id/test', authenticateDeveloper, (req, res) => {
  const appId = req.dev.app_id;
  if (!appId) return res.status(400).json({ error: 'app_id claim required on developer token' });
  const ep = db.prepare('SELECT * FROM webhook_endpoints WHERE id=? AND app_id=?').get(req.params.id, appId);
  if (!ep) return res.status(404).json({ error: 'Not found' });
  const { fire } = require('../services/webhooks');
  fire(appId, 'test', { message: 'This is a test event from RTC Platform' });
  res.json({ success: true, message: 'Test event fired' });
});

module.exports = router;

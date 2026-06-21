const db = require('../db/webhooks');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const { isBlockedWebhookUrl } = require('../utils/webhookUrl');
const logger = require('../utils/logger');

function sign(secret, payload) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    };
    const req = lib.request(options, (res) => resolve(res.statusCode));
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function deliver(deliveryId, endpoint, event, payload, attempt = 1) {
  if (isBlockedWebhookUrl(endpoint.url)) {
    db.prepare('UPDATE webhook_deliveries SET status=?, attempts=?, last_attempt_at=?, response_status=? WHERE id=?')
      .run('failed', attempt, Date.now(), null, deliveryId);
    logger.warn({ endpointId: endpoint.id }, 'webhook delivery blocked for private URL');
    return;
  }

  const timestamp = Date.now();
  const envelope = { event, app_id: payload.app_id, timestamp, data: payload.data ?? payload };
  const body = JSON.stringify(envelope);
  const sig = sign(endpoint.secret, `${timestamp}.${body}`);
  let status = 'failed';
  let responseStatus = null;
  try {
    responseStatus = await httpPost(endpoint.url, body, {
      'Content-Type': 'application/json',
      'X-RTC-Signature': sig,
      'X-RTC-Event': event,
      'X-RTC-Delivery': deliveryId,
      'X-RTC-Attempt': String(attempt),
      'X-RTC-Timestamp': String(timestamp),
    });
    status = responseStatus >= 200 && responseStatus < 300 ? 'delivered' : 'failed';
  } catch (e) {
    status = 'failed';
    logger.warn({ err: e, event, endpointId: endpoint.id, attempt }, 'webhook delivery error');
  }
  db.prepare('UPDATE webhook_deliveries SET status=?, attempts=?, last_attempt_at=?, response_status=? WHERE id=?')
    .run(status, attempt, Date.now(), responseStatus, deliveryId);
  if (status === 'failed' && attempt < 3) {
    const delay = attempt * 2000;
    setTimeout(() => deliver(deliveryId, endpoint, event, payload, attempt + 1), delay);
  }
}

function fire(appId, event, payload) {
  const endpoints = db.prepare('SELECT * FROM webhook_endpoints WHERE app_id=? AND is_active=1').all(appId);
  if (!endpoints.length) return;
  for (const ep of endpoints) {
    const events = JSON.parse(ep.events);
    if (!events.includes('*') && !events.includes(event)) continue;
    const deliveryId = uuidv4();
    db.prepare('INSERT INTO webhook_deliveries (id,endpoint_id,event,payload,status,attempts,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(deliveryId, ep.id, event, JSON.stringify(payload), 'pending', 0, Date.now());
    deliver(deliveryId, ep, event, { app_id: appId, data: payload });
  }
}

module.exports = { fire };

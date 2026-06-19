const db = require('../db/webhooks');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

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
      timeout: 5000
    };
    const req = lib.request(options, (res) => resolve(res.statusCode));
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function deliver(deliveryId, endpoint, event, payload, attempt = 1) {
  const body = JSON.stringify(payload);
  const sig = sign(endpoint.secret, body);
  let status = 'failed';
  let responseStatus = null;
  try {
    responseStatus = await httpPost(endpoint.url, body, {
      'Content-Type': 'application/json',
      'X-RTC-Signature': sig,
      'X-RTC-Event': event,
      'X-RTC-Delivery': deliveryId,
      'X-RTC-Attempt': String(attempt),
    });
    status = responseStatus >= 200 && responseStatus < 300 ? 'delivered' : 'failed';
    if (status === 'delivered') {
      console.log('[webhook] delivered event=%s endpoint=%s attempt=%d status=%d', event, endpoint.id, attempt, responseStatus);
    } else {
      console.warn('[webhook] failed event=%s endpoint=%s attempt=%d status=%d', event, endpoint.id, attempt, responseStatus);
    }
  } catch(e) {
    status = 'failed';
    console.warn('[webhook] error event=%s endpoint=%s attempt=%d error=%s', event, endpoint.id, attempt, e.message);
  }
  db.prepare('UPDATE webhook_deliveries SET status=?, attempts=?, last_attempt_at=?, response_status=? WHERE id=?')
    .run(status, attempt, Date.now(), responseStatus, deliveryId);
  if (status === 'failed' && attempt < 3) {
    const delay = attempt * 2000;
    console.log('[webhook] retrying in %dms attempt=%d', delay, attempt + 1);
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
    deliver(deliveryId, ep, event, { event, app_id: appId, timestamp: Date.now(), data: payload });
  }
}

module.exports = { fire };
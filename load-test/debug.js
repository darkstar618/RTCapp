const http = require('http');

const sdkToken = process.argv[2];

function request(path, method, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3002, path, method,
      headers: { 'Authorization': 'Bearer ' + sdkToken, 'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('Sending 30 concurrent POST /v1/channels...');
  const results = await Promise.all(Array.from({ length: 30 }, () => request('/v1/channels', 'POST', {})));
  const grouped = {};
  results.forEach(r => {
    grouped[r.status] = grouped[r.status] || [];
    grouped[r.status].push(r.body);
  });
  Object.entries(grouped).forEach(([status, bodies]) => {
    console.log('Status', status + ':', bodies.length, 'responses');
    if (status !== '201') console.log('  Sample:', bodies[0]);
  });
}

main().catch(console.error);
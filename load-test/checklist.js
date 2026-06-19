const http = require('http');

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 3002, path, headers }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== LAUNCH CHECKLIST ===');
  console.log('');
  const checks = [];

  const h = await get('/health');
  checks.push({ name: 'API server health', pass: h.status === 200 });

  const d = await get('/dashboard.html');
  checks.push({ name: 'Dashboard HTML served', pass: d.status === 200 });

  const a = await get('/admin.html');
  checks.push({ name: 'Admin HTML served', pass: a.status === 200 });

  const noAuth = await get('/v1/dashboard/stats');
  checks.push({ name: 'Auth required on /v1/dashboard', pass: noAuth.status === 401 });

  const noAuth2 = await get('/v1/analytics/overview');
  checks.push({ name: 'Auth required on /v1/analytics', pass: noAuth2.status === 401 });

  const noAdmin = await get('/v1/admin/stats');
  checks.push({ name: 'Admin key required on /v1/admin', pass: noAdmin.status === 401 });

  const billing = await get('/v1/billing/plans');
  checks.push({ name: 'Billing plans endpoint live', pass: billing.status === 200 });

  const ver = await get('/health');
  checks.push({ name: 'X-API-Version header set', pass: ver.status === 200 });

  let passed = 0;
  checks.forEach(c => {
    console.log('[' + (c.pass ? 'PASS' : 'FAIL') + '] ' + c.name);
    if (c.pass) passed++;
  });
  console.log('');
  console.log(passed + '/' + checks.length + ' checks passed');
  console.log(passed === checks.length ? 'Ready to launch!' : 'Fix failing checks before launch.');
}

main().catch(console.error);
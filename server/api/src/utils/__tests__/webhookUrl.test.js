const test = require('node:test');
const assert = require('node:assert/strict');
const { isBlockedWebhookUrl } = require('../webhookUrl');

test('blocks localhost webhook URLs', () => {
  assert.equal(isBlockedWebhookUrl('http://localhost/hook'), true);
  assert.equal(isBlockedWebhookUrl('http://127.0.0.1/hook'), true);
});

test('blocks cloud metadata endpoint', () => {
  assert.equal(isBlockedWebhookUrl('http://169.254.169.254/latest/meta-data'), true);
});

test('allows public https URLs', () => {
  assert.equal(isBlockedWebhookUrl('https://example.com/webhooks/rtc'), false);
});

test('blocks non-http schemes', () => {
  assert.equal(isBlockedWebhookUrl('ftp://example.com/hook'), true);
});

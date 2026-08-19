const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACCESS_TTL_MS,
  issueAccessToken,
  verifyAccessToken,
  publicBaseUrl
} = require('./xiaomiReauthAccess');

test('issues a tamper-resistant short-lived Xiaomi reauth token', () => {
  const now = Date.parse('2026-08-19T12:00:00Z');
  const token = issueAccessToken('test-secret', now);
  assert.equal(verifyAccessToken(token, 'test-secret', now + 60_000), true);
  assert.equal(verifyAccessToken(`${token}x`, 'test-secret', now + 60_000), false);
  assert.equal(verifyAccessToken(token, 'wrong-secret', now + 60_000), false);
  assert.equal(verifyAccessToken(token, 'test-secret', now + ACCESS_TTL_MS + 1), false);
});

test('uses only configured deployment origins for reauth links', () => {
  assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: 'https://power.example.com/' }), 'https://power.example.com');
  assert.equal(publicBaseUrl({ RAILWAY_PUBLIC_DOMAIN: 'power.up.railway.app' }), 'https://power.up.railway.app');
  assert.equal(publicBaseUrl({}), null);
});

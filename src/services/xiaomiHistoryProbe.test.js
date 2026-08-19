const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { LegacySession, _test } = require('./xiaomiHistoryProbe');

test('RC4 codec discards the Xiaomi prefix stream and round-trips bytes', () => {
  const key = crypto.randomBytes(32);
  const plaintext = Buffer.from('{"code":0,"result":[]}');
  const encrypted = _test.rc4(key, plaintext);
  assert.notDeepEqual(encrypted, plaintext);
  assert.deepEqual(_test.rc4(key, encrypted), plaintext);
});

test('extracts numeric energy values from Xiaomi stored JSON formats', () => {
  assert.equal(_test.parseStoredValue('[400]'), 400);
  assert.equal(_test.parseStoredValue('[[600]]'), 600);
  assert.equal(_test.parseStoredValue('0.6'), 0.6);
  assert.equal(_test.parseStoredValue('not-a-number'), null);
});

test('extracts the first daily statistic and uses Beijing midnight', () => {
  assert.equal(_test.parseStatisticsValue('[40,999]'), 40);
  assert.equal(_test.parseStatisticsValue('[60]'), 60);
  assert.equal(
    _test.beijingTodayStartSeconds(Date.parse('2026-08-11T14:30:00Z')),
    Date.parse('2026-08-10T16:00:00Z') / 1000
  );
});

test('signed nonce follows SHA-256 over decoded security and nonce', () => {
  const security = Buffer.from('security').toString('base64');
  const nonce = Buffer.from('123456789012').toString('base64');
  const expected = crypto.createHash('sha256')
    .update(Buffer.concat([Buffer.from('security'), Buffer.from('123456789012')]))
    .digest('base64');
  assert.equal(_test.signedNonce(security, nonce), expected);
});

test('recognizes an expired Xiaomi service token hidden behind HTTP 426', async () => {
  const session = LegacySession.fromAuth({
    deviceId: 'device-id',
    userId: 'user-id',
    ssecurity: Buffer.from('security').toString('base64'),
    serviceToken: 'expired-token'
  }, async () => new Response('{"code":0,"message":"SERVICETOKEN_EXPIRED"}', {
    status: 426,
    headers: { 'Content-Type': 'application/json' }
  }));

  await assert.rejects(
    () => session.apiPost('home/device_list', {}),
    error => error.kind === 'credentials'
      && error.code === 'SERVICETOKEN_EXPIRED'
      && error.message === '米家登录已过期，请重新连接'
  );
});

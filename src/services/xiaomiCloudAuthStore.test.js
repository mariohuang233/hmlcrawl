const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('./xiaomiCloudAuthStore');

test('encrypts and authenticates Xiaomi cloud session fields', () => {
  const previous = process.env.XIAOMI_CLOUD_ENCRYPTION_KEY;
  process.env.XIAOMI_CLOUD_ENCRYPTION_KEY = 'unit-test-only-encryption-secret';
  try {
    const auth = {
      version: 1,
      region: 'cn',
      deviceId: 'DEVICE123',
      userId: '10001',
      ssecurity: 'secret-signing-material',
      serviceToken: 'secret-service-token'
    };
    const encrypted = store._test.encrypt(auth);
    assert.equal(encrypted.ciphertext.includes(auth.serviceToken), false);
    assert.deepEqual(store._test.decrypt(encrypted), auth);
    const tamperedPrefix = encrypted.auth_tag.startsWith('A') ? 'B' : 'A';
    assert.throws(() => store._test.decrypt({ ...encrypted, auth_tag: `${tamperedPrefix}${encrypted.auth_tag.slice(1)}` }));
  } finally {
    if (previous === undefined) delete process.env.XIAOMI_CLOUD_ENCRYPTION_KEY;
    else process.env.XIAOMI_CLOUD_ENCRYPTION_KEY = previous;
  }
});

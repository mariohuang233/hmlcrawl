const crypto = require('crypto');
const XiaomiCloudCredential = require('../models/XiaomiCloudCredential');

function encryptionKey() {
  const secret = process.env.XIAOMI_CLOUD_ENCRYPTION_KEY || process.env.MONGO_URI;
  if (!secret) throw new Error('未配置米家会话加密密钥');
  return crypto.createHash('sha256')
    .update(`xiaomi-cloud-session-v1\0${secret}`)
    .digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final()
  ]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64')
  };
}

function decrypt(record) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(record.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}

async function save(auth) {
  const encrypted = encrypt(auth);
  await XiaomiCloudCredential.updateOne(
    { account: 'xiaomi-cn' },
    {
      $set: {
        ...encrypted,
        connected_at: new Date(),
        last_error: null
      },
      $unset: { backfill_completed_at: 1 }
    },
    { upsert: true }
  );
}

async function load() {
  const record = await XiaomiCloudCredential.findOne({ account: 'xiaomi-cn' }).lean();
  return record ? decrypt(record) : null;
}

async function updateStatus({ success, error, backfill = false }) {
  await XiaomiCloudCredential.updateOne(
    { account: 'xiaomi-cn' },
    { $set: success
      ? {
          last_sync_at: new Date(),
          last_error: null,
          ...(backfill ? { backfill_completed_at: new Date() } : {})
        }
      : { last_error: String(error || '同步失败').slice(0, 300) }
    }
  );
}

async function status() {
  const record = await XiaomiCloudCredential.findOne({ account: 'xiaomi-cn' })
    .select('connected_at last_sync_at backfill_completed_at last_error')
    .lean();
  return record || null;
}

module.exports = { save, load, updateStatus, status, _test: { encrypt, decrypt } };

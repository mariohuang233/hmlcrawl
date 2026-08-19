const crypto = require('crypto');

const ACCESS_TTL_MS = 2 * 60 * 60 * 1000;

function signingSecret(env = process.env) {
  return env.XIAOMI_REAUTH_SECRET || env.XIAOMI_CLOUD_ENCRYPTION_KEY || env.MONGO_URI || '';
}

function issueAccessToken(secret, now = Date.now()) {
  if (!secret) throw new Error('未配置米家网页授权签名密钥');
  const timestamp = String(now);
  const nonce = crypto.randomBytes(12).toString('base64url');
  const payload = `${timestamp}.${nonce}`;
  const signature = crypto.createHmac('sha256', secret)
    .update(`xiaomi-reauth-v1\0${payload}`)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifyAccessToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return false;
  const [timestampText, nonce, signature] = token.split('.');
  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp) || !nonce || !signature) return false;
  const age = now - timestamp;
  if (age < -60_000 || age > ACCESS_TTL_MS) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(`xiaomi-reauth-v1\0${timestampText}.${nonce}`)
    .digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function publicBaseUrl(env = process.env) {
  const configured = env.PUBLIC_BASE_URL || env.RAILWAY_STATIC_URL;
  if (configured) return String(configured).replace(/\/+$/, '');
  if (env.RAILWAY_PUBLIC_DOMAIN) return `https://${String(env.RAILWAY_PUBLIC_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return null;
}

module.exports = {
  ACCESS_TTL_MS,
  signingSecret,
  issueAccessToken,
  verifyAccessToken,
  publicBaseUrl
};

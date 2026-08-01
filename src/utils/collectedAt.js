const DEFAULT_NAIVE_OFFSET = '+08:00';
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const TIMEZONE_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;

function parseCollectedAt(value, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const maxFutureSkewMs = options.maxFutureSkewMs ?? MAX_FUTURE_SKEW_MS;

  if (value === undefined || value === null || value === '') {
    return new Date(now);
  }

  let candidate;
  if (value instanceof Date) {
    candidate = new Date(value);
  } else {
    const raw = String(value).trim();
    const normalized = TIMEZONE_SUFFIX.test(raw) ? raw : `${raw}${DEFAULT_NAIVE_OFFSET}`;
    candidate = new Date(normalized);
  }

  if (Number.isNaN(candidate.getTime())) {
    throw new Error('collected_at 不是有效日期');
  }

  if (candidate.getTime() > now.getTime() + maxFutureSkewMs) {
    throw new Error('collected_at 超过服务器时间 5 分钟，请检查设备时区和时钟');
  }

  return candidate;
}

module.exports = {
  DEFAULT_NAIVE_OFFSET,
  MAX_FUTURE_SKEW_MS,
  parseCollectedAt
};

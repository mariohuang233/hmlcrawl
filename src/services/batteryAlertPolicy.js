function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig() {
  return {
    threshold: positiveNumber(process.env.BATTERY_ALERT_THRESHOLD, 1),
    cooldownHours: positiveNumber(process.env.BATTERY_ALERT_COOLDOWN_HOURS, 4),
    maxDataAgeMinutes: positiveNumber(process.env.BATTERY_ALERT_MAX_DATA_AGE_MINUTES, 30)
  };
}

function normalizeSource(source) {
  const value = String(source || '').toLowerCase();
  if (value === 'ipad' || value === 'mobile' || value === 'mobile-crawler') {
    return 'mobile-crawler';
  }
  if (value === 'cloud' || value === 'cloud-crawler') {
    return 'cloud-crawler';
  }
  return 'local-crawler';
}

function isFreshReading(collectedAt, maxAgeMinutes, now = new Date()) {
  const timestamp = collectedAt instanceof Date ? collectedAt : new Date(collectedAt);
  if (Number.isNaN(timestamp.getTime())) return false;
  const ageMs = now.getTime() - timestamp.getTime();
  return ageMs >= -5 * 60 * 1000 && ageMs <= maxAgeMinutes * 60 * 1000;
}

module.exports = {
  getConfig,
  normalizeSource,
  isFreshReading
};

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getConfig,
  normalizeSource,
  isFreshReading
} = require('./src/services/batteryAlertPolicy');

test('normalizeSource groups local mobile sources without including cloud logs', () => {
  assert.equal(normalizeSource('ipad'), 'mobile-crawler');
  assert.equal(normalizeSource('mobile'), 'mobile-crawler');
  assert.equal(normalizeSource('local'), 'local-crawler');
  assert.equal(normalizeSource('cloud'), 'cloud-crawler');
});

test('isFreshReading accepts current readings and rejects stale replays', () => {
  const now = new Date('2026-07-22T12:00:00.000Z');
  assert.equal(isFreshReading('2026-07-22T11:45:00.000Z', 30, now), true);
  assert.equal(isFreshReading('2026-07-22T11:20:00.000Z', 30, now), false);
  assert.equal(isFreshReading('2026-07-22T12:06:00.000Z', 30, now), false);
  assert.equal(isFreshReading('not-a-date', 30, now), false);
});

test('getConfig uses explicit positive values and safe defaults', () => {
  const original = {
    threshold: process.env.BATTERY_ALERT_THRESHOLD,
    cooldown: process.env.BATTERY_ALERT_COOLDOWN_HOURS,
    maxAge: process.env.BATTERY_ALERT_MAX_DATA_AGE_MINUTES
  };

  try {
    process.env.BATTERY_ALERT_THRESHOLD = '0.8';
    process.env.BATTERY_ALERT_COOLDOWN_HOURS = '6';
    process.env.BATTERY_ALERT_MAX_DATA_AGE_MINUTES = '45';
    assert.deepEqual(getConfig(), {
      threshold: 0.8,
      cooldownHours: 6,
      maxDataAgeMinutes: 45
    });

    process.env.BATTERY_ALERT_THRESHOLD = 'invalid';
    process.env.BATTERY_ALERT_COOLDOWN_HOURS = '0';
    process.env.BATTERY_ALERT_MAX_DATA_AGE_MINUTES = '-1';
    assert.deepEqual(getConfig(), {
      threshold: 1,
      cooldownHours: 4,
      maxDataAgeMinutes: 30
    });
  } finally {
    const restore = (name, value) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore('BATTERY_ALERT_THRESHOLD', original.threshold);
    restore('BATTERY_ALERT_COOLDOWN_HOURS', original.cooldown);
    restore('BATTERY_ALERT_MAX_DATA_AGE_MINUTES', original.maxAge);
  }
});

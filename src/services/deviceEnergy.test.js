const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateCumulativeUsage
} = require('./deviceEnergy');
const { beijingDateKey, withOther } = require('./deviceEnergyAnalytics');

test('calculates usage from a cumulative meter with a period baseline', () => {
  const result = calculateCumulativeUsage([
    { energy_kwh: 10.2, collected_at: '2026-08-09T16:00:00.000Z' },
    { energy_kwh: 10.7, collected_at: '2026-08-10T00:00:00.000Z' },
    { energy_kwh: 12.05, collected_at: '2026-08-10T08:00:00.000Z' }
  ], true);
  assert.equal(result.usageKwh, 1.85);
  assert.equal(result.complete, true);
  assert.equal(result.resetCount, 0);
});

test('continues counting after a cumulative meter reset', () => {
  const result = calculateCumulativeUsage([
    { energy_kwh: 8.5, collected_at: '2026-08-10T00:00:00.000Z' },
    { energy_kwh: 9, collected_at: '2026-08-10T01:00:00.000Z' },
    { energy_kwh: 0.2, collected_at: '2026-08-10T02:00:00.000Z' },
    { energy_kwh: 0.6, collected_at: '2026-08-10T03:00:00.000Z' }
  ], true);
  assert.equal(result.usageKwh, 1.1);
  assert.equal(result.resetCount, 1);
});

test('builds a Beijing-day device breakdown without losing Xiaomi precision', () => {
  assert.equal(beijingDateKey('2026-08-10T16:00:00.000Z'), '2026-08-11');
  assert.deepEqual(withOther({
    air_conditioner_kwh: 0.429,
    water_heater_kwh: 0.62
  }, 2), {
    air_conditioner_kwh: 0.429,
    water_heater_kwh: 0.62,
    other_kwh: 0.951
  });
});

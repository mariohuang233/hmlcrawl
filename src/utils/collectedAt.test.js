const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCollectedAt } = require('./collectedAt');

const NOW = new Date('2026-08-01T06:36:00.000Z');

test('preserves an explicit UTC timestamp', () => {
  const result = parseCollectedAt('2026-08-01T06:30:00.000Z', { now: NOW });
  assert.equal(result.toISOString(), '2026-08-01T06:30:00.000Z');
});

test('interprets a legacy timezone-less mobile timestamp as Beijing time', () => {
  const result = parseCollectedAt('2026-08-01T14:30:00.000', { now: NOW });
  assert.equal(result.toISOString(), '2026-08-01T06:30:00.000Z');
});

test('rejects timestamps that are clearly in the future', () => {
  assert.throws(
    () => parseCollectedAt('2026-08-01T07:00:00.000Z', { now: NOW }),
    /5 分钟/
  );
});

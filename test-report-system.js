const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPreviousDayRange,
  getPreviousWeekRange,
  getPreviousMonthRange,
  validatePeriodSummary
} = require('./src/services/reportAnalytics');
const {
  buildWeeklyMessage,
  buildMonthlyMessage,
  calculateNextWeeklyDelay,
  calculateNextMonthlyDelay
} = require('./src/services/summaryReport');
const { calculateNextReportDelay } = require('./src/services/dailyReport');

test('report ranges use complete previous Beijing periods', () => {
  const now = new Date('2026-07-30T02:00:00.000Z');

  const day = getPreviousDayRange(now);
  assert.equal(day.start.toISOString(), '2026-07-28T16:00:00.000Z');
  assert.equal(day.end.toISOString(), '2026-07-29T15:59:59.999Z');
  assert.equal(day.periodKey, '2026-07-29');

  const week = getPreviousWeekRange(now);
  assert.equal(week.start.toISOString(), '2026-07-19T16:00:00.000Z');
  assert.equal(week.end.toISOString(), '2026-07-26T15:59:59.999Z');

  const month = getPreviousMonthRange(new Date('2026-08-01T00:10:00.000Z'));
  assert.equal(month.start.toISOString(), '2026-06-30T16:00:00.000Z');
  assert.equal(month.end.toISOString(), '2026-07-31T15:59:59.999Z');
  assert.equal(month.periodKey, '2026-07');
});

test('weekly and monthly schedules use Beijing 08:00 and 08:05', () => {
  const now = new Date('2026-07-30T02:00:00.000Z');
  const weeklyTarget = new Date(now.getTime() + calculateNextWeeklyDelay(now));
  const monthlyTarget = new Date(now.getTime() + calculateNextMonthlyDelay(now));

  assert.equal(weeklyTarget.toISOString(), '2026-08-03T00:00:00.000Z');
  assert.equal(monthlyTarget.toISOString(), '2026-08-01T00:05:00.000Z');
});

test('daily schedule runs at Beijing 00:10 for the previous day', () => {
  const before = new Date('2026-07-30T16:05:00.000Z');
  const beforeTarget = new Date(before.getTime() + calculateNextReportDelay(before));
  assert.equal(beforeTarget.toISOString(), '2026-07-30T16:10:00.000Z');

  const after = new Date('2026-07-30T16:11:00.000Z');
  const afterTarget = new Date(after.getTime() + calculateNextReportDelay(after));
  assert.equal(afterTarget.toISOString(), '2026-07-31T16:10:00.000Z');
});

test('period validation rejects missing and stale data', () => {
  const originalMin = process.env.REPORT_MIN_DATA_POINTS;
  try {
    process.env.REPORT_MIN_DATA_POINTS = '2';
    const end = new Date('2026-07-29T15:59:59.999Z');

    assert.equal(validatePeriodSummary({
      end,
      dataPoints: 0,
      remainingKwh: null,
      latestCollectedAt: null
    }).valid, false);

    assert.equal(validatePeriodSummary({
      end,
      dataPoints: 2,
      remainingKwh: 10,
      latestCollectedAt: new Date('2026-07-29T14:00:00.000Z')
    }).valid, false);

    assert.equal(validatePeriodSummary({
      end,
      dataPoints: 2,
      remainingKwh: 10,
      latestCollectedAt: new Date('2026-07-29T15:50:00.000Z')
    }).valid, true);
  } finally {
    if (originalMin === undefined) delete process.env.REPORT_MIN_DATA_POINTS;
    else process.env.REPORT_MIN_DATA_POINTS = originalMin;
  }
});

function makeSummary(start, end) {
  return {
    start,
    end,
    totalUsage: 21,
    dailyUsage: [
      { date: '2026-07-20', usageKwh: 2 },
      { date: '2026-07-21', usageKwh: 4 }
    ],
    hourlyUsage: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      kwh: hour >= 18 ? 0.8 : 0.2,
      count: 1
    })),
    rechargeCount: 2,
    rechargeKwh: 40,
    rechargeTimes: [
      new Date('2026-07-05T00:00:00.000Z'),
      new Date('2026-07-20T00:00:00.000Z')
    ],
    remainingKwh: 18,
    latestCollectedAt: end,
    coveragePercent: 96
  };
}

test('weekly and monthly templates contain the agreed sections', () => {
  const start = new Date('2026-07-19T16:00:00.000Z');
  const end = new Date('2026-07-26T15:59:59.999Z');
  const current = makeSummary(start, end);
  const previous = { ...makeSummary(start, end), totalUsage: 18 };

  const weekly = buildWeeklyMessage(current, previous);
  assert.match(weekly.title, /用电周报/);
  assert.match(weekly.message, /本周概览/);
  assert.match(weekly.message, /余额与充值/);
  assert.match(weekly.message, /数据完整率：96%/);

  const monthly = buildMonthlyMessage(current, previous);
  assert.match(monthly.title, /用电月报/);
  assert.match(monthly.message, /月度亮点/);
  assert.match(monthly.message, /用电最高周/);
  assert.match(monthly.message, /平均充值间隔/);
  assert.match(monthly.message, /月度建议/);
});

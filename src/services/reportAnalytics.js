const Usage = require('../models/Usage');

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBeijingParts(date) {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

function beijingDateStartUtc(year, month, day) {
  return new Date(Date.UTC(year, month, day) - BEIJING_OFFSET_MS);
}

function formatDateKey(date) {
  const parts = toBeijingParts(date);
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatChineseDate(date, includeYear = false) {
  const parts = toBeijingParts(date);
  return includeYear
    ? `${parts.year}年${parts.month + 1}月${parts.day}日`
    : `${parts.month + 1}月${parts.day}日`;
}

function getPreviousDayRange(now = new Date()) {
  const parts = toBeijingParts(now);
  const currentStart = beijingDateStartUtc(parts.year, parts.month, parts.day);
  const start = new Date(currentStart.getTime() - DAY_MS);
  return {
    start,
    end: new Date(currentStart.getTime() - 1),
    periodKey: formatDateKey(start)
  };
}

function getPreviousWeekRange(now = new Date()) {
  const parts = toBeijingParts(now);
  const currentDayStart = beijingDateStartUtc(parts.year, parts.month, parts.day);
  const daysSinceMonday = parts.weekday === 0 ? 6 : parts.weekday - 1;
  const currentWeekStart = new Date(currentDayStart.getTime() - daysSinceMonday * DAY_MS);
  const start = new Date(currentWeekStart.getTime() - 7 * DAY_MS);
  const end = new Date(currentWeekStart.getTime() - 1);
  return {
    start,
    end,
    periodKey: `${formatDateKey(start)}_${formatDateKey(end)}`
  };
}

function getPreviousMonthRange(now = new Date()) {
  const parts = toBeijingParts(now);
  const currentMonthStart = beijingDateStartUtc(parts.year, parts.month, 1);
  const previousMonthAnchor = new Date(currentMonthStart.getTime() - DAY_MS);
  const previousParts = toBeijingParts(previousMonthAnchor);
  const start = beijingDateStartUtc(previousParts.year, previousParts.month, 1);
  return {
    start,
    end: new Date(currentMonthStart.getTime() - 1),
    periodKey: `${previousParts.year}-${String(previousParts.month + 1).padStart(2, '0')}`
  };
}

function shiftRange(range, mode) {
  if (mode === 'month') {
    const startParts = toBeijingParts(range.start);
    const end = new Date(range.start.getTime() - 1);
    const previousParts = toBeijingParts(end);
    return {
      start: beijingDateStartUtc(previousParts.year, previousParts.month, 1),
      end,
      periodKey: `${previousParts.year}-${String(previousParts.month + 1).padStart(2, '0')}`
    };
  }

  const duration = range.end.getTime() - range.start.getTime() + 1;
  const start = new Date(range.start.getTime() - duration);
  return {
    start,
    end: new Date(range.start.getTime() - 1),
    periodKey: mode === 'day'
      ? formatDateKey(start)
      : `${formatDateKey(start)}_${formatDateKey(new Date(range.start.getTime() - 1))}`
  };
}

async function calculatePeriodSummary(meterId, range) {
  const [baseline, readings] = await Promise.all([
    Usage.findOne({
      meter_id: meterId,
      collected_at: { $lt: range.start }
    })
      .select('remaining_kwh collected_at')
      .sort({ collected_at: -1 })
      .lean(),
    Usage.find({
      meter_id: meterId,
      collected_at: { $gte: range.start, $lte: range.end }
    })
      .select('remaining_kwh collected_at')
      .sort({ collected_at: 1 })
      .lean()
  ]);

  const sequence = baseline ? [baseline, ...readings] : readings;
  const dailyMap = new Map();
  const hourlyUsage = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    kwh: 0,
    count: 0
  }));
  let totalUsage = 0;
  let validPoints = 0;
  let rechargeCount = 0;
  let rechargeKwh = 0;
  const rechargeTimes = [];

  for (let index = 1; index < sequence.length; index++) {
    const previous = sequence[index - 1];
    const current = sequence[index];
    if (current.collected_at < range.start || current.collected_at > range.end) continue;

    const difference = previous.remaining_kwh - current.remaining_kwh;
    if (difference >= 0) {
      totalUsage += difference;
      validPoints++;
      const dateKey = formatDateKey(current.collected_at);
      dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + difference);
      const hour = toBeijingParts(current.collected_at).hour;
      hourlyUsage[hour].kwh += difference;
      hourlyUsage[hour].count++;
    } else if (Math.abs(difference) > 0.1) {
      rechargeCount++;
      rechargeKwh += Math.abs(difference);
      rechargeTimes.push(current.collected_at);
    }
  }

  const expectedIntervalMinutes = positiveNumber(
    process.env.REPORT_EXPECTED_INTERVAL_MINUTES,
    10
  );
  const periodMinutes = (range.end.getTime() - range.start.getTime() + 1) / 60000;
  const expectedPoints = Math.max(1, Math.floor(periodMinutes / expectedIntervalMinutes));
  const coveragePercent = Math.min(100, Math.round(readings.length / expectedPoints * 100));
  const dailyUsage = [...dailyMap.entries()]
    .map(([date, usageKwh]) => ({
      date,
      usageKwh: Math.round(usageKwh * 100) / 100
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...range,
    dataPoints: readings.length,
    validPoints,
    totalUsage: Math.round(totalUsage * 100) / 100,
    dailyUsage,
    hourlyUsage: hourlyUsage.map(item => ({
      ...item,
      kwh: Math.round(item.kwh * 100) / 100
    })),
    rechargeCount,
    rechargeKwh: Math.round(rechargeKwh * 100) / 100,
    rechargeTimes,
    remainingKwh: readings.length > 0
      ? readings[readings.length - 1].remaining_kwh
      : null,
    latestCollectedAt: readings.length > 0
      ? readings[readings.length - 1].collected_at
      : null,
    coveragePercent
  };
}

function validatePeriodSummary(summary) {
  const minDataPoints = positiveNumber(process.env.REPORT_MIN_DATA_POINTS, 12);
  const maxDataAgeMinutes = positiveNumber(process.env.REPORT_MAX_DATA_AGE_MINUTES, 30);

  if (!summary || summary.remainingKwh === null || !summary.latestCollectedAt) {
    return { valid: false, reason: '统计区间内没有可用读数' };
  }
  if (summary.dataPoints < minDataPoints) {
    return {
      valid: false,
      reason: `有效采样不足：仅 ${summary.dataPoints} 条，至少需要 ${minDataPoints} 条`
    };
  }

  const ageMinutes = (summary.end.getTime() - summary.latestCollectedAt.getTime()) / 60000;
  if (ageMinutes > maxDataAgeMinutes) {
    return {
      valid: false,
      reason: `期末数据已过期：最后采集距统计截止 ${Math.round(ageMinutes)} 分钟`
    };
  }

  return { valid: true };
}

module.exports = {
  DAY_MS,
  toBeijingParts,
  beijingDateStartUtc,
  formatDateKey,
  formatChineseDate,
  getPreviousDayRange,
  getPreviousWeekRange,
  getPreviousMonthRange,
  shiftRange,
  calculatePeriodSummary,
  validatePeriodSummary
};

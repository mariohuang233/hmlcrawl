const { crawlerLogger } = require('../utils/logger');
const { formatBeijingTime } = require('../utils/timezone');
const {
  DAY_MS,
  toBeijingParts,
  formatChineseDate,
  getPreviousWeekRange,
  getPreviousMonthRange,
  shiftRange,
  calculatePeriodSummary,
  validatePeriodSummary
} = require('./reportAnalytics');
const { ReportDataError, deliverReport } = require('./reportNotificationService');
const { getDelivery } = require('./reportDeliveryService');

const CONFIG = {
  weeklyHour: 8,
  weeklyMinute: 0,
  monthlyHour: 8,
  monthlyMinute: 5,
  backupCheckMinutes: 10
};
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

let weeklyTimer = null;
let monthlyTimer = null;
let backupInterval = null;

function formatKwh(value) {
  return Number(value || 0).toFixed(2);
}

function comparisonText(current, previous) {
  const difference = Math.round((current - previous) * 100) / 100;
  if (previous <= 0) {
    return {
      direction: '暂无可比数据',
      value: Math.abs(difference).toFixed(2),
      percent: '—',
      sentence: '上期数据不足，暂不计算环比'
    };
  }

  const percent = Math.round(Math.abs(difference) / previous * 1000) / 10;
  if (difference > 0) {
    return {
      direction: '增加',
      value: difference.toFixed(2),
      percent: percent.toFixed(1),
      sentence: `较上期增加 ${difference.toFixed(2)} 度（${percent.toFixed(1)}%）`
    };
  }
  if (difference < 0) {
    return {
      direction: '减少',
      value: Math.abs(difference).toFixed(2),
      percent: percent.toFixed(1),
      sentence: `较上期减少 ${Math.abs(difference).toFixed(2)} 度（${percent.toFixed(1)}%）`
    };
  }
  return {
    direction: '持平',
    value: '0.00',
    percent: '0.0',
    sentence: '与上期持平'
  };
}

function getDailyExtremes(summary) {
  const days = summary.dailyUsage.filter(item => item.usageKwh > 0);
  if (days.length === 0) {
    return {
      max: { date: '暂无', usageKwh: 0 },
      min: { date: '暂无', usageKwh: 0 }
    };
  }
  return {
    max: days.reduce((best, item) => item.usageKwh > best.usageKwh ? item : best),
    min: days.reduce((best, item) => item.usageKwh < best.usageKwh ? item : best)
  };
}

function getPeakPeriod(summary) {
  const periods = [
    { label: '0:00-6:00', value: summary.hourlyUsage.slice(0, 6).reduce((sum, item) => sum + item.kwh, 0) },
    { label: '6:00-12:00', value: summary.hourlyUsage.slice(6, 12).reduce((sum, item) => sum + item.kwh, 0) },
    { label: '12:00-18:00', value: summary.hourlyUsage.slice(12, 18).reduce((sum, item) => sum + item.kwh, 0) },
    { label: '18:00-24:00', value: summary.hourlyUsage.slice(18, 24).reduce((sum, item) => sum + item.kwh, 0) }
  ];
  const peak = periods.reduce((best, item) => item.value > best.value ? item : best);
  return {
    ...peak,
    percent: summary.totalUsage > 0
      ? Math.round(peak.value / summary.totalUsage * 100)
      : 0
  };
}

function getWeekdayWeekendStats(summary) {
  let weekdayTotal = 0;
  let weekdayCount = 0;
  let weekendTotal = 0;
  let weekendCount = 0;

  summary.dailyUsage.forEach(item => {
    const [year, month, day] = item.date.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      weekendTotal += item.usageKwh;
      weekendCount++;
    } else {
      weekdayTotal += item.usageKwh;
      weekdayCount++;
    }
  });

  return {
    weekdayAverage: weekdayCount > 0 ? weekdayTotal / weekdayCount : 0,
    weekendAverage: weekendCount > 0 ? weekendTotal / weekendCount : 0
  };
}

function getHighestWeek(summary) {
  const weeks = new Map();
  summary.dailyUsage.forEach(item => {
    const [year, month, day] = item.date.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay();
    const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
    const monday = new Date(date.getTime() - daysSinceMonday * DAY_MS);
    const key = monday.toISOString().slice(0, 10);
    weeks.set(key, (weeks.get(key) || 0) + item.usageKwh);
  });

  if (weeks.size === 0) {
    return { range: '暂无', usageKwh: 0 };
  }
  const [startKey, usageKwh] = [...weeks.entries()]
    .reduce((best, item) => item[1] > best[1] ? item : best);
  const start = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return {
    range: `${formatChineseDate(start)}—${formatChineseDate(end)}`,
    usageKwh
  };
}

function getAverageRechargeInterval(summary) {
  if (!summary.rechargeTimes || summary.rechargeTimes.length < 2) {
    return '暂无足够记录';
  }
  const sorted = [...summary.rechargeTimes].sort((a, b) => a - b);
  let totalInterval = 0;
  for (let index = 1; index < sorted.length; index++) {
    totalInterval += sorted[index].getTime() - sorted[index - 1].getTime();
  }
  return `${(totalInterval / (sorted.length - 1) / DAY_MS).toFixed(1)} 天`;
}

function estimateRemaining(summary, dayCount) {
  const dailyAverage = dayCount > 0 ? summary.totalUsage / dayCount : 0;
  if (dailyAverage <= 0 || summary.remainingKwh === null) {
    return { dailyAverage, days: null, depletionTime: '数据不足' };
  }
  const days = summary.remainingKwh / dailyAverage;
  const depletion = new Date(summary.end.getTime() + days * DAY_MS);
  return {
    dailyAverage,
    days,
    depletionTime: depletion.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  };
}

function buildInsight(comparison, peak, current, previous) {
  if (previous.totalUsage > 0) {
    const changePercent = Math.abs(current.totalUsage - previous.totalUsage) / previous.totalUsage * 100;
    if (changePercent >= 20) {
      return `本期用电${comparison.direction}${comparison.percent}%，主要高峰集中在 ${peak.label}，建议关注该时段的空调、热水器等高功率设备。`;
    }
  }
  return '本期用电整体平稳，未发现明显异常峰值。';
}

function assertValidSummary(summary) {
  const validation = validatePeriodSummary(summary);
  if (!validation.valid) {
    throw new ReportDataError(validation.reason, {
      dataPoints: summary.dataPoints,
      latestCollectedAt: summary.latestCollectedAt
    });
  }
}

async function fetchSummaryData(meterId, range, comparisonMode) {
  const previousRange = shiftRange(range, comparisonMode);
  const [current, previous] = await Promise.all([
    calculatePeriodSummary(meterId, range),
    calculatePeriodSummary(meterId, previousRange)
  ]);
  assertValidSummary(current);
  return { current, previous };
}

function buildWeeklyMessage(current, previous) {
  const dayCount = 7;
  const comparison = comparisonText(current.totalUsage, previous.totalUsage);
  const extremes = getDailyExtremes(current);
  const peak = getPeakPeriod(current);
  const dayTypes = getWeekdayWeekendStats(current);
  const estimate = estimateRemaining(current, dayCount);
  const insight = buildInsight(comparison, peak, current, previous);
  const dashboardUrl = process.env.DASHBOARD_URL || '';
  const rechargeUrl = `https://www.wap.cnyiot.com/nat/pay.aspx?mid=${encodeURIComponent(process.env.METER_ID || '18100071580')}`;
  const period = `${formatChineseDate(current.start)}—${formatChineseDate(current.end)}`;

  return {
    title: `📊 用电周报｜${period}`,
    message: [
      `本周共用电 ${formatKwh(current.totalUsage)} 度，日均 ${formatKwh(estimate.dailyAverage)} 度，`,
      `${comparison.sentence}。`,
      '',
      '📈 本周概览',
      `最高：${extremes.max.date}，${formatKwh(extremes.max.usageKwh)} 度`,
      `最低：${extremes.min.date}，${formatKwh(extremes.min.usageKwh)} 度`,
      `高峰时段：${peak.label}，占本周用电 ${peak.percent}%`,
      `周末日均：${formatKwh(dayTypes.weekendAverage)} 度`,
      `工作日日均：${formatKwh(dayTypes.weekdayAverage)} 度`,
      '',
      '🔋 余额与充值',
      `当前余额：${formatKwh(current.remainingKwh)} 度`,
      `本周充值：${current.rechargeCount} 次，共 ${formatKwh(current.rechargeKwh)} 度`,
      `按近期用电习惯，预计可使用至 ${estimate.depletionTime}`,
      '',
      '💡 本周观察',
      insight,
      '',
      `数据完整率：${current.coveragePercent}%`,
      `最新采集：${current.latestCollectedAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
      dashboardUrl
        ? `👉 [查看详情](${dashboardUrl}) ｜ [立即充值](${rechargeUrl})`
        : `👉 [立即充值](${rechargeUrl})`
    ].join('\n')
  };
}

function buildMonthlyMessage(current, previous) {
  const daysInMonth = Math.round((current.end.getTime() - current.start.getTime() + 1) / DAY_MS);
  const comparison = comparisonText(current.totalUsage, previous.totalUsage);
  const extremes = getDailyExtremes(current);
  const peak = getPeakPeriod(current);
  const dayTypes = getWeekdayWeekendStats(current);
  const highestWeek = getHighestWeek(current);
  const estimate = estimateRemaining(current, daysInMonth);
  const insight = buildInsight(comparison, peak, current, previous);
  const dashboardUrl = process.env.DASHBOARD_URL || '';
  const rechargeUrl = `https://www.wap.cnyiot.com/nat/pay.aspx?mid=${encodeURIComponent(process.env.METER_ID || '18100071580')}`;
  const monthParts = toBeijingParts(current.start);
  const price = Number(process.env.ELECTRICITY_PRICE_PER_KWH);
  const costLine = Number.isFinite(price) && price > 0
    ? `按 ${price.toFixed(2)} 元/度估算，本月电费约 ${(current.totalUsage * price).toFixed(2)} 元。`
    : null;
  const weekdayWeekendSummary = dayTypes.weekendAverage > dayTypes.weekdayAverage
    ? `周末日均比工作日高 ${formatKwh(dayTypes.weekendAverage - dayTypes.weekdayAverage)} 度`
    : `工作日日均比周末高 ${formatKwh(dayTypes.weekdayAverage - dayTypes.weekendAverage)} 度`;

  const lines = [
    `本月共用电 ${formatKwh(current.totalUsage)} 度，日均 ${formatKwh(estimate.dailyAverage)} 度，`,
    `${comparison.sentence}。`
  ];
  if (costLine) lines.push(costLine);
  lines.push(
    '',
    '📊 月度亮点',
    `用电最高日：${extremes.max.date}，${formatKwh(extremes.max.usageKwh)} 度`,
    `用电最低日：${extremes.min.date}，${formatKwh(extremes.min.usageKwh)} 度`,
    `用电最高周：${highestWeek.range}，共 ${formatKwh(highestWeek.usageKwh)} 度`,
    `主要高峰：${peak.label}，占全月 ${peak.percent}%`,
    `工作日与周末差异：${weekdayWeekendSummary}`,
    '',
    '🔌 充值与余额',
    `本月充值 ${current.rechargeCount} 次，共 ${formatKwh(current.rechargeKwh)} 度`,
    `平均充值间隔：${getAverageRechargeInterval(current)}`,
    `月末余额：${formatKwh(current.remainingKwh)} 度`,
    `预计可使用至：${estimate.depletionTime}`,
    '',
    '💡 月度建议',
    insight,
    '',
    `数据完整率：${current.coveragePercent}%`,
    `统计区间：${formatChineseDate(current.start, true)}—${formatChineseDate(current.end, true)}`,
    dashboardUrl
      ? `👉 [查看完整趋势](${dashboardUrl}) ｜ [立即充值](${rechargeUrl})`
      : `👉 [立即充值](${rechargeUrl})`
  );

  return {
    title: `🗓️ ${monthParts.year}年${monthParts.month + 1}月用电月报`,
    message: lines.join('\n')
  };
}

async function sendWeeklyReport(now = new Date()) {
  const meterId = process.env.METER_ID || '18100071580';
  const range = getPreviousWeekRange(now);
  return deliverReport({
    reportType: 'weekly',
    meterId,
    periodKey: range.periodKey,
    buildReport: async () => {
      const { current, previous } = await fetchSummaryData(meterId, range, 'week');
      return buildWeeklyMessage(current, previous);
    }
  });
}

async function sendMonthlyReport(now = new Date()) {
  const meterId = process.env.METER_ID || '18100071580';
  const range = getPreviousMonthRange(now);
  return deliverReport({
    reportType: 'monthly',
    meterId,
    periodKey: range.periodKey,
    buildReport: async () => {
      const { current, previous } = await fetchSummaryData(meterId, range, 'month');
      return buildMonthlyMessage(current, previous);
    }
  });
}

function targetUtcMs(year, month, day, hour, minute) {
  return Date.UTC(year, month, day, hour, minute) - 8 * 60 * 60 * 1000;
}

function calculateNextWeeklyDelay(now = new Date()) {
  const parts = toBeijingParts(now);
  let daysAhead = (1 - parts.weekday + 7) % 7;
  let target = targetUtcMs(
    parts.year,
    parts.month,
    parts.day + daysAhead,
    CONFIG.weeklyHour,
    CONFIG.weeklyMinute
  );
  if (target <= now.getTime()) {
    daysAhead += 7;
    target = targetUtcMs(
      parts.year,
      parts.month,
      parts.day + daysAhead,
      CONFIG.weeklyHour,
      CONFIG.weeklyMinute
    );
  }
  return target - now.getTime();
}

function calculateNextMonthlyDelay(now = new Date()) {
  const parts = toBeijingParts(now);
  let target = targetUtcMs(
    parts.year,
    parts.month,
    1,
    CONFIG.monthlyHour,
    CONFIG.monthlyMinute
  );
  if (target <= now.getTime()) {
    target = targetUtcMs(
      parts.year,
      parts.month + 1,
      1,
      CONFIG.monthlyHour,
      CONFIG.monthlyMinute
    );
  }
  return target - now.getTime();
}

function scheduleWeekly() {
  clearTimeout(weeklyTimer);
  const delay = calculateNextWeeklyDelay();
  const wait = Math.min(delay, MAX_TIMER_MS);
  weeklyTimer = setTimeout(async () => {
    try {
      if (delay <= MAX_TIMER_MS) {
        await sendWeeklyReport();
      }
    } catch (error) {
      crawlerLogger.error(`周报定时任务失败: ${error.message}`);
    } finally {
      scheduleWeekly();
    }
  }, wait);
  crawlerLogger.info(`周报将在 ${formatBeijingTime(new Date(Date.now() + delay), 'datetime')} (北京时间) 触发`);
}

function scheduleMonthly() {
  clearTimeout(monthlyTimer);
  const delay = calculateNextMonthlyDelay();
  const wait = Math.min(delay, MAX_TIMER_MS);
  monthlyTimer = setTimeout(async () => {
    try {
      if (delay <= MAX_TIMER_MS) {
        await sendMonthlyReport();
      }
    } catch (error) {
      crawlerLogger.error(`月报定时任务失败: ${error.message}`);
    } finally {
      scheduleMonthly();
    }
  }, wait);
  crawlerLogger.info(`月报将在 ${formatBeijingTime(new Date(Date.now() + delay), 'datetime')} (北京时间) 触发`);
}

function checkMissedReports(now = new Date()) {
  const parts = toBeijingParts(now);
  const minutes = parts.hour * 60 + parts.minute;
  const graceEnd = 12 * 60;

  if (
    parts.weekday === 1 &&
    minutes >= CONFIG.weeklyHour * 60 + CONFIG.weeklyMinute &&
    minutes <= graceEnd
  ) {
    sendWeeklyReport(now).catch(error => {
      crawlerLogger.error(`周报补发检查失败: ${error.message}`);
    });
  }

  if (
    parts.day === 1 &&
    minutes >= CONFIG.monthlyHour * 60 + CONFIG.monthlyMinute &&
    minutes <= graceEnd
  ) {
    sendMonthlyReport(now).catch(error => {
      crawlerLogger.error(`月报补发检查失败: ${error.message}`);
    });
  }
}

function start() {
  if (weeklyTimer || monthlyTimer) return;
  scheduleWeekly();
  scheduleMonthly();
  checkMissedReports();
  backupInterval = setInterval(
    () => checkMissedReports(),
    CONFIG.backupCheckMinutes * 60 * 1000
  );
}

function stop() {
  if (weeklyTimer) clearTimeout(weeklyTimer);
  if (monthlyTimer) clearTimeout(monthlyTimer);
  if (backupInterval) clearInterval(backupInterval);
  weeklyTimer = null;
  monthlyTimer = null;
  backupInterval = null;
}

async function getStatus() {
  const meterId = process.env.METER_ID || '18100071580';
  const now = new Date();
  const weeklyRange = getPreviousWeekRange(now);
  const monthlyRange = getPreviousMonthRange(now);
  const [weeklyDelivery, monthlyDelivery] = await Promise.all([
    getDelivery('weekly', meterId, weeklyRange.periodKey),
    getDelivery('monthly', meterId, monthlyRange.periodKey)
  ]);

  return {
    running: !!weeklyTimer && !!monthlyTimer,
    weekly: {
      schedule: '每周一 08:00 (北京时间)',
      nextFire: formatBeijingTime(
        new Date(now.getTime() + calculateNextWeeklyDelay(now)),
        'datetime'
      ),
      latestPeriod: weeklyRange.periodKey,
      deliveryStatus: weeklyDelivery?.status || 'pending'
    },
    monthly: {
      schedule: '每月1日 08:05 (北京时间)',
      nextFire: formatBeijingTime(
        new Date(now.getTime() + calculateNextMonthlyDelay(now)),
        'datetime'
      ),
      latestPeriod: monthlyRange.periodKey,
      deliveryStatus: monthlyDelivery?.status || 'pending'
    }
  };
}

module.exports = {
  start,
  stop,
  getStatus,
  sendWeeklyReport,
  sendMonthlyReport,
  buildWeeklyMessage,
  buildMonthlyMessage,
  calculateNextWeeklyDelay,
  calculateNextMonthlyDelay
};

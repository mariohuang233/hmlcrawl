const Usage = require('../models/Usage');
const CrawlerLog = require('../models/CrawlerLog');
const electricityAssistant = require('./electricityAssistant');
const xiaomiCloudAuthStore = require('./xiaomiCloudAuthStore');
const { getDeviceMonthlyMap, withOther } = require('./deviceEnergyAnalytics');
const {
  getBeijingTodayStart,
  getBeijingWeekStart,
  getBeijingMonthStart
} = require('../utils/timezone');

const DAY_MS = 24 * 60 * 60 * 1000;

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percentageChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return round(((current - previous) / previous) * 100, 1);
}

function dateKey(date) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildOverview(context, earliestData, recentCrawlResults, monthlyTrend, now) {
  const successfulCrawls = recentCrawlResults.filter(log => log.action === 'success').length;
  const recentSuccessRate = recentCrawlResults.length
    ? round((successfulCrawls / recentCrawlResults.length) * 100, 1)
    : null;
  const latestCollectedAt = context.updatedAt;
  const dataAgeMinutes = latestCollectedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(latestCollectedAt).getTime()) / 60000))
    : null;
  const projectedDaily = Number(context.projectedTodayUsage || context.todayUsage || 0);
  const consumptionRate = projectedDaily > 0 ? projectedDaily / 24 : 0;
  const hoursRemaining = consumptionRate > 0 ? context.remainingKwh / consumptionRate : null;
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const elapsedDays = Math.max(1, beijingNow.getUTCDate());
  const daysInMonth = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth() + 1, 0)).getUTCDate();
  const monthCost = round((context.monthUsage / elapsedDays) * daysInMonth);
  const electricityPrice = Number(process.env.ELECTRICITY_PRICE_PER_KWH || 1);
  const monthStart = getBeijingMonthStart(now);
  const weekStart = getBeijingWeekStart(now);
  const previousMonth = monthlyTrend.at(-2);
  const lastMonthUsage = round(previousMonth?.used_kwh);
  const lastMonthCost = round(lastMonthUsage * electricityPrice);
  const earliestAt = earliestData?.collected_at ? new Date(earliestData.collected_at) : null;
  const actualWeekStart = earliestAt && earliestAt > weekStart ? earliestAt : weekStart;
  const actualMonthStart = earliestAt && earliestAt > monthStart ? earliestAt : monthStart;

  return {
    current_remaining: context.remainingKwh,
    latest_collected_at: latestCollectedAt,
    data_age_minutes: dataAgeMinutes,
    collection_source: context.collectionSource,
    recent_success_rate: recentSuccessRate,
    recent_attempts: recentCrawlResults.length,
    today_usage: context.todayUsage,
    week_usage: context.weekUsage,
    month_usage: context.monthUsage,
    month_cost: monthCost,
    comparisons: {
      today_vs_yesterday: percentageChange(context.todayUsage, context.yesterdayUsage),
      today_vs_last_week_same_day: percentageChange(context.todayUsage, context.previousWeekSameUsage),
      week_vs_last_week: percentageChange(context.weekUsage, context.previousWeekUsage),
      month_vs_last_month: percentageChange(context.monthUsage, lastMonthUsage),
      cost_vs_last_month: percentageChange(monthCost, lastMonthCost),
      yesterday_usage: context.yesterdayUsage,
      last_week_same_day_usage: context.previousWeekSameUsage,
      last_week_usage: context.previousWeekUsage,
      last_month_usage: lastMonthUsage,
      last_month_cost: lastMonthCost
    },
    predicted_depletion: {
      predicted_time: hoursRemaining ? new Date(now.getTime() + hoursRemaining * 60 * 60 * 1000) : null,
      hours_remaining: hoursRemaining ? round(hoursRemaining, 1) : null,
      consumption_rate: consumptionRate ? round(consumptionRate, 3) : null,
      status: hoursRemaining ? 'success' : 'insufficient_data',
      message: hoursRemaining ? '根据今日用电节奏估算' : '数据不足，无法预测',
      data_points: context.todayDataPoints
    },
    data_coverage: {
      earliest_data: earliestData?.collected_at || null,
      week_data_complete: Boolean(earliestData?.collected_at && new Date(earliestData.collected_at) <= new Date(now.getTime() - 7 * DAY_MS)),
      month_data_complete: Boolean(earliestData?.collected_at && new Date(earliestData.collected_at) <= monthStart),
      week_actual_start: actualWeekStart.toISOString(),
      month_actual_start: actualMonthStart.toISOString()
    }
  };
}

function buildToday(context) {
  const todayByHour = new Map(context.todayHourly.map(item => [item.hour, item.kwh]));
  const yesterdayByHour = new Map(context.yesterdayHourly.map(item => [item.hour, item.kwh]));
  const rawTodayBreakdown = context.dashboard.deviceDailyBreakdowns[dateKey(getBeijingTodayStart(new Date(context.generatedAt)))];
  const todayBreakdown = { ...withOther(rawTodayBreakdown, context.todayUsage), available: Boolean(rawTodayBreakdown) };
  return Array.from({ length: 24 }, (_, hour) => {
    const today = round(todayByHour.get(hour));
    const yesterday = round(yesterdayByHour.get(hour));
    const average = round(context.dashboard.averageHourly[hour]);
    return {
      hour,
      used_kwh: today,
      yesterday_used_kwh: yesterday,
      avg_used_kwh: average,
      vs_yesterday: percentageChange(today, yesterday),
      vs_avg: percentageChange(today, average),
      device_breakdown: todayBreakdown
    };
  });
}

function buildThirtyDays(context) {
  return context.dashboard.thirtyDayUsage.map((item, index, items) => {
    const previous = index ? items[index - 1].usageKwh : 0;
    const rawBreakdown = context.dashboard.deviceDailyBreakdowns[item.date];
    return {
      date: item.date,
      used_kwh: item.usageKwh,
      prev_day_used_kwh: previous,
      vs_prev_day: index ? percentageChange(item.usageKwh, previous) : null,
      device_breakdown: { ...withOther(rawBreakdown, item.usageKwh), available: Boolean(rawBreakdown) }
    };
  });
}

function buildMonthly(monthlyBuckets, deviceMonthly, now) {
  const usageByMonth = Object.fromEntries(monthlyBuckets.map(item => [item.key, Number(item.used_kwh || 0)]));
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth() - 11 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  return months.map((month, index) => {
    const usage = round(usageByMonth[month]);
    const previous = index ? round(usageByMonth[months[index - 1]]) : 0;
    return {
      month,
      used_kwh: usage,
      prev_month_used_kwh: previous,
      vs_prev_month: index ? percentageChange(usage, previous) : null,
      device_breakdown: withOther(deviceMonthly.get(month), usage)
    };
  });
}

function buildDeviceSummary(context, xiaomiStatus) {
  const electricityPrice = Number(process.env.ELECTRICITY_PRICE_PER_KWH || 1);
  const deviceUpdatedAt = xiaomiStatus?.last_sync_at || null;
  const devices = context.deviceEnergy.devices.filter(device => !device.estimated).map(device => ({
    device_id: device.id,
    device_name: device.name,
    entity_id: null,
    today_kwh: device.todayKwh,
    month_kwh: device.monthKwh,
    updated_at: deviceUpdatedAt,
    coverage: { today_complete: device.todayComplete !== false, month_complete: true }
  }));
  const monitoredToday = round(devices.reduce((sum, device) => sum + device.today_kwh, 0));
  const monitoredMonth = round(devices.reduce((sum, device) => sum + device.month_kwh, 0));
  return {
    success: true,
    configured: context.deviceEnergy.configured,
    updated_at: deviceUpdatedAt,
    sync: {
      status: xiaomiStatus?.reauth_required_at ? 'reauth_required' : xiaomiStatus?.last_error ? 'error' : 'ready',
      last_sync_at: deviceUpdatedAt,
      message: xiaomiStatus?.last_error || null
    },
    devices,
    totals: {
      today_kwh: context.todayUsage,
      month_kwh: context.monthUsage,
      monitored_today_kwh: monitoredToday,
      monitored_month_kwh: monitoredMonth,
      other_today_kwh: round(Math.max(0, context.todayUsage - monitoredToday)),
      other_month_kwh: round(Math.max(0, context.monthUsage - monitoredMonth)),
      monitored_month_cost: round(monitoredMonth * electricityPrice)
    }
  };
}

async function loadDashboardSnapshot(now = new Date()) {
  const meterId = process.env.METER_ID || '18100071580';
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const monthlyStart = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth() - 11, 1) - 8 * 60 * 60 * 1000);
  const recentLogStart = new Date(now.getTime() - DAY_MS);

  const [context, monthlyBuckets, deviceMonthly, rechargeHistory, earliestData, recentCrawlResults, xiaomiStatus] = await Promise.all([
    electricityAssistant.buildContext(),
    Usage.getUsageBuckets(meterId, monthlyStart, now, 'month'),
    getDeviceMonthlyMap(monthlyStart, now).catch(() => new Map()),
    Usage.getRechargeHistory(meterId, 50),
    Usage.findOne({ meter_id: meterId }).select('collected_at').sort({ collected_at: 1 }).lean(),
    CrawlerLog.find({ timestamp: { $gte: recentLogStart }, action: { $in: ['success', 'failed'] } })
      .select('action').sort({ timestamp: -1 }).limit(100).lean(),
    xiaomiCloudAuthStore.status().catch(() => null)
  ]);
  const briefing = await electricityAssistant.getBriefing();
  const monthlyTrend = buildMonthly(monthlyBuckets, deviceMonthly, now);

  return {
    generated_at: now.toISOString(),
    refresh_after_ms: 5 * 60 * 1000,
    modules: {
      overview: { status: 'ready', updated_at: context.updatedAt },
      trends: { status: 'ready', updated_at: context.updatedAt },
      devices: {
        status: xiaomiStatus?.reauth_required_at ? 'error' : context.deviceEnergy.configured ? 'ready' : 'empty',
        updated_at: xiaomiStatus?.last_sync_at || null
      },
      recharge: { status: rechargeHistory.error ? 'degraded' : 'ready', updated_at: context.updatedAt },
      assistant: { status: briefing.available ? 'ready' : 'degraded', updated_at: context.updatedAt }
    },
    overview: buildOverview(context, earliestData, recentCrawlResults, monthlyTrend, now),
    trends: {
      last24h: context.dashboard.last24Trend,
      today: buildToday(context),
      days30: buildThirtyDays(context),
      months12: monthlyTrend
    },
    device_energy: buildDeviceSummary(context, xiaomiStatus),
    recharge_history: rechargeHistory,
    assistant_briefing: briefing
  };
}

module.exports = { loadDashboardSnapshot };

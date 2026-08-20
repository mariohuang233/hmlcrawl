const Usage = require('../models/Usage');
const { getDeviceDailyMap, withOther } = require('./deviceEnergyAnalytics');
const {
  formatBeijingTime,
  getBeijingHour,
  getBeijingTodayStart,
  getBeijingWeekStart,
  getBeijingMonthStart
} = require('../utils/timezone');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_METER_ID = '18100071580';
const DEFAULT_AI_TIMEOUT_MS = 18000;

function boundedPositiveInteger(value, fallback, maximum = 60000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.round(parsed), maximum)
    : fallback;
}

function logAIWarning(message, metadata, silent = false) {
  if (!silent) require('../utils/logger').warn(message, metadata);
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percentageChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return round(((current - previous) / previous) * 100, 1);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatDelta(value) {
  if (value === 0) return '与对比时段持平';
  return `较对比时段${value > 0 ? '高' : '低'} ${Math.abs(value)}%`;
}

function bucketTime(bucket) {
  return Date.parse(`${bucket.key}T${String(Number(bucket.hour || 0)).padStart(2, '0')}:00:00+08:00`);
}

function statsFromHourlyBuckets(buckets, startDate, endDate) {
  const selected = buckets.filter(bucket => {
    const time = bucketTime(bucket);
    return time >= startDate.getTime() && time <= endDate.getTime();
  });
  return {
    totalUsage: round(selected.reduce((sum, bucket) => sum + Number(bucket.used_kwh || 0), 0)),
    dataPoints: selected.length,
    validPoints: selected.filter(bucket => Number(bucket.used_kwh || 0) > 0).length
  };
}

function hourlySeriesForDate(buckets, key) {
  const values = new Map(buckets.filter(bucket => bucket.key === key).map(bucket => [Number(bucket.hour), Number(bucket.used_kwh || 0)]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, kwh: round(values.get(hour)) }));
}

function dailyUsageFromHourlyBuckets(buckets, todayStart, daysCount = 8) {
  const totals = new Map();
  for (const bucket of buckets) totals.set(bucket.key, (totals.get(bucket.key) || 0) + Number(bucket.used_kwh || 0));
  return Array.from({ length: daysCount }, (_, index) => {
    const date = new Date(todayStart.getTime() - (daysCount - 1 - index) * DAY_MS);
    const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const key = beijingDate.toISOString().slice(0, 10);
    return { date: key, usageKwh: round(totals.get(key)), dayOfWeek: beijingDate.getUTCDay() };
  });
}

function dashboardDetails(last24Records, hourlyBuckets, deviceDaily, todayStart, now) {
  const dayMs = DAY_MS;
  const last24Start = new Date(now.getTime() - dayMs);
  const selectedLast24Records = last24Records.filter(record => new Date(record.collected_at) >= last24Start);
  const last24Trend = [];
  for (let index = 1; index < selectedLast24Records.length; index += 1) {
    const previous = selectedLast24Records[index - 1];
    const current = selectedLast24Records[index];
    const used = Number(previous.remaining_kwh) - Number(current.remaining_kwh);
    if (used < 0) continue;
    last24Trend.push({
      time: new Date(current.collected_at).toISOString(),
      used_kwh: round(used),
      remaining_kwh: round(current.remaining_kwh)
    });
  }

  const hourlyHistory = Array.from({ length: 24 }, () => ({ total: 0, dates: new Set() }));
  const todayKey = new Date(todayStart.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const bucket of hourlyBuckets) {
    if (bucket.key === todayKey) continue;
    const hour = Number(bucket.hour || 0);
    hourlyHistory[hour].total += Number(bucket.used_kwh || 0);
    hourlyHistory[hour].dates.add(bucket.key);
  }

  const deviceDailyBreakdowns = Object.fromEntries(
    [...deviceDaily.entries()].map(([date, value]) => [date, {
      air_conditioner_kwh: round(value.air_conditioner_kwh),
      water_heater_kwh: round(value.water_heater_kwh)
    }])
  );

  return {
    last24Trend,
    thirtyDayUsage: dailyUsageFromHourlyBuckets(hourlyBuckets, todayStart, 30),
    averageHourly: hourlyHistory.map(item => round(item.total / Math.max(1, item.dates.size))),
    deviceDailyBreakdowns
  };
}

function summarizeDevices(deviceDaily, todayStart, todayUsage, monthUsage, now) {
  const dateKey = date => new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayKey = dateKey(todayStart);
  const monthStartKey = `${todayKey.slice(0, 7)}-01`;
  const todayComplete = deviceDaily.has(todayKey);
  const today = withOther(deviceDaily.get(todayKey), todayUsage);
  const monthMeasured = { air_conditioner_kwh: 0, water_heater_kwh: 0 };
  for (const [key, value] of deviceDaily.entries()) {
    if (key < monthStartKey) continue;
    monthMeasured.air_conditioner_kwh += Number(value.air_conditioner_kwh || 0);
    monthMeasured.water_heater_kwh += Number(value.water_heater_kwh || 0);
  }
  const month = withOther(monthMeasured, monthUsage);
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const elapsedDays = Math.max(1, beijingNow.getUTCDate());
  const completeDays = Math.max(1, elapsedDays - 1);
  const definitions = [
    ['air_conditioner', '空调', 'air_conditioner_kwh', false],
    ['water_heater', '热水器', 'water_heater_kwh', false],
    ['other', '其他电器', 'other_kwh', true]
  ];
  const devices = definitions.map(([id, name, key, estimated]) => {
    const todayKwh = round(today[key]);
    const monthKwh = round(month[key]);
    const completedMonthKwh = Math.max(0, monthKwh - todayKwh);
    const dailyAverageKwh = round(completedMonthKwh / completeDays);
    return {
      id,
      name,
      todayKwh,
      monthKwh,
      todayComplete,
      dailyAverageKwh,
      todayShare: todayUsage > 0 ? round((todayKwh / todayUsage) * 100, 1) : 0,
      versusDailyAverage: dailyAverageKwh > 0 ? percentageChange(todayKwh, dailyAverageKwh) : null,
      estimated
    };
  });
  const dominant = devices.reduce((best, item) => item.todayKwh > (best?.todayKwh || 0) ? item : best, null);
  return { configured: deviceDaily.size > 0, today, month, devices, dominant };
}

async function loadContext(now = new Date()) {
  const meterId = process.env.METER_ID || DEFAULT_METER_ID;
  const todayStart = getBeijingTodayStart(now);
  const elapsedMs = Math.max(0, now.getTime() - todayStart.getTime());
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const yesterdaySameTime = new Date(yesterdayStart.getTime() + elapsedMs);
  const yesterdayEnd = new Date(todayStart.getTime() - 1);
  const weekStart = getBeijingWeekStart(now);
  const monthStart = getBeijingMonthStart(now);
  const previousMonthEnd = new Date(monthStart.getTime() - 1);
  const previousMonthStart = getBeijingMonthStart(previousMonthEnd);
  const previousMonthSameEnd = new Date(Math.min(
    previousMonthEnd.getTime(),
    previousMonthStart.getTime() + Math.max(0, now.getTime() - monthStart.getTime())
  ));
  const sevenDaysStart = new Date(todayStart.getTime() - 7 * DAY_MS);
  const thirtyDaysStart = new Date(todayStart.getTime() - 29 * DAY_MS);
  const historyStart = new Date(todayStart.getTime() - 366 * DAY_MS);
  const previousWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);
  const previousWeekEnd = new Date(weekStart.getTime() - 1);
  const previousWeekSameEnd = new Date(previousWeekStart.getTime() + Math.max(0, now.getTime() - weekStart.getTime()));

  // Aggregate the long range in MongoDB and only transfer raw samples for the
  // 24-hour sparkline. This keeps the first dashboard/AI request lightweight.
  const queryStart = new Date(Math.min(monthStart.getTime(), thirtyDaysStart.getTime(), sevenDaysStart.getTime(), yesterdayStart.getTime(), previousWeekStart.getTime()));
  const last24Start = new Date(now.getTime() - DAY_MS);
  const [hourlyBuckets, last24Records, latest, deviceDaily] = await Promise.all([
    Usage.getUsageBuckets(meterId, queryStart, now, 'hour'),
    Usage.getUsageInRange(meterId, last24Start, now),
    Usage.getLatestUsage(meterId),
    getDeviceDailyMap(historyStart, now).catch(() => new Map())
  ]);
  const todayStats = statsFromHourlyBuckets(hourlyBuckets, todayStart, now);
  const yesterdaySameStats = statsFromHourlyBuckets(hourlyBuckets, yesterdayStart, yesterdaySameTime);
  const yesterdayStats = statsFromHourlyBuckets(hourlyBuckets, yesterdayStart, yesterdayEnd);
  const weekStats = statsFromHourlyBuckets(hourlyBuckets, weekStart, now);
  const previousWeekStats = statsFromHourlyBuckets(hourlyBuckets, previousWeekStart, previousWeekEnd);
  const previousWeekSameStats = statsFromHourlyBuckets(hourlyBuckets, previousWeekStart, previousWeekSameEnd);
  const monthStats = statsFromHourlyBuckets(hourlyBuckets, monthStart, now);
  const previousMonthStats = statsFromHourlyBuckets(hourlyBuckets, previousMonthStart, previousMonthEnd);
  const previousMonthSameStats = statsFromHourlyBuckets(hourlyBuckets, previousMonthStart, previousMonthSameEnd);
  const todayKey = new Date(todayStart.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const yesterdayKey = new Date(yesterdayStart.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dailyUsage = dailyUsageFromHourlyBuckets(hourlyBuckets, todayStart, 8);
  const dailyUsageHistory = dailyUsageFromHourlyBuckets(hourlyBuckets, todayStart, 62);

  const todayHourly = hourlySeriesForDate(hourlyBuckets, todayKey);
  const yesterdayHourly = hourlySeriesForDate(hourlyBuckets, yesterdayKey);
  const elapsedHours = Math.max(1, elapsedMs / (60 * 60 * 1000));
  const paceProjection = round((todayStats.totalUsage / elapsedHours) * 24);
  const samePeriodDelta = percentageChange(todayStats.totalUsage, yesterdaySameStats.totalUsage);
  const latestCollectedAt = latest?.collected_at || null;
  const activeHours = todayHourly.filter(item => item.kwh > 0);
  const peak = activeHours.reduce((best, item) => item.kwh > (best?.kwh || 0) ? item : best, null);
  const sevenDayPeak = dailyUsage.reduce((best, item) => item.usageKwh > (best?.usageKwh || 0) ? item : best, null);
  const deviceEnergy = summarizeDevices(deviceDaily, todayStart, todayStats.totalUsage, monthStats.totalUsage, now);
  const dashboard = dashboardDetails(last24Records, hourlyBuckets, deviceDaily, todayStart, now);
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const currentHour = beijingNow.getUTCHours();
  const currentDayType = [0, 6].includes(beijingNow.getUTCDay()) ? 'weekend' : 'weekday';
  const comparableTotals = new Map();
  for (const bucket of hourlyBuckets) {
    if (bucket.key === todayKey || Number(bucket.hour) >= currentHour) continue;
    const day = new Date(`${bucket.key}T00:00:00+08:00`);
    const dayType = [0, 6].includes(new Date(day.getTime() + 8 * 60 * 60 * 1000).getUTCDay()) ? 'weekend' : 'weekday';
    if (dayType !== currentDayType) continue;
    comparableTotals.set(bucket.key, (comparableTotals.get(bucket.key) || 0) + Number(bucket.used_kwh || 0));
  }
  const todayCompletedHoursUsage = round(todayHourly.slice(0, currentHour).reduce((sum, item) => sum + item.kwh, 0));
  const sameProgressMedian = median([...comparableTotals.values()]);

  return {
    meterId,
    generatedAt: now.toISOString(),
    updatedAt: latestCollectedAt ? new Date(latestCollectedAt).toISOString() : null,
    collectionSource: latest?.source || null,
    updatedLabel: latestCollectedAt ? formatBeijingTime(new Date(latestCollectedAt), 'time') : '暂无数据',
    remainingKwh: round(latest?.remaining_kwh),
    todayUsage: round(todayStats.totalUsage),
    yesterdaySameUsage: round(yesterdaySameStats.totalUsage),
    yesterdayUsage: round(yesterdayStats.totalUsage),
    weekUsage: round(weekStats.totalUsage),
    previousWeekUsage: round(previousWeekStats.totalUsage),
    previousWeekSameUsage: round(previousWeekSameStats.totalUsage),
    monthUsage: round(monthStats.totalUsage),
    previousMonthUsage: round(previousMonthStats.totalUsage),
    previousMonthSameUsage: round(previousMonthSameStats.totalUsage),
    samePeriodDelta,
    projectedTodayUsage: elapsedHours >= 3 && todayStats.dataPoints >= 2 ? paceProjection : null,
    todayDataPoints: todayStats.dataPoints,
    todayHourly,
    yesterdayHourly,
    peakHour: peak?.hour ?? null,
    peakHourUsage: peak?.kwh ?? null,
    sevenDayUsage: dailyUsage.slice(-7),
    sevenDayPeak,
    dailyUsage30: dashboard.thirtyDayUsage,
    dailyUsageHistory,
    availableDailyKeys: [...new Set(hourlyBuckets.map(item => item.key))],
    monthlyUsage12: [],
    sameProgressMedian: sameProgressMedian === null ? null : round(sameProgressMedian),
    sameProgressMedianDelta: sameProgressMedian ? percentageChange(todayCompletedHoursUsage, sameProgressMedian) : null,
    comparableDayCount: comparableTotals.size,
    dataAgeMinutes: latestCollectedAt ? round((now.getTime() - new Date(latestCollectedAt).getTime()) / 60000, 1) : null,
    deviceEnergy,
    dashboard,
    dataComplete: todayStats.dataPoints >= 2
  };
}

let contextCache = null;
let contextCacheExpiresAt = 0;
let contextLoadPromise = null;
let longRangeCache = null;
let longRangeCacheExpiresAt = 0;
let previousMonthCache = null;
let previousMonthCacheExpiresAt = 0;

function invalidateContextCache() {
  contextCache = null;
  contextCacheExpiresAt = 0;
  longRangeCache = null;
  longRangeCacheExpiresAt = 0;
  previousMonthCache = null;
  previousMonthCacheExpiresAt = 0;
}

async function buildContext(now) {
  // Explicit timestamps are used by tests and should never reuse live cache data.
  if (now) return loadContext(now);
  if (contextCache && Date.now() < contextCacheExpiresAt) return contextCache;
  if (contextLoadPromise) return contextLoadPromise;

  contextLoadPromise = loadContext()
    .then(context => {
      contextCache = context;
      contextCacheExpiresAt = Date.now() + 5 * 60 * 1000;
      return context;
    })
    .catch(error => {
      if (contextCache) return contextCache;
      throw error;
    })
    .finally(() => {
      contextLoadPromise = null;
    });
  return contextLoadPromise;
}

async function enrichContextForPlan(context, plan) {
  let enriched = context;
  const needsPreviousMonth = plan.timeRange.kind === 'last_month' ||
    (plan.timeRange.kind === 'this_month' && plan.action === 'compare');
  if (needsPreviousMonth && (!previousMonthCache || Date.now() >= previousMonthCacheExpiresAt)) {
    const now = new Date(context.generatedAt);
    const monthStart = getBeijingMonthStart(now);
    const previousMonthEnd = new Date(monthStart.getTime() - 1);
    const previousMonthStart = getBeijingMonthStart(previousMonthEnd);
    const previousMonthSameEnd = new Date(Math.min(
      previousMonthEnd.getTime(),
      previousMonthStart.getTime() + Math.max(0, now.getTime() - monthStart.getTime())
    ));
    const buckets = await Usage.getUsageBuckets(context.meterId, previousMonthStart, previousMonthEnd, 'hour');
    previousMonthCache = {
      previousMonthUsage: round(statsFromHourlyBuckets(buckets, previousMonthStart, previousMonthEnd).totalUsage),
      previousMonthSameUsage: round(statsFromHourlyBuckets(buckets, previousMonthStart, previousMonthSameEnd).totalUsage)
    };
    previousMonthCacheExpiresAt = Date.now() + 30 * 60 * 1000;
  }
  if (needsPreviousMonth && previousMonthCache) enriched = { ...enriched, ...previousMonthCache };

  if (plan.timeRange.kind === 'rolling_months' && (!longRangeCache || Date.now() >= longRangeCacheExpiresAt)) {
    const end = new Date(context.generatedAt);
    const start = new Date(end.getTime() - 366 * DAY_MS);
    const buckets = await Usage.getUsageBuckets(context.meterId, start, end, 'month');
    longRangeCache = buckets.slice(-12).map(item => ({ month: item.key, usageKwh: round(item.used_kwh) }));
    longRangeCacheExpiresAt = Date.now() + 30 * 60 * 1000;
  }
  if (plan.timeRange.kind === 'rolling_months') enriched = { ...enriched, monthlyUsage12: longRangeCache || [] };
  return enriched;
}

function normalizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-10).map(item => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: String(item?.content || item?.text || '').trim().slice(0, 800),
    plan: item?.plan && typeof item.plan === 'object' ? item.plan : undefined
  })).filter(item => item.content || item.plan);
}

function planToIntent(plan) {
  if (plan.action === 'out_of_scope') return 'out_of_scope';
  if (plan.action === 'clarify') return 'unknown';
  if (plan.action === 'status') return 'status';
  if (plan.action === 'recommend') return 'saving';
  if (plan.action === 'explain') return 'explain';
  if (plan.metric === 'balance') return 'balance';
  if (plan.action === 'forecast') return plan.timeRange.kind === 'this_month' ? 'month_forecast' : 'forecast';
  if (plan.action === 'compare' || plan.action === 'trend') return 'analysis';
  if (plan.entities.some(entity => entity !== 'total')) return 'devices';
  if (plan.metric === 'peak') return 'week_peak';
  if (plan.timeRange.kind === 'yesterday') return 'yesterday';
  if (plan.timeRange.kind === 'this_week') return 'week';
  if (['this_month', 'last_month'].includes(plan.timeRange.kind)) return 'month';
  return 'today';
}

function buildQueryPlan(message, history = []) {
  const normalized = String(message || '').trim();
  const lower = normalized.toLowerCase();
  const conversation = normalizeConversationHistory(history);
  const lastAssistantPlan = [...conversation].reverse().find(item => item.role === 'assistant' && item.plan)?.plan;
  const lastUser = [...conversation].reverse().find(item => item.role === 'user' && item.content)?.content;
  const inherited = lastAssistantPlan || (lastUser ? buildQueryPlan(lastUser, []) : null);
  const isFollowUp = /^(那|那么|换成|改成|再看|还有|以及|和|对比一下|比较一下)/.test(normalized) || normalized.length <= 8;
  const hasPowerContext = /用电|电量|电费|电价|电表|耗电|耗能|功率|千瓦|kwh|度电|节电|省电|余额|剩余电|续航|高峰|峰值|充电|空调|热水器|米家|设备|电器/.test(lower);
  const externalDomain = /天气|气温|下雨|降雨|刮风|台风|空气质量|穿什么|新闻|股票|基金|汇率|彩票|足球|篮球|比赛|电影|音乐|菜谱|快递|路线|导航|翻译|写.*代码|编程/.test(normalized);
  const plan = {
    version: 1,
    action: 'query',
    metric: 'usage',
    entities: ['total'],
    timeRange: { kind: 'today' },
    compareWith: null,
    needsAI: false,
    confidence: 0.9
  };

  if (isFollowUp && inherited) {
    Object.assign(plan, inherited, {
      entities: [...(inherited.entities || ['total'])],
      timeRange: { ...(inherited.timeRange || { kind: 'today' }) }
    });
  }
  if (externalDomain && !hasPowerContext && !/省|节约|耗/.test(normalized)) {
    return { ...plan, action: 'out_of_scope', confidence: 0.99, intent: 'out_of_scope' };
  }

  if (/空调/.test(normalized)) plan.entities = ['air_conditioner'];
  else if (/热水器|热水/.test(normalized)) plan.entities = ['water_heater'];
  else if (/其他电器|其它电器/.test(normalized)) plan.entities = ['other'];
  else if (/全部设备|所有设备|米家|设备|电器/.test(normalized)) plan.entities = ['air_conditioner', 'water_heater', 'other'];
  else if (/全屋|总用电|总电表/.test(normalized)) plan.entities = ['total'];

  if (/过去\s*12\s*个?月|近\s*12\s*个?月|最近一年|过去一年/.test(normalized)) plan.timeRange = { kind: 'rolling_months', months: 12 };
  else if (/近\s*30\s*天|最近\s*30\s*天|过去\s*30\s*天/.test(normalized)) plan.timeRange = { kind: 'rolling_days', days: 30 };
  else if (/最近一周|近一周|近\s*7\s*天|最近\s*7\s*天|过去一周/.test(normalized)) plan.timeRange = { kind: 'rolling_days', days: 7 };
  else if (/上个月|上月/.test(normalized)) plan.timeRange = { kind: 'last_month' };
  else if (/本月|这个月|当月|月底|本月底/.test(normalized)) plan.timeRange = { kind: 'this_month' };
  else if (/上周/.test(normalized) && !/本周.*上周|这周.*上周/.test(normalized)) plan.timeRange = { kind: 'last_week' };
  else if (/本周|这周/.test(normalized)) plan.timeRange = { kind: 'this_week' };
  else if (/昨天|昨日/.test(normalized)) plan.timeRange = { kind: 'yesterday' };
  else if (/今天|今日|当天|现在|当前/.test(normalized)) plan.timeRange = { kind: 'today' };

  if (/余额|剩余|还能用|用完|续航/.test(normalized)) plan.metric = 'balance';
  else if (/电费|费用|多少钱|成本/.test(normalized)) plan.metric = 'cost';
  else if (/峰值|最高|最多|高峰/.test(normalized)) plan.metric = 'peak';
  else if (/更新|同步|新鲜度|数据状态|数据.*完整/.test(normalized)) plan.metric = 'freshness';
  else if (/趋势|规律|走势/.test(normalized)) plan.metric = 'trend';

  if (/设置.*提醒|创建.*提醒|提醒我/.test(normalized)) plan.action = 'reminder';
  else if (/比较|对比|相比|差多少|高多少|低多少|和.*比|比平时|比平均|较平时/.test(normalized)) plan.action = 'compare';
  else if (/为什么|原因|解释|异常|变高|变多|突然/.test(normalized)) plan.action = 'explain';
  else if (/节电|省电|建议|怎么省|如何省|优化/.test(normalized)) plan.action = 'recommend';
  else if (/预计|预测|会用多少|什么时候用完|还能用多久/.test(normalized)) plan.action = 'forecast';
  else if (/趋势|规律|走势|分析|总结/.test(normalized)) plan.action = 'trend';
  else if (plan.metric === 'freshness') plan.action = 'status';

  if (plan.action === 'compare') {
    if (/今天.*昨天|昨天.*今天/.test(normalized) || (inherited && /(?:和)?昨天比/.test(normalized))) {
      plan.timeRange = { kind: 'today' };
      plan.compareWith = 'yesterday_same_time';
    } else if (/本周.*上周|这周.*上周/.test(normalized)) {
      plan.timeRange = { kind: 'this_week' };
      plan.compareWith = 'previous_period_same_progress';
    } else if (/本月.*上月|这个月.*上个月/.test(normalized)) {
      plan.timeRange = { kind: 'this_month' };
      plan.compareWith = 'previous_period_same_progress';
    } else if (/平均|日均|平时/.test(normalized)) {
      plan.compareWith = 'historical_average';
    } else {
      plan.compareWith = 'previous_period';
    }
  }
  plan.needsAI = ['explain', 'recommend', 'trend'].includes(plan.action) || /解释|原因|为什么/.test(normalized);
  if (!normalized) plan.action = 'clarify';
  if (!hasPowerContext && !inherited && plan.action === 'query' && plan.metric === 'usage' && !/用了多少|用多少|耗了多少|消耗多少|几度/.test(normalized)) {
    plan.action = 'clarify';
    plan.confidence = 0.35;
  }
  plan.intent = planToIntent(plan);
  return plan;
}

function classifyIntent(message, history = []) {
  return buildQueryPlan(message, history).intent;
}

function buildOutOfScopeAnswer() {
  return {
    role: 'assistant',
    intent: 'out_of_scope',
    headline: '这个问题不属于用电范围',
    body: '我是家庭用电助手，暂时不能查询天气等外部信息；你可以问我用电量、余额、费用、趋势、预测或节电建议。',
    source: '布布用电助手能力范围',
    mode: 'data',
    quickReplies: ['今天用了多少电？', '当前还剩多少电？', '给我节电建议']
  };
}

function buildClarificationAnswer() {
  return {
    role: 'assistant',
    intent: 'clarification',
    headline: '我还不确定你想查什么',
    body: '你想查询当前电量余额、某段时间的用电量，还是希望我分析用电变化？',
    source: '布布用电助手',
    mode: 'data',
    quickReplies: ['当前还剩多少电？', '今天用了多少电？', '分析最近七天用电规律']
  };
}

function needsAIAnalysis(message, intentOrPlan) {
  if (intentOrPlan && typeof intentOrPlan === 'object') return Boolean(intentOrPlan.needsAI);
  const intent = intentOrPlan;
  if (intent === 'analysis' || intent === 'explain' || intent === 'saving') return true;
  return /帮我分析|总结|规律|解释|为什么|原因|是否异常|比较|对比|给我.*建议|保持这样|当前速度|按照.*速度/.test(message);
}

function chartForToday(context) {
  const lastHour = Math.min(23, getBeijingHour(new Date(context.generatedAt)));
  const labels = Array.from({ length: lastHour + 1 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
  return {
    kind: 'line',
    labels,
    series: [
      { name: '今日', values: context.todayHourly.slice(0, lastHour + 1).map(item => item.kwh) },
      { name: '昨日同期', values: context.yesterdayHourly.slice(0, lastHour + 1).map(item => item.kwh) }
    ]
  };
}

function projectMonthUsage(context) {
  const beijingNow = new Date(new Date(context.generatedAt).getTime() + 8 * 60 * 60 * 1000);
  const year = beijingNow.getUTCFullYear();
  const month = beijingNow.getUTCMonth();
  const day = beijingNow.getUTCDate();
  const elapsedToday = (beijingNow.getUTCHours() + beijingNow.getUTCMinutes() / 60) / 24;
  const elapsedDays = Math.max(1, day - 1 + elapsedToday);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    projectedUsage: round((context.monthUsage / elapsedDays) * daysInMonth),
    elapsedDays: round(elapsedDays, 1),
    daysInMonth
  };
}

function buildDeterministicAnswer(intent, context) {
  const hasDevices = Boolean(context.deviceEnergy?.configured);
  const source = `${hasDevices ? '基于电表与米家设备数据' : '基于电表采集数据'} · 更新于 ${context.updatedLabel}`;
  const common = { role: 'assistant', intent, source, updatedAt: context.updatedAt, mode: 'data' };

  if (!context.dataComplete) {
    return {
      ...common,
      headline: '当前数据不足',
      body: '今天的有效采集点不足，暂时无法进行可靠分析。你仍可以查看当前余额。',
      quickReplies: ['当前余额多少？', '数据什么时候更新？']
    };
  }

  switch (intent) {
    case 'devices': {
      if (!hasDevices) {
        return {
          ...common,
          headline: '设备用电数据暂不可用',
          body: '米家设备数据尚未完成同步，目前只能查看全屋总用电。',
          quickReplies: ['今天用了多少电？', '本月用了多少电？']
        };
      }
      const measured = context.deviceEnergy.devices.filter(item => !item.estimated);
      const top = measured.reduce((best, item) => item.todayKwh > (best?.todayKwh || 0) ? item : best, null);
      return {
        ...common,
        headline: top ? `今日设备中${top.name}用电较多` : '设备用电已接入',
        body: `空调今日 ${measured[0]?.todayKwh || 0} kWh，热水器今日 ${measured[1]?.todayKwh || 0} kWh。“其他电器”是全屋总表减去两台米家设备后的估算值。`,
        chart: {
          kind: 'bar',
          labels: context.deviceEnergy.devices.map(item => item.name),
          series: [{ name: '今日用电', values: context.deviceEnergy.devices.map(item => item.todayKwh) }]
        },
        evidence: context.deviceEnergy.devices.map(item => ({
          label: item.name,
          value: `今日 ${item.todayKwh} kWh · 本月 ${item.monthKwh} kWh${item.estimated ? '（估算）' : ''}`
        })),
        quickReplies: ['哪个设备本月最耗电？', '结合设备数据给我节电建议', '为什么今天用电变高？']
      };
    }
    case 'balance':
      return {
        ...common,
        headline: `当前剩余 ${context.remainingKwh} kWh`,
        body: context.projectedTodayUsage
          ? `按今日当前用电节奏估算，相当于约 ${round(context.remainingKwh / Math.max(context.projectedTodayUsage, 0.01), 1)} 天用量；这只是节奏估算，实际续航会随用电变化。`
          : '当前数据还不足以估算可靠的剩余天数。',
        metric: { value: context.remainingKwh, unit: 'kWh', label: '当前余额' },
        quickReplies: ['预计什么时候用完？', '本月用了多少？']
      };
    case 'yesterday':
      return {
        ...common,
        headline: `昨日用电 ${context.yesterdayUsage} kWh`,
        body: '统计范围为昨日 00:00–24:00，已自动排除充值造成的余额上升。',
        metric: { value: context.yesterdayUsage, unit: 'kWh', label: '昨日用电' },
        quickReplies: ['今天用了多少？', '最近一周哪天最高？']
      };
    case 'week':
      return {
        ...common,
        headline: `本周已用 ${context.weekUsage} kWh`,
        body: '本周数据从周一 00:00 统计至最近一次采集。',
        metric: { value: context.weekUsage, unit: 'kWh', label: '本周用电' },
        quickReplies: ['最近一周哪天最高？', '给我节电建议']
      };
    case 'month':
      return {
        ...common,
        headline: `本月已用 ${context.monthUsage} kWh`,
        body: `按 1 元/kWh 的当前系统口径，对应已发生用电成本约 ¥${context.monthUsage}。${hasDevices ? `其中空调 ${context.deviceEnergy.devices[0].monthKwh} kWh，热水器 ${context.deviceEnergy.devices[1].monthKwh} kWh。` : ''}`,
        metric: { value: context.monthUsage, unit: 'kWh', label: '本月用电' },
        quickReplies: ['预计本月费用？', '本周用了多少？']
      };
    case 'month_forecast': {
      const projection = projectMonthUsage(context);
      return {
        ...common,
        mode: 'prediction',
        headline: `预计本月约 ${projection.projectedUsage} kWh`,
        body: `根据本月前 ${projection.elapsedDays} 天累计 ${context.monthUsage} kWh 的平均节奏，推算至本月 ${projection.daysInMonth} 日；后续用电习惯变化会影响结果。`,
        metric: { value: projection.projectedUsage, unit: 'kWh', label: '本月预测' },
        evidence: [
          { label: '本月已用', value: `${context.monthUsage} kWh` },
          { label: '预测周期', value: `${projection.daysInMonth} 天` }
        ],
        disclaimer: '预测按本月当前日均用电节奏计算，仅供参考。',
        quickReplies: ['本月已经用了多少？', '给我节电建议']
      };
    }
    case 'forecast':
      return {
        ...common,
        mode: 'prediction',
        headline: context.projectedTodayUsage ? `预计今日约 ${context.projectedTodayUsage} kWh` : '暂时无法可靠预测',
        body: context.projectedTodayUsage
          ? `根据今日已采集时段的用电节奏推算，${formatDelta(context.samePeriodDelta)}；越接近当天结束，预测越稳定。`
          : '今日有效数据不足 3 小时，继续采集后再试。',
        metric: context.projectedTodayUsage ? { value: context.projectedTodayUsage, unit: 'kWh', label: '全天预测' } : undefined,
        chart: chartForToday(context),
        disclaimer: '预测结果仅供参考，以最终电表数据为准。',
        quickReplies: ['为什么今天用电更高？', '设置高峰提醒']
      };
    case 'week_peak': {
      const peak = context.sevenDayPeak;
      return {
        ...common,
        headline: peak ? `${peak.date.slice(5).replace('-', '月')}日用电最高` : '最近一周数据不足',
        body: peak ? `当天用电 ${peak.usageKwh} kWh，是最近 7 天的最高值。` : '暂时没有足够的每日数据进行比较。',
        chart: {
          kind: 'bar',
          labels: context.sevenDayUsage.map(item => item.date.slice(5)),
          series: [{ name: '每日用电', values: context.sevenDayUsage.map(item => item.usageKwh) }]
        },
        quickReplies: ['看当天分时用电', '和本周平均对比']
      };
    }
    case 'explain': {
      const delta = context.samePeriodDelta;
      const peakLabel = context.peakHour === null ? '暂未识别' : `${String(context.peakHour).padStart(2, '0')}:00–${String((context.peakHour + 1) % 24).padStart(2, '0')}:00`;
      return {
        ...common,
        headline: delta > 0 ? `今日同期用电高 ${delta}%` : delta < 0 ? `今日同期用电低 ${Math.abs(delta)}%` : '今日同期用电基本持平',
        body: hasDevices
          ? `变化最明显的已采集时段是 ${peakLabel}。米家设备中，空调今日 ${context.deviceEnergy.devices[0].todayKwh} kWh，热水器今日 ${context.deviceEnergy.devices[1].todayKwh} kWh；可据此判断设备贡献，但“其他电器”仍是总表差值估算。`
          : `变化最明显的已采集时段是 ${peakLabel}。当前只有电表总量数据，无法确认具体是哪台设备造成。`,
        chart: chartForToday(context),
        evidence: [
          { label: '今日截至当前', value: `${context.todayUsage} kWh` },
          { label: '昨日同期', value: `${context.yesterdaySameUsage} kWh` },
          { label: '今日峰值时段', value: peakLabel },
          ...(hasDevices ? context.deviceEnergy.devices.slice(0, 2).map(item => ({ label: `${item.name}今日`, value: `${item.todayKwh} kWh` })) : [])
        ],
        quickReplies: ['预计今天用多少？', '给我节电建议']
      };
    }
    case 'analysis': {
      const weeklyDelta = percentageChange(context.weekUsage, context.previousWeekSameUsage);
      const weeklyDifference = round(context.weekUsage - context.previousWeekSameUsage);
      return {
        ...common,
        headline: weeklyDelta > 0 ? `本周较上周同期高 ${weeklyDelta}%` : weeklyDelta < 0 ? `本周较上周同期低 ${Math.abs(weeklyDelta)}%` : '本周与上周同期基本持平',
        body: `本周截至当前已用 ${context.weekUsage} kWh，上周相同进度为 ${context.previousWeekSameUsage} kWh，相差 ${Math.abs(weeklyDifference)} kWh。最近七天最高用电日为 ${context.sevenDayPeak?.date || '暂无数据'}。${hasDevices ? `今日米家设备中空调 ${context.deviceEnergy.devices[0].todayKwh} kWh、热水器 ${context.deviceEnergy.devices[1].todayKwh} kWh，可辅助解释设备贡献。` : '当前只能定位变化时段，不能确认具体设备原因。'}`,
        evidence: [
          { label: '本周截至当前', value: `${context.weekUsage} kWh` },
          { label: '上周同期', value: `${context.previousWeekSameUsage} kWh` },
          { label: '同期变化', value: `${weeklyDelta > 0 ? '+' : ''}${weeklyDelta}%` }
        ],
        chart: {
          kind: 'bar',
          labels: context.sevenDayUsage.map(item => item.date.slice(5)),
          series: [{ name: '每日用电', values: context.sevenDayUsage.map(item => item.usageKwh) }]
        },
        disclaimer: hasDevices ? '空调和热水器来自米家日用电数据；其他电器为总表差值估算。' : '当前未接入设备级数据，不能把变化归因到具体电器。',
        quickReplies: ['分析变化集中在哪些时段', '给我三个具体节电建议']
      };
    }
    case 'saving': {
      const topDevice = hasDevices
        ? context.deviceEnergy.devices.filter(item => !item.estimated).reduce((best, item) => item.todayKwh > (best?.todayKwh || 0) ? item : best, null)
        : null;
      return {
        ...common,
        headline: '先优化用电最高的时段',
        body: context.peakHour === null
          ? '当前分时数据不足，暂时无法给出针对性建议。'
          : `今天用电较集中的时段是 ${String(context.peakHour).padStart(2, '0')}:00–${String((context.peakHour + 1) % 24).padStart(2, '0')}:00。${topDevice ? `${topDevice.name}今日已用 ${topDevice.todayKwh} kWh，可以先检查其运行时长和设定。` : '可以优先检查这一时段是否有可错峰或缩短运行时间的高功率设备。'}`,
        chart: chartForToday(context),
        disclaimer: hasDevices ? '建议结合米家设备日用电与总表分时数据生成。' : '当前未接入设备级数据，建议基于分时变化生成。',
        quickReplies: ['设置高峰提醒', '最近一周哪天最高？']
      };
    }
    case 'today':
    default:
      return {
        ...common,
        headline: `截至 ${context.updatedLabel}，今日已用 ${context.todayUsage} kWh`,
        body: `${formatDelta(context.samePeriodDelta)}。${hasDevices ? `米家设备中，空调 ${context.deviceEnergy.devices[0].todayKwh} kWh，热水器 ${context.deviceEnergy.devices[1].todayKwh} kWh。` : ''}`,
        metric: { value: context.todayUsage, unit: 'kWh', label: '今日用电', comparison: context.samePeriodDelta },
        chart: chartForToday(context),
        quickReplies: hasDevices ? ['查看设备用电详情', '为什么变高？', '结合设备数据给我节电建议'] : ['为什么变高？', '预计今天用多少？', '给我节电建议']
      };
  }
}

const ENTITY_LABELS = {
  total: '全屋',
  air_conditioner: '空调',
  water_heater: '热水器',
  other: '其他电器'
};

function rangeLabel(timeRange) {
  const labels = {
    today: '今天',
    yesterday: '昨天',
    this_week: '本周',
    last_week: '上周',
    this_month: '本月',
    last_month: '上个月'
  };
  if (timeRange.kind === 'rolling_days') return `最近 ${timeRange.days || 7} 天`;
  if (timeRange.kind === 'rolling_months') return `最近 ${timeRange.months || 12} 个月`;
  return labels[timeRange.kind] || '当前时段';
}

function beijingKey(date) {
  return new Date(new Date(date).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function deviceValueForDate(context, entity, date) {
  const breakdown = context.dashboard?.deviceDailyBreakdowns?.[date] || {};
  if (entity === 'air_conditioner') return Number(breakdown.air_conditioner_kwh || 0);
  if (entity === 'water_heater') return Number(breakdown.water_heater_kwh || 0);
  const total = context.dailyUsageHistory?.find(item => item.date === date)?.usageKwh || 0;
  return Math.max(0, total - Number(breakdown.air_conditioner_kwh || 0) - Number(breakdown.water_heater_kwh || 0));
}

function periodData(plan, context) {
  const entity = plan.entities.length === 1 ? plan.entities[0] : 'total';
  const now = new Date(context.generatedAt);
  const todayKey = beijingKey(now);
  const allDailyKeys = Object.keys(context.dashboard?.deviceDailyBreakdowns || {});
  const availableKeys = new Set(context.availableDailyKeys || []);
  const totalDaily = (context.dailyUsageHistory || context.dailyUsage30 || []).filter(item => !availableKeys.size || availableKeys.has(item.date));
  const valueForDate = date => entity === 'total'
    ? Number(totalDaily.find(item => item.date === date)?.usageKwh || 0)
    : deviceValueForDate(context, entity, date);
  const dateStartKey = daysAgo => beijingKey(new Date(now.getTime() - daysAgo * DAY_MS));
  let dates = [];
  let value = 0;

  if (plan.timeRange.kind === 'today') {
    value = entity === 'total' ? context.todayUsage : deviceValueForDate(context, entity, todayKey);
    if (entity === 'total') {
      const hour = getBeijingHour(now);
      return {
        entity,
        value: round(value),
        labels: context.todayHourly.slice(0, hour + 1).map(item => `${String(item.hour).padStart(2, '0')}:00`),
        values: context.todayHourly.slice(0, hour + 1).map(item => item.kwh)
      };
    }
  } else if (plan.timeRange.kind === 'yesterday') {
    const key = dateStartKey(1);
    dates = [key];
    value = entity === 'total' ? context.yesterdayUsage : deviceValueForDate(context, entity, key);
    if (entity === 'total') {
      return {
        entity,
        value: round(value),
        labels: context.yesterdayHourly.map(item => `${String(item.hour).padStart(2, '0')}:00`),
        values: context.yesterdayHourly.map(item => item.kwh)
      };
    }
  } else if (plan.timeRange.kind === 'this_week' || plan.timeRange.kind === 'last_week') {
    const weekStart = getBeijingWeekStart(now);
    const start = plan.timeRange.kind === 'last_week' ? new Date(weekStart.getTime() - 7 * DAY_MS) : weekStart;
    const end = plan.timeRange.kind === 'last_week' ? new Date(weekStart.getTime() - 1) : now;
    const startKey = beijingKey(start);
    const endKey = beijingKey(end);
    dates = [...new Set([...totalDaily.map(item => item.date), ...allDailyKeys])].filter(key => key >= startKey && key <= endKey).sort();
    value = entity === 'total'
      ? (plan.timeRange.kind === 'last_week' ? context.previousWeekUsage : context.weekUsage)
      : round(dates.reduce((sum, key) => sum + valueForDate(key), 0));
  } else if (plan.timeRange.kind === 'this_month' || plan.timeRange.kind === 'last_month') {
    const monthKey = plan.timeRange.kind === 'last_month'
      ? beijingKey(new Date(getBeijingMonthStart(now).getTime() - 1)).slice(0, 7)
      : todayKey.slice(0, 7);
    dates = allDailyKeys.filter(key => key.startsWith(monthKey)).sort();
    if (entity === 'total') value = plan.timeRange.kind === 'last_month' ? context.previousMonthUsage : context.monthUsage;
    else value = round(dates.reduce((sum, key) => sum + valueForDate(key), 0));
  } else if (plan.timeRange.kind === 'rolling_days') {
    const days = Math.min(30, Number(plan.timeRange.days || 7));
    const startKey = dateStartKey(days - 1);
    dates = totalDaily.map(item => item.date).filter(key => key >= startKey && key <= todayKey).sort();
    value = round(dates.reduce((sum, key) => sum + valueForDate(key), 0));
  } else if (plan.timeRange.kind === 'rolling_months') {
    const months = Math.min(12, Number(plan.timeRange.months || 12));
    const monthly = (context.monthlyUsage12 || []).slice(-months);
    if (entity === 'total') {
      return {
        entity,
        value: round(monthly.reduce((sum, item) => sum + item.usageKwh, 0)),
        labels: monthly.map(item => item.month),
        values: monthly.map(item => item.usageKwh)
      };
    }
    const allowedMonths = new Set(monthly.map(item => item.month));
    const totals = new Map([...allowedMonths].map(month => [month, 0]));
    for (const key of allDailyKeys) {
      const month = key.slice(0, 7);
      if (allowedMonths.has(month)) totals.set(month, (totals.get(month) || 0) + valueForDate(key));
    }
    return {
      entity,
      value: round([...totals.values()].reduce((sum, item) => sum + item, 0)),
      labels: [...totals.keys()],
      values: [...totals.values()].map(item => round(item))
    };
  }

  return {
    entity,
    value: round(value),
    labels: dates.map(key => key.slice(5)),
    values: dates.map(key => round(valueForDate(key)))
  };
}

function personalizedQuickReplies(plan, context) {
  const entity = plan.entities.length === 1 ? plan.entities[0] : 'total';
  const name = ENTITY_LABELS[entity] || '全屋';
  const period = rangeLabel(plan.timeRange);
  const trendPeriod = entity !== 'total' && plan.timeRange.kind === 'today' ? '最近 7 天' : period;
  const alternatives = entity === 'air_conditioner'
    ? ['再看热水器今天用了多少电']
    : entity === 'water_heater'
      ? ['再看空调今天用了多少电']
      : context.deviceEnergy?.configured ? ['查看空调和热水器今天的用电'] : [];
  const candidates = [
    { action: 'compare', text: `${name}${period}和上一周期相比怎么样？` },
    { action: 'trend', text: `分析${name}${trendPeriod}的用电趋势` },
    { action: 'recommend', text: `结合${name}${period}数据给我节电建议` },
    ...alternatives.map(text => ({ action: 'query', text }))
  ].filter(item => item.action !== plan.action);
  if (plan.metric === 'balance') candidates.unshift({ action: 'forecast', text: '按最近 7 天日均还能用多久？' });
  if (plan.action === 'status') candidates.unshift({ action: 'status_detail', text: '今天的数据是否完整？' });
  return [...new Set(candidates.map(item => item.text))].slice(0, 3);
}

function comparisonForPlan(plan, context, current) {
  const entity = plan.entities.length === 1 ? plan.entities[0] : 'total';
  if (entity !== 'total') {
    if (plan.timeRange.kind === 'this_week') {
      const previous = periodData({ ...plan, timeRange: { kind: 'last_week' } }, context);
      return { label: '上周', value: previous.value };
    }
    if (plan.timeRange.kind === 'this_month') {
      const previous = periodData({ ...plan, timeRange: { kind: 'last_month' } }, context);
      return { label: '上个月', value: previous.value };
    }
    const todayKey = beijingKey(context.generatedAt);
    const samples = Object.keys(context.dashboard?.deviceDailyBreakdowns || {})
      .filter(key => key < todayKey)
      .sort()
      .slice(-14)
      .map(key => deviceValueForDate(context, entity, key))
      .filter(value => value > 0);
    const baseline = median(samples);
    return { label: '最近完整日中位数', value: baseline === null ? null : round(baseline), samples: samples.length };
  }
  if (plan.compareWith === 'historical_average' && plan.timeRange.kind === 'today') {
    return { label: '同类日期同进度中位数', value: context.sameProgressMedian, samples: context.comparableDayCount };
  }
  if (plan.timeRange.kind === 'today') return { label: '昨天同期', value: context.yesterdaySameUsage };
  if (plan.timeRange.kind === 'this_week') return { label: '上周同期', value: context.previousWeekSameUsage };
  if (plan.timeRange.kind === 'this_month') return { label: '上月同期', value: context.previousMonthSameUsage };
  if (plan.timeRange.kind === 'yesterday') {
    const previous = context.dailyUsage30?.at(-3)?.usageKwh;
    return { label: '前天', value: previous };
  }
  return { label: '上一周期', value: null, current };
}

function buildPlanDrivenAnswer(plan, context) {
  if (plan.action === 'out_of_scope') return { ...buildOutOfScopeAnswer(), plan };
  if (plan.action === 'clarify') return { ...buildClarificationAnswer(), plan };
  const source = `${context.deviceEnergy?.configured ? '基于电表与米家设备数据' : '基于电表采集数据'} · 更新于 ${context.updatedLabel}`;
  const common = { role: 'assistant', intent: plan.intent, source, updatedAt: context.updatedAt, mode: 'data', plan };

  if (!context.dataComplete && !['status'].includes(plan.action) && plan.metric !== 'balance') {
    return {
      ...common,
      headline: '当前数据不足',
      body: '今天的有效采集点不足，暂时无法完成可靠的查询或分析；系统不会把缺失数据当作 0。',
      quickReplies: ['当前余额多少？', '数据什么时候更新？']
    };
  }

  if (plan.action === 'status') {
    const fresh = context.dataAgeMinutes !== null && context.dataAgeMinutes <= 30;
    return {
      ...common,
      headline: fresh ? '数据更新正常' : '数据更新可能延迟',
      body: context.dataAgeMinutes === null ? '目前没有可用的电表更新时间。' : `最近一次电表数据更新于 ${context.updatedLabel}，距现在约 ${context.dataAgeMinutes} 分钟；今日共有 ${context.todayDataPoints} 个小时采集桶。`,
      evidence: [
        { label: '最近更新', value: context.updatedLabel },
        { label: '数据延迟', value: context.dataAgeMinutes === null ? '未知' : `${context.dataAgeMinutes} 分钟` },
        { label: '米家设备', value: context.deviceEnergy?.configured ? (context.deviceEnergy.devices.every(item => item.estimated || item.todayComplete) ? '今日数据已同步' : '今日数据待同步') : '未接入' }
      ],
      quickReplies: personalizedQuickReplies(plan, context)
    };
  }

  if (plan.action === 'reminder') {
    return {
      ...common,
      headline: '暂时不能直接创建自定义提醒',
      body: '当前只支持系统自动识别低余额、设备异常和全屋增长提醒；为了避免误操作，我不会假装已经创建提醒。',
      quickReplies: ['查看当前是否存在用电异常', '分析今天的用电高峰', '当前余额还能用多久？']
    };
  }

  if (plan.action === 'query' && plan.entities.length > 1) {
    const answer = buildDeterministicAnswer('devices', context);
    return { ...answer, plan, quickReplies: personalizedQuickReplies(plan, context) };
  }

  const period = periodData(plan, context);
  const entityName = ENTITY_LABELS[period.entity] || '全屋';
  const periodName = rangeLabel(plan.timeRange);
  const chart = period.labels.length > 1 ? {
    kind: 'bar',
    labels: period.labels,
    series: [{ name: `${entityName}用电`, values: period.values }]
  } : undefined;

  if (plan.metric === 'peak' && plan.action === 'query') {
    if (plan.timeRange.kind === 'today' && period.entity === 'total') {
      const label = context.peakHour === null ? null : `${String(context.peakHour).padStart(2, '0')}:00–${String((context.peakHour + 1) % 24).padStart(2, '0')}:00`;
      return {
        ...common,
        headline: label ? `今天用电最高时段是 ${label}` : '今天的分时数据不足',
        body: label ? `该小时用电约 ${context.peakHourUsage} kWh；这里只能确认用电集中时段，不能仅凭总表判断具体设备原因。` : '继续采集后才能识别可靠的高峰时段。',
        chart: chartForToday(context),
        evidence: label ? [{ label: '最高时段', value: label }, { label: '该小时用电', value: `${context.peakHourUsage} kWh` }] : undefined,
        quickReplies: personalizedQuickReplies(plan, context)
      };
    }
    const peakIndex = period.values.length ? period.values.indexOf(Math.max(...period.values)) : -1;
    return {
      ...common,
      headline: peakIndex >= 0 ? `${entityName}${periodName}最高点为 ${period.labels[peakIndex]}` : `${entityName}${periodName}数据不足`,
      body: peakIndex >= 0 ? `最高点用电 ${period.values[peakIndex]} kWh，周期累计 ${period.value} kWh。` : '当前没有足够的数据点进行比较。',
      chart,
      quickReplies: personalizedQuickReplies(plan, context)
    };
  }

  if (plan.metric === 'cost' && plan.action === 'query') {
    const price = Number(process.env.ELECTRICITY_PRICE_PER_KWH || 1);
    const cost = round(period.value * price);
    return {
      ...common,
      headline: `${entityName}${periodName}预估电费 ¥${cost}`,
      body: `按当前配置电价 ¥${round(price, 3)}/kWh，以 ${period.value} kWh 估算；若实际采用阶梯电价，账单金额可能不同。`,
      evidence: [{ label: '用电量', value: `${period.value} kWh` }, { label: '计算电价', value: `¥${round(price, 3)}/kWh` }],
      chart,
      disclaimer: '费用为按配置单价计算的估算值，不代表电力公司的最终账单。',
      quickReplies: personalizedQuickReplies(plan, context)
    };
  }

  if (plan.action === 'compare') {
    const comparison = comparisonForPlan(plan, context, period.value);
    const delta = Number.isFinite(comparison.value) ? percentageChange(period.value, comparison.value) : null;
    return {
      ...common,
      headline: delta === null ? `${entityName}${periodName}暂无可比周期` : `${entityName}${periodName}较${comparison.label}${delta > 0 ? '高' : delta < 0 ? '低' : '持平'}${delta ? ` ${Math.abs(delta)}%` : ''}`,
      body: delta === null ? '当前保存的数据不足以完成同口径比较。' : `当前为 ${period.value} kWh，${comparison.label}为 ${comparison.value} kWh；比较使用相同进度或完整周期数据，避免拿未结束周期与完整周期直接比较。`,
      evidence: [
        { label: `${periodName}用电`, value: `${period.value} kWh` },
        { label: comparison.label, value: comparison.value === null ? '数据不足' : `${comparison.value} kWh` },
        ...(comparison.samples ? [{ label: '参考样本', value: `${comparison.samples} 个同类日期` }] : [])
      ],
      chart,
      quickReplies: personalizedQuickReplies(plan, context)
    };
  }

  if (plan.action === 'trend') {
    const values = period.values.filter(Number.isFinite);
    const peakIndex = values.length ? values.indexOf(Math.max(...values)) : -1;
    const average = values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    return {
      ...common,
      headline: `${entityName}${periodName}用电趋势`,
      body: values.length > 1 ? `${periodName}累计 ${period.value} kWh，日均或月均 ${average} kWh，最高点为 ${period.labels[peakIndex]} 的 ${values[peakIndex]} kWh。` : '当前周期的数据点不足，暂时不能判断可靠趋势。',
      evidence: average === null ? undefined : [
        { label: '周期累计', value: `${period.value} kWh` },
        { label: '周期均值', value: `${average} kWh` },
        { label: '最高点', value: `${period.labels[peakIndex]} · ${values[peakIndex]} kWh` }
      ],
      chart,
      quickReplies: personalizedQuickReplies(plan, context)
    };
  }

  if (plan.action === 'explain' || plan.action === 'recommend') {
    const requestedDevice = plan.entities.length === 1 && plan.entities[0] !== 'total'
      ? context.deviceEnergy?.devices?.find(item => item.id === plan.entities[0])
      : null;
    const topDevice = requestedDevice || (context.deviceEnergy?.configured
      ? context.deviceEnergy.devices.filter(item => !item.estimated).sort((a, b) => b.todayKwh - a.todayKwh)[0]
      : null);
    const medianDelta = context.sameProgressMedianDelta;
    return {
      ...common,
      headline: plan.action === 'recommend' ? `给${entityName}的个性化节电建议` : `${entityName}${periodName}变化分析`,
      body: medianDelta === null
        ? `当前同类日期样本不足，无法可靠判断是否异常。${topDevice ? `今天两台米家设备中，${topDevice.name}用电较多，为 ${topDevice.todayKwh} kWh。` : ''}`
        : `截至上一个完整小时，全屋用电较 ${context.comparableDayCount} 个同类日期的同进度中位数${medianDelta > 0 ? '高' : '低'} ${Math.abs(medianDelta)}%。${topDevice ? `${topDevice.name}今日用电为 ${topDevice.todayKwh} kWh。` : '当前没有可靠的设备级数据，不能归因到具体电器。'}`,
      evidence: [
        { label: '同进度中位数', value: context.sameProgressMedian === null ? '样本不足' : `${context.sameProgressMedian} kWh` },
        { label: '参考样本', value: `${context.comparableDayCount} 个${[0, 6].includes(new Date(new Date(context.generatedAt).getTime() + 8 * 60 * 60 * 1000).getUTCDay()) ? '周末' : '工作日'}` },
        ...(topDevice ? [{ label: `${topDevice.name}今日`, value: `${topDevice.todayKwh} kWh（${topDevice.estimated ? '总表差值估算' : '米家实测'}）` }] : [])
      ],
      chart: chartForToday(context),
      disclaimer: '异常判断使用同为工作日或同为周末的历史同进度中位数；米家设备为实测，其他电器仍是总表差值估算。',
      quickReplies: personalizedQuickReplies(plan, context)
    };
  }

  if (plan.action === 'query' && (plan.entities.some(entity => entity !== 'total') || !['today', 'yesterday', 'this_week', 'this_month'].includes(plan.timeRange.kind))) {
    return {
      ...common,
      headline: `${entityName}${periodName}用电 ${period.value} kWh`,
      body: period.entity === 'other' ? '“其他电器”是全屋总表减去空调和热水器后的估算值，不是单独电器的实测值。' : `${entityName}${periodName}用电按照${period.entity === 'total' ? '全屋电表' : '米家设备日用电'}数据统计。`,
      metric: { value: period.value, unit: 'kWh', label: `${entityName}${periodName}` },
      chart,
      quickReplies: personalizedQuickReplies(plan, context)
    };
  }

  const fallback = buildDeterministicAnswer(plan.intent, context);
  return { ...fallback, plan, quickReplies: personalizedQuickReplies(plan, context) };
}

function extractAIText(payload) {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content ?? choice?.text;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(part => typeof part === 'string' ? part : part?.text)
      .filter(Boolean)
      .join('')
      .trim();
  }
  return null;
}

function retryDelayFromResponse(response) {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return response?.status === 429 ? 1000 : 300;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.min(3000, Math.max(300, Math.round(seconds * 1000)));
  const retryAt = new Date(raw).getTime();
  return Number.isFinite(retryAt) ? Math.min(3000, Math.max(300, retryAt - Date.now())) : 300;
}

function configuredAIProviders(env = process.env) {
  const providers = [];
  if (env.DOTS_API_KEY) {
    providers.push({
      id: 'dots',
      label: 'Dots',
      apiKey: env.DOTS_API_KEY,
      baseUrl: env.DOTS_BASE_URL || 'https://note3-prev-api.askdiandian.com/v1',
      model: env.DOTS_MODEL || 'dots3-note-prev',
      auth: 'api-key',
      body: { chat_template_kwargs: { enable_thinking: false } }
    });
  }
  if (env.DEEPSEEK_API_KEY) {
    providers.push({
      id: 'deepseek',
      label: 'DeepSeek',
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      auth: 'bearer',
      body: { thinking: { type: 'disabled' } }
    });
  }
  if (providers.length > 0) {
    if (providers[0].id === 'dots' && !env.DEEPSEEK_API_KEY && env.AI_API_KEY && env.AI_MODEL) {
      providers.push({
        id: 'compatible',
        label: '备用 AI',
        apiKey: env.AI_API_KEY,
        baseUrl: env.AI_BASE_URL || 'https://api.openai.com/v1',
        model: env.AI_MODEL,
        auth: 'bearer'
      });
    }
    return providers;
  }

  if (env.AI_API_KEY && env.AI_MODEL) {
    const legacy = {
      id: 'compatible',
      label: 'AI',
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_BASE_URL || 'https://api.openai.com/v1',
      model: env.AI_MODEL,
      auth: 'bearer'
    };
    providers.push(legacy);
    if (env.AI_FALLBACK_MODEL && env.AI_FALLBACK_MODEL !== env.AI_MODEL) {
      providers.push({ ...legacy, model: env.AI_FALLBACK_MODEL });
    }
  }
  return providers;
}

async function askConfiguredModel(message, context, requestedModel, options = {}) {
  const provider = options.provider || {
    id: 'compatible',
    label: 'AI',
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: requestedModel || process.env.AI_MODEL,
    auth: 'bearer'
  };
  const { apiKey, model } = provider;
  if (!apiKey || !model) {
    return { text: null, reason: 'not_configured', retryable: false, model: model || null, provider: provider.id };
  }

  const baseUrl = String(provider.baseUrl).replace(/\/+$/, '');
  const controller = new AbortController();
  const timeoutMs = boundedPositiveInteger(options.timeoutMs, DEFAULT_AI_TIMEOUT_MS);
  const maxTokens = boundedPositiveInteger(options.maxTokens, 900, 2000);
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.auth === 'api-key' ? { 'api-key': apiKey } : { Authorization: `Bearer ${apiKey}` })
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        stream: typeof options.onDelta === 'function',
        messages: [
          {
            role: 'system',
            content: '你是家庭用电助手布布，负责分析和表达，不负责猜测或计算原始数值。只回答与当前家庭用电数据有关的问题。输出必须是简洁纯文本并严格分成四段，每段依次以“结论：”“数据依据：”“可解释范围：”“建议：”开头，不要使用 Markdown。比较尚未结束的本周与上周时，必须使用上周相同进度数据 previousWeekSameUsage，不能拿本周累计与上周整周比较。只有 deviceEnergy.configured 为 true 时才可以引用具体设备；空调和热水器来自米家日用电数据，其他电器是全屋总表减去两台设备后的估算值，必须明确区分实测与估算。不得修改输入数值，不得猜测输入中没有的设备状态、运行时长或原因。不得输出自我纠正、反问、推理过程或前后矛盾的表述。数据不足时要明确说明。'
          },
          ...normalizeConversationHistory(options.history).map(item => ({
            role: item.role,
            content: item.content
          })),
          {
            role: 'user',
            content: `用户问题：${message}\n可用的结构化数据：${JSON.stringify({
              queryPlan: options.queryPlan,
              remainingKwh: context.remainingKwh,
              todayUsage: context.todayUsage,
              yesterdaySameUsage: context.yesterdaySameUsage,
              yesterdayUsage: context.yesterdayUsage,
              weekUsage: context.weekUsage,
              previousWeekSameUsage: context.previousWeekSameUsage,
              monthUsage: context.monthUsage,
              samePeriodDelta: context.samePeriodDelta,
              sameProgressMedian: context.sameProgressMedian,
              sameProgressMedianDelta: context.sameProgressMedianDelta,
              comparableDayCount: context.comparableDayCount,
              projectedTodayUsage: context.projectedTodayUsage,
              peakHour: context.peakHour,
              sevenDayUsage: context.sevenDayUsage,
              dailyUsage30: context.dailyUsage30,
              monthlyUsage12: context.monthlyUsage12,
              deviceEnergy: context.deviceEnergy,
              updatedLabel: context.updatedLabel
            })}`
          }
        ],
        ...(provider.body || {})
      })
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 409 ||
        response.status === 425 || response.status === 429 || response.status >= 500;
      logAIWarning('AI model request failed', {
        model,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        retryable
      }, options.silent);
      return {
        text: null,
        reason: `http_${response.status}`,
        retryable,
        retryAfterMs: retryDelayFromResponse(response),
        model,
        provider: provider.id,
        providerLabel: provider.label
      };
    }
    let finishReason = null;
    let text = null;
    if (typeof options.onDelta === 'function' && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedText = '';
      const consumeLine = line => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') return;
        try {
          const payload = JSON.parse(data);
          const choice = payload?.choices?.[0];
          const delta = choice?.delta?.content;
          if (typeof delta === 'string' && delta) {
            streamedText += delta;
            options.onDelta(delta);
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason;
        } catch {
          // Ignore malformed keep-alive lines from OpenAI-compatible gateways.
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(consumeLine);
        if (done) break;
      }
      if (buffer) consumeLine(buffer);
      text = streamedText.trim() || null;
    } else {
      const payload = await response.json();
      finishReason = payload?.choices?.[0]?.finish_reason || null;
      text = extractAIText(payload);
    }
    if (!text || finishReason === 'length') {
      logAIWarning('AI model returned an incomplete response', {
        model,
        finish_reason: finishReason,
        duration_ms: Date.now() - startedAt
      }, options.silent);
      return {
        text,
        reason: finishReason === 'length' ? 'truncated' : 'empty_response',
        retryable: finishReason === 'length',
        finishReason,
        model,
        provider: provider.id,
        providerLabel: provider.label
      };
    }
    return { text, reason: null, retryable: false, finishReason, model, provider: provider.id, providerLabel: provider.label };
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    logAIWarning('AI model request unavailable', {
      model,
      reason: timedOut ? 'timeout' : 'network_error',
      duration_ms: Date.now() - startedAt
    }, options.silent);
    return {
      text: null,
      reason: timedOut ? 'timeout' : 'network_error',
      retryable: true,
      model,
      provider: provider.id,
      providerLabel: provider.label
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isUsableAIText(text) {
  const normalized = String(text || '').trim();
  return normalized.length >= 20 && /[。！？.!?）)】]$/.test(normalized);
}

function buildNotification(context) {
  const base = { updatedAt: context.updatedAt, source: `数据更新于 ${context.updatedLabel}` };
  const beijingHour = getBeijingHour(new Date(context.generatedAt));
  const lowBalanceThreshold = Number(process.env.ASSISTANT_LOW_BALANCE_KWH || 10);
  if (context.remainingKwh > 0 && context.remainingKwh <= lowBalanceThreshold) {
    return {
      ...base,
      id: `low-balance-${Math.floor(context.remainingKwh)}`,
      type: 'balance',
      severity: 'critical',
      title: '布布提醒',
      proactive: true,
      message: `当前仅剩 ${context.remainingKwh} kWh，建议尽快关注余额。`,
      actionLabel: '查看详情',
      prompt: '当前余额还能用多久？'
    };
  }
  const deviceCandidate = context.deviceEnergy?.configured
    ? context.deviceEnergy.devices
      .filter(item => !item.estimated && item.todayKwh >= 0.5 && item.dailyAverageKwh > 0)
      .sort((a, b) => (b.versusDailyAverage || 0) - (a.versusDailyAverage || 0))[0]
    : null;
  if (beijingHour >= 18 && deviceCandidate && deviceCandidate.versusDailyAverage >= 50) {
    return {
      ...base,
      id: `device-anomaly-${deviceCandidate.id}-${new Date(context.generatedAt).toISOString().slice(0, 10)}`,
      type: 'device',
      severity: 'warning',
      title: `${deviceCandidate.name}今日用电偏高`,
      proactive: true,
      message: `今日已用 ${deviceCandidate.todayKwh} kWh，较本月此前日均高 ${deviceCandidate.versusDailyAverage}%。`,
      actionLabel: '查看设备分析',
      prompt: `分析${deviceCandidate.name}今天的用电`
    };
  }
  if (context.dataComplete && context.comparableDayCount >= 3 && context.sameProgressMedianDelta >= 20) {
    return {
      ...base,
      id: `usage-anomaly-${new Date(context.generatedAt).toISOString().slice(0, 10)}`,
      type: 'anomaly',
      severity: 'warning',
      title: '今日用电增长较快',
      proactive: true,
      message: `截至上一个完整小时，今日用电较 ${context.comparableDayCount} 个同类日期的同进度中位数高 ${context.sameProgressMedianDelta}%，要看看变化集中在哪个时段吗？`,
      actionLabel: '查看原因',
      prompt: '为什么今天用电更高？'
    };
  }
  return {
    ...base,
    id: `daily-summary-${new Date(context.generatedAt).toISOString().slice(0, 10)}`,
    type: 'daily',
    severity: 'info',
    title: '今日用电小结',
    proactive: beijingHour >= 18,
    message: `昨日用电 ${context.yesterdayUsage} kWh，今日截至 ${context.updatedLabel} 已用 ${context.todayUsage} kWh。`,
    actionLabel: '查看详情',
    prompt: '今天到现在用了多少电？'
  };
}

async function getBriefing() {
  const context = await buildContext();
  const starterPlan = buildQueryPlan('查看今天的全屋和设备用电');
  return {
    available: context.dataComplete,
    aiConfigured: configuredAIProviders().length > 0,
    notification: buildNotification(context),
    welcome: buildDeterministicAnswer('today', context),
    quickReplies: personalizedQuickReplies(starterPlan, context)
  };
}

async function answerQuestion(message, options = {}) {
  const startedAt = Date.now();
  const finish = answer => ({ ...answer, elapsedMs: Date.now() - startedAt });
  const history = normalizeConversationHistory(options.history);
  const plan = buildQueryPlan(message, history);
  if (plan.action === 'out_of_scope') return finish({ ...buildOutOfScopeAnswer(), plan });
  if (plan.action === 'clarify') return finish({ ...buildClarificationAnswer(), plan });

  const baseContext = await buildContext();
  const context = await enrichContextForPlan(baseContext, plan);
  const deterministic = buildPlanDrivenAnswer(plan, context);
  if (needsAIAnalysis(message, plan)) {
    const providers = configuredAIProviders();
    const primaryProvider = providers[0];
    const fallbackProvider = providers[1];
    let emittedDelta = false;
    const onDelta = typeof options.onDelta === 'function'
      ? delta => { emittedDelta = true; options.onDelta(delta); }
      : undefined;
    let completion = await askConfiguredModel(message, context, primaryProvider?.model, {
      timeoutMs: boundedPositiveInteger(process.env.AI_TIMEOUT_MS, 28000),
      onDelta,
      provider: primaryProvider,
      queryPlan: plan,
      history
    });
    if (!emittedDelta && !isUsableAIText(completion.text) && (completion.retryable || fallbackProvider)) {
      await new Promise(resolve => setTimeout(resolve, completion.retryAfterMs || 300));
      const retryProvider = fallbackProvider || primaryProvider;
      completion = await askConfiguredModel(
        message,
        context,
        retryProvider?.model,
        {
          timeoutMs: boundedPositiveInteger(process.env.AI_RETRY_TIMEOUT_MS, 20000),
          maxTokens: completion.reason === 'truncated' ? 1300 : 900,
          onDelta,
          provider: retryProvider,
          queryPlan: plan,
          history
        }
      );
    }
    const aiText = completion.text;
    if (isUsableAIText(aiText)) {
      return finish({
        ...deterministic,
        headline: '布布的 AI 分析',
        body: aiText,
        source: `基于电表与米家设备数据，由 ${completion.providerLabel || 'AI'} 分析 · 更新于 ${context.updatedLabel}`,
        mode: 'ai',
        disclaimer: 'AI 只负责解释与建议，所有用电数值均来自电表数据。',
        quickReplies: ['比较本周和上周', '预计本月用多少？']
      });
    }
    return finish({
      ...deterministic,
      disclaimer: `${deterministic.disclaimer ? `${deterministic.disclaimer} ` : ''}AI 分析服务暂时不可用，本次显示确定性数据分析。`
    });
  }
  return finish(deterministic);
}

module.exports = {
  askConfiguredModel,
  buildQueryPlan,
  buildPlanDrivenAnswer,
  configuredAIProviders,
  answerQuestion,
  buildContext,
  buildClarificationAnswer,
  buildDeterministicAnswer,
  buildOutOfScopeAnswer,
  buildNotification,
  classifyIntent,
  extractAIText,
  isUsableAIText,
  retryDelayFromResponse,
  needsAIAnalysis,
  normalizeConversationHistory,
  invalidateContextCache,
  getBriefing
};

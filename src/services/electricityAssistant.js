const Usage = require('../models/Usage');
const {
  formatBeijingTime,
  getBeijingHour,
  getBeijingTodayStart,
  getBeijingWeekStart,
  getBeijingMonthStart
} = require('../utils/timezone');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_METER_ID = '18100071580';

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percentageChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return round(((current - previous) / previous) * 100, 1);
}

function formatDelta(value) {
  if (value === 0) return '与对比时段持平';
  return `较对比时段${value > 0 ? '高' : '低'} ${Math.abs(value)}%`;
}

function bucketHourlyUsage(records) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, kwh: 0 }));
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1];
    const current = records[index];
    const used = previous.remaining_kwh - current.remaining_kwh;
    if (used >= 0) buckets[getBeijingHour(current.collected_at)].kwh += used;
  }
  return buckets.map(item => ({ ...item, kwh: round(item.kwh) }));
}

function statsFromRecords(records, startDate, endDate) {
  const data = records.filter(record => {
    const collectedAt = new Date(record.collected_at).getTime();
    return collectedAt >= startDate.getTime() && collectedAt <= endDate.getTime();
  });
  let totalUsage = 0;
  let validPoints = 0;
  for (let index = 1; index < data.length; index += 1) {
    const used = data[index - 1].remaining_kwh - data[index].remaining_kwh;
    if (used >= 0) {
      totalUsage += used;
      validPoints += 1;
    }
  }
  return { totalUsage: round(totalUsage), dataPoints: data.length, validPoints };
}

function dailyUsageFromRecords(records, todayStart, daysCount = 8) {
  const totals = new Map();
  for (let index = 1; index < records.length; index += 1) {
    const used = records[index - 1].remaining_kwh - records[index].remaining_kwh;
    if (used < 0) continue;
    const beijingDate = new Date(new Date(records[index].collected_at).getTime() + 8 * 60 * 60 * 1000);
    const date = beijingDate.toISOString().slice(0, 10);
    totals.set(date, (totals.get(date) || 0) + used);
  }
  return Array.from({ length: daysCount }, (_, index) => {
    const date = new Date(todayStart.getTime() - (daysCount - 1 - index) * DAY_MS);
    const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const dateKey = beijingDate.toISOString().slice(0, 10);
    return { date: dateKey, usageKwh: round(totals.get(dateKey) || 0), dayOfWeek: beijingDate.getUTCDay() };
  });
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
  const sevenDaysStart = new Date(todayStart.getTime() - 7 * DAY_MS);
  const previousWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);
  const previousWeekEnd = new Date(weekStart.getTime() - 1);
  const previousWeekSameEnd = new Date(previousWeekStart.getTime() + Math.max(0, now.getTime() - weekStart.getTime()));

  // One indexed range read replaces nine concurrent queries. This avoids exhausting
  // the small remote MongoDB connection pool when the dashboard loads in parallel.
  const queryStart = new Date(Math.min(monthStart.getTime(), sevenDaysStart.getTime(), yesterdayStart.getTime(), previousWeekStart.getTime()));
  const records = await Usage.getUsageInRange(meterId, queryStart, now);
  const latest = records.at(-1) || await Usage.getLatestUsage(meterId);
  const todayStats = statsFromRecords(records, todayStart, now);
  const yesterdaySameStats = statsFromRecords(records, yesterdayStart, yesterdaySameTime);
  const yesterdayStats = statsFromRecords(records, yesterdayStart, yesterdayEnd);
  const weekStats = statsFromRecords(records, weekStart, now);
  const previousWeekStats = statsFromRecords(records, previousWeekStart, previousWeekEnd);
  const previousWeekSameStats = statsFromRecords(records, previousWeekStart, previousWeekSameEnd);
  const monthStats = statsFromRecords(records, monthStart, now);
  const todayRecords = records.filter(record => new Date(record.collected_at) >= todayStart);
  const yesterdayRecords = records.filter(record => {
    const collectedAt = new Date(record.collected_at);
    return collectedAt >= yesterdayStart && collectedAt <= yesterdaySameTime;
  });
  const dailyUsage = dailyUsageFromRecords(records, todayStart, 8);

  const todayHourly = bucketHourlyUsage(todayRecords);
  const yesterdayHourly = bucketHourlyUsage(yesterdayRecords);
  const elapsedHours = Math.max(1, elapsedMs / (60 * 60 * 1000));
  const paceProjection = round((todayStats.totalUsage / elapsedHours) * 24);
  const samePeriodDelta = percentageChange(todayStats.totalUsage, yesterdaySameStats.totalUsage);
  const latestCollectedAt = latest?.collected_at || null;
  const activeHours = todayHourly.filter(item => item.kwh > 0);
  const peak = activeHours.reduce((best, item) => item.kwh > (best?.kwh || 0) ? item : best, null);
  const sevenDayPeak = dailyUsage.reduce((best, item) => item.usageKwh > (best?.usageKwh || 0) ? item : best, null);

  return {
    meterId,
    generatedAt: now.toISOString(),
    updatedAt: latestCollectedAt ? new Date(latestCollectedAt).toISOString() : null,
    updatedLabel: latestCollectedAt ? formatBeijingTime(new Date(latestCollectedAt), 'time') : '暂无数据',
    remainingKwh: round(latest?.remaining_kwh),
    todayUsage: round(todayStats.totalUsage),
    yesterdaySameUsage: round(yesterdaySameStats.totalUsage),
    yesterdayUsage: round(yesterdayStats.totalUsage),
    weekUsage: round(weekStats.totalUsage),
    previousWeekUsage: round(previousWeekStats.totalUsage),
    previousWeekSameUsage: round(previousWeekSameStats.totalUsage),
    monthUsage: round(monthStats.totalUsage),
    samePeriodDelta,
    projectedTodayUsage: elapsedHours >= 3 && todayStats.dataPoints >= 2 ? paceProjection : null,
    todayDataPoints: todayStats.dataPoints,
    todayHourly,
    yesterdayHourly,
    peakHour: peak?.hour ?? null,
    peakHourUsage: peak?.kwh ?? null,
    sevenDayUsage: dailyUsage.slice(-7),
    sevenDayPeak,
    dataComplete: todayStats.dataPoints >= 2
  };
}

let contextCache = null;
let contextCacheExpiresAt = 0;
let contextLoadPromise = null;

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

function classifyIntent(message) {
  const normalized = String(message || '').trim();
  const hasPowerContext = /用电|电量|电费|电价|电表|耗电|耗能|功率|千瓦|kwh|度电|节电|省电|余额|剩余电|续航|高峰|峰值|充电/.test(normalized.toLowerCase());
  const isUsageQuestion = /用了多少|用多少电|会用多少|预计.*用多少|耗了多少|消耗多少|还剩多少电/.test(normalized);

  // Explicitly reject common non-electricity domains before looking at time words
  // such as “今天”; otherwise “今天天气如何” would be misclassified as today usage.
  if (/天气|气温|温度|下雨|降雨|刮风|台风|空气质量|穿什么|新闻|股票|基金|汇率|彩票|足球|篮球|比赛|电影|音乐|菜谱|快递|路线|导航|翻译|写代码/.test(normalized)) {
    return 'out_of_scope';
  }
  if (/余额|剩余|还能用|用完|续航/.test(normalized)) return 'balance';
  if ((/最近一周|近一周/.test(normalized) && hasPowerContext) || /哪天用电最高|用电最高的一天|^哪天最高[？?]?$/.test(normalized)) return 'week_peak';
  if ((/为什么|原因|变高|变多|异常|高峰/.test(normalized) && hasPowerContext) || /^为什么(变高|变多)?[？?]?$/.test(normalized)) return 'explain';
  if ((/分析|总结|规律|趋势|比较|对比|判断/.test(normalized) && hasPowerContext) || /比较.*(本周|上周)|本周.*上周/.test(normalized)) return 'analysis';
  if (/预计|预测/.test(normalized) && /本月|这个月|月底|本月底/.test(normalized)) return 'month_forecast';
  if ((/预计|预测|全天/.test(normalized) && (hasPowerContext || isUsageQuestion)) || /今天会用(多少)?电/.test(normalized)) return 'forecast';
  if (/本周|这周/.test(normalized) && (hasPowerContext || isUsageQuestion)) return 'week';
  if (/电费|用电费用/.test(normalized) || (/本月|这个月/.test(normalized) && (hasPowerContext || isUsageQuestion))) return 'month';
  if (/昨天|昨日/.test(normalized) && (hasPowerContext || isUsageQuestion)) return 'yesterday';
  if ((/今天|今日|现在|当前/.test(normalized) && (hasPowerContext || isUsageQuestion)) || isUsageQuestion) return 'today';
  if (/节电|省电|建议/.test(normalized)) return 'saving';
  return 'unknown';
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

function needsAIAnalysis(message, intent) {
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
  const source = `基于电表采集数据 · 更新于 ${context.updatedLabel}`;
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
        body: `按 1 元/kWh 的当前系统口径，对应已发生用电成本约 ¥${context.monthUsage}。`,
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
        body: `变化最明显的已采集时段是 ${peakLabel}。当前只有电表总量数据，无法确认具体是哪台设备造成。`,
        chart: chartForToday(context),
        evidence: [
          { label: '今日截至当前', value: `${context.todayUsage} kWh` },
          { label: '昨日同期', value: `${context.yesterdaySameUsage} kWh` },
          { label: '今日峰值时段', value: peakLabel }
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
        body: `本周截至当前已用 ${context.weekUsage} kWh，上周相同进度为 ${context.previousWeekSameUsage} kWh，相差 ${Math.abs(weeklyDifference)} kWh。最近七天最高用电日为 ${context.sevenDayPeak?.date || '暂无数据'}。当前只有总表数据，可以定位变化时段，但不能确认具体设备原因。`,
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
        disclaimer: '当前未接入设备级数据，不能把变化归因到具体电器。',
        quickReplies: ['分析变化集中在哪些时段', '给我三个具体节电建议']
      };
    }
    case 'saving':
      return {
        ...common,
        headline: '先优化用电最高的时段',
        body: context.peakHour === null
          ? '当前分时数据不足，暂时无法给出针对性建议。'
          : `今天用电较集中的时段是 ${String(context.peakHour).padStart(2, '0')}:00–${String((context.peakHour + 1) % 24).padStart(2, '0')}:00。可以优先检查这一时段是否有可错峰或缩短运行时间的高功率设备。`,
        chart: chartForToday(context),
        disclaimer: '当前未接入设备级数据，建议基于分时变化生成。',
        quickReplies: ['设置高峰提醒', '最近一周哪天最高？']
      };
    case 'today':
    default:
      return {
        ...common,
        headline: `截至 ${context.updatedLabel}，今日已用 ${context.todayUsage} kWh`,
        body: `${formatDelta(context.samePeriodDelta)}。`,
        metric: { value: context.todayUsage, unit: 'kWh', label: '今日用电', comparison: context.samePeriodDelta },
        chart: chartForToday(context),
        quickReplies: ['为什么变高？', '预计今天用多少？', '给我节电建议']
      };
  }
}

async function askConfiguredModel(message, context, requestedModel) {
  const apiKey = process.env.AI_API_KEY;
  const model = requestedModel || process.env.AI_MODEL;
  if (!apiKey || !model) return null;

  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: 'system',
            content: '你是家庭用电助手布布，负责分析和表达，不负责猜测或计算原始数值。只回答与当前家庭用电数据有关的问题。输出必须是简洁纯文本并严格分成四段，每段依次以“结论：”“数据依据：”“可解释范围：”“建议：”开头，不要使用 Markdown。比较尚未结束的本周与上周时，必须使用上周相同进度数据 previousWeekSameUsage，不能拿本周累计与上周整周比较。不得修改输入数值，不得猜测或暗示某台设备、某类电器的使用变化；只有总表数据时必须明确说无法判断具体设备原因。不得输出自我纠正、反问、推理过程或前后矛盾的表述。数据不足时要明确说明。'
          },
          {
            role: 'user',
            content: `用户问题：${message}\n可用的结构化数据：${JSON.stringify({
              remainingKwh: context.remainingKwh,
              todayUsage: context.todayUsage,
              yesterdaySameUsage: context.yesterdaySameUsage,
              yesterdayUsage: context.yesterdayUsage,
              weekUsage: context.weekUsage,
              previousWeekSameUsage: context.previousWeekSameUsage,
              monthUsage: context.monthUsage,
              samePeriodDelta: context.samePeriodDelta,
              projectedTodayUsage: context.projectedTodayUsage,
              peakHour: context.peakHour,
              sevenDayUsage: context.sevenDayUsage,
              updatedLabel: context.updatedLabel
            })}`
          }
        ]
      })
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content?.trim() || null;
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isUsableAIText(text) {
  const normalized = String(text || '').trim();
  return normalized.length >= 30 && /[。！？.!?]$/.test(normalized);
}

function buildNotification(context) {
  const base = { updatedAt: context.updatedAt, source: `数据更新于 ${context.updatedLabel}` };
  const lowBalanceThreshold = Number(process.env.ASSISTANT_LOW_BALANCE_KWH || 10);
  if (context.remainingKwh > 0 && context.remainingKwh <= lowBalanceThreshold) {
    return {
      ...base,
      id: `low-balance-${Math.floor(context.remainingKwh)}`,
      type: 'balance',
      severity: 'critical',
      title: '布布提醒',
      message: `当前仅剩 ${context.remainingKwh} kWh，建议尽快关注余额。`,
      actionLabel: '查看详情',
      prompt: '当前余额还能用多久？'
    };
  }
  if (context.dataComplete && context.samePeriodDelta >= 20) {
    return {
      ...base,
      id: `usage-anomaly-${new Date(context.generatedAt).toISOString().slice(0, 10)}`,
      type: 'anomaly',
      severity: 'warning',
      title: '布布提醒',
      message: `今日用电较昨日同期高 ${context.samePeriodDelta}%，要看看变化集中在哪个时段吗？`,
      actionLabel: '查看原因',
      prompt: '为什么今天用电更高？'
    };
  }
  return {
    ...base,
    id: `daily-summary-${new Date(context.generatedAt).toISOString().slice(0, 10)}`,
    type: 'daily',
    severity: 'info',
    title: '布布提醒',
    message: `昨日用电 ${context.yesterdayUsage} kWh，今日截至 ${context.updatedLabel} 已用 ${context.todayUsage} kWh。`,
    actionLabel: '查看详情',
    prompt: '今天到现在用了多少电？'
  };
}

async function getBriefing() {
  const context = await buildContext();
  return {
    available: context.dataComplete,
    aiConfigured: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL),
    notification: buildNotification(context),
    welcome: buildDeterministicAnswer('today', context),
    quickReplies: ['今天用了多少电？', '分析最近七天用电规律', '预计本月用多少？', '给我三个具体节电建议']
  };
}

async function answerQuestion(message) {
  const intent = classifyIntent(message);
  if (intent === 'out_of_scope') return buildOutOfScopeAnswer();
  if (intent === 'unknown') return buildClarificationAnswer();

  const context = await buildContext();
  const deterministic = buildDeterministicAnswer(intent, context);
  if (needsAIAnalysis(message, intent)) {
    let aiText = await askConfiguredModel(message, context);
    if (!isUsableAIText(aiText)) {
      await new Promise(resolve => setTimeout(resolve, 250));
      const fallbackModel = process.env.AI_FALLBACK_MODEL || process.env.AI_MODEL;
      aiText = await askConfiguredModel(message, context, fallbackModel);
    }
    if (isUsableAIText(aiText)) {
      return {
        ...deterministic,
        headline: '布布的 AI 分析',
        body: aiText,
        source: `基于电表数据，由 DeepSeek 分析 · 更新于 ${context.updatedLabel}`,
        mode: 'ai',
        disclaimer: 'AI 只负责解释与建议，所有用电数值均来自电表数据。',
        quickReplies: ['比较本周和上周', '预计本月用多少？']
      };
    }
    return {
      ...deterministic,
      disclaimer: `${deterministic.disclaimer ? `${deterministic.disclaimer} ` : ''}AI 分析服务暂时不可用，本次显示确定性数据分析。`
    };
  }
  return deterministic;
}

module.exports = {
  answerQuestion,
  buildContext,
  buildClarificationAnswer,
  buildDeterministicAnswer,
  buildOutOfScopeAnswer,
  buildNotification,
  classifyIntent,
  isUsableAIText,
  needsAIAnalysis,
  getBriefing
};

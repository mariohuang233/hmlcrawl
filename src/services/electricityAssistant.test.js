const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDeterministicAnswer,
  buildClarificationAnswer,
  buildNotification,
  buildOutOfScopeAnswer,
  classifyIntent,
  isUsableAIText
} = require('./electricityAssistant');

const context = {
  generatedAt: '2026-08-09T02:30:00.000Z',
  updatedAt: '2026-08-09T02:28:00.000Z',
  updatedLabel: '10:28',
  remainingKwh: 19.44,
  todayUsage: 2.18,
  yesterdaySameUsage: 2.06,
  yesterdayUsage: 6.42,
  weekUsage: 40.14,
  previousWeekUsage: 53.58,
  previousWeekSameUsage: 48.2,
  monthUsage: 55.25,
  samePeriodDelta: 5.8,
  projectedTodayUsage: 7.6,
  todayDataPoints: 50,
  todayHourly: Array.from({ length: 24 }, (_, hour) => ({ hour, kwh: hour === 8 ? 0.62 : 0.05 })),
  yesterdayHourly: Array.from({ length: 24 }, (_, hour) => ({ hour, kwh: hour === 8 ? 0.38 : 0.04 })),
  peakHour: 8,
  peakHourUsage: 0.62,
  sevenDayUsage: [
    { date: '2026-08-03', usageKwh: 5.4 },
    { date: '2026-08-04', usageKwh: 6.1 },
    { date: '2026-08-05', usageKwh: 8.91 }
  ],
  sevenDayPeak: { date: '2026-08-05', usageKwh: 8.91 },
  dataComplete: true
};

test('classifies supported electricity questions deterministically', () => {
  assert.equal(classifyIntent('今天到现在用了多少电？'), 'today');
  assert.equal(classifyIntent('为什么今天用电变高？'), 'explain');
  assert.equal(classifyIntent('预计今天会用多少？'), 'forecast');
  assert.equal(classifyIntent('预计本月用多少？'), 'month_forecast');
  assert.equal(classifyIntent('预测这个月电费'), 'month_forecast');
  assert.equal(classifyIntent('分析最近七天的用电规律'), 'analysis');
  assert.equal(classifyIntent('比较本周和上周并解释原因'), 'analysis');
  assert.equal(classifyIntent('今天天气如何？'), 'out_of_scope');
  assert.equal(classifyIntent('今天心情如何？'), 'unknown');
  assert.equal(classifyIntent('本月电费是多少？'), 'month');
  assert.equal(classifyIntent('为什么变高？'), 'explain');
  assert.equal(classifyIntent('讲个笑话'), 'unknown');
});

test('asks for clarification instead of guessing an unknown intent', () => {
  const answer = buildClarificationAnswer();
  assert.equal(answer.intent, 'clarification');
  assert.match(answer.body, /余额.*用电量.*分析/);
});

test('returns a scoped refusal for explicit non-electricity questions', () => {
  const answer = buildOutOfScopeAnswer();
  assert.equal(answer.intent, 'out_of_scope');
  assert.match(answer.headline, /不属于用电范围/);
  assert.doesNotMatch(answer.body, /今日已用/);
});

test('builds a grounded today answer with source and chart', () => {
  const answer = buildDeterministicAnswer('today', context);
  assert.match(answer.headline, /2.18 kWh/);
  assert.match(answer.source, /10:28/);
  assert.equal(answer.chart.kind, 'line');
  assert.equal(answer.metric.value, 2.18);
});

test('builds a month projection instead of a today projection', () => {
  const answer = buildDeterministicAnswer('month_forecast', context);
  assert.match(answer.headline, /预计本月约/);
  assert.equal(answer.metric.label, '本月预测');
  assert.match(answer.body, /本月前/);
});

test('compares this week with the same point last week', () => {
  const answer = buildDeterministicAnswer('analysis', context);
  assert.match(answer.headline, /本周较上周同期/);
  assert.match(answer.body, /上周相同进度为 48.2 kWh/);
  assert.equal(answer.evidence[1].label, '上周同期');
});

test('rejects visibly truncated AI responses', () => {
  assert.equal(isUsableAIText('最近七天整体用电呈工作日高、周末'), false);
  assert.equal(isUsableAIText('结论：本周用电低于上周同期。数据依据充分，建议继续观察晚间高峰是否持续下降。'), true);
});

test('uses a low balance reminder before routine summaries', () => {
  const notification = buildNotification({ ...context, remainingKwh: 8.6 });
  assert.equal(notification.type, 'balance');
  assert.match(notification.message, /8.6 kWh/);
});

test('does not claim a device-level cause without device data', () => {
  const answer = buildDeterministicAnswer('explain', context);
  assert.match(answer.body, /无法确认具体是哪台设备/);
  assert.equal(answer.evidence[2].value, '08:00–09:00');
});

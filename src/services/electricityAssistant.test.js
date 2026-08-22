const test = require('node:test');
const assert = require('node:assert/strict');
const {
  askConfiguredModel,
  buildQueryPlan,
  buildPlanDrivenAnswer,
  configuredAIProviders,
  buildDeterministicAnswer,
  buildClarificationAnswer,
  buildNotification,
  buildOutOfScopeAnswer,
  classifyIntent,
  extractAIText,
  isUsableAIText,
  retryDelayFromResponse
} = require('./electricityAssistant');
const intentEvalCases = require('./electricityIntentEval');

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
  deviceEnergy: {
    configured: true,
    devices: [
      { id: 'air_conditioner', name: '空调', todayKwh: 1.24, monthKwh: 18.4, dailyAverageKwh: 0.8, todayShare: 56.9, versusDailyAverage: 55, estimated: false },
      { id: 'water_heater', name: '热水器', todayKwh: 0.52, monthKwh: 9.6, dailyAverageKwh: 0.45, todayShare: 23.9, versusDailyAverage: 15.6, estimated: false },
      { id: 'other', name: '其他电器', todayKwh: 0.42, monthKwh: 27.25, dailyAverageKwh: 2.4, todayShare: 19.2, versusDailyAverage: -82.5, estimated: true }
    ]
  },
  dataComplete: true
};

test('passes the realistic Chinese query-plan evaluation set', () => {
  for (const [message, options, expected] of intentEvalCases) {
    const plan = buildQueryPlan(message, options.history || []);
    assert.equal(plan.action, expected.action, `${message} action`);
    assert.equal(plan.metric, expected.metric, `${message} metric`);
    assert.equal(plan.entities[0], expected.entity, `${message} entity`);
    assert.equal(plan.timeRange.kind, expected.range, `${message} range`);
    if (expected.compareWith) assert.equal(plan.compareWith, expected.compareWith, `${message} comparison`);
    if (expected.entityCount) assert.equal(plan.entities.length, expected.entityCount, `${message} entity count`);
  }
});

test('drives comparison copy and evidence from the structured query plan', () => {
  const plan = buildQueryPlan('比较今天和昨天用电');
  const answer = buildPlanDrivenAnswer(plan, context);
  assert.match(answer.headline, /昨天同期/);
  assert.equal(answer.evidence[0].value, '2.18 kWh');
  assert.equal(answer.evidence[1].value, '2.06 kWh');
  assert.equal(answer.plan.compareWith, 'yesterday_same_time');
});

test('only emits personalized quick replies that resolve to supported query plans', () => {
  const prompts = [
    '今天用了多少电？',
    '空调今天用了多少电？',
    '近30天用电趋势',
    '结合空调数据给我节电建议',
    '数据什么时候更新？',
    '当前余额还能用多久？'
  ];
  for (const prompt of prompts) {
    const plan = buildQueryPlan(prompt);
    const answer = buildPlanDrivenAnswer(plan, context);
    for (const reply of answer.quickReplies || []) {
      const nextPlan = buildQueryPlan(reply, [{ role: 'assistant', content: answer.body, plan }]);
      assert.doesNotMatch(nextPlan.action, /clarify|out_of_scope|reminder/, `${prompt} -> ${reply}`);
    }
  }
});

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
  assert.equal(classifyIntent('空调今天用了多少电？'), 'devices');
  assert.equal(classifyIntent('哪个设备本月最耗电？'), 'devices');
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
  assert.equal(isUsableAIText('结论：本周用电低于上周同期。数据依据：当前用电数据支持该比较。可解释范围：仅能基于已采集数据判断。建议：继续观察晚间高峰是否持续下降。'), true);
});

test('accepts compatible providers that return segmented content', () => {
  assert.equal(extractAIText({
    choices: [{ message: { content: [{ type: 'text', text: '结论：正常。' }, { type: 'text', text: '建议：继续观察。' }] } }]
  }), '结论：正常。建议：继续观察。');
  assert.equal(isUsableAIText('结论：当前用电正常。数据依据：当前数据没有明显增长。可解释范围：不推断具体设备状态。建议：继续观察今晚的变化。'), true);
});

test('prioritizes Dots and configures DeepSeek as the fallback provider', () => {
  const providers = configuredAIProviders({
    DOTS_API_KEY: 'dots-secret',
    DEEPSEEK_API_KEY: 'deepseek-secret'
  });
  assert.deepEqual(providers.map(item => item.id), ['dots', 'deepseek']);
  assert.equal(providers[0].model, 'dots3-note-prev');
  assert.equal(providers[0].auth, 'api-key');
  assert.equal(providers[1].model, 'deepseek-v4-flash');
  assert.equal(providers[1].auth, 'bearer');
});

test('calls Dots with its required api-key header and request shape', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const provider = configuredAIProviders({ DOTS_API_KEY: 'dots-secret' })[0];
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: '结论：当前正常。建议：继续观察今天的用电变化。' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await askConfiguredModel('分析用电', context, provider.model, {
    provider,
    timeoutMs: 1000,
    silent: true
  });
  assert.equal(captured.url, 'https://note3-prev-api.askdiandian.com/v1/chat/completions');
  assert.equal(captured.options.headers['api-key'], 'dots-secret');
  assert.equal(captured.options.headers.Authorization, undefined);
  assert.equal(captured.body.model, 'dots3-note-prev');
  assert.equal(captured.body.chat_template_kwargs.enable_thinking, false);
  assert.equal(result.provider, 'dots');
});

test('marks rate limits as retryable without exposing provider payloads', async t => {
  const originalFetch = global.fetch;
  const originalKey = process.env.AI_API_KEY;
  const originalModel = process.env.AI_MODEL;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = originalModel;
  });
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';
  global.fetch = async () => ({ ok: false, status: 429, headers: { get: () => '0.5' } });

  const result = await askConfiguredModel('分析用电', context, undefined, { timeoutMs: 100, silent: true });
  assert.equal(result.reason, 'http_429');
  assert.equal(result.retryable, true);
  assert.equal(result.retryAfterMs, 500);
  assert.equal(result.text, null);
});

test('streams compatible provider deltas without waiting for the full response', async t => {
  const originalFetch = global.fetch;
  const originalKey = process.env.AI_API_KEY;
  const originalModel = process.env.AI_MODEL;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = originalModel;
  });
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';
  global.fetch = async () => new Response([
    'data: {"choices":[{"delta":{"content":"结论：当前正常。"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"建议：继续观察。"},"finish_reason":"stop"}]}\n\n',
    'data: [DONE]\n\n'
  ].join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const deltas = [];
  const result = await askConfiguredModel('分析用电', context, undefined, {
    timeoutMs: 1000,
    silent: true,
    onDelta: delta => deltas.push(delta)
  });
  assert.deepEqual(deltas, ['结论：当前正常。', '建议：继续观察。']);
  assert.equal(result.text, '结论：当前正常。建议：继续观察。');
  assert.equal(result.finishReason, 'stop');
});

test('caps provider retry-after delays to keep the assistant responsive', () => {
  assert.equal(retryDelayFromResponse({ status: 429, headers: { get: () => '30' } }), 3000);
  assert.equal(retryDelayFromResponse({ status: 429, headers: { get: () => null } }), 1000);
});

test('uses a low balance reminder before routine summaries', () => {
  const notification = buildNotification({ ...context, remainingKwh: 8.6 });
  assert.equal(notification.type, 'balance');
  assert.match(notification.message, /8.6 kWh/);
});

test('builds a grounded appliance answer from Xiaomi device readings', () => {
  const answer = buildDeterministicAnswer('devices', context);
  assert.match(answer.body, /空调今日 1.24 kWh/);
  assert.match(answer.body, /热水器今日 0.52 kWh/);
  assert.match(answer.body, /估算值/);
  assert.equal(answer.evidence.length, 3);
});

test('only prioritizes a full-day device anomaly late enough in the day', () => {
  assert.equal(buildNotification(context).type, 'daily');
  const notification = buildNotification({ ...context, generatedAt: '2026-08-09T12:30:00.000Z' });
  assert.equal(notification.type, 'device');
  assert.equal(notification.proactive, true);
  assert.match(notification.message, /本月此前日均高 55%/);
});

test('does not claim a device-level cause when device data is unavailable', () => {
  const answer = buildDeterministicAnswer('explain', { ...context, deviceEnergy: { configured: false } });
  assert.match(answer.body, /无法确认具体是哪台设备/);
  assert.equal(answer.evidence[2].value, '08:00–09:00');
});

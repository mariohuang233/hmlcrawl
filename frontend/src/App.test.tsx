import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import App from './App';

vi.mock('./components/Chart', () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />
}));

const overviewFixture = {
  current_remaining: 8.6,
  latest_collected_at: new Date().toISOString(),
  data_age_minutes: 3,
  collection_source: 'local',
  recent_success_rate: 100,
  recent_attempts: 24,
  today_usage: 2.8,
  week_usage: 18.6,
  month_usage: 76.4,
  month_cost: 46.2,
};

const assistantBriefingFixture = {
  available: true,
  aiConfigured: false,
  notification: {
    id: 'device-test', type: 'device', severity: 'warning', title: '空调今日用电偏高',
    message: '今日已用 1.2 kWh。', actionLabel: '查看设备分析', prompt: '分析空调今天的用电', source: '更新于 10:28', proactive: true
  },
  welcome: {},
  quickReplies: ['今天用了多少？', '为什么变高？']
};

const deviceEnergyFixture = {
  success: true,
  configured: true,
  updated_at: new Date().toISOString(),
  devices: [
    { device_id: 'air_conditioner', device_name: '空调', today_kwh: 1.2, month_kwh: 18.4, updated_at: new Date().toISOString(), coverage: { today_complete: true, month_complete: true } },
    { device_id: 'water_heater', device_name: '热水器', today_kwh: 0.8, month_kwh: 12.6, updated_at: new Date().toISOString(), coverage: { today_complete: true, month_complete: true } }
  ],
  totals: { today_kwh: 2.8, month_kwh: 76.4, monitored_today_kwh: 2, monitored_month_kwh: 31, other_today_kwh: 0.8, other_month_kwh: 45.4, monitored_month_cost: 31 }
};

const snapshotFixture = {
  generated_at: new Date().toISOString(),
  refresh_after_ms: 300000,
  modules: {},
  overview: overviewFixture,
  trends: { last24h: [], today: [], days30: [], months12: [] },
  device_energy: deviceEnergyFixture,
  recharge_history: { total: 0, totalRechargeKwh: 0, records: [] },
  assistant_briefing: assistantBriefingFixture
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let payload: unknown = overviewFixture;
    if (url.includes('/api/dashboard-snapshot')) {
      payload = snapshotFixture;
    } else if (url.includes('/api/assistant/briefing')) {
      payload = assistantBriefingFixture;
    } else if (url.includes('/api/trend/')) {
      payload = [];
    } else if (url.includes('/api/recharge-history')) {
      payload = { success: true, records: [] };
    } else if (url.includes('/api/device-energy/summary')) {
      payload = deviceEnergyFixture;
    } else if (url.includes('/api/assistant/chat') && init?.method === 'POST') {
      payload = {
        role: 'assistant', intent: 'today', headline: '截至 10:28，今日已用 2.18 kWh',
        body: '较昨日同期高 6%。', source: '基于电表数据 · 更新于 10:28', mode: 'data',
        quickReplies: ['为什么变高？']
      };
    }
    return { ok: true, status: 200, json: async () => payload };
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('renders the electricity dashboard heading', async () => {
  render(<App />);
  await screen.findByRole('button', { name: '刷新全部数据' });
  expect(screen.getByRole('heading', { name: /一二布布的电量监控/ })).toBeInTheDocument();
  expect(screen.queryByText(/undefined%/)).not.toBeInTheDocument();
});

test('renders cumulative appliance energy without real-time power', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: '空调' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '设备用电' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '热水器' })).toBeInTheDocument();
  expect(screen.queryByText(/实时功率/)).not.toBeInTheDocument();
});

test('groups secondary mobile actions in an accessible menu', async () => {
  const user = userEvent.setup();
  render(<App />);

  const menuTrigger = await screen.findByRole('button', { name: '打开更多操作' });
  await user.click(menuTrigger);
  expect(screen.getByRole('menuitem', { name: /切换夜间模式/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /查看本地日志/ })).toBeInTheDocument();

  await user.click(screen.getByRole('menuitem', { name: /切换夜间模式/ }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('opens the assistant and answers a grounded quick question', async () => {
  const user = userEvent.setup();
  render(<App />);

  const launcher = await screen.findByRole('button', { name: '打开布布用电助手' });
  await user.click(launcher);
  await user.click(screen.getByRole('button', { name: '今天用了多少？' }));

  expect(await screen.findByText('截至 10:28，今日已用 2.18 kWh')).toBeInTheDocument();
  expect(screen.getByText('基于电表数据 · 更新于 10:28')).toBeInTheDocument();
  expect(window.localStorage.getItem('electricity-assistant-conversation-v1')).toContain('截至 10:28');
}, 15000);

test('restores the saved assistant conversation after remounting', async () => {
  window.localStorage.setItem('electricity-assistant-conversation-v1', JSON.stringify([
    { id: 'u-saved', role: 'user', text: '今天用了多少？' },
    { id: 'a-saved', role: 'assistant', answer: { role: 'assistant', intent: 'today', headline: '已保存的回答', body: '今日数据已恢复。', source: '本地会话', mode: 'data' } }
  ]));
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: '打开布布用电助手' }));
  expect(screen.getByText('已保存的回答')).toBeInTheDocument();
  expect(screen.getByText('今天用了多少？')).toBeInTheDocument();
});

test('opens a Xiaomi-aware smart reminder and applies global reminder cooldown', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-12T04:00:00.000Z'));
  const user = userEvent.setup();
  render(<App />);

  expect(await screen.findByText('智能提醒 · 米家设备')).toBeInTheDocument();
  expect(screen.getByText('空调今日用电偏高')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '查看设备分析' }));
  expect(await screen.findByText('分析空调今天的用电')).toBeInTheDocument();
  expect(screen.queryByText('智能提醒 · 米家设备')).not.toBeInTheDocument();
  expect(Number(window.localStorage.getItem('electricity-assistant-last-reminder'))).toBeGreaterThan(0);
  vi.useRealTimers();
}, 15000);

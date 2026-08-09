import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import App from './App';

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

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let payload: unknown = overviewFixture;
    if (url.includes('/api/assistant/briefing')) {
      payload = {
        available: true,
        aiConfigured: false,
        notification: {
          id: 'daily-test', type: 'daily', severity: 'info', title: '布布提醒',
          message: '昨日用电 6.42 kWh。', actionLabel: '查看详情', prompt: '今天用了多少？', source: '更新于 10:28'
        },
        welcome: {},
        quickReplies: ['今天用了多少？', '为什么变高？']
      };
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
});

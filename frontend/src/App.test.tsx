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
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => overviewFixture,
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

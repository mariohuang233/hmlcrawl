import type { RechargeHistoryData } from '../utils/api';

export interface DeviceBreakdownData {
  air_conditioner_kwh: number;
  water_heater_kwh: number;
  other_kwh: number;
  available?: boolean;
}

export interface Trend24hData {
  time: string;
  used_kwh: number;
  remaining_kwh: number;
}

export interface TodayTrendData {
  hour: number;
  used_kwh: number;
  yesterday_used_kwh: number;
  avg_used_kwh: number;
  vs_yesterday: number;
  vs_avg: number;
  device_breakdown?: DeviceBreakdownData;
}

export interface DailyTrendData {
  date: string;
  used_kwh: number;
  prev_day_used_kwh: number;
  vs_prev_day: number | null;
  device_breakdown?: DeviceBreakdownData;
}

export interface MonthlyTrendData {
  month: string;
  used_kwh: number;
  prev_month_used_kwh: number;
  vs_prev_month: number | null;
  device_breakdown?: DeviceBreakdownData;
}

export interface DeviceEnergySnapshot {
  success: boolean;
  configured: boolean;
  updated_at: string | null;
  sync?: {
    status: 'ready' | 'error' | 'reauth_required';
    last_sync_at: string | null;
    message: string | null;
  };
  devices: Array<{
    device_id: string;
    device_name: string;
    entity_id?: string | null;
    today_kwh: number;
    month_kwh: number;
    updated_at: string | null;
    coverage: { today_complete: boolean; month_complete: boolean };
  }>;
  totals: {
    today_kwh: number;
    month_kwh: number;
    monitored_today_kwh: number;
    monitored_month_kwh: number;
    other_today_kwh: number;
    other_month_kwh: number;
    monitored_month_cost: number;
  };
}

export interface AssistantSeries {
  name: string;
  values: number[];
}

export interface AssistantAnswer {
  role: 'assistant';
  intent: string;
  headline: string;
  body: string;
  source: string;
  updatedAt?: string | null;
  mode: 'data' | 'ai' | 'prediction';
  elapsedMs?: number;
  metric?: { value: number; unit: string; label: string; comparison?: number };
  chart?: { kind: 'line' | 'bar'; labels: string[]; series: AssistantSeries[] };
  evidence?: Array<{ label: string; value: string }>;
  disclaimer?: string;
  quickReplies?: string[];
}

export interface AssistantNotification {
  id: string;
  type: 'daily' | 'anomaly' | 'balance' | 'device';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  actionLabel: string;
  prompt: string;
  source: string;
  proactive?: boolean;
}

export interface AssistantBriefing {
  available: boolean;
  aiConfigured: boolean;
  notification: AssistantNotification;
  welcome: AssistantAnswer;
  quickReplies: string[];
}

export interface DashboardSnapshot<TOverview> {
  generated_at: string;
  refresh_after_ms: number;
  modules: Record<string, { status: 'ready' | 'empty' | 'degraded'; updated_at: string | null }>;
  overview: TOverview;
  trends: {
    last24h: Trend24hData[];
    today: TodayTrendData[];
    days30: DailyTrendData[];
    months12: MonthlyTrendData[];
  };
  device_energy: DeviceEnergySnapshot;
  recharge_history: RechargeHistoryData;
  assistant_briefing: AssistantBriefing;
}

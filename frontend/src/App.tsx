import React, { lazy, startTransition, useState, useEffect, useCallback, useRef } from 'react';
import Overview from './components/Overview';
import DeferredSection from './components/DeferredSection';
import './premium.css';
import { fetchAPI, retryRequest, formatErrorMessage } from './utils/api';
import bubuIcon from './assets/bubu.png';
import { ColorTheme } from './utils/chartTheme';

const Trend24h = lazy(() => import('./components/Trend24h'));
const TodayUsage = lazy(() => import('./components/TodayUsage'));
const DailyTrend = lazy(() => import('./components/DailyTrend'));
const MonthlyTrend = lazy(() => import('./components/MonthlyTrend'));
const RechargeHistory = lazy(() => import('./components/RechargeHistory'));
const DATA_REFRESH_INTERVAL_MS = 60 * 1000;

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
};

interface WindowAnalysis {
  rate: number;
  dataPoints: number;
  valid: boolean;
  consumption?: number;
  hours?: number;
}

interface PredictionAnalysis {
  short_term: WindowAnalysis;
  medium_term: WindowAnalysis;
  long_term: WindowAnalysis;
  weights: {
    short: number;
    medium: number;
    long: number;
  };
  prediction_method?: string;
}

interface PredictionData {
  predicted_time: string | null;
  hours_remaining: number | null;
  consumption_rate: number | null;
  status: 'success' | 'insufficient_data' | 'no_consumption' | 'invalid_prediction' | 'error';
  message: string;
  data_points: number;
  has_recharge?: boolean;
  analysis?: PredictionAnalysis;
}

interface ComparisonData {
  today_vs_yesterday: number;
  today_vs_last_week_same_day: number;
  week_vs_last_week: number;
  month_vs_last_month: number;
  cost_vs_last_month: number;
  yesterday_usage: number;
  last_week_same_day_usage: number;
  last_week_usage: number;
  last_month_usage: number;
  last_month_cost: number;
}

interface OverviewData {
  current_remaining: number;
  latest_collected_at: string | null;
  data_age_minutes: number | null;
  collection_source: string | null;
  recent_success_rate: number | null;
  recent_attempts: number;
  today_usage: number;
  week_usage: number;
  month_usage: number;
  month_cost: number;
  comparisons?: ComparisonData;
  predicted_depletion?: PredictionData;
  data_coverage?: {
    earliest_data: string | null;
    week_data_complete: boolean;
    month_data_complete: boolean;
    week_actual_start: string;
    month_actual_start: string;
  };
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  source?: string;
}

function getCollectionStatus(data: OverviewData | null) {
  const ageMinutes = data?.data_age_minutes;
  if (!data?.latest_collected_at || ageMinutes === null || ageMinutes === undefined) {
    return { level: 'offline', label: '暂无数据', ageLabel: '尚无采集记录' };
  }
  const ageLabel = ageMinutes < 1
    ? '刚刚采集'
    : ageMinutes < 60
      ? `${ageMinutes} 分钟前采集`
      : `${Math.floor(ageMinutes / 60)} 小时前采集`;
  if (ageMinutes <= 20) return { level: 'online', label: '数据在线', ageLabel };
  if (ageMinutes <= 60) return { level: 'stale', label: '数据延迟', ageLabel };
  return { level: 'offline', label: '数据离线', ageLabel };
}

function App() {
  const lastRefreshAtRef = useRef(0);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [theme, setTheme] = useState<ColorTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    const savedTheme = window.localStorage.getItem('electricity-monitor-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem('electricity-monitor-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(current => current === 'dark' ? 'light' : 'dark');
  }, []);

  const fetchOverview = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      const data = await retryRequest(() => fetchAPI<OverviewData>('/api/overview'), 2, 500);
      setOverview(data);
      lastRefreshAtRef.current = Date.now();
      setError(null);
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      if (!silent) {
        setError(errorMessage);
      }
      console.error('Error fetching overview:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const data = await fetchAPI<{ success: boolean; logs?: any[] }>(
        '/api/crawler/logs?source=local&limit=50'
      );
      
      if (data.success && data.logs) {
        const formattedLogs = data.logs.map((log: any) => ({
          timestamp: log.timestamp || log.time,
          level: log.level || ((log.action === 'error' || log.action === 'failed') ? 'error' : 'info'),
          message: log.message || log.info || JSON.stringify(log.data || log, null, 2),
          source: log.source
        }));
        setLogs(formattedLogs);
      } else {
        setLogs([]);
      }
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      console.error('Error fetching logs:', err);
      alert(`获取日志失败：${errorMessage}`);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    startTransition(() => setRefreshKey(prev => prev + 1));
    fetchOverview(true);
    if (showLogs) {
      fetchLogs();
    }
  }, [fetchOverview, fetchLogs, showLogs]);

  const handleShowLogs = useCallback(() => {
    if (!showLogs) {
      fetchLogs();
    }
    setShowLogs(!showLogs);
  }, [fetchLogs, showLogs]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const collectionStatus = getCollectionStatus(overview);
  const collectionStatusDetails = [
    collectionStatus.ageLabel,
    overview?.collection_source ? `来源 ${overview.collection_source}` : null,
    overview?.recent_success_rate !== null && overview?.recent_success_rate !== undefined
      ? `近 24 小时成功率 ${overview.recent_success_rate}%（${overview.recent_attempts} 次）`
      : null
  ].filter(Boolean).join('，');

  useEffect(() => {
    const refreshVisiblePage = (force = false) => {
      if (document.visibilityState !== 'visible') return;
      if (!force && Date.now() - lastRefreshAtRef.current < DATA_REFRESH_INTERVAL_MS) return;
      fetchOverview(true);
      startTransition(() => setRefreshKey(prev => prev + 1));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshVisiblePage(true);
    };

    const interval = setInterval(() => refreshVisiblePage(), DATA_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchOverview]);

  if (loading) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="header-content">
            <div className="header-inner">
              <div className="app-title-section">
                <h1 className="app-title">
                  <div className="logo-wrapper">
                    <img src={bubuIcon} alt="一二布布" className="app-title-icon" />
                  </div>
                  <span className="app-title-text">一二布布的电量监控</span>
                </h1>
                <p className="app-subtitle">温暖守护，智能用电</p>
              </div>
              <div className="header-actions">
                <button
                  onClick={toggleTheme}
                  className="btn btn-quiet theme-toggle"
                  aria-label={`切换到${theme === 'dark' ? '日间' : '夜间'}模式`}
                >
                  <span>{theme === 'dark' ? '日间模式' : '夜间模式'}</span>
                </button>
              </div>
            </div>
          </div>
        </header>
        <div className="skeleton-container">
          <div className="skeleton-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton skeleton-icon"></div>
                <div className="skeleton skeleton-value"></div>
                <div className="skeleton skeleton-label"></div>
              </div>
            ))}
          </div>
          <div className="skeleton-chart">
            <div className="skeleton skeleton-chart-inner"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-content fade-in">
          <div className="error-mark" aria-hidden="true">连接异常</div>
          <p className="error-message">{error}</p>
          <button 
            onClick={handleRefresh}
            className="btn btn-primary"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-inner">
            <div className="app-title-section">
              <h1 className="app-title">
                <div className="logo-wrapper">
                  <img src={bubuIcon} alt="一二布布" className="app-title-icon" />
                </div>
                <span className="app-title-text">一二布布的电量监控</span>
              </h1>
              <p className="app-subtitle">
                温暖守护，智能用电
                {overview?.latest_collected_at && (
                  <span className="last-update">
                    · {collectionStatus.ageLabel}
                  </span>
                )}
              </p>
            </div>
            <div className="header-actions">
              <div
                className={`system-status is-${collectionStatus.level}`}
                aria-label={`${collectionStatus.label}，${collectionStatusDetails}`}
                title={collectionStatusDetails}
              >
                <span className="system-status-mark" aria-hidden="true"></span>
                {collectionStatus.label}
              </div>
              <button
                onClick={toggleTheme}
                className="btn btn-quiet theme-toggle"
                title={`切换到${theme === 'dark' ? '日间' : '夜间'}模式`}
                aria-label={`切换到${theme === 'dark' ? '日间' : '夜间'}模式`}
              >
                <span>{theme === 'dark' ? '日间模式' : '夜间模式'}</span>
              </button>
              <button
                onClick={handleRefresh}
                className={`btn btn-quiet ${isRefreshing ? 'refreshing' : ''}`}
                title="刷新数据"
                aria-label="刷新全部数据"
                disabled={isRefreshing}
              >
                <span className="refresh-mark" aria-hidden="true">↻</span>
                <span>{isRefreshing ? '刷新中' : '刷新'}</span>
              </button>
              <button
                onClick={handleShowLogs}
                className={`btn btn-quiet ${showLogs ? 'is-active' : ''}`}
                title={showLogs ? '隐藏日志' : '查看日志'}
                aria-expanded={showLogs}
              >
                <span>{showLogs ? '收起日志' : '本地日志'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="fade-in">
          {overview && <Overview data={overview} />}
          
          <div className={isMobile ? 'charts-grid-mobile' : 'charts-grid'}>
            <DeferredSection label="24小时趋势">
              <Trend24h isMobile={isMobile} refreshKey={refreshKey} theme={theme} />
            </DeferredSection>
            <DeferredSection label="今日用电分布">
              <TodayUsage isMobile={isMobile} refreshKey={refreshKey} theme={theme} />
            </DeferredSection>
            <DeferredSection label="30天用电趋势">
              <DailyTrend isMobile={isMobile} refreshKey={refreshKey} theme={theme} />
            </DeferredSection>
            <DeferredSection label="12个月用电趋势">
              <MonthlyTrend isMobile={isMobile} refreshKey={refreshKey} theme={theme} />
            </DeferredSection>
          </div>

          <DeferredSection label="充值记录" minHeight={240} rootMargin="500px 0px">
            <RechargeHistory isMobile={isMobile} refreshKey={refreshKey} />
          </DeferredSection>
          
          {showLogs && (
            <section className="logs-section" aria-live="polite">
              <div className="logs-heading">
                <div>
                  <h2 className="logs-title">本地爬虫日志</h2>
                  <div className="logs-subtitle">本地 Node 与移动端爬虫最近 50 条记录</div>
                </div>
                <span className="logs-source-badge">LOCAL</span>
              </div>
              {logsLoading ? (
                <div className="logs-loading">加载中...</div>
              ) : logs.length === 0 ? (
                <div className="logs-empty">
                  <strong>暂无本地爬虫日志</strong>
                  <span>本地或移动端爬虫完成一次采集后，记录会显示在这里。</span>
                </div>
              ) : (
                <div className="logs-list">
                  {logs.map((log, index) => (
                    <div 
                      key={index} 
                      className={`log-entry log-entry-${log.level}`}
                    >
                      <span className="log-time">
                        {new Date(log.timestamp).toLocaleString('zh-CN')}
                      </span>
                      <span className={`log-level log-level-${log.level}`}>
                        {log.level.toUpperCase()}
                      </span>
                      <span className="log-message">
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

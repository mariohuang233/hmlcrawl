import React, { useState, useEffect, useCallback } from 'react';
import Overview from './components/Overview';
import Trend24h from './components/Trend24h';
import TodayUsage from './components/TodayUsage';
import DailyTrend from './components/DailyTrend';
import MonthlyTrend from './components/MonthlyTrend';
import './App.css';
import { fetchAPI, retryRequest, formatErrorMessage } from './utils/api';
import bubuIcon from './assets/bubu.png';

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
}

function App() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchOverview = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      const data = await retryRequest(() => fetchAPI<OverviewData>('/api/overview'), 2, 500);
      setOverview(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      console.error('Error fetching overview:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const response = await fetch('/api/crawler/logs?limit=50');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      if (data.success && data.logs) {
        const formattedLogs = data.logs.map((log: any) => ({
          timestamp: log.timestamp || log.time,
          level: log.level || ((log.action === 'error' || log.action === 'failed') ? 'error' : 'info'),
          message: log.message || log.info || JSON.stringify(log.data || log, null, 2)
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
    setRefreshKey(prev => prev + 1);
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

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOverview(true);
      setRefreshKey(prev => prev + 1);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
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
          <div className="error-icon">😔</div>
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
                {lastUpdate && (
                  <span className="last-update">
                    · 更新于 {lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
            <div className="header-actions">
              <button
                onClick={handleRefresh}
                className={`btn btn-icon ${isRefreshing ? 'refreshing' : ''}`}
                title="刷新数据"
                disabled={isRefreshing}
              >
                <span className="btn-icon-text">{isRefreshing ? '⟳' : '↻'}</span>
              </button>
              <button
                onClick={handleShowLogs}
                className="btn btn-icon"
                title={showLogs ? '隐藏日志' : '查看日志'}
              >
                <span className="btn-icon-text">{showLogs ? '✕' : '☰'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="fade-in">
          {overview && <Overview key={`overview-${refreshKey}`} data={overview} />}
          
          <Trend24h key={`trend24h-${refreshKey}`} />
          
          <TodayUsage key={`today-${refreshKey}`} />
          
          <DailyTrend key={`daily-${refreshKey}`} />
          
          <MonthlyTrend key={`monthly-${refreshKey}`} />
          
          {showLogs && (
            <div className="logs-section">
              <h2 className="logs-title">系统日志</h2>
              <div className="logs-subtitle">最近 50 条记录</div>
              {logsLoading ? (
                <div className="logs-loading">加载中...</div>
              ) : logs.length === 0 ? (
                <div className="logs-empty">暂无日志</div>
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
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

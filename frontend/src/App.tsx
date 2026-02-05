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

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const data = await retryRequest(() => fetchAPI<OverviewData>('/api/overview'), 2, 500);
      setOverview(data);
      setError(null);
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      console.error('Error fetching overview:', err);
    } finally {
      setLoading(false);
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
    fetchOverview();
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

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-content fade-in">
          <div className="loading-spinner"></div>
          <p className="loading-text">正在加载...</p>
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
                <img src={bubuIcon} alt="一二布布" className="app-title-icon" />
                一二布布的电量监控
              </h1>
              <p className="app-subtitle">温暖守护，智能用电</p>
            </div>
            <div className="header-actions">
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
          {overview && <Overview data={overview} />}
          
          <Trend24h />
          
          <TodayUsage />
          
          <DailyTrend />
          
          <MonthlyTrend />
          
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

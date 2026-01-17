import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Overview from './components/Overview';
import Trend24h from './components/Trend24h';
import TodayUsage from './components/TodayUsage';
import DailyTrend from './components/DailyTrend';
import MonthlyTrend from './components/MonthlyTrend';
import './App.css';
import { fetchAPI, retryRequest, formatErrorMessage } from './utils/api';

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
          level: log.level || (log.action === 'error' || log.action === 'failed' ? 'error' : 'info'),
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
          <p className="loading-text">正在加载数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-content fade-in">
          <div className="error-icon">⚠️</div>
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
            <h1 className="app-title">雷神一二布布的电量监控</h1>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleRefresh}
                className="btn btn-primary"
              >
                刷新数据
              </button>
              <button
                onClick={handleShowLogs}
                className="btn btn-primary"
                style={{ backgroundColor: '#17a2b8' }}
              >
                {showLogs ? '隐藏日志' : '查看日志'}
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
            <div style={{ 
              marginTop: '40px', 
              padding: '20px', 
              backgroundColor: '#1e1e1e', 
              borderRadius: '8px',
              color: '#fff',
              maxHeight: '500px',
              overflowY: 'auto'
            }}>
              <h2 style={{ marginBottom: '20px', color: '#17a2b8' }}>本地爬虫日志</h2>
              <div style={{ marginBottom: '15px', fontSize: '14px', color: '#aaa' }}>
                显示最近50条本地爬虫日志
              </div>
              {logsLoading ? (
                <div>加载中...</div>
              ) : logs.length === 0 ? (
                <div>暂无日志</div>
              ) : (
                <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {logs.map((log, index) => (
                    <div 
                      key={index} 
                      style={{ 
                        padding: '8px',
                        borderBottom: '1px solid #333',
                        display: 'flex',
                        gap: '15px',
                        flexWrap: 'wrap'
                      }}
                    >
                      <span style={{ color: '#888', minWidth: '150px' }}>
                        {new Date(log.timestamp).toLocaleString('zh-CN')}
                      </span>
                      <span style={{ 
                        color: log.level === 'error' ? '#dc3545' : 
                               log.level === 'warn' ? '#ffc107' : 
                               '#17a2b8',
                        minWidth: '80px',
                        fontWeight: 'bold'
                      }}>
                        [{log.level.toUpperCase()}]
                      </span>
                      <span style={{ flex: 1, minWidth: '300px' }}>
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

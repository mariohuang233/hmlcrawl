import React, { useState, useEffect } from 'react';
// 使用fetch替代axios
import Overview from './components/Overview';
import Trend24h from './components/Trend24h';
import TodayUsage from './components/TodayUsage';
import DailyTrend from './components/DailyTrend';
import MonthlyTrend from './components/MonthlyTrend';
import './App.css';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

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

function App() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/overview`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setOverview(data);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取数据失败，请检查网络连接';
      setError(errorMessage);
      console.error('Error fetching overview:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchOverview();
  };

  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const response = await fetch(`${API_BASE}/api/crawler/logs?limit=100`);
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleShowLogs = () => {
    if (!showLogs) {
      fetchLogs();
    }
    setShowLogs(!showLogs);
  };

  const handleTriggerCrawl = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/crawler/trigger`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        alert('爬取任务已触发！');
        setTimeout(() => fetchLogs(), 2000);
      }
    } catch (err) {
      console.error('Error triggering crawl:', err);
      alert('触发失败，请重试');
    }
  };

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
                onClick={handleTriggerCrawl}
                className="btn btn-primary"
                style={{ backgroundColor: '#28a745' }}
              >
                手动爬取
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
          {/* 总览模块 */}
          {overview && <Overview data={overview} />}
          
          {/* 24小时趋势 */}
          <Trend24h />
          
          {/* 当天用电 */}
          <TodayUsage />
          
          {/* 每日趋势 */}
          <DailyTrend />
          
          {/* 每月趋势 */}
          <MonthlyTrend />
          
          {/* 爬虫日志 */}
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
              <h2 style={{ marginBottom: '20px', color: '#17a2b8' }}>爬虫执行日志</h2>
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
                        gap: '15px'
                      }}
                    >
                      <span style={{ color: '#888', minWidth: '150px' }}>
                        {new Date(log.timestamp).toLocaleString('zh-CN')}
                      </span>
                      <span style={{ 
                        color: log.action === 'success' ? '#28a745' : 
                               log.action === 'error' || log.action === 'failed' ? '#dc3545' : 
                               '#17a2b8',
                        minWidth: '100px'
                      }}>
                        [{log.action}]
                      </span>
                      <span>
                        {JSON.stringify(log, null, 2)}
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
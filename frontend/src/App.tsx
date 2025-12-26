import React, { useState, useEffect } from 'react';
// 使用fetch替代axios
import Overview from './components/Overview';
import Trend24h from './components/Trend24h';
import TodayUsage from './components/TodayUsage';
import DailyTrend from './components/DailyTrend';
import MonthlyTrend from './components/MonthlyTrend';
import './App.css';
import { fetchAPI, retryRequest, formatErrorMessage, API_BASE } from './utils/api';

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
  action: string;
  duration?: string;
  data?: any;
  error?: string;
  retryCount?: number;
}

interface LogResponse {
  success: boolean;
  logs: LogEntry[];
  error?: string;
}



function App() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  // 分布式爬虫状态
  const [nextCrawlTime, setNextCrawlTime] = useState<Date | null>(null);
  const [crawlCountdown, setCrawlCountdown] = useState<number>(0); // 倒计时秒数
  const [distributedStatus, setDistributedStatus] = useState<'idle' | 'crawling' | 'success' | 'failed'>('idle');
  const [distributedProgress, setDistributedProgress] = useState<number>(0); // 0-100%

  // 分布式爬虫函数：使用用户浏览器爬取数据
  const performDistributedCrawl = async () => {
    try {
      setDistributedStatus('crawling');
      setDistributedProgress(0);
      
      // 模拟进度更新
      const progressInterval = setInterval(() => {
        setDistributedProgress(prev => {
          const newProgress = prev + 2;
          if (newProgress >= 98) {
            clearInterval(progressInterval);
            return 98;
          }
          return newProgress;
        });
      }, 100);
      
      // 尝试从目标网站获取原始HTML
      console.log('🔍 开始利用用户浏览器爬取数据...');
      setDistributedProgress(20);
      
      const res = await fetch('https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580', {
        mode: 'cors',
        cache: 'no-cache'
      });
      
      setDistributedProgress(50);
      
      if (!res.ok) {
        throw new Error(`Failed to fetch target data: ${res.status}`);
      }
      const htmlData = await res.text();
      console.log('📥 成功获取目标网站HTML数据');
      setDistributedProgress(70);
      
      // 使用封装的fetchAPI函数上报数据，包含更好的错误处理
      console.log('📤 正在将数据发送到服务器...');
      console.log('API_BASE:', API_BASE);
      
      await fetchAPI('/api/reportData', {
        method: 'POST',
        body: JSON.stringify({ data: htmlData })
      });
      
      clearInterval(progressInterval);
      setDistributedProgress(100);
      setDistributedStatus('success');
      
      console.log('✅ 利用用户浏览器爬取数据成功，并已提交到服务器');
      console.log('📊 爬取的HTML数据已发送到/api/reportData端点进行解析');
      console.log('🔄 页面数据将自动刷新以显示最新结果');
      
      // 重置状态
      setTimeout(() => {
        setDistributedStatus('idle');
        setDistributedProgress(0);
      }, 2000);
      
      return true;
    } catch (err) {
      console.error('利用用户浏览器爬取失败:', err);
      console.error('错误详情:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      setDistributedStatus('failed');
      setDistributedProgress(0);
      
      // 重置状态
      setTimeout(() => {
        setDistributedStatus('idle');
      }, 2000);
      
      return false;
    }
  };

  useEffect(() => {
    fetchOverview();

    // 页面加载时执行一次爬取
    performDistributedCrawl();

    // 设置下一次爬取时间
    const setNextCrawl = () => {
      const nextTime = new Date(Date.now() + 2 * 60 * 1000);
      setNextCrawlTime(nextTime);
    };

    // 页面加载时设置第一次倒计时
    setNextCrawl();

    // 设置定时器：每2分钟执行一次爬取
    const crawlInterval = setInterval(() => {
      performDistributedCrawl();
      setNextCrawl();
    }, 2 * 60 * 1000);

    // 组件卸载时清除定时器
    return () => {
      clearInterval(crawlInterval);
    };
  }, []);

  // 倒计时更新
  useEffect(() => {
    if (!nextCrawlTime) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((nextCrawlTime.getTime() - now) / 1000));
      setCrawlCountdown(diff);
    };

    // 立即更新一次
    updateCountdown();

    // 每秒更新一次倒计时
    const countdownInterval = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(countdownInterval);
    };
  }, [nextCrawlTime]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const data = await retryRequest(() => fetchAPI<OverviewData>('/api/overview'), 3, 1000);
      setOverview(data);
      setError(null);
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
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
      const data = await retryRequest(() => fetchAPI<LogResponse>('/api/crawler/logs?limit=100'), 2, 500);
      if (data.success) {
        setLogs(data.logs);
      } else {
        throw new Error(data.error || '获取日志失败');
      }
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      console.error('Error fetching logs:', err);
      alert(`获取日志失败：${errorMessage}`);
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
      console.log('开始利用用户浏览器爬取数据...');
      const success = await performDistributedCrawl();
      if (success) {
        alert('浏览器爬取任务已触发并成功提交数据！');
        // 爬取成功后刷新数据
        fetchOverview();
        setTimeout(() => fetchLogs(), 2000);
      } else {
        throw new Error('浏览器爬取任务提交失败');
      }
    } catch (err) {
      const errorMessage = formatErrorMessage(err);
      console.error('利用用户浏览器爬取失败:', err);
      alert(`触发失败：${errorMessage}`);
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
          
          {/* 分布式爬虫状态模块 */}
          <div style={{ 
            marginTop: '40px', 
            padding: '20px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '8px',
            border: '1px solid #dee2e6'
          }}>
            <h2 style={{ marginBottom: '20px', color: '#495057' }}>分布式爬虫状态</h2>
            
            {/* 爬虫进度 */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '10px', fontSize: '16px', color: '#6c757d' }}>爬虫进度</h3>
              <div style={{ 
                width: '100%', 
                height: '20px', 
                backgroundColor: '#e9ecef', 
                borderRadius: '10px',
                overflow: 'hidden'
              }}>
                <div 
                  style={{ 
                    width: `${distributedProgress}%`, 
                    height: '100%', 
                    backgroundColor: 
                      distributedStatus === 'crawling' ? '#ffc107' :
                      distributedStatus === 'success' ? '#28a745' :
                      distributedStatus === 'failed' ? '#dc3545' : '#6c757d',
                    transition: 'width 0.3s ease'
                  }}
                ></div>
              </div>
              <div style={{ marginTop: '5px', fontSize: '14px', color: '#6c757d' }}>
                状态: 
                <span style={{ 
                  color: 
                    distributedStatus === 'crawling' ? '#ffc107' :
                    distributedStatus === 'success' ? '#28a745' :
                    distributedStatus === 'failed' ? '#dc3545' : '#6c757d',
                  fontWeight: 'bold'
                }}>
                  {distributedStatus === 'idle' ? '空闲' :
                   distributedStatus === 'crawling' ? '爬取中' :
                   distributedStatus === 'success' ? '爬取成功' : '爬取失败'}
                </span>
              </div>
            </div>
            
            {/* 下一次爬取倒计时 */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '10px', fontSize: '16px', color: '#6c757d' }}>下一次爬取倒计时</h3>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 'bold', 
                color: '#007bff',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span>{Math.floor(crawlCountdown / 60).toString().padStart(2, '0')}</span>
                <span>:</span>
                <span>{(crawlCountdown % 60).toString().padStart(2, '0')}</span>
                <span style={{ fontSize: '14px', color: '#6c757d', fontWeight: 'normal' }}>(分钟:秒)</span>
              </div>
              {nextCrawlTime && (
                <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                  预计下次爬取时间: {new Date(nextCrawlTime).toLocaleTimeString('zh-CN')}
                </div>
              )}
            </div>
            
            {/* 手动爬取按钮 */}
            <div>
              <button
                onClick={handleTriggerCrawl}
                className="btn btn-primary"
                style={{ backgroundColor: '#28a745', marginRight: '10px' }}
                disabled={distributedStatus === 'crawling'}
              >
                {distributedStatus === 'crawling' ? '爬取中...' : '手动触发爬取'}
              </button>
              <span style={{ fontSize: '14px', color: '#6c757d' }}>
                (使用当前浏览器进行分布式爬取)
              </span>
            </div>
          </div>
          
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
              <h2 style={{ marginBottom: '20px', color: '#17a2b8' }}>分布式爬虫日志</h2>
              <div style={{ marginBottom: '15px', fontSize: '14px', color: '#888' }}>
                显示所有分布式爬取日志 (本地+服务器)
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
                        color: log.action === 'success' ? '#28a745' : 
                               log.action === 'error' || log.action === 'failed' ? '#dc3545' : 
                               '#17a2b8',
                        minWidth: '100px'
                      }}>
                        [{log.action}]
                      </span>
                      <span style={{ flex: 1, minWidth: '300px' }}>
                        {log.message || JSON.stringify(log, null, 2)}
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
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Overview from './components/Overview';
import Trend24h from './components/Trend24h';
import TodayUsage from './components/TodayUsage';
import DailyTrend from './components/DailyTrend';
import MonthlyTrend from './components/MonthlyTrend';
import './App.css';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface OverviewData {
  today_usage: number;
  week_usage: number;
  month_usage: number;
  month_cost: number;
}

function App() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/api/overview`);
      setOverview(response.data);
      setError(null);
    } catch (err) {
      setError('获取数据失败，请检查网络连接');
      console.error('Error fetching overview:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchOverview();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '16px', color: '#6b7280' }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#ef4444', fontSize: '20px', marginBottom: '16px' }}>⚠️</div>
          <p style={{ color: '#dc2626', marginBottom: '16px' }}>{error}</p>
          <button 
            onClick={handleRefresh}
            style={{ 
              backgroundColor: '#2563eb', 
              color: 'white', 
              padding: '8px 16px', 
              borderRadius: '6px', 
              border: 'none',
              cursor: 'pointer'
            }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <header style={{ backgroundColor: 'white', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>家庭用电监控系统</h1>
            <button
              onClick={handleRefresh}
              style={{ 
                backgroundColor: '#2563eb', 
                color: 'white', 
                padding: '8px 16px', 
                borderRadius: '6px', 
                border: 'none',
                cursor: 'pointer'
              }}
            >
              刷新数据
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>
        <div>
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
        </div>
      </main>
    </div>
  );
}

export default App;
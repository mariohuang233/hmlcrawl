import React from 'react';

interface OverviewData {
  current_remaining: number;
  today_usage: number;
  week_usage: number;
  month_usage: number;
  month_cost: number;
}

interface OverviewProps {
  data: OverviewData;
}

const Overview: React.FC<OverviewProps> = ({ data }) => {
  // 检测暗夜模式
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const stats = [
    {
      value: data.current_remaining.toFixed(2),
      label: '当前剩余电量',
      unit: 'kWh',
      color: isDarkMode ? '#30D158' : '#34C759',
      icon: '🔋'
    },
    {
      value: data.today_usage.toFixed(2),
      label: '今日用电',
      unit: 'kWh',
      color: isDarkMode ? '#5AC8FA' : '#4A90E2',
      icon: '⚡'
    },
    {
      value: data.week_usage.toFixed(2),
      label: '本周用电',
      unit: 'kWh',
      color: isDarkMode ? '#30D158' : '#34C759',
      icon: '📊'
    },
    {
      value: data.month_usage.toFixed(2),
      label: '本月用电',
      unit: 'kWh',
      color: isDarkMode ? '#FF9F0A' : '#FF9500',
      icon: '📈'
    },
    {
      value: `¥${data.month_cost.toFixed(2)}`,
      label: '本月预计费用',
      unit: '',
      color: isDarkMode ? '#FFFFFF' : '#0D0D0D',
      icon: '💰'
    }
  ];

  return (
    <div className="card">
      <h2 className="card-title">用电总览</h2>
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-icon" style={{ color: stat.color, fontSize: '24px', marginBottom: '8px' }}>
              {stat.icon}
            </div>
            <div className="stat-value" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="stat-label">
              {stat.label}
              {stat.unit && <span style={{ opacity: 0.7 }}> ({stat.unit})</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Overview;

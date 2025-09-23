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
  const stats = [
    {
      value: data.current_remaining.toFixed(2),
      label: '当前剩余电量',
      unit: 'kWh',
      color: 'var(--accent-green)',
      icon: '🔋'
    },
    {
      value: data.today_usage.toFixed(2),
      label: '今日用电',
      unit: 'kWh',
      color: 'var(--accent-blue)',
      icon: '⚡'
    },
    {
      value: data.week_usage.toFixed(2),
      label: '本周用电',
      unit: 'kWh',
      color: 'var(--accent-green)',
      icon: '📊'
    },
    {
      value: data.month_usage.toFixed(2),
      label: '本月用电',
      unit: 'kWh',
      color: 'var(--accent-orange)',
      icon: '📈'
    },
    {
      value: `¥${data.month_cost.toFixed(2)}`,
      label: '本月预计费用',
      unit: '',
      color: 'var(--text-primary)',
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

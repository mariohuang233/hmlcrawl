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
  return (
    <div className="card">
      <h2 className="card-title">用电总览</h2>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '24px' 
      }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{data.current_remaining.toFixed(2)}</div>
          <div className="stat-label">当前剩余电量 (kWh)</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{data.today_usage.toFixed(2)}</div>
          <div className="stat-label">今日用电 (kWh)</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#059669' }}>{data.week_usage.toFixed(2)}</div>
          <div className="stat-label">本周用电 (kWh)</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#d97706' }}>{data.month_usage.toFixed(2)}</div>
          <div className="stat-label">本月用电 (kWh)</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>¥{data.month_cost.toFixed(2)}</div>
          <div className="stat-label">本月预计费用</div>
        </div>
      </div>
    </div>
  );
};

export default Overview;

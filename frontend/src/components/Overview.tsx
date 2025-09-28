import React from 'react';

interface PredictionData {
  predicted_time: string | null;
  hours_remaining: number | null;
  consumption_rate: number | null;
  status: 'success' | 'insufficient_data' | 'no_consumption' | 'invalid_prediction' | 'error';
  message: string;
  data_points: number;
  has_recharge?: boolean;
  analysis_period?: string;
}

interface OverviewData {
  current_remaining: number;
  today_usage: number;
  week_usage: number;
  month_usage: number;
  month_cost: number;
  predicted_depletion?: PredictionData;
  data_coverage?: {
    earliest_data: string | null;
    week_data_complete: boolean;
    month_data_complete: boolean;
    week_actual_start: string;
    month_actual_start: string;
  };
}

interface OverviewProps {
  data: OverviewData;
}

const Overview: React.FC<OverviewProps> = ({ data }) => {
  // 检测暗夜模式
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // 检查数据完整性
  const isDataIncomplete = data.data_coverage && 
    (!data.data_coverage.week_data_complete || !data.data_coverage.month_data_complete);
  
  // 格式化日期
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { 
      month: 'numeric', 
      day: 'numeric' 
    });
  };

  // 格式化预计用完时间
  const formatPredictedTime = (prediction: PredictionData) => {
    if (prediction.status !== 'success' || !prediction.predicted_time) {
      return {
        value: '--',
        label: '预计用完时间',
        subtitle: prediction.message,
        icon: '❌'
      };
    }

    const predictedDate = new Date(prediction.predicted_time);
    const now = new Date();
    const diffMs = predictedDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let timeStr = '';
    if (diffDays > 0) {
      timeStr = `${diffDays}天${diffHours}小时`;
    } else if (diffHours > 0) {
      timeStr = `${diffHours}小时`;
    } else {
      timeStr = '即将用完';
    }

    const dateStr = predictedDate.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return {
      value: timeStr,
      label: '预计用完时间',
      subtitle: `${dateStr} (${prediction.analysis_period || ''}分析)`,
      icon: diffDays > 7 ? '🔋' : diffDays > 3 ? '⚠️' : '🚨'
    };
  };

  // 获取预测信息
  const predictionInfo = data.predicted_depletion ? formatPredictedTime(data.predicted_depletion) : null;
  
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
      label: data.data_coverage && !data.data_coverage.week_data_complete 
        ? `本周用电（从${formatDate(data.data_coverage.week_actual_start)}起）`
        : '本周用电',
      unit: 'kWh',
      color: isDarkMode ? '#30D158' : '#34C759',
      icon: '📊',
      warning: data.data_coverage && !data.data_coverage.week_data_complete
    },
    {
      value: data.month_usage.toFixed(2),
      label: data.data_coverage && !data.data_coverage.month_data_complete 
        ? `本月用电（从${formatDate(data.data_coverage.month_actual_start)}起）`
        : '本月用电',
      unit: 'kWh',
      color: isDarkMode ? '#FF9F0A' : '#FF9500',
      icon: '📈',
      warning: data.data_coverage && !data.data_coverage.month_data_complete
    },
    {
      value: `¥${data.month_cost.toFixed(2)}`,
      label: '本月预计费用',
      unit: '',
      color: isDarkMode ? '#FFFFFF' : '#0D0D0D',
      icon: '💰'
    },
    // 添加预计用完时间
    ...(predictionInfo ? [{
      value: predictionInfo.value,
      label: predictionInfo.label,
      unit: '',
      color: predictionInfo.icon === '🚨' ? (isDarkMode ? '#FF453A' : '#FF3B30') : 
             predictionInfo.icon === '⚠️' ? (isDarkMode ? '#FF9F0A' : '#FF9500') : 
             (isDarkMode ? '#30D158' : '#34C759'),
      icon: predictionInfo.icon,
      subtitle: predictionInfo.subtitle
    }] : [])
  ];

  return (
    <div className="card">
      <h2 className="card-title">用电总览</h2>
      {isDataIncomplete && (
        <div style={{
          backgroundColor: isDarkMode ? 'rgba(255, 159, 10, 0.1)' : 'rgba(255, 149, 0, 0.1)',
          border: `1px solid ${isDarkMode ? 'rgba(255, 159, 10, 0.3)' : 'rgba(255, 149, 0, 0.3)'}`,
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          fontSize: '14px',
          color: isDarkMode ? '#FF9F0A' : '#FF9500'
        }}>
          ⚠️ 数据不完整：数据库中只有从 {data.data_coverage?.earliest_data ? formatDate(data.data_coverage.earliest_data) : '最近'} 开始的记录，因此本周和本月用电量可能相同。
        </div>
      )}
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card" style={{
            border: (stat as any).warning ? `1px solid ${isDarkMode ? 'rgba(255, 159, 10, 0.3)' : 'rgba(255, 149, 0, 0.3)'}` : undefined
          }}>
            <div className="stat-icon" style={{ color: stat.color, fontSize: '24px', marginBottom: '8px' }}>
              {stat.icon}
              {(stat as any).warning && <span style={{ fontSize: '12px', marginLeft: '4px' }}>⚠️</span>}
            </div>
            <div className="stat-value" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="stat-label">
              {stat.label}
              {stat.unit && <span style={{ opacity: 0.7 }}> ({stat.unit})</span>}
              {(stat as any).subtitle && (
                <div style={{ 
                  fontSize: '12px', 
                  opacity: 0.7, 
                  marginTop: '4px',
                  lineHeight: '1.2'
                }}>
                  {(stat as any).subtitle}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Overview;

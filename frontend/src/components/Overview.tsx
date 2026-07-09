import React from 'react';
import AnimatedNumber from './AnimatedNumber';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

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

interface OverviewProps {
  data: OverviewData;
}

const Overview: React.FC<OverviewProps> = ({ data }) => {
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.01,
    rootMargin: '50px'
  });
  
  const isDataIncomplete = data.data_coverage && 
    (!data.data_coverage.week_data_complete || !data.data_coverage.month_data_complete);
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { 
      month: 'numeric', 
      day: 'numeric' 
    });
  };

  const formatComparison = (percentage: number) => {
    if (percentage === 0) return '持平';
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage}%`;
  };

  const getComparisonColor = (percentage: number) => {
    if (percentage === 0) return '#8a8078';
    if (percentage > 0) return '#f43f5e';
    return '#10b981';
  };

  const formatPredictedTime = (prediction: PredictionData) => {
    if (prediction.status !== 'success' || !prediction.predicted_time) {
      return {
        value: '--',
        label: '预计用完时间',
        subtitle: prediction.message,
        icon: '🔋',
        status: 'neutral' as const
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

    let analysisDetail = `${dateStr}`;
    if (prediction.analysis?.weights) {
      const weights = prediction.analysis.weights;
      const primaryMethod = weights.short > 0.5 ? '短期' : 
                           weights.long > 0.4 ? '长期' : '综合';
      analysisDetail += ` (${primaryMethod}分析)`;
    }

    let status: 'safe' | 'warning' | 'danger' | 'neutral' = 'safe';
    if (diffDays <= 1) status = 'danger';
    else if (diffDays <= 3) status = 'warning';

    return {
      value: timeStr,
      label: '预计用完时间',
      subtitle: analysisDetail,
      icon: diffDays > 7 ? '🔋' : diffDays > 3 ? '⚡' : '🔔',
      analysis: prediction.analysis,
      status
    };
  };

  const predictionInfo = data.predicted_depletion ? formatPredictedTime(data.predicted_depletion) : null;
  
  const getBatteryLevel = (remaining: number) => {
    if (remaining <= 10) return { level: 'critical', color: '#f43f5e', bgColor: '#fff1f2' };
    if (remaining <= 30) return { level: 'low', color: '#f59e0b', bgColor: '#fffbeb' };
    if (remaining <= 60) return { level: 'medium', color: '#0ea5e9', bgColor: '#f0f9ff' };
    return { level: 'high', color: '#10b981', bgColor: '#ecfdf5' };
  };

  const batteryLevel = getBatteryLevel(data.current_remaining);

  const secondaryStats = [
    {
      value: data.today_usage,
      label: '今日用电',
      unit: 'kWh',
      icon: '⚡',
      precision: 2,
      delay: 100,
      comparison: data.comparisons ? {
        text: `较昨日 ${formatComparison(data.comparisons.today_vs_yesterday)}`,
        color: getComparisonColor(data.comparisons.today_vs_yesterday),
        secondaryText: `周环比 ${formatComparison(data.comparisons.today_vs_last_week_same_day)}`,
        secondaryColor: getComparisonColor(data.comparisons.today_vs_last_week_same_day)
      } : undefined
    },
    {
      value: data.week_usage,
      label: data.data_coverage && !data.data_coverage.week_data_complete 
        ? `本周用电（从${formatDate(data.data_coverage.week_actual_start)}起）`
        : '本周用电',
      unit: 'kWh',
      icon: '📊',
      precision: 2,
      delay: 200,
      warning: data.data_coverage && !data.data_coverage.week_data_complete,
      comparison: data.comparisons ? {
        text: `较上周 ${formatComparison(data.comparisons.week_vs_last_week)}`,
        color: getComparisonColor(data.comparisons.week_vs_last_week)
      } : undefined
    },
    {
      value: data.month_usage,
      label: data.data_coverage && !data.data_coverage.month_data_complete 
        ? `本月用电（从${formatDate(data.data_coverage.month_actual_start)}起）`
        : '本月用电',
      unit: 'kWh',
      icon: '📈',
      precision: 2,
      delay: 300,
      warning: data.data_coverage && !data.data_coverage.month_data_complete,
      comparison: data.comparisons ? {
        text: `较上月 ${formatComparison(data.comparisons.month_vs_last_month)}`,
        color: getComparisonColor(data.comparisons.month_vs_last_month)
      } : undefined
    },
    {
      value: data.month_cost,
      label: '本月预计费用',
      unit: '元',
      prefix: '¥',
      icon: '💰',
      precision: 2,
      delay: 400,
      comparison: data.comparisons ? {
        text: `较上月 ${formatComparison(data.comparisons.cost_vs_last_month)}`,
        color: getComparisonColor(data.comparisons.cost_vs_last_month)
      } : undefined
    }
  ];

  return (
    <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
      <h2 className="card-title">用电总览</h2>
      {isDataIncomplete && (
        <div className="data-warning">
          <span>⚠️</span>
          <span>数据不完整：数据库中只有从 {data.data_coverage?.earliest_data ? formatDate(data.data_coverage.earliest_data) : '最近'} 开始的记录，因此本周和本月用电量可能相同。</span>
        </div>
      )}
      
      <div className="hero-section">
        <div 
          className={`hero-card ${hasTriggered ? 'animate-in' : ''}`}
          style={{ 
            animationDelay: '0ms',
            borderLeft: `4px solid ${batteryLevel.color}`
          }}
        >
          <div className="hero-content">
            <div className="hero-icon-wrapper" style={{ background: batteryLevel.bgColor }}>
              <span className="hero-icon">🔋</span>
              <span className="hero-status-dot" style={{ backgroundColor: batteryLevel.color }}></span>
            </div>
            <div className="hero-info">
              <div className="hero-label">当前剩余电量</div>
              <div className="hero-value-row">
                <span className="hero-value" style={{ color: batteryLevel.color }}>
                  <AnimatedNumber
                    value={data.current_remaining}
                    unit=""
                    precision={2}
                    delay={0}
                    easing="easeOutBounce"
                    autoStart={hasTriggered}
                  />
                </span>
                <span className="hero-unit" style={{ color: batteryLevel.color }}>kWh</span>
              </div>
              <div className="battery-bar-container">
                <div className="battery-bar-bg">
                  <div 
                    className="battery-bar-fill" 
                    style={{ 
                      width: `${Math.min(data.current_remaining, 100)}%`,
                      background: `linear-gradient(90deg, ${batteryLevel.color} 0%, ${batteryLevel.color}dd 100%)`
                    }}
                  ></div>
                </div>
                <span className="battery-bar-text" style={{ color: batteryLevel.color }}>
                  {data.current_remaining.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {predictionInfo && (
          <div 
            className={`hero-card hero-card-prediction ${predictionInfo.status} ${hasTriggered ? 'animate-in' : ''}`}
            style={{ animationDelay: '150ms' }}
          >
            <div className="hero-content">
              <div className="hero-icon-wrapper" style={{ 
                background: predictionInfo.status === 'danger' ? '#fff1f2' : 
                           predictionInfo.status === 'warning' ? '#fffbeb' : '#f0f9ff' 
              }}>
                <span className="hero-icon">{predictionInfo.icon}</span>
              </div>
              <div className="hero-info">
                <div className="hero-label">{predictionInfo.label}</div>
                <div className="hero-value-row">
                  <span className="hero-value" style={{ 
                    color: predictionInfo.status === 'danger' ? '#f43f5e' : 
                           predictionInfo.status === 'warning' ? '#f59e0b' : '#2d2620' 
                  }}>
                    {predictionInfo.value}
                  </span>
                </div>
                <div className="hero-subtitle">{predictionInfo.subtitle}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="secondary-stats-grid">
        {secondaryStats.map((stat, index) => (
          <div 
            key={index} 
            className={`secondary-stat-card ${hasTriggered ? 'animate-in' : ''}`}
            style={{
              animationDelay: `${(stat as any).delay || 0}ms`,
              border: (stat as any).warning ? '1px solid var(--accent-amber-200)' : undefined
            }}
          >
            <div className="secondary-stat-icon">{stat.icon}</div>
            <div className="secondary-stat-content">
              <div className="secondary-stat-value">
                {(stat as any).prefix || ''}
                <AnimatedNumber
                  value={typeof stat.value === 'number' ? stat.value : 0}
                  unit={stat.unit}
                  precision={(stat as any).precision || 2}
                  delay={hasTriggered ? ((stat as any).delay || 0) : 0}
                  easing="easeOutBounce"
                  autoStart={hasTriggered}
                />
              </div>
              <div className="secondary-stat-label">{stat.label}</div>
              {(stat as any).comparison && (
                <div className="secondary-stat-comparison">
                  <span className="comparison-badge" style={{ color: (stat as any).comparison.color }}>
                    {(stat as any).comparison.text}
                  </span>
                  {(stat as any).comparison.secondaryText && (
                    <span className="comparison-badge comparison-badge-secondary" style={{ color: (stat as any).comparison.secondaryColor }}>
                      {(stat as any).comparison.secondaryText}
                    </span>
                  )}
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

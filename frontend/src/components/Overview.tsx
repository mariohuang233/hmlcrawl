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

interface StatItem {
  value: number | string;
  label: string;
  unit: string;
  icon: string;
  precision: number;
  delay: number;
  prefix?: string;
  suffix?: string;
  subtitle?: string;
  warning?: boolean;
  isStatic?: boolean;
  comparison?: {
    text: string;
    color: string;
    secondaryText?: string;
    secondaryColor?: string;
  };
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
    if (percentage === 0) return '#9A8B7E';
    if (percentage > 0) return '#E88B8B';
    return '#7CB87C';
  };

  const formatPredictedTime = (prediction: PredictionData) => {
    if (prediction.status !== 'success' || !prediction.predicted_time) {
      return {
        value: '--',
        label: '预计用完时间',
        subtitle: prediction.message,
        icon: '🔋'
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

    return {
      value: timeStr,
      label: '预计用完时间',
      subtitle: analysisDetail,
      icon: diffDays > 7 ? '🔋' : diffDays > 3 ? '⚡' : '🔔',
      analysis: prediction.analysis
    };
  };

  const predictionInfo = data.predicted_depletion ? formatPredictedTime(data.predicted_depletion) : null;
  
  const stats = [
    {
      value: data.current_remaining,
      label: '当前剩余电量',
      unit: 'kWh',
      icon: '🔋',
      precision: 2,
      delay: 0
    },
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
    },
    ...(predictionInfo ? [{
      value: predictionInfo.value,
      label: predictionInfo.label,
      unit: '',
      icon: predictionInfo.icon,
      subtitle: predictionInfo.subtitle,
      precision: 0,
      delay: 500,
      isStatic: true
    }] : [])
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
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div 
            key={index} 
            className={`stat-card ${hasTriggered ? 'animate-in' : ''}`}
            style={{
              animationDelay: `${(stat as any).delay || 0}ms`,
              border: (stat as any).warning ? '1px solid #FFE082' : undefined
            }}
          >
            <div className="stat-icon">
              {stat.icon}
              {(stat as any).warning && <span style={{ fontSize: '12px', marginLeft: '4px' }}>⚠️</span>}
            </div>
            <div className="stat-value">
              {(stat as any).isStatic ? (
                stat.value
              ) : (
                <AnimatedNumber
                  value={typeof stat.value === 'number' ? stat.value : 0}
                  unit={stat.unit}
                  prefix={(stat as any).prefix || ''}
                  suffix={(stat as any).suffix || ''}
                  precision={(stat as any).precision || 2}
                  delay={hasTriggered ? ((stat as any).delay || 0) : 0}
                  easing="easeOutBounce"
                  autoStart={hasTriggered}
                />
              )}
            </div>
            <div className="stat-label">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span>{stat.label}</span>
                {stat.unit && stat.unit !== '元' && <span className="unit-badge">{stat.unit}</span>}
              </div>
              {(stat as any).subtitle && (
                <div style={{ 
                  fontSize: '12px', 
                  color: '#9A8B7E',
                  marginTop: '4px',
                  lineHeight: '1.4'
                }}>
                  {(stat as any).subtitle}
                </div>
              )}
              {(stat as any).comparison && (
                <>
                  <div style={{ 
                    fontSize: '11px',
                    marginTop: '6px',
                    color: (stat as any).comparison.color,
                    fontWeight: 600
                  }}>
                    {(stat as any).comparison.text}
                  </div>
                  {(stat as any).comparison.secondaryText && (
                    <div style={{ 
                      fontSize: '11px',
                      marginTop: '2px',
                      color: (stat as any).comparison.secondaryColor,
                      fontWeight: 600
                    }}>
                      {(stat as any).comparison.secondaryText}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Overview;

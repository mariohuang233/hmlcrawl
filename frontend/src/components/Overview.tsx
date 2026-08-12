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
    if (!Number.isFinite(percentage)) return '暂无对比';
    if (percentage === 0) return '持平';
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage}%`;
  };

  const getComparisonColor = (percentage: number) => {
    if (!Number.isFinite(percentage)) return 'var(--text-tertiary)';
    if (percentage === 0) return 'var(--text-tertiary)';
    if (percentage > 0) return 'var(--accent)';
    return 'var(--text-secondary)';
  };

  const formatPredictedTime = (prediction: PredictionData) => {
    if (prediction.status !== 'success' || !prediction.predicted_time) {
      return {
        value: '--',
        label: '预计用完时间',
        subtitle: prediction.message,
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
      analysis: prediction.analysis,
      status
    };
  };

  const predictionInfo = data.predicted_depletion ? formatPredictedTime(data.predicted_depletion) : null;
  
  const getBatteryLevel = (remaining: number) => {
    if (remaining <= 10) return { level: 'critical', color: 'var(--accent)', bgColor: 'var(--accent-soft)' };
    return { level: 'normal', color: 'var(--text-primary)', bgColor: 'var(--bg-surface)' };
  };

  const batteryLevel = getBatteryLevel(data.current_remaining);

  const secondaryStats = [
    {
      value: data.today_usage,
      label: '今日用电',
      unit: 'kWh',
      shortLabel: '今日',
      precision: 2,
      delay: 0,
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
      shortLabel: '本周',
      precision: 2,
      delay: 40,
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
      shortLabel: '本月',
      precision: 2,
      delay: 80,
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
      shortLabel: '费用',
      precision: 2,
      delay: 120,
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
          <strong>数据提示</strong>
          <span>数据不完整：数据库中只有从 {data.data_coverage?.earliest_data ? formatDate(data.data_coverage.earliest_data) : '最近'} 开始的记录，因此本周和本月用电量可能相同。</span>
        </div>
      )}
      
      <div className="hero-section">
        <div 
          className={`hero-card hero-card-balance ${hasTriggered ? 'animate-in' : ''}`}
          style={{ animationDelay: '0ms' }}
        >
          <div className="hero-content">
            <div className="hero-info">
              <div className="hero-kicker">电量余额</div>
              <div className="hero-label">当前剩余电量</div>
              <div className="hero-value-row">
                <span className="hero-value" style={{ color: batteryLevel.color }}>
                  <AnimatedNumber
                    value={data.current_remaining}
                    unit=""
                    precision={2}
                    delay={0}
                    easing="easeOut"
                    autoStart={hasTriggered}
                  />
                </span>
                <span className="hero-unit" style={{ color: batteryLevel.color }}>kWh</span>
              </div>
            </div>
          </div>
        </div>

        {predictionInfo && (
          <div 
            className={`hero-card hero-card-prediction ${predictionInfo.status} ${hasTriggered ? 'animate-in' : ''}`}
            style={{ animationDelay: '60ms' }}
          >
            <div className="hero-content">
              <div className="hero-info">
                <div className="hero-kicker">续航预估</div>
                <div className="hero-label">{predictionInfo.label}</div>
                <div className="hero-value-row">
                  <span className="hero-value" style={{ 
                    color: predictionInfo.status === 'danger' ? 'var(--accent)' :
                           predictionInfo.status === 'warning' ? 'var(--warning)' : 'var(--text-primary)'
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
            <div className="secondary-stat-index">{stat.shortLabel}</div>
            <div className="secondary-stat-content">
              <div className="secondary-stat-value">
                {(stat as any).prefix || ''}
                <AnimatedNumber
                  value={typeof stat.value === 'number' ? stat.value : 0}
                  unit={stat.unit}
                  precision={(stat as any).precision || 2}
                  delay={hasTriggered ? ((stat as any).delay || 0) : 0}
                  easing="easeOut"
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

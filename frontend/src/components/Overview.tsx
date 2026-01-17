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
  // 检测暗夜模式
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // 使用Intersection Observer检测组件是否进入视口
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
  });
  
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

  // 格式化对比百分比
  const formatComparison = (percentage: number) => {
    if (percentage === 0) return '持平';
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage}%`;
  };

  // 获取对比颜色
  const getComparisonColor = (percentage: number) => {
    if (percentage === 0) return isDarkMode ? '#8E8E93' : '#8E8E93';
    // 用电增加显示红色，减少显示绿色
    if (percentage > 0) return isDarkMode ? '#FF453A' : '#FF3B30';
    return isDarkMode ? '#30D158' : '#34C759';
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

    // 生成分析详情
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
      icon: diffDays > 7 ? '🔋' : diffDays > 3 ? '⚠️' : '🚨',
      analysis: prediction.analysis
    };
  };

  // 获取预测信息
  const predictionInfo = data.predicted_depletion ? formatPredictedTime(data.predicted_depletion) : null;
  
  const stats = [
    {
      value: data.current_remaining,
      label: '当前剩余电量',
      unit: 'kWh',
      color: isDarkMode ? '#34D399' : '#10B981',
      icon: '🔋',
      precision: 2,
      delay: 0
    },
    {
      value: data.today_usage,
      label: '今日用电',
      unit: 'kWh',
      color: isDarkMode ? '#60A5FA' : '#3B82F6',
      icon: '⚡',
      precision: 2,
      delay: 200,
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
      color: isDarkMode ? '#34D399' : '#10B981',
      icon: '📊',
      precision: 2,
      delay: 400,
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
      color: isDarkMode ? '#FBBF24' : '#F59E0B',
      icon: '📈',
      precision: 2,
      delay: 600,
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
      color: isDarkMode ? '#FFFFFF' : '#1A1A1A',
      icon: '💰',
      precision: 2,
      delay: 800,
      comparison: data.comparisons ? {
        text: `较上月 ${formatComparison(data.comparisons.cost_vs_last_month)}`,
        color: getComparisonColor(data.comparisons.cost_vs_last_month)
      } : undefined
    },
    // 添加预计用完时间
    ...(predictionInfo ? [{
      value: predictionInfo.value,
      label: predictionInfo.label,
      unit: '',
      color: predictionInfo.icon === '🚨' ? (isDarkMode ? '#EF4444' : '#DC2626') : 
             predictionInfo.icon === '⚠️' ? (isDarkMode ? '#FBBF24' : '#F59E0B') : 
             (isDarkMode ? '#34D399' : '#10B981'),
      icon: predictionInfo.icon,
      subtitle: predictionInfo.subtitle,
      precision: 0,
      delay: 1000,
      isStatic: true // 预计时间不需要动画
    }] : [])
  ];

  return (
    <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
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
          <div key={index} className={`stat-card ${hasTriggered ? 'animate-in' : ''}`} style={{
            border: (stat as any).warning ? `1px solid ${isDarkMode ? 'rgba(255, 159, 10, 0.3)' : 'rgba(255, 149, 0, 0.3)'}` : undefined
          }}>
            <div className="stat-icon" style={{ color: stat.color, fontSize: '24px', marginBottom: '8px' }}>
              {stat.icon}
              {(stat as any).warning && <span style={{ fontSize: '12px', marginLeft: '4px' }}>⚠️</span>}
            </div>
            <div className="stat-value" style={{ color: stat.color }}>
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
                  style={{ color: stat.color }}
                />
              )}
            </div>
            <div className="stat-label">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span>{stat.label}</span>
                {stat.unit && <span className="unit-badge">{stat.unit}</span>}
              </div>
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
              {(stat as any).comparison && (
                <>
                  <div style={{ 
                    fontSize: '11px',
                    marginTop: '6px',
                    color: (stat as any).comparison.color,
                    fontWeight: 500
                  }}>
                    {(stat as any).comparison.text}
                  </div>
                  {(stat as any).comparison.secondaryText && (
                    <div style={{ 
                      fontSize: '11px',
                      marginTop: '2px',
                      color: (stat as any).comparison.secondaryColor,
                      fontWeight: 500
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

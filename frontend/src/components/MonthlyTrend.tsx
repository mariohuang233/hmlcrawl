import React, { useState, useEffect, useCallback } from 'react';
import Chart from './Chart';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { ColorTheme, getChartTheme } from '../utils/chartTheme';
import ChartCardHeader from './ChartCardHeader';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface MonthlyData {
  month: string;
  used_kwh: number;
  prev_month_used_kwh: number;
  vs_prev_month: number | null;
}

interface MonthlyTrendProps {
  isMobile?: boolean;
  refreshKey?: number;
  theme?: ColorTheme;
}

const MonthlyTrend: React.FC<MonthlyTrendProps> = ({ isMobile = false, refreshKey = 0, theme = 'light' }) => {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/trend/monthly`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      if (responseData.error) {
        throw new Error(responseData.message || responseData.error);
      }

      if (!Array.isArray(responseData)) {
        throw new Error('月度趋势数据格式无效');
      }

      setData(responseData.map((item: MonthlyData) => ({
        ...item,
        used_kwh: Number.isFinite(Number(item.used_kwh)) ? Number(item.used_kwh) : 0,
        prev_month_used_kwh: Number.isFinite(Number(item.prev_month_used_kwh))
          ? Number(item.prev_month_used_kwh)
          : 0
      })));
    } catch (error) {
      console.error('Error fetching monthly trend:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);
  
  const colors = getChartTheme(theme);
  const currentMonthUsage = data.length > 0 ? data[data.length - 1].used_kwh : 0;
  const chartOption = {
    animation: hasTriggered,
    animationDuration: isMobile ? 260 : 420,
    animationDurationUpdate: 180,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      triggerOn: 'mousemove|click',
      confine: true,
      enterable: false,
      hideDelay: 40,
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: isMobile ? 10 : 12,
      textStyle: {
        color: colors.text,
        fontFamily: 'inherit',
        fontSize: isMobile ? 11 : 12
      },
      extraCssText: colors.tooltipShadow,
      formatter: (params: any) => {
        const point = params[0];
        const dataItem = data[point.dataIndex];
        const vsPrevMonth = dataItem.vs_prev_month;
        
        let comparisonHtml = '';
        if (vsPrevMonth !== null) {
          const vsPrevMonthText = vsPrevMonth === 0 ? '持平' : 
            (vsPrevMonth > 0 ? `+${vsPrevMonth}%` : `${vsPrevMonth}%`);
          const vsPrevMonthColor = vsPrevMonth === 0 ? colors.muted :
            (vsPrevMonth > 0 ? colors.accent : colors.positive);
          
          comparisonHtml = `
            <div style="display:flex;justify-content:space-between;gap:16px;color:${colors.muted}">
              <span>上月</span><span>${dataItem.prev_month_used_kwh} kWh</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:16px;color:${colors.muted}">
              <span>变化</span><strong style="color:${vsPrevMonthColor}">${vsPrevMonthText}</strong>
            </div>
          `;
        }
        
        return `
          <div style="min-width:${isMobile ? 148 : 172}px">
            <div style="margin-bottom:7px;font-weight:700;color:${colors.textStrong}">${point.axisValue}</div>
            <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px;color:${colors.muted}">
              <span>用电</span><strong style="color:${colors.textStrong}">${point.value} kWh</strong>
            </div>
            ${comparisonHtml}
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.month.replace(/^(\d{4})-(\d{2})$/, '$1/$2')),
      axisLabel: {
        rotate: 0,
        interval: isMobile ? (index: number) => index % 2 === 0 : 0,
        color: colors.muted,
        fontFamily: 'inherit',
        fontSize: isMobile ? 10 : 11,
        formatter: (value: string) => {
          if (!isMobile) return value;
          try {
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;
            return `${date.getFullYear().toString().slice(-2)}/${date.getMonth() + 1}`;
          } catch {
            return value;
          }
        }
      },
      axisLine: {
        lineStyle: {
          color: colors.axis
        }
      },
      axisTick: {
        lineStyle: {
          color: colors.axis
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '用电量 (kWh)',
      nameTextStyle: {
        color: colors.muted,
        fontFamily: 'inherit',
        fontSize: isMobile ? 9 : 11
      },
      axisLabel: {
        color: colors.muted,
        fontFamily: 'inherit',
        fontSize: isMobile ? 9 : 11
      },
      axisLine: {
        lineStyle: {
          color: colors.axis
        }
      },
      axisTick: {
        lineStyle: {
          color: colors.axis
        }
      },
      splitLine: {
        lineStyle: {
          color: colors.grid,
          type: 'solid'
        }
      }
    },
    series: [
      {
        name: '月用电',
        type: 'bar',
        data: data.map((item, index) => ({
          value: item.used_kwh,
          itemStyle: {
            color: index === data.length - 1 ? colors.series : colors.seriesMuted
          }
        })),
        barMaxWidth: isMobile ? 12 : 18,
        itemStyle: {
          color: colors.seriesMuted,
          borderRadius: [6, 6, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: colors.series
          }
        },
        animationDelay: 0,
        animationDuration: isMobile ? 260 : 420,
        animationEasing: 'cubicOut'
      }
    ],
    grid: {
      left: isMobile ? 42 : 54,
      right: isMobile ? 12 : 20,
      bottom: isMobile ? 28 : 34,
      top: 10,
      containLabel: true
    }
  };

  if (loading) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">12个月用电趋势</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (data.length === 0 || data.every(item => item.used_kwh <= 0)) {
    return (
      <div className={`card chart-card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">12个月用电趋势</h2>
        <div className="chart-empty-state">
          <span className="chart-empty-kicker">暂无月度数据</span>
          <p>完成至少两次有效采集后，这里会显示每月用电柱状图。</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`card chart-card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
      <ChartCardHeader
        title="12个月趋势"
        description="月度用电对比"
        value={`本月 ${currentMonthUsage.toFixed(1)} kWh`}
      />
      <Chart
        option={chartOption} 
        style={{ height: isMobile ? '230px' : '300px' }}
        className="chart-container"
        notMerge={false}
        lazyUpdate={true}
      />
    </div>
  );
};

export default React.memo(MonthlyTrend);

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Chart from './Chart';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { ColorTheme, getChartTheme } from '../utils/chartTheme';
import ChartCardHeader from './ChartCardHeader';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface TodayData {
  hour: number;
  used_kwh: number;
  yesterday_used_kwh: number;
  avg_used_kwh: number;
  vs_yesterday: number;
  vs_avg: number;
}

interface TodayUsageProps {
  isMobile?: boolean;
  refreshKey?: number;
  theme?: ColorTheme;
}

const TodayUsage: React.FC<TodayUsageProps> = React.memo(({ isMobile = false, refreshKey = 0, theme = 'light' }) => {
  const [data, setData] = useState<TodayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/trend/today`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setData(data);
      setError(null);
    } catch (error) {
      console.error('Error fetching today usage:', error);
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);
  
  const colors = useMemo(() => getChartTheme(theme), [theme]);
  const todayTotal = useMemo(
    () => data.reduce((total, item) => total + (Number(item.used_kwh) || 0), 0),
    [data]
  );
  const latestActiveIndex = useMemo(
    () => data.reduce((latest, item, index) => item.used_kwh > 0 ? index : latest, -1),
    [data]
  );

  const chartOption = useMemo(() => ({
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
        const vsYesterday = dataItem.vs_yesterday;
        const vsAvg = dataItem.vs_avg;
        
        const vsYesterdayText = vsYesterday === 0 ? '持平' : 
          (vsYesterday > 0 ? `+${vsYesterday}%` : `${vsYesterday}%`);
        const vsYesterdayColor = vsYesterday === 0 ? colors.muted :
          (vsYesterday > 0 ? colors.accent : colors.positive);
        
        const vsAvgText = vsAvg === 0 ? '持平' : 
          (vsAvg > 0 ? `+${vsAvg}%` : `${vsAvg}%`);
        const vsAvgColor = vsAvg === 0 ? colors.muted :
          (vsAvg > 0 ? colors.accent : colors.positive);
        
        return `
          <div style="min-width:${isMobile ? 148 : 172}px">
            <div style="margin-bottom:7px;font-weight:700;color:${colors.textStrong}">${point.axisValue}</div>
            <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px;color:${colors.muted}">
              <span>今日</span><strong style="color:${colors.textStrong}">${point.value} kWh</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:16px;color:${colors.muted}">
              <span>较昨日</span><strong style="color:${vsYesterdayColor}">${vsYesterdayText}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:16px;color:${colors.muted}">
              <span>较平均</span><strong style="color:${vsAvgColor}">${vsAvgText}</strong>
            </div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => `${item.hour}时`),
      axisLabel: {
        interval: isMobile ? (index: number) => index % 4 === 0 : 1,
        color: colors.muted,
        fontFamily: 'inherit',
        fontSize: isMobile ? 10 : 11,
        rotate: 0
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
        name: '用电量',
        type: 'bar',
        data: data.map((item, index) => ({
          value: item.used_kwh,
          itemStyle: {
            color: index === latestActiveIndex ? colors.series : colors.seriesMuted
          }
        })),
        barMaxWidth: isMobile ? 12 : 18,
        barMinHeight: 2,
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
  }), [colors, data, hasTriggered, isMobile, latestActiveIndex]);

  if (loading) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">今日用电分布</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">今日用电分布</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#f43f5e' }}>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`card chart-card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
      <ChartCardHeader
        title="今日用电"
        description="按小时查看"
        value={`${todayTotal.toFixed(2)} kWh`}
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
});

export default TodayUsage;

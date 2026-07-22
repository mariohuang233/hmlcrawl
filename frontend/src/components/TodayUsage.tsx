import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Chart from './Chart';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

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
}

const TodayUsage: React.FC<TodayUsageProps> = React.memo(({ isMobile = false, refreshKey = 0 }) => {
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
  
  const chartOption = useMemo(() => ({
    title: {
      text: '今日用电分布',
      left: 'center',
      textStyle: {
        fontSize: isMobile ? 15 : 18,
        fontWeight: 600,
        color: '#2d2620',
        fontFamily: 'Outfit, Nunito, sans-serif'
      },
      top: isMobile ? 10 : 16
    },
    animation: hasTriggered,
    animationDuration: isMobile ? 350 : 600,
    animationDurationUpdate: 250,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: 'rgba(184, 134, 90, 0.12)',
      borderWidth: 1,
      borderRadius: 12,
      padding: isMobile ? 16 : 12,
      textStyle: {
        color: '#2d2620',
        fontFamily: 'Outfit, Nunito, sans-serif',
        fontSize: isMobile ? 14 : 13
      },
      extraCssText: 'box-shadow: 0 4px 16px rgba(45, 38, 32, 0.08);',
      formatter: (params: any) => {
        const point = params[0];
        const dataItem = data[point.dataIndex];
        const vsYesterday = dataItem.vs_yesterday;
        const vsAvg = dataItem.vs_avg;
        
        const vsYesterdayText = vsYesterday === 0 ? '持平' : 
          (vsYesterday > 0 ? `+${vsYesterday}%` : `${vsYesterday}%`);
        const vsYesterdayColor = vsYesterday === 0 ? '#8a8078' :
          (vsYesterday > 0 ? '#f43f5e' : '#10b981');
        
        const vsAvgText = vsAvg === 0 ? '持平' : 
          (vsAvg > 0 ? `+${vsAvg}%` : `${vsAvg}%`);
        const vsAvgColor = vsAvg === 0 ? '#8a8078' :
          (vsAvg > 0 ? '#f43f5e' : '#10b981');
        
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 8px; font-weight: 600; color: #664733; font-size: ${isMobile ? 15 : 14}px;">${point.axisValue}</div>
            <div style="margin-bottom: 4px;">今日: <span style="color: #664733; font-weight: 600;">${point.value}</span> kWh</div>
            <div style="color: #8a8078; font-size: ${isMobile ? 13 : 12}px; margin-bottom: 2px;">昨日: ${dataItem.yesterday_used_kwh} kWh</div>
            <div style="color: #8a8078; font-size: ${isMobile ? 13 : 12}px; margin-bottom: 4px;">平均: ${dataItem.avg_used_kwh} kWh</div>
            <div style="color: ${vsYesterdayColor}; font-size: ${isMobile ? 13 : 12}px;">
              较昨日 ${vsYesterdayText}
            </div>
            <div style="color: ${vsAvgColor}; font-size: ${isMobile ? 13 : 12}px;">
              较平均 ${vsAvgText}
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
        color: '#8a8078',
        fontFamily: 'Outfit, Nunito, sans-serif',
        fontSize: isMobile ? 9 : 11,
        rotate: isMobile ? 45 : 0
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(184, 134, 90, 0.12)'
        }
      },
      axisTick: {
        lineStyle: {
          color: 'rgba(184, 134, 90, 0.12)'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '用电量 (kWh)',
      nameTextStyle: {
        color: '#8a8078',
        fontFamily: 'Outfit, Nunito, sans-serif',
        fontSize: isMobile ? 9 : 11
      },
      axisLabel: {
        color: '#8a8078',
        fontFamily: 'Outfit, Nunito, sans-serif',
        fontSize: isMobile ? 9 : 11
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(184, 134, 90, 0.12)'
        }
      },
      axisTick: {
        lineStyle: {
          color: 'rgba(184, 134, 90, 0.12)'
        }
      },
      splitLine: {
        lineStyle: {
          color: '#f5f3f1',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: '用电量',
        type: 'bar',
        data: data.map(item => item.used_kwh),
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#176a6d' },
              { offset: 0.5, color: '#c49a6c' },
              { offset: 1, color: '#d4b896' }
            ]
          },
          borderRadius: [isMobile ? 6 : 8, isMobile ? 6 : 8, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: '#176a6d'
          }
        },
        animationDelay: 0,
        animationDuration: isMobile ? 350 : 600,
        animationEasing: 'cubicOut'
      }
    ],
    grid: {
      left: isMobile ? '14%' : '5%',
      right: isMobile ? '6%' : '5%',
      bottom: isMobile ? '25%' : '10%',
      top: isMobile ? '14%' : '18%',
      containLabel: true
    }
  }), [data, hasTriggered, isMobile]);

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
    <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
      <Chart
        option={chartOption} 
        style={{ height: isMobile ? '380px' : '380px' }}
        className="chart-container"
        notMerge={false}
        lazyUpdate={true}
      />
    </div>
  );
});

export default TodayUsage;

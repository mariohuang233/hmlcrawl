import React, { useState, useEffect, useCallback } from 'react';
import Chart from './Chart';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface DailyData {
  date: string;
  used_kwh: number;
  prev_day_used_kwh: number;
  vs_prev_day: number | null;
}

interface DailyTrendProps {
  isMobile?: boolean;
  refreshKey?: number;
}

const DailyTrend: React.FC<DailyTrendProps> = ({ isMobile = false, refreshKey = 0 }) => {
  const [data, setData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/trend/30d`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.message || data.error);
      }
      
      setData(data);
    } catch (error) {
      console.error('Error fetching daily trend:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);
  
  const chartOption = {
    title: {
      text: '30天用电趋势',
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
    animationDuration: isMobile ? 400 : 650,
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
        const vsPrevDay = dataItem.vs_prev_day;
        
        let comparisonHtml = '';
        if (vsPrevDay !== null) {
          const vsPrevDayText = vsPrevDay === 0 ? '持平' : 
            (vsPrevDay > 0 ? `+${vsPrevDay}%` : `${vsPrevDay}%`);
          const vsPrevDayColor = vsPrevDay === 0 ? '#8a8078' :
            (vsPrevDay > 0 ? '#f43f5e' : '#10b981');
          
          comparisonHtml = `
            <div style="color: #8a8078; font-size: ${isMobile ? 13 : 12}px; margin-bottom: 2px;">前一天: ${dataItem.prev_day_used_kwh} kWh</div>
            <div style="color: ${vsPrevDayColor}; font-size: ${isMobile ? 13 : 12}px;">
              较前一天 ${vsPrevDayText}
            </div>
          `;
        }
        
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 8px; font-weight: 600; color: #664733; font-size: ${isMobile ? 15 : 14}px;">${point.axisValue}</div>
            <div style="margin-bottom: 4px;">用电量: <span style="color: #664733; font-weight: 600;">${point.value}</span> kWh</div>
            ${comparisonHtml}
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.date),
      axisLabel: {
        rotate: isMobile ? 45 : 45,
        interval: isMobile ? (index: number) => index % 5 === 0 : 0,
        color: '#8a8078',
        fontFamily: 'Outfit, Nunito, sans-serif',
        fontSize: isMobile ? 8 : 10,
        formatter: (value: string) => {
          if (!isMobile) return value;
          try {
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;
            return `${date.getMonth() + 1}/${date.getDate()}`;
          } catch {
            return value;
          }
        }
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
        name: '每日用电',
        type: 'line',
        data: data.map(item => item.used_kwh),
        smooth: true,
        symbol: 'circle',
        symbolSize: isMobile ? 4 : 5,
        lineStyle: {
          color: '#176a6d',
          width: isMobile ? 2 : 3
        },
        itemStyle: {
          color: '#176a6d',
          borderColor: '#ffffff',
          borderWidth: isMobile ? 1 : 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(40, 127, 130, 0.14)' },
              { offset: 1, color: 'rgba(40, 127, 130, 0.02)' }
            ]
          }
        },
        animationDelay: 0,
        animationDuration: isMobile ? 400 : 650,
        animationEasing: 'cubicOut'
      }
    ],
    grid: {
      left: isMobile ? '14%' : '5%',
      right: isMobile ? '6%' : '5%',
      bottom: isMobile ? '30%' : '15%',
      top: isMobile ? '14%' : '18%',
      containLabel: true
    }
  };

  if (loading) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">30天用电趋势</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="loading-spinner"></div>
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
};

export default React.memo(DailyTrend);

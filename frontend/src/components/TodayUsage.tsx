import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
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

const TodayUsage: React.FC = React.memo(() => {
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
  }, [fetchData]);
  
  const chartOption = useMemo(() => ({
    title: {
      text: '今日用电分布',
      left: 'center',
      textStyle: {
        fontSize: 18,
        fontWeight: 600,
        color: '#3D3229',
        fontFamily: 'Noto Sans SC, sans-serif'
      },
      top: 16
    },
    animation: hasTriggered,
    animationDuration: 1500,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: '#E8E0D8',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      textStyle: {
        color: '#3D3229',
        fontFamily: 'Noto Sans SC, sans-serif',
        fontSize: 13
      },
      extraCssText: 'box-shadow: 0 4px 20px rgba(61, 50, 41, 0.15);',
      formatter: (params: any) => {
        const point = params[0];
        const dataItem = data[point.dataIndex];
        const vsYesterday = dataItem.vs_yesterday;
        const vsAvg = dataItem.vs_avg;
        
        const vsYesterdayText = vsYesterday === 0 ? '持平' : 
          (vsYesterday > 0 ? `+${vsYesterday}%` : `${vsYesterday}%`);
        const vsYesterdayColor = vsYesterday === 0 ? '#9A8B7E' :
          (vsYesterday > 0 ? '#E88B8B' : '#7CB87C');
        
        const vsAvgText = vsAvg === 0 ? '持平' : 
          (vsAvg > 0 ? `+${vsAvg}%` : `${vsAvg}%`);
        const vsAvgColor = vsAvg === 0 ? '#9A8B7E' :
          (vsAvg > 0 ? '#E88B8B' : '#7CB87C');
        
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 8px; font-weight: 600; color: #8B6F5C; font-size: 14px;">${point.axisValue}</div>
            <div style="margin-bottom: 4px;">今日: <span style="color: #8B6F5C; font-weight: 600;">${point.value}</span> kWh</div>
            <div style="color: #9A8B7E; font-size: 12px; margin-bottom: 2px;">昨日: ${dataItem.yesterday_used_kwh} kWh</div>
            <div style="color: #9A8B7E; font-size: 12px; margin-bottom: 4px;">平均: ${dataItem.avg_used_kwh} kWh</div>
            <div style="color: ${vsYesterdayColor}; font-size: 12px;">
              较昨日 ${vsYesterdayText}
            </div>
            <div style="color: ${vsAvgColor}; font-size: 12px;">
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
        interval: 1,
        color: '#9A8B7E',
        fontFamily: 'Noto Sans SC, sans-serif',
        fontSize: 11
      },
      axisLine: {
        lineStyle: {
          color: '#E8E0D8'
        }
      },
      axisTick: {
        lineStyle: {
          color: '#E8E0D8'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '用电量 (kWh)',
      nameTextStyle: {
        color: '#9A8B7E',
        fontFamily: 'Noto Sans SC, sans-serif',
        fontSize: 11
      },
      axisLabel: {
        color: '#9A8B7E',
        fontFamily: 'Noto Sans SC, sans-serif',
        fontSize: 11
      },
      axisLine: {
        lineStyle: {
          color: '#E8E0D8'
        }
      },
      axisTick: {
        lineStyle: {
          color: '#E8E0D8'
        }
      },
      splitLine: {
        lineStyle: {
          color: '#F5F0EC',
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
              { offset: 0, color: '#8B6F5C' },
              { offset: 0.5, color: '#A88B7A' },
              { offset: 1, color: '#D4C8BC' }
            ]
          },
          borderRadius: [6, 6, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: '#8B6F5C'
          }
        },
        animationDelay: 0,
        animationDuration: 1500,
        animationEasing: 'cubicOut'
      }
    ],
    grid: {
      left: '5%',
      right: '5%',
      bottom: '10%',
      top: '18%',
      containLabel: true
    }
  }), [data, hasTriggered]);

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#E88B8B' }}>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
      <ReactECharts 
        option={chartOption} 
        style={{ height: '400px' }}
        className="chart-container"
        notMerge={true}
        lazyUpdate={false}
      />
    </div>
  );
});

export default TodayUsage;

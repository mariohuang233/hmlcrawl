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
  
  // 使用Intersection Observer检测组件是否进入视口
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

  // 检测暗夜模式
  const isDarkMode = useMemo(() => 
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches,
    []
  );
  
  const chartOption = useMemo(() => ({
    title: {
      text: '今日用电分布（按小时）',
      left: 'center',
      textStyle: {
        fontSize: 20,
        fontWeight: 700,
        color: isDarkMode ? '#FFFFFF' : '#1D1D1F',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        letterSpacing: '-0.02em'
      },
      top: 20
    },
    // 添加绘画动画配置
    animation: hasTriggered,
    animationDuration: 3000,
    animationEasing: 'cubicOut',
    animationDelay: 0,
    // 启用渐进式渲染
    progressive: hasTriggered ? 0 : false,
    progressiveThreshold: 3000,
    progressiveChunkMode: 'mod',
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      borderWidth: 1,
      borderRadius: 12,
      textStyle: {
        color: isDarkMode ? '#FFFFFF' : '#0D0D0D',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
      },
      formatter: (params: any) => {
        const point = params[0];
        const dataItem = data[point.dataIndex];
        const vsYesterday = dataItem.vs_yesterday;
        const vsAvg = dataItem.vs_avg;
        
        const vsYesterdayText = vsYesterday === 0 ? '持平' : 
          (vsYesterday > 0 ? `+${vsYesterday}%` : `${vsYesterday}%`);
        const vsYesterdayColor = vsYesterday === 0 ? '#8E8E93' :
          (vsYesterday > 0 ? '#FF3B30' : '#34C759');
        
        const vsAvgText = vsAvg === 0 ? '持平' : 
          (vsAvg > 0 ? `+${vsAvg}%` : `${vsAvg}%`);
        const vsAvgColor = vsAvg === 0 ? '#8E8E93' :
          (vsAvg > 0 ? '#FF3B30' : '#34C759');
        
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 4px; font-weight: 600;">⏰ ${point.axisValue}</div>
            <div>⚡ 今日: ${point.value} kWh</div>
            <div style="color: #8E8E93; font-size: 12px;">昨日: ${dataItem.yesterday_used_kwh} kWh</div>
            <div style="color: #8E8E93; font-size: 12px;">平均: ${dataItem.avg_used_kwh} kWh</div>
            <div style="color: ${vsYesterdayColor}; font-size: 12px; font-weight: 500;">
              较昨日 ${vsYesterdayText}
            </div>
            <div style="color: ${vsAvgColor}; font-size: 12px; font-weight: 500;">
              较平均 ${vsAvgText}
            </div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => `${item.hour}点`),
      axisLabel: {
        interval: 1,
        color: isDarkMode ? '#8E8E93' : '#6E6E73',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
        }
      },
      axisTick: {
        lineStyle: {
          color: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '用电量 (kWh)',
      nameTextStyle: {
        color: isDarkMode ? '#8E8E93' : '#6E6E73',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 12
      },
      axisLabel: {
        color: isDarkMode ? '#8E8E93' : '#6E6E73',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
        }
      },
      axisTick: {
        lineStyle: {
          color: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
        }
      },
      splitLine: {
        lineStyle: {
          color: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
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
              { offset: 0, color: isDarkMode ? '#32D74B' : '#30D158' },
              { offset: 0.5, color: isDarkMode ? 'rgba(50, 215, 75, 0.9)' : 'rgba(48, 209, 88, 0.9)' },
              { offset: 1, color: isDarkMode ? 'rgba(50, 215, 75, 0.6)' : 'rgba(48, 209, 88, 0.6)' }
            ]
          },
          borderRadius: [6, 6, 0, 0],
          shadowColor: isDarkMode ? 'rgba(50, 215, 75, 0.3)' : 'rgba(48, 209, 88, 0.3)',
          shadowBlur: 8
        },
        emphasis: {
          itemStyle: {
            color: isDarkMode ? '#32D74B' : '#30D158',
            shadowBlur: 15,
            shadowColor: isDarkMode ? 'rgba(50, 215, 75, 0.5)' : 'rgba(48, 209, 88, 0.5)',
            borderColor: isDarkMode ? '#000000' : '#FFFFFF',
            borderWidth: 2
          }
        },
        // 绘画动画效果 - 从下到上绘制
        animationDelay: 0,
        animationDuration: 3000,
        animationEasing: 'cubicOut',
        // 启用绘画效果
        progressive: hasTriggered ? 0 : false,
        progressiveThreshold: 3000,
        progressiveChunkMode: 'mod'
      }
    ],
    grid: {
      left: '5%',
      right: '5%',
      bottom: '10%',
      top: '15%',
      containLabel: true
    }
  }), [data, isDarkMode, hasTriggered]);

  if (loading) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">今日用电分布（按小时）</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">今日用电分布（按小时）</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#FF3B30' }}>
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

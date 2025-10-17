import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
// 使用fetch替代axios

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface DailyData {
  date: string;
  used_kwh: number;
  prev_day_used_kwh: number;
  vs_prev_day: number | null;
}

const DailyTrend: React.FC = () => {
  const [data, setData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 使用Intersection Observer检测组件是否进入视口
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/trend/30d`);
      const data = await response.json();
      setData(data);
    } catch (error) {
      console.error('Error fetching daily trend:', error);
    } finally {
      setLoading(false);
    }
  };

  // 检测暗夜模式
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const chartOption = {
    title: {
      text: '最近30天每日用电趋势',
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
        const vsPrevDay = dataItem.vs_prev_day;
        
        let comparisonHtml = '';
        if (vsPrevDay !== null) {
          const vsPrevDayText = vsPrevDay === 0 ? '持平' : 
            (vsPrevDay > 0 ? `+${vsPrevDay}%` : `${vsPrevDay}%`);
          const vsPrevDayColor = vsPrevDay === 0 ? '#8E8E93' :
            (vsPrevDay > 0 ? '#FF3B30' : '#34C759');
          
          comparisonHtml = `
            <div style="color: #8E8E93; font-size: 12px;">前一天: ${dataItem.prev_day_used_kwh} kWh</div>
            <div style="color: ${vsPrevDayColor}; font-size: 12px; font-weight: 500;">
              较前一天 ${vsPrevDayText}
            </div>
          `;
        }
        
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 4px; font-weight: 600;">📅 ${point.axisValue}</div>
            <div>⚡ 用电量: ${point.value} kWh</div>
            ${comparisonHtml}
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.date),
      axisLabel: {
        rotate: 45,
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
        name: '每日用电',
        type: 'line',
        data: data.map(item => item.used_kwh),
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: {
          color: isDarkMode ? '#FF9F0A' : '#FF9500',
          width: 4,
          shadowColor: isDarkMode ? 'rgba(255, 159, 10, 0.3)' : 'rgba(255, 149, 0, 0.3)',
          shadowBlur: 10
        },
        itemStyle: {
          color: isDarkMode ? '#FF9F0A' : '#FF9500',
          borderColor: isDarkMode ? '#000000' : '#FFFFFF',
          borderWidth: 3,
          shadowColor: isDarkMode ? 'rgba(255, 159, 10, 0.4)' : 'rgba(255, 149, 0, 0.4)',
          shadowBlur: 8
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: isDarkMode ? 'rgba(255, 159, 10, 0.3)' : 'rgba(255, 149, 0, 0.3)' },
              { offset: 1, color: isDarkMode ? 'rgba(255, 159, 10, 0.05)' : 'rgba(255, 149, 0, 0.05)' }
            ]
          }
        },
        // 绘画动画效果 - 从左到右绘制
        animationDelay: 0,
        animationDuration: 3000,
        animationEasing: 'cubicOut',
        // 启用绘画效果
        progressive: 0,
        progressiveThreshold: 3000,
        progressiveChunkMode: 'mod'
      }
    ],
    grid: {
      left: '5%',
      right: '5%',
      bottom: '15%',
      top: '15%',
      containLabel: true
    }
  };

  if (loading) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">最近30天每日用电趋势</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="loading-spinner"></div>
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
      />
    </div>
  );
};

export default DailyTrend;

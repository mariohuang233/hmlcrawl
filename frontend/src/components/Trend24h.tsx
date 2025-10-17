import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
// 使用fetch替代axios

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface TrendData {
  time: string;
  used_kwh: number;
  remaining_kwh: number;
}

const Trend24h: React.FC = () => {
  const [data, setData] = useState<TrendData[]>([]);
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
      const response = await fetch(`${API_BASE}/api/trend/24h`);
      const rawData = await response.json();
      
      // 数据去重处理：按时间分组，取最真实的数值
      const timeMap = new Map();
      
      rawData.forEach((item: any) => {
        const date = new Date(item.time);
        const timeKey = date.toLocaleTimeString('zh-CN', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'Asia/Shanghai'
        });
        
        if (!timeMap.has(timeKey)) {
          timeMap.set(timeKey, item);
        } else {
          const existingItem = timeMap.get(timeKey);
          // 优先选择用电量不为0的数据
          if (item.used_kwh > 0 && existingItem.used_kwh === 0) {
            timeMap.set(timeKey, item);
          } else if (item.used_kwh > existingItem.used_kwh) {
            // 选择用电量更大的数据（更真实的用电记录）
            timeMap.set(timeKey, item);
          } else if (item.used_kwh === existingItem.used_kwh && item.used_kwh > 0) {
            // 如果用电量相同且不为0，选择剩余电量较小的（更新的数据）
            if (item.remaining_kwh < existingItem.remaining_kwh) {
              timeMap.set(timeKey, item);
            }
          }
        }
      });
      
      // 转换回数组并按时间排序
      const processedData = Array.from(timeMap.values()).sort((a, b) => 
        new Date(a.time).getTime() - new Date(b.time).getTime()
      );
      
      setData(processedData);
    } catch (error) {
      console.error('Error fetching 24h trend:', error);
    } finally {
      setLoading(false);
    }
  };

  // 检测暗夜模式
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const chartOption = {
    title: {
      text: '过去24小时用电趋势',
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
    // 添加动画配置
    animation: hasTriggered,
    animationDuration: 2000,
    animationEasing: 'cubicOut',
    animationDelay: (idx: number) => idx * 50,
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
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 4px; font-weight: 600;">⏰ ${point.axisValue}</div>
            <div style="margin-bottom: 4px;">⚡ 用电量: ${point.value} kWh</div>
            <div>🔋 剩余电量: ${data[point.dataIndex]?.remaining_kwh} kWh</div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => {
        const date = new Date(item.time);
        return date.toLocaleTimeString('zh-CN', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'Asia/Shanghai'
        });
      }),
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
        type: 'line',
        data: data.map(item => item.used_kwh),
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: {
          color: isDarkMode ? '#64D2FF' : '#007AFF',
          width: 4,
          shadowColor: isDarkMode ? 'rgba(100, 210, 255, 0.3)' : 'rgba(0, 122, 255, 0.3)',
          shadowBlur: 10
        },
        itemStyle: {
          color: isDarkMode ? '#64D2FF' : '#007AFF',
          borderColor: isDarkMode ? '#000000' : '#FFFFFF',
          borderWidth: 3,
          shadowColor: isDarkMode ? 'rgba(100, 210, 255, 0.4)' : 'rgba(0, 122, 255, 0.4)',
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
              { offset: 0, color: isDarkMode ? 'rgba(100, 210, 255, 0.3)' : 'rgba(0, 122, 255, 0.3)' },
              { offset: 1, color: isDarkMode ? 'rgba(100, 210, 255, 0.05)' : 'rgba(0, 122, 255, 0.05)' }
            ]
          }
        },
        // 添加动画效果
        animationDelay: (idx: number) => idx * 100,
        animationDuration: 2000,
        animationEasing: 'cubicOut'
      }
    ],
    grid: {
      left: '5%',
      right: '5%',
      bottom: '10%',
      top: '15%',
      containLabel: true
    }
  };

  if (loading) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">过去24小时用电趋势</h2>
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

export default Trend24h;

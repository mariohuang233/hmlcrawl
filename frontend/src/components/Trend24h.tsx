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
  const [isMobile, setIsMobile] = useState(false);
  
  // 使用Intersection Observer检测组件是否进入视口
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/trend/24h`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const rawData = await response.json();
      
      if (rawData.error) {
        throw new Error(rawData.message || rawData.error);
      }
      
      // 按15分钟间隔聚合数据
      const aggregatedData = aggregateDataBy15Min(rawData);
      
      setData(aggregatedData);
    } catch (error) {
      console.error('Error fetching 24h trend:', error);
    } finally {
      setLoading(false);
    }
  };

  // 按15分钟间隔聚合数据
  const aggregateDataBy15Min = (rawData: any[]) => {
    const timeMap = new Map();
    
    rawData.forEach((item: any) => {
      const date = new Date(item.time);
      // 将时间向下取整到最近的15分钟
      const roundedTime = roundTo15Minutes(date);
      const timeKey = roundedTime.toISOString();
      
      if (!timeMap.has(timeKey)) {
        timeMap.set(timeKey, {
          time: timeKey,
          used_kwh: 0,
          remaining_kwh: item.remaining_kwh,
          count: 0
        });
      }
      
      const existingItem = timeMap.get(timeKey);
      existingItem.used_kwh += item.used_kwh;
      existingItem.count += 1;
      // 使用最新的剩余电量
      if (new Date(item.time) > new Date(existingItem.time)) {
        existingItem.remaining_kwh = item.remaining_kwh;
      }
    });
    
    // 转换回数组并按时间排序
    return Array.from(timeMap.values())
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .map(item => ({
        time: item.time,
        used_kwh: Math.round(item.used_kwh * 100) / 100,
        remaining_kwh: item.remaining_kwh
      }));
  };

  // 将时间向下取整到最近的15分钟
  const roundTo15Minutes = (date: Date) => {
    const rounded = new Date(date);
    const minutes = rounded.getMinutes();
    const roundedMinutes = Math.floor(minutes / 15) * 15;
    rounded.setMinutes(roundedMinutes, 0, 0);
    return rounded;
  };

  // 检测暗夜模式
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const chartOption = {
    title: {
      text: '过去24小时用电趋势',
      left: 'center',
      textStyle: {
        fontSize: isMobile ? 18 : 22,
        fontWeight: 600,
        color: isDarkMode ? '#FFFFFF' : '#1D1D1F',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        letterSpacing: '-0.01em'
      },
      top: isMobile ? 15 : 25,
      subtext: isMobile 
        ? '每15分钟更新一次 • 拖拽下方滑块或双指缩放'
        : '每15分钟更新一次 • 拖拽下方滑块或按住Ctrl+滚轮缩放',
      subtextStyle: {
        fontSize: isMobile ? 10 : 11,
        color: isDarkMode ? '#8E8E93' : '#6E6E73',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
      }
    },
    // 优化动画配置
    animation: hasTriggered,
    animationDuration: 2500,
    animationEasing: 'cubicOut',
    animationDelay: 0,
    // 启用渐进式渲染
    progressive: hasTriggered ? 0 : false,
    progressiveThreshold: 2000,
    progressiveChunkMode: 'mod',
    // 强制重新渲染以实现绘画效果
    animationDurationUpdate: 2500,
    animationEasingUpdate: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
      borderWidth: 1,
      borderRadius: 16,
      padding: [12, 16],
      textStyle: {
        color: isDarkMode ? '#FFFFFF' : '#0D0D0D',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 13
      },
      formatter: (params: any) => {
        const point = params[0];
        const timeLabel = point.axisValue;
        const usage = point.value;
        const remaining = data[point.dataIndex]?.remaining_kwh || 0;
        
        return `
          <div style="padding: 4px 0;">
            <div style="margin-bottom: 8px; font-weight: 600; font-size: 14px; color: ${isDarkMode ? '#FFFFFF' : '#1D1D1F'};">⏰ ${timeLabel}</div>
            <div style="margin-bottom: 6px; display: flex; align-items: center;">
              <span style="display: inline-block; width: 8px; height: 8px; background: ${isDarkMode ? '#64D2FF' : '#007AFF'}; border-radius: 50%; margin-right: 8px;"></span>
              <span style="font-weight: 500;">用电量: ${usage} kWh</span>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="display: inline-block; width: 8px; height: 8px; background: ${isDarkMode ? '#32D74B' : '#34C759'}; border-radius: 50%; margin-right: 8px;"></span>
              <span style="font-weight: 500;">剩余电量: ${remaining} kWh</span>
            </div>
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
        fontSize: isMobile ? 10 : 11,
        fontWeight: 500,
        interval: isMobile ? 2 : 'auto', // 移动端减少标签密度
        rotate: 0
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      name: '用电量 (kWh)',
      nameTextStyle: {
        color: isDarkMode ? '#8E8E93' : '#6E6E73',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: isMobile ? 10 : 11,
        fontWeight: 500,
        padding: [0, 0, 0, isMobile ? 5 : 10]
      },
      axisLabel: {
        color: isDarkMode ? '#8E8E93' : '#6E6E73',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: isMobile ? 10 : 11,
        fontWeight: 500,
        formatter: (value: number) => value.toFixed(1)
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
          type: 'solid',
          width: 1
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
        symbolSize: 6,
        showSymbol: data.length <= 20, // 数据点少时显示符号
        lineStyle: {
          color: isDarkMode ? '#64D2FF' : '#007AFF',
          width: 3,
          shadowColor: isDarkMode ? 'rgba(100, 210, 255, 0.4)' : 'rgba(0, 122, 255, 0.4)',
          shadowBlur: 12,
          shadowOffsetY: 4
        },
        itemStyle: {
          color: isDarkMode ? '#64D2FF' : '#007AFF',
          borderColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
          borderWidth: 2,
          shadowColor: isDarkMode ? 'rgba(100, 210, 255, 0.5)' : 'rgba(0, 122, 255, 0.5)',
          shadowBlur: 8,
          shadowOffsetY: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: isDarkMode ? 'rgba(100, 210, 255, 0.25)' : 'rgba(0, 122, 255, 0.25)' },
              { offset: 0.5, color: isDarkMode ? 'rgba(100, 210, 255, 0.15)' : 'rgba(0, 122, 255, 0.15)' },
              { offset: 1, color: isDarkMode ? 'rgba(100, 210, 255, 0.03)' : 'rgba(0, 122, 255, 0.03)' }
            ]
          }
        },
        // 优化动画效果
        animationDelay: 0,
        animationDuration: 2500,
        animationEasing: 'cubicOut',
        // 启用绘画效果
        progressive: hasTriggered ? 0 : false,
        progressiveThreshold: 2000,
        progressiveChunkMode: 'mod',
        // 添加数据标签（可选）
        label: {
          show: false,
          position: 'top',
          color: isDarkMode ? '#FFFFFF' : '#1D1D1F',
          fontSize: 10,
          fontWeight: 500
        }
      }
    ],
    grid: {
      left: isMobile ? '10%' : '8%',
      right: isMobile ? '6%' : '4%',
      bottom: isMobile ? '20%' : '15%', // 移动端为缩放条留出更多空间
      top: isMobile ? '15%' : '20%',
      containLabel: true
    },
    // 添加工具栏（移动端隐藏）
    toolbox: {
      show: !isMobile,
      right: isMobile ? 10 : 20,
      top: isMobile ? 10 : 20,
      feature: {
        dataZoom: {
          title: {
            zoom: '区域缩放',
            back: '还原缩放'
          },
          yAxisIndex: 'none'
        },
        restore: {
          title: '还原'
        }
      },
      iconStyle: {
        color: isDarkMode ? '#8E8E93' : '#6E6E73',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
      },
      emphasis: {
        iconStyle: {
          color: isDarkMode ? '#64D2FF' : '#007AFF'
        }
      }
    },
    // 优化数据缩放功能（移动端适配）
    dataZoom: [
      {
        type: 'slider',
        show: true,
        start: Math.max(0, 100 - (24 * 4)), // 显示最近24小时的数据点
        end: 100,
        height: isMobile ? 32 : 24, // 移动端增加高度，便于触摸操作
        bottom: isMobile ? 20 : 15,
        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        fillerColor: isDarkMode ? 'rgba(100, 210, 255, 0.2)' : 'rgba(0, 122, 255, 0.2)',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        borderRadius: isMobile ? 16 : 12, // 移动端更大的圆角
        handleStyle: {
          color: isDarkMode ? '#64D2FF' : '#007AFF',
          borderColor: isDarkMode ? '#FFFFFF' : '#FFFFFF',
          borderWidth: isMobile ? 3 : 2, // 移动端更粗的边框
          shadowColor: isDarkMode ? 'rgba(100, 210, 255, 0.3)' : 'rgba(0, 122, 255, 0.3)',
          shadowBlur: isMobile ? 6 : 4, // 移动端更明显的阴影
          width: isMobile ? 20 : 12, // 移动端更大的拖拽区域
          height: isMobile ? 20 : 12
        },
        textStyle: {
          color: isDarkMode ? '#8E8E93' : '#6E6E73',
          fontSize: isMobile ? 11 : 10,
          fontWeight: 500
        },
        showDetail: false, // 隐藏详细数值，减少视觉干扰
        showDataShadow: true,
        dataShadowColor: isDarkMode ? 'rgba(100, 210, 255, 0.1)' : 'rgba(0, 122, 255, 0.1)',
        // 移动端优化
        moveHandleSize: isMobile ? 20 : 12,
        moveHandleIcon: isMobile ? 'M-9.5,0a9.5,9.5 0 1,0 19,0a9.5,9.5 0 1,0 -19,0' : undefined
      },
      {
        type: 'inside',
        start: Math.max(0, 100 - (24 * 4)),
        end: 100,
        // 移动端和桌面端不同的缩放配置
        zoomOnMouseWheel: isMobile ? false : 'ctrl', // 移动端禁用滚轮缩放
        moveOnMouseMove: !isMobile, // 移动端禁用鼠标移动
        moveOnMouseWheel: false, // 禁用鼠标滚轮缩放，避免误操作
        preventDefaultMouseMove: true,
        throttle: isMobile ? 50 : 100, // 移动端更快的响应
        // 移动端触摸支持
        zoomOnPinch: isMobile, // 移动端支持双指缩放
        moveOnPinch: isMobile // 移动端支持双指移动
      }
    ]
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
        style={{ height: isMobile ? '350px' : '400px' }}
        className="chart-container"
        notMerge={true}
        lazyUpdate={false}
      />
    </div>
  );
};

export default Trend24h;

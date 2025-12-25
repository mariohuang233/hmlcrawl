import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
// 使用fetch替代axios
import { fetchAPI, retryRequest, formatErrorMessage } from '../utils/api';

interface TrendData {
  time: string;
  used_kwh: number;
  remaining_kwh: number;
}

const Trend24h: React.FC = () => {
  const [data, setData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    
    // 延迟检测，确保组件完全加载
    const timer = setTimeout(checkMobile, 100);
    window.addEventListener('resize', checkMobile);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      setError(null);
      // 使用统一的API封装和重试机制
      const rawData = await retryRequest(() => fetchAPI<any[]>('/api/trend/24h'), 3, 1000);
      
      // 按15分钟间隔聚合数据
      const aggregatedData = aggregateDataBy15Min(rawData);
      
      setData(aggregatedData);
    } catch (error) {
      console.error('Error fetching 24h trend:', error);
      const errorMessage = formatErrorMessage(error);
      setError(errorMessage);
      // 设置空数据，避免白屏
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // 按15分钟间隔聚合数据
  const aggregateDataBy15Min = (rawData: any[]) => {
    try {
      const timeMap = new Map();
      
      rawData.forEach((item: any) => {
        try {
          const date = new Date(item.time);
          // 将UTC时间转换为北京时间进行15分钟取整
          const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
          const roundedBeijingTime = roundTo15Minutes(beijingTime);
          // 转换回UTC时间作为聚合key（保持UTC）
          const utcRounded = new Date(roundedBeijingTime.getTime() - 8 * 60 * 60 * 1000);
          const timeKey = utcRounded.toISOString();
          
          if (!timeMap.has(timeKey)) {
            timeMap.set(timeKey, {
              time: timeKey,
              used_kwh: 0,
              remaining_kwh: item.remaining_kwh || 0,
              count: 0
            });
          }
          
          const existingItem = timeMap.get(timeKey);
          existingItem.used_kwh += item.used_kwh || 0;
          existingItem.count += 1;
          // 使用最新的剩余电量
          if (new Date(item.time) > new Date(existingItem.time)) {
            existingItem.remaining_kwh = item.remaining_kwh || 0;
          }
        } catch (itemError) {
          // 静默处理单个项目错误
        }
      });
      
      // 转换回数组并按时间排序
      const dataArray = Array.from(timeMap.values()).map(item => ({
        originalUTC: item.time,
        used_kwh: Math.round(item.used_kwh * 100) / 100,
        remaining_kwh: item.remaining_kwh
      }));
      
      // 使用UTC时间进行排序
      dataArray.sort((a, b) => new Date(a.originalUTC).getTime() - new Date(b.originalUTC).getTime());
      
      // 直接返回数据，保持UTC时间，在显示时再转换为北京时间
      const result = dataArray.map(item => ({
        time: item.originalUTC,
        used_kwh: item.used_kwh,
        remaining_kwh: item.remaining_kwh
      }));
      
      return result;
    } catch (error) {
      console.error('聚合数据时出错:', error);
      return [];
    }
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
  
  // 如果移动端状态还未初始化，使用默认值（假设桌面端）
  const mobileState = isMobile || false;
  
  const chartOption = {
    title: {
      text: '过去24小时用电趋势',
      left: 'center',
      textStyle: {
        fontSize: mobileState ? 18 : 22,
        fontWeight: 600,
        color: isDarkMode ? '#FFFFFF' : '#1D1D1F',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        letterSpacing: '-0.01em'
      },
      top: mobileState ? 15 : 25,
      subtext: mobileState 
        ? '每15分钟更新一次 • 拖拽下方滑块或双指缩放'
        : '每15分钟更新一次 • 拖拽下方滑块或按住Ctrl+滚轮缩放',
      subtextStyle: {
        fontSize: mobileState ? 10 : 11,
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
        
        // 将UTC时间转换为北京时间显示
        let beijingTime = '';
        try {
          const utcDate = new Date(timeLabel);
          if (!isNaN(utcDate.getTime())) {
            // 转换为北京时间 (UTC+8) - 手动计算避免时区问题
            const beijingTimestamp = utcDate.getTime() + 8 * 60 * 60 * 1000;
            const beijingDate = new Date(beijingTimestamp);
            // 格式化为更清晰的北京时间格式 - 使用UTC方法避免本地时区影响
            const year = beijingDate.getUTCFullYear();
            const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(beijingDate.getUTCDate()).padStart(2, '0');
            const hour = String(beijingDate.getUTCHours()).padStart(2, '0');
            const minute = String(beijingDate.getUTCMinutes()).padStart(2, '0');
            beijingTime = `${year}/${month}/${day} ${hour}:${minute}`;
          } else {
            beijingTime = timeLabel; // 如果转换失败，使用原始值
          }
        } catch (error) {
          console.error('时间转换错误:', error);
          beijingTime = timeLabel;
        }
        
        return `
          <div style="padding: 4px 0;">
            <div style="margin-bottom: 8px; font-weight: 600; font-size: 14px; color: ${isDarkMode ? '#FFFFFF' : '#1D1D1F'};">⏰ ${beijingTime}</div>
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
      data: data.map(item => item.time), // 直接使用原始时间字符串
      axisLabel: {
        color: isDarkMode ? '#8E8E93' : '#6E6E73',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: mobileState ? 10 : 11,
        fontWeight: 500,
        interval: (index: number) => {
          // 智能间隔显示，确保标签不重叠
          const totalPoints = data.length;
          if (totalPoints <= 12) {
            return true; // 数据点少时全部显示
          } else if (totalPoints <= 24) {
            return index % 2 === 0; // 每2个显示1个
          } else if (totalPoints <= 48) {
            return index % 4 === 0; // 每4个显示1个
          } else {
            return index % 6 === 0; // 每6个显示1个
          }
        },
        rotate: 0,
        formatter: (value: string) => {
          // value是UTC时间字符串，转换为北京时间显示
          try {
            const utcDate = new Date(value);
            if (isNaN(utcDate.getTime())) {
              return '';
            }
            // 转换为北京时间 (UTC+8) - 手动计算避免时区问题
            const beijingTimestamp = utcDate.getTime() + 8 * 60 * 60 * 1000;
            const beijingDate = new Date(beijingTimestamp);
            const hour = beijingDate.getUTCHours(); // 使用getUTCHours避免本地时区影响
            const minute = beijingDate.getUTCMinutes();
            return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          } catch (error) {
            return '';
          }
        }
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
        fontSize: mobileState ? 10 : 11,
        fontWeight: 500,
        padding: [0, 0, 0, mobileState ? 5 : 10]
      },
      axisLabel: {
        color: isDarkMode ? '#8E8E93' : '#6E6E73',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: mobileState ? 10 : 11,
        fontWeight: 500,
        formatter: (value: number) => {
          // 确保Y轴标签正确显示
          if (typeof value !== 'number' || isNaN(value)) {
            return '0.0';
          }
          return value.toFixed(1);
        }
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
      left: mobileState ? '10%' : '8%',
      right: mobileState ? '6%' : '4%',
      bottom: mobileState ? '25%' : '20%', // 为X轴标签留出更多空间
      top: mobileState ? '15%' : '20%',
      containLabel: true
    },
    // 简化工具栏配置
    toolbox: {
      show: false // 暂时隐藏工具栏，避免交互错误
    },
    // 简化数据缩放功能，避免ECharts错误
    dataZoom: data.length > 0 ? [
      {
        type: 'slider',
        show: true,
        start: 0,
        end: 100,
        height: mobileState ? 32 : 24,
        bottom: mobileState ? 20 : 15,
        backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        fillerColor: isDarkMode ? 'rgba(100, 210, 255, 0.2)' : 'rgba(0, 122, 255, 0.2)',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        borderRadius: mobileState ? 16 : 12,
        handleStyle: {
          color: isDarkMode ? '#64D2FF' : '#007AFF',
          borderColor: isDarkMode ? '#FFFFFF' : '#FFFFFF',
          borderWidth: mobileState ? 3 : 2,
          shadowColor: isDarkMode ? 'rgba(100, 210, 255, 0.3)' : 'rgba(0, 122, 255, 0.3)',
          shadowBlur: mobileState ? 6 : 4
        },
        textStyle: {
          color: isDarkMode ? '#8E8E93' : '#6E6E73',
          fontSize: mobileState ? 11 : 10,
          fontWeight: 500
        },
        showDetail: false,
        showDataShadow: false
      }
    ] : []
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

  // 如果有错误，显示错误信息
  if (error) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">过去24小时用电趋势</h2>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '300px',
          color: '#FF3B30',
          fontSize: '14px',
          padding: '20px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <p style={{ marginBottom: '16px', textAlign: 'center' }}>{error}</p>
          <button 
            onClick={fetchData}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007AFF',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  // 如果数据为空，显示提示信息
  if (data.length === 0) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">过去24小时用电趋势</h2>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '300px',
          color: '#8E8E93',
          fontSize: '14px'
        }}>
          暂无数据可用
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
      <ReactECharts 
        option={chartOption} 
        style={{ height: mobileState ? '350px' : '400px' }}
        className="chart-container"
        notMerge={false}
        lazyUpdate={true}
      />
    </div>
  );
};

export default Trend24h;

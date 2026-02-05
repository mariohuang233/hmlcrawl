import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
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
  
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
    };
    
    const timer = setTimeout(checkMobile, 100);
    window.addEventListener('resize', checkMobile);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      const rawData = await retryRequest(() => fetchAPI<any[]>('/api/trend/24h'), 3, 1000);
      
      const aggregatedData = aggregateDataBy15Min(rawData);
      
      setData(aggregatedData);
    } catch (error) {
      console.error('Error fetching 24h trend:', error);
      const errorMessage = formatErrorMessage(error);
      setError(errorMessage);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const aggregateDataBy15Min = (rawData: any[]) => {
    try {
      const timeMap = new Map();
      
      rawData.forEach((item: any) => {
        try {
          const date = new Date(item.time);
          const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
          const roundedBeijingTime = roundTo15Minutes(beijingTime);
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
          if (new Date(item.time) > new Date(existingItem.time)) {
            existingItem.remaining_kwh = item.remaining_kwh || 0;
          }
        } catch (itemError) {
          // 静默处理单个项目错误
        }
      });
      
      const dataArray = Array.from(timeMap.values()).map(item => ({
        originalUTC: item.time,
        used_kwh: Math.round(item.used_kwh * 100) / 100,
        remaining_kwh: item.remaining_kwh
      }));
      
      dataArray.sort((a, b) => new Date(a.originalUTC).getTime() - new Date(b.originalUTC).getTime());
      
      return dataArray.map(item => ({
        time: item.originalUTC,
        used_kwh: item.used_kwh,
        remaining_kwh: item.remaining_kwh
      }));
    } catch (error) {
      console.error('聚合数据时出错:', error);
      return [];
    }
  };

  const roundTo15Minutes = (date: Date) => {
    const rounded = new Date(date);
    const minutes = rounded.getMinutes();
    const roundedMinutes = Math.floor(minutes / 15) * 15;
    rounded.setMinutes(roundedMinutes, 0, 0);
    return rounded;
  };
  
  const mobileState = isMobile || false;
  
  const chartOption = {
    title: {
      text: '24小时用电趋势',
      left: 'center',
      textStyle: {
        fontSize: mobileState ? 16 : 18,
        fontWeight: 600,
        color: '#3D3229',
        fontFamily: 'Noto Sans SC, sans-serif'
      },
      top: 16,
      subtext: mobileState 
        ? '每15分钟更新'
        : '每15分钟更新 · 拖拽下方滑块缩放',
      subtextStyle: {
        fontSize: mobileState ? 11 : 12,
        color: '#9A8B7E',
        fontFamily: 'Noto Sans SC, sans-serif'
      }
    },
    animation: hasTriggered,
    animationDuration: 2000,
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
        const timeLabel = point.axisValue;
        const usage = point.value;
        const remaining = data[point.dataIndex]?.remaining_kwh || 0;
        
        let beijingTime = '';
        try {
          const utcDate = new Date(timeLabel);
          if (!isNaN(utcDate.getTime())) {
            const beijingTimestamp = utcDate.getTime() + 8 * 60 * 60 * 1000;
            const beijingDate = new Date(beijingTimestamp);
            const year = beijingDate.getUTCFullYear();
            const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(beijingDate.getUTCDate()).padStart(2, '0');
            const hour = String(beijingDate.getUTCHours()).padStart(2, '0');
            const minute = String(beijingDate.getUTCMinutes()).padStart(2, '0');
            beijingTime = `${year}/${month}/${day} ${hour}:${minute}`;
          } else {
            beijingTime = timeLabel;
          }
        } catch (error) {
          beijingTime = timeLabel;
        }
        
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 8px; font-weight: 600; color: #8B6F5C; font-size: 14px;">${beijingTime}</div>
            <div style="margin-bottom: 4px;">
              <span style="display: inline-block; width: 8px; height: 8px; background: #8B6F5C; border-radius: 50%; margin-right: 8px;"></span>
              <span>用电量: <span style="color: #8B6F5C; font-weight: 600;">${usage}</span> kWh</span>
            </div>
            <div>
              <span style="display: inline-block; width: 8px; height: 8px; background: #7BA3C0; border-radius: 50%; margin-right: 8px;"></span>
              <span>剩余电量: <span style="color: #7BA3C0; font-weight: 600;">${remaining}</span> kWh</span>
            </div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.time),
      axisLabel: {
        color: '#9A8B7E',
        fontFamily: 'Noto Sans SC, sans-serif',
        fontSize: mobileState ? 10 : 11,
        interval: (index: number) => {
          const totalPoints = data.length;
          if (totalPoints <= 12) return true;
          else if (totalPoints <= 24) return index % 2 === 0;
          else if (totalPoints <= 48) return index % 4 === 0;
          else return index % 6 === 0;
        },
        rotate: 0,
        formatter: (value: string) => {
          try {
            const utcDate = new Date(value);
            if (isNaN(utcDate.getTime())) return '';
            const beijingTimestamp = utcDate.getTime() + 8 * 60 * 60 * 1000;
            const beijingDate = new Date(beijingTimestamp);
            const hour = beijingDate.getUTCHours();
            const minute = beijingDate.getUTCMinutes();
            return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          } catch (error) {
            return '';
          }
        }
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
        fontSize: 10,
        formatter: (value: number) => {
          if (typeof value !== 'number' || isNaN(value)) return '0.0';
          return value.toFixed(1);
        }
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
        type: 'line',
        data: data.map(item => item.used_kwh),
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: data.length <= 20,
        lineStyle: {
          color: '#8B6F5C',
          width: 3
        },
        itemStyle: {
          color: '#8B6F5C',
          borderColor: '#FFFFFF',
          borderWidth: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(139, 111, 92, 0.2)' },
              { offset: 0.5, color: 'rgba(139, 111, 92, 0.1)' },
              { offset: 1, color: 'rgba(139, 111, 92, 0.02)' }
            ]
          }
        },
        animationDelay: 0,
        animationDuration: 2000,
        animationEasing: 'cubicOut'
      }
    ],
    grid: {
      left: mobileState ? '12%' : '8%',
      right: mobileState ? '6%' : '4%',
      bottom: mobileState ? '22%' : '18%',
      top: mobileState ? '18%' : '20%',
      containLabel: true
    },
    dataZoom: data.length > 0 ? [
      {
        type: 'slider',
        show: true,
        start: 0,
        end: 100,
        height: mobileState ? 28 : 22,
        bottom: mobileState ? 15 : 12,
        backgroundColor: '#F5F0EC',
        fillerColor: 'rgba(139, 111, 92, 0.2)',
        borderColor: '#E8E0D8',
        borderRadius: mobileState ? 14 : 11,
        handleStyle: {
          color: '#8B6F5C',
          borderColor: '#FFFFFF',
          borderWidth: mobileState ? 2 : 1
        },
        textStyle: {
          color: '#9A8B7E',
          fontSize: mobileState ? 10 : 9,
          fontFamily: 'Noto Sans SC, sans-serif'
        },
        showDetail: false,
        showDataShadow: false
      }
    ] : []
  };

  if (loading) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">24小时用电趋势</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">24小时用电趋势</h2>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '300px',
          color: '#E88B8B',
          fontSize: '14px',
          padding: '20px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😔</div>
          <p style={{ marginBottom: '16px', textAlign: 'center' }}>{error}</p>
          <button 
            onClick={fetchData}
            className="btn btn-primary"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">24小时用电趋势</h2>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '300px',
          color: '#9A8B7E',
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

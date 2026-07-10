import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { fetchAPI, retryRequest, formatErrorMessage } from '../utils/api';

interface TrendData {
  time: string;
  used_kwh: number;
  remaining_kwh: number;
}

interface Trend24hProps {
  isMobile?: boolean;
}

const Trend24h: React.FC<Trend24hProps> = ({ isMobile = false }) => {
  const [data, setData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  const roundTo15Minutes = (date: Date) => {
    const rounded = new Date(date);
    const minutes = rounded.getMinutes();
    const roundedMinutes = Math.floor(minutes / 15) * 15;
    rounded.setMinutes(roundedMinutes, 0, 0);
    return rounded;
  };

  const aggregateDataBy15Min = useMemo(() => (rawData: any[]) => {
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
    } catch (err) {
      console.error('聚合数据时出错:', err);
      return [];
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const rawData = await retryRequest(() => fetchAPI<any[]>('/api/trend/24h'), 3, 1000);
      
      const aggregatedData = aggregateDataBy15Min(rawData);
      
      setData(aggregatedData);
    } catch (err) {
      console.error('Error fetching 24h trend:', err);
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [aggregateDataBy15Min]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const mobileState = isMobile;
  
  const chartOption = {
    title: {
      text: '24小时用电趋势',
      left: 'center',
      textStyle: {
        fontSize: mobileState ? 15 : 18,
        fontWeight: 600,
        color: '#2d2620',
        fontFamily: 'Outfit, Nunito, sans-serif'
      },
      top: mobileState ? 12 : 16,
      subtext: mobileState 
        ? '每15分钟更新'
        : '每15分钟更新 · 拖拽下方滑块缩放',
      subtextStyle: {
        fontSize: mobileState ? 10 : 12,
        color: '#8a8078',
        fontFamily: 'Outfit, Nunito, sans-serif'
      }
    },
    animation: hasTriggered,
    animationDuration: 1800,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: 'rgba(184, 134, 90, 0.12)',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      textStyle: {
        color: '#2d2620',
        fontFamily: 'Outfit, Nunito, sans-serif',
        fontSize: 13
      },
      extraCssText: 'box-shadow: 0 4px 16px rgba(45, 38, 32, 0.08);',
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
            <div style="margin-bottom: 8px; font-weight: 600; color: #664733; font-size: 14px;">${beijingTime}</div>
            <div style="margin-bottom: 4px;">
              <span style="display: inline-block; width: 8px; height: 8px; background: #a07048; border-radius: 50%; margin-right: 8px;"></span>
              <span>用电量: <span style="color: #664733; font-weight: 600;">${usage}</span> kWh</span>
            </div>
            <div>
              <span style="display: inline-block; width: 8px; height: 8px; background: #0ea5e9; border-radius: 50%; margin-right: 8px;"></span>
              <span>剩余电量: <span style="color: #0ea5e9; font-weight: 600;">${remaining}</span> kWh</span>
            </div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.time),
      axisLabel: {
        color: '#8a8078',
        fontFamily: 'Outfit, Nunito, sans-serif',
        fontSize: mobileState ? 9 : 11,
        interval: (index: number) => {
          const totalPoints = data.length;
          if (mobileState) {
            if (totalPoints <= 12) return index % 2 === 0;
            else if (totalPoints <= 24) return index % 3 === 0;
            else if (totalPoints <= 48) return index % 6 === 0;
            else return index % 8 === 0;
          }
          if (totalPoints <= 12) return true;
          else if (totalPoints <= 24) return index % 2 === 0;
          else if (totalPoints <= 48) return index % 4 === 0;
          else return index % 6 === 0;
        },
        rotate: mobileState ? 45 : 0,
        formatter: (value: string) => {
          try {
            const utcDate = new Date(value);
            if (isNaN(utcDate.getTime())) return '';
            const beijingTimestamp = utcDate.getTime() + 8 * 60 * 60 * 1000;
            const beijingDate = new Date(beijingTimestamp);
            const hour = beijingDate.getUTCHours();
            const minute = beijingDate.getUTCMinutes();
            if (mobileState) {
              return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            }
            return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          } catch (error) {
            return '';
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
        fontSize: mobileState ? 9 : 11
      },
      axisLabel: {
        color: '#8a8078',
        fontFamily: 'Outfit, Nunito, sans-serif',
        fontSize: mobileState ? 9 : 10,
        formatter: (value: number) => {
          if (typeof value !== 'number' || isNaN(value)) return '0.0';
          return value.toFixed(1);
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
        type: 'line',
        data: data.map(item => item.used_kwh),
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: data.length <= 20,
        lineStyle: {
          color: '#a07048',
          width: 3
        },
        itemStyle: {
          color: '#a07048',
          borderColor: '#ffffff',
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
              { offset: 0, color: 'rgba(160, 112, 72, 0.15)' },
              { offset: 0.5, color: 'rgba(160, 112, 72, 0.08)' },
              { offset: 1, color: 'rgba(160, 112, 72, 0.02)' }
            ]
          }
        },
        animationDelay: 0,
        animationDuration: 1800,
        animationEasing: 'cubicOut'
      }
    ],
    grid: {
      left: mobileState ? '14%' : '8%',
      right: mobileState ? '6%' : '4%',
      bottom: mobileState ? '28%' : '18%',
      top: mobileState ? '16%' : '20%',
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
        backgroundColor: '#f5f3f1',
        fillerColor: 'rgba(160, 112, 72, 0.15)',
        borderColor: 'rgba(184, 134, 90, 0.12)',
        borderRadius: mobileState ? 14 : 11,
        handleStyle: {
          color: '#a07048',
          borderColor: '#ffffff',
          borderWidth: mobileState ? 2 : 1
        },
        textStyle: {
          color: '#8a8078',
          fontSize: mobileState ? 10 : 9,
          fontFamily: 'Outfit, Nunito, sans-serif'
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
          color: '#f43f5e',
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
          color: '#8a8078',
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
        style={{ height: mobileState ? '380px' : '380px' }}
        className="chart-container"
        notMerge={false}
        lazyUpdate={true}
      />
    </div>
  );
};

export default Trend24h;

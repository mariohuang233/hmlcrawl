import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Chart from './Chart';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { fetchAPI, retryRequest, formatErrorMessage } from '../utils/api';
import { ColorTheme, getChartTheme } from '../utils/chartTheme';
import { createSparseCategoryInterval } from '../utils/chartAxis';
import ChartCardHeader from './ChartCardHeader';

interface TrendData {
  time: string;
  used_kwh: number;
  remaining_kwh: number;
}

interface Trend24hProps {
  isMobile?: boolean;
  refreshKey?: number;
  theme?: ColorTheme;
}

const Trend24h: React.FC<Trend24hProps> = ({ isMobile = false, refreshKey = 0, theme = 'light' }) => {
  const [data, setData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  const roundTo10Minutes = (date: Date) => {
    const rounded = new Date(date);
    const minutes = rounded.getMinutes();
    const roundedMinutes = Math.floor(minutes / 10) * 10;
    rounded.setMinutes(roundedMinutes, 0, 0);
    return rounded;
  };

  const aggregateDataBy10Min = useMemo(() => (rawData: any[]) => {
    try {
      const timeMap = new Map();
      
      rawData.forEach((item: any) => {
        try {
          const date = new Date(item.time);
          const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
          const roundedBeijingTime = roundTo10Minutes(beijingTime);
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
      
      const aggregatedData = aggregateDataBy10Min(rawData);
      
      setData(aggregatedData);
    } catch (err) {
      console.error('Error fetching 24h trend:', err);
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [aggregateDataBy10Min]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);
  
  const mobileState = isMobile;
  const colors = getChartTheme(theme);
  const latestRemaining = data.length > 0 ? data[data.length - 1].remaining_kwh : 0;
  
  const chartOption = {
    animation: hasTriggered,
    animationDuration: 220,
    animationDurationUpdate: 160,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      triggerOn: 'mousemove|click',
      confine: true,
      enterable: false,
      hideDelay: 40,
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: mobileState ? 10 : 12,
      textStyle: {
        color: colors.text,
        fontFamily: 'inherit',
        fontSize: mobileState ? 11 : 12
      },
      extraCssText: colors.tooltipShadow,
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
          <div style="min-width:${mobileState ? 145 : 165}px">
            <div style="margin-bottom:7px;font-weight:700;color:${colors.textStrong}">${beijingTime}</div>
            <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px;color:${colors.muted}">
              <span>用电</span><strong style="color:${colors.textStrong}">${usage} kWh</strong>
            </div>
            <div style="display:flex;justify-content:space-between;gap:16px;color:${colors.muted}">
              <span>余量</span><strong style="color:${colors.textStrong}">${remaining} kWh</strong>
            </div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.time),
      axisLabel: {
        color: colors.muted,
        fontFamily: 'inherit',
        fontSize: mobileState ? 10 : 11,
        interval: createSparseCategoryInterval(data.length, mobileState ? 5 : 8),
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: true,
        margin: mobileState ? 9 : 11,
        rotate: 0,
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
          color: colors.axis
        }
      },
      axisTick: {
        lineStyle: {
          color: colors.axis
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '用电量 (kWh)',
      nameTextStyle: {
        color: colors.muted,
        fontFamily: 'inherit',
        fontSize: mobileState ? 10 : 11
      },
      axisLabel: {
        color: colors.muted,
        fontFamily: 'inherit',
        fontSize: mobileState ? 9 : 10,
        formatter: (value: number) => {
          if (typeof value !== 'number' || isNaN(value)) return '0.0';
          return value.toFixed(1);
        }
      },
      axisLine: {
        lineStyle: {
          color: colors.axis
        }
      },
      axisTick: {
        lineStyle: {
          color: colors.axis
        }
      },
      splitLine: {
        lineStyle: {
          color: colors.grid,
          type: 'solid'
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
          color: colors.series,
          width: mobileState ? 2 : 2.5
        },
        itemStyle: {
          color: colors.series,
          borderColor: colors.pointBorder,
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
              { offset: 0, color: colors.areaTop },
              { offset: 1, color: colors.areaBottom }
            ]
          }
        },
        animationDelay: 0,
        animationDuration: 220,
        animationEasing: 'cubicOut'
      }
    ],
    grid: {
      left: mobileState ? 42 : 54,
      right: mobileState ? 12 : 20,
      bottom: mobileState ? 28 : 50,
      top: 10,
      containLabel: true
    },
    dataZoom: data.length > 0 ? (mobileState ? [
      {
        type: 'inside',
        start: 0,
        end: 100,
        zoomOnMouseWheel: false,
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      }
    ] : [
      {
        type: 'slider',
        show: true,
        start: 0,
        end: 100,
        height: mobileState ? 28 : 22,
        bottom: mobileState ? 15 : 12,
        backgroundColor: colors.zoomBackground,
        fillerColor: colors.zoomFill,
        borderColor: colors.axis,
        borderRadius: mobileState ? 14 : 11,
        handleStyle: {
          color: colors.series,
          borderColor: colors.pointBorder,
          borderWidth: mobileState ? 2 : 1
        },
        textStyle: {
          color: colors.muted,
          fontSize: mobileState ? 10 : 9,
          fontFamily: 'inherit'
        },
        showDetail: false,
        showDataShadow: false
      }
    ]) : []
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
          <div className="error-mark" aria-hidden="true">图表异常</div>
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
          color: '#70807c',
          fontSize: '14px'
        }}>
          暂无数据可用
        </div>
      </div>
    );
  }

  return (
    <div className={`card chart-card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
      <ChartCardHeader
        title="24小时用电"
        description="每10分钟更新"
        value={`余量 ${latestRemaining.toFixed(2)} kWh`}
      />
      <Chart
        ariaLabel="过去 24 小时用电量与剩余电量趋势图"
        summary={`图表包含 ${data.length} 个时间点，当前剩余 ${latestRemaining.toFixed(2)} kWh。`}
        option={chartOption} 
        style={{ height: mobileState ? '230px' : '300px' }}
        className="chart-container"
        notMerge={false}
        lazyUpdate={true}
      />
    </div>
  );
};

export default React.memo(Trend24h);

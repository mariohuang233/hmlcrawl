import React, { useState, useEffect, useCallback } from 'react';
import Chart from './Chart';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface MonthlyData {
  month: string;
  used_kwh: number;
  prev_month_used_kwh: number;
  vs_prev_month: number | null;
}

interface MonthlyTrendProps {
  isMobile?: boolean;
  refreshKey?: number;
}

const MonthlyTrend: React.FC<MonthlyTrendProps> = ({ isMobile = false, refreshKey = 0 }) => {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/trend/monthly`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      if (responseData.error) {
        throw new Error(responseData.message || responseData.error);
      }

      if (!Array.isArray(responseData)) {
        throw new Error('月度趋势数据格式无效');
      }

      setData(responseData.map((item: MonthlyData) => ({
        ...item,
        used_kwh: Number.isFinite(Number(item.used_kwh)) ? Number(item.used_kwh) : 0,
        prev_month_used_kwh: Number.isFinite(Number(item.prev_month_used_kwh))
          ? Number(item.prev_month_used_kwh)
          : 0
      })));
    } catch (error) {
      console.error('Error fetching monthly trend:', error);
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
      text: '12个月用电趋势',
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
        const vsPrevMonth = dataItem.vs_prev_month;
        
        let comparisonHtml = '';
        if (vsPrevMonth !== null) {
          const vsPrevMonthText = vsPrevMonth === 0 ? '持平' : 
            (vsPrevMonth > 0 ? `+${vsPrevMonth}%` : `${vsPrevMonth}%`);
          const vsPrevMonthColor = vsPrevMonth === 0 ? '#8a8078' :
            (vsPrevMonth > 0 ? '#f43f5e' : '#10b981');
          
          comparisonHtml = `
            <div style="color: #8a8078; font-size: ${isMobile ? 13 : 12}px; margin-bottom: 2px;">上月: ${dataItem.prev_month_used_kwh} kWh</div>
            <div style="color: ${vsPrevMonthColor}; font-size: ${isMobile ? 13 : 12}px;">
              较上月 ${vsPrevMonthText}
            </div>
          `;
        }
        
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 8px; font-weight: 600; color: #176a6d; font-size: ${isMobile ? 15 : 14}px;">${point.axisValue}</div>
            <div style="margin-bottom: 4px;">用电量: <span style="color: #176a6d; font-weight: 600;">${point.value}</span> kWh</div>
            ${comparisonHtml}
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.month.replace(/^(\d{4})-(\d{2})$/, '$1/$2')),
      axisLabel: {
        rotate: isMobile ? 45 : 45,
        interval: isMobile ? (index: number) => index % 2 === 0 : 0,
        color: '#8a8078',
        fontFamily: 'Outfit, Nunito, sans-serif',
        fontSize: isMobile ? 8 : 10,
        formatter: (value: string) => {
          if (!isMobile) return value;
          try {
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;
            return `${date.getFullYear().toString().slice(-2)}/${date.getMonth() + 1}`;
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
        name: '月用电',
        type: 'bar',
        data: data.map(item => item.used_kwh),
        barMaxWidth: isMobile ? 20 : 28,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#176a6d' },
              { offset: 0.5, color: '#287f82' },
              { offset: 1, color: '#89b9ba' }
            ]
          },
          borderRadius: [isMobile ? 6 : 8, isMobile ? 6 : 8, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: '#176a6d'
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
      bottom: isMobile ? '28%' : '15%',
      top: isMobile ? '14%' : '18%',
      containLabel: true
    }
  };

  if (loading) {
    return (
      <div className={`card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">12个月用电趋势</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (data.length === 0 || data.every(item => item.used_kwh <= 0)) {
    return (
      <div className={`card chart-card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
        <h2 className="card-title">12个月用电趋势</h2>
        <div className="chart-empty-state">
          <span className="chart-empty-kicker">暂无月度数据</span>
          <p>完成至少两次有效采集后，这里会显示每月用电柱状图。</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`card chart-card ${hasTriggered ? 'animate-in' : ''}`} ref={elementRef as React.RefObject<HTMLDivElement>}>
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

export default React.memo(MonthlyTrend);

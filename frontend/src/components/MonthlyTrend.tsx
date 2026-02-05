import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface MonthlyData {
  month: string;
  used_kwh: number;
  prev_month_used_kwh: number;
  vs_prev_month: number | null;
}

const MonthlyTrend: React.FC = () => {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/trend/monthly`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.message || data.error);
      }
      
      setData(data);
    } catch (error) {
      console.error('Error fetching monthly trend:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };
  
  const chartOption = {
    title: {
      text: '12个月用电趋势',
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
        const dataItem = data[point.dataIndex];
        const vsPrevMonth = dataItem.vs_prev_month;
        
        let comparisonHtml = '';
        if (vsPrevMonth !== null) {
          const vsPrevMonthText = vsPrevMonth === 0 ? '持平' : 
            (vsPrevMonth > 0 ? `+${vsPrevMonth}%` : `${vsPrevMonth}%`);
          const vsPrevMonthColor = vsPrevMonth === 0 ? '#9A8B7E' :
            (vsPrevMonth > 0 ? '#E88B8B' : '#7CB87C');
          
          comparisonHtml = `
            <div style="color: #9A8B7E; font-size: 12px; margin-bottom: 2px;">上月: ${dataItem.prev_month_used_kwh} kWh</div>
            <div style="color: ${vsPrevMonthColor}; font-size: 12px;">
              较上月 ${vsPrevMonthText}
            </div>
          `;
        }
        
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 8px; font-weight: 600; color: #8B6F5C; font-size: 14px;">${point.axisValue}</div>
            <div style="margin-bottom: 4px;">用电量: <span style="color: #8B6F5C; font-weight: 600;">${point.value}</span> kWh</div>
            ${comparisonHtml}
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.month),
      axisLabel: {
        rotate: 45,
        color: '#9A8B7E',
        fontFamily: 'Noto Sans SC, sans-serif',
        fontSize: 10
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
        name: '月用电',
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
              { offset: 0, color: '#7BA3C0' },
              { offset: 0.5, color: '#A3C4D9' },
              { offset: 1, color: '#D4E4F0' }
            ]
          },
          borderRadius: [6, 6, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: '#7BA3C0'
          }
        },
        animationDelay: 0,
        animationDuration: 2000,
        animationEasing: 'cubicOut'
      }
    ],
    grid: {
      left: '5%',
      right: '5%',
      bottom: '15%',
      top: '18%',
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
};

export default MonthlyTrend;

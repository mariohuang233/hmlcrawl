import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
// 使用fetch替代axios

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface DailyData {
  date: string;
  used_kwh: number;
}

const DailyTrend: React.FC = () => {
  const [data, setData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);

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

  const chartOption = {
    title: {
      text: '最近30天每日用电趋势',
      left: 'center',
      textStyle: {
        fontSize: 18,
        fontWeight: 600,
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-primary)'
      },
      top: 20
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--bg-secondary)',
      borderColor: 'var(--border-light)',
      borderWidth: 1,
      borderRadius: 12,
      textStyle: {
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-primary)'
      },
      formatter: (params: any) => {
        const point = params[0];
        return `
          <div style="padding: 4px;">
            <div style="margin-bottom: 4px; font-weight: 600;">📅 ${point.axisValue}</div>
            <div>⚡ 用电量: ${point.value} kWh</div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.date),
      axisLabel: {
        rotate: 45,
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-primary)',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'var(--border-light)'
        }
      },
      axisTick: {
        lineStyle: {
          color: 'var(--border-light)'
        }
      }
    },
    yAxis: {
      type: 'value',
      name: '用电量 (kWh)',
      nameTextStyle: {
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-primary)',
        fontSize: 12
      },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-primary)',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: 'var(--border-light)'
        }
      },
      axisTick: {
        lineStyle: {
          color: 'var(--border-light)'
        }
      },
      splitLine: {
        lineStyle: {
          color: 'var(--border-light)',
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
        symbolSize: 6,
        lineStyle: {
          color: 'var(--accent-orange)',
          width: 3
        },
        itemStyle: {
          color: 'var(--accent-orange)',
          borderColor: '#fff',
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
              { offset: 0, color: 'rgba(255, 149, 0, 0.2)' },
              { offset: 1, color: 'rgba(255, 149, 0, 0.05)' }
            ]
          }
        }
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
      <div className="card">
        <h2 className="card-title">最近30天每日用电趋势</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <ReactECharts 
        option={chartOption} 
        style={{ height: '400px' }}
        className="chart-container"
      />
    </div>
  );
};

export default DailyTrend;

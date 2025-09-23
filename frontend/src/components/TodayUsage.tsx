import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
// 使用fetch替代axios

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface TodayData {
  hour: number;
  used_kwh: number;
}

const TodayUsage: React.FC = () => {
  const [data, setData] = useState<TodayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/trend/today`);
      const data = await response.json();
      setData(data);
    } catch (error) {
      console.error('Error fetching today usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartOption = {
    title: {
      text: '今日用电分布（按小时）',
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
            <div style="margin-bottom: 4px; font-weight: 600;">⏰ ${point.axisValue}</div>
            <div>⚡ 用电量: ${point.value} kWh</div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => `${item.hour}点`),
      axisLabel: {
        interval: 1,
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
        name: '用电量',
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
              { offset: 0, color: 'var(--accent-green)' },
              { offset: 1, color: 'rgba(52, 199, 89, 0.7)' }
            ]
          },
          borderRadius: [4, 4, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: 'var(--accent-green)',
            shadowBlur: 10,
            shadowColor: 'rgba(52, 199, 89, 0.3)'
          }
        }
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
      <div className="card">
        <h2 className="card-title">今日用电分布（按小时）</h2>
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

export default TodayUsage;

import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/trend/24h`);
      const data = await response.json();
      setData(data);
    } catch (error) {
      console.error('Error fetching 24h trend:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartOption = {
    title: {
      text: '过去24小时用电趋势',
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
        type: 'line',
        data: data.map(item => item.used_kwh),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: 'var(--accent-blue)',
          width: 3
        },
        itemStyle: {
          color: 'var(--accent-blue)',
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
              { offset: 0, color: 'rgba(74, 144, 226, 0.2)' },
              { offset: 1, color: 'rgba(74, 144, 226, 0.05)' }
            ]
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
        <h2 className="card-title">过去24小时用电趋势</h2>
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

export default Trend24h;

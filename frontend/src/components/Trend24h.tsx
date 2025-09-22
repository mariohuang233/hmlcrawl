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
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const point = params[0];
        return `
          <div>
            <div>时间: ${point.axisValue}</div>
            <div>用电量: ${point.value} kWh</div>
            <div>剩余电量: ${data[point.dataIndex]?.remaining_kwh} kWh</div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => {
        const date = new Date(item.time);
        // 转换为北京时间显示 (UTC+8)
        const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
        return beijingTime.toLocaleTimeString('zh-CN', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'UTC'
        });
      })
    },
    yAxis: {
      type: 'value',
      name: '用电量 (kWh)'
    },
    series: [
      {
        name: '用电量',
        type: 'line',
        data: data.map(item => item.used_kwh),
        smooth: true,
        lineStyle: {
          color: '#3b82f6'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.1)' }
            ]
          }
        }
      }
    ],
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center h-64">
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

import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';

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
      const response = await axios.get(`${API_BASE}/api/trend/30d`);
      setData(response.data);
    } catch (error) {
      console.error('Error fetching daily trend:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartOption = {
    title: {
      text: '最近30天每日用电趋势',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const point = params[0];
        return `${point.axisValue}: ${point.value} kWh`;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.date),
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      name: '用电量 (kWh)'
    },
    series: [
      {
        name: '每日用电',
        type: 'line',
        data: data.map(item => item.used_kwh),
        smooth: true,
        lineStyle: {
          color: '#f59e0b'
        },
        itemStyle: {
          color: '#f59e0b'
        }
      }
    ],
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
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

export default DailyTrend;

import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';

const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';

interface MonthlyData {
  month: string;
  used_kwh: number;
}

const MonthlyTrend: React.FC = () => {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/trend/monthly`);
      setData(response.data);
    } catch (error) {
      console.error('Error fetching monthly trend:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartOption = {
    title: {
      text: '最近12个月用电趋势',
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
      data: data.map(item => item.month),
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
        name: '月用电',
        type: 'bar',
        data: data.map(item => item.used_kwh),
        itemStyle: {
          color: '#8b5cf6'
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

export default MonthlyTrend;

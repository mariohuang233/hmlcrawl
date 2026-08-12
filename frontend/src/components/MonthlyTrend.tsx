import React, { useState, useEffect, useCallback } from 'react';
import Chart from './Chart';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';
import { ColorTheme, getChartTheme } from '../utils/chartTheme';
import { createSparseCategoryInterval } from '../utils/chartAxis';
import ChartCardHeader from './ChartCardHeader';
import { fetchAPI } from '../utils/api';
import { DeviceBreakdown, deviceSeriesColors, deviceTooltipRows, normalizeDeviceBreakdown } from '../utils/deviceEnergy';

interface MonthlyData {
  month: string;
  used_kwh: number;
  prev_month_used_kwh: number;
  vs_prev_month: number | null;
  device_breakdown?: DeviceBreakdown;
}

interface MonthlyTrendProps {
  isMobile?: boolean;
  refreshKey?: number;
  theme?: ColorTheme;
}

const MonthlyTrend: React.FC<MonthlyTrendProps> = ({ isMobile = false, refreshKey = 0, theme = 'light' }) => {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  });

  const fetchData = useCallback(async () => {
    try {
      const responseData = await fetchAPI<MonthlyData[]>('/api/trend/monthly');

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
  
  const colors = getChartTheme(theme);
  const currentMonthUsage = data.length > 0 ? data[data.length - 1].used_kwh : 0;
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
      padding: isMobile ? 10 : 12,
      textStyle: {
        color: colors.text,
        fontFamily: 'inherit',
        fontSize: isMobile ? 11 : 12
      },
      extraCssText: colors.tooltipShadow,
      formatter: (params: any) => {
        const point = params[0];
        const dataItem = data[point.dataIndex];
        const vsPrevMonth = dataItem.vs_prev_month;
        
        let comparisonHtml = '';
        if (vsPrevMonth !== null) {
          const vsPrevMonthText = vsPrevMonth === 0 ? '持平' : 
            (vsPrevMonth > 0 ? `+${vsPrevMonth}%` : `${vsPrevMonth}%`);
          const vsPrevMonthColor = vsPrevMonth === 0 ? colors.muted :
            (vsPrevMonth > 0 ? colors.accent : colors.positive);
          
          comparisonHtml = `
            <div style="display:flex;justify-content:space-between;gap:16px;color:${colors.muted}">
              <span>上月</span><span>${dataItem.prev_month_used_kwh} kWh</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:16px;color:${colors.muted}">
              <span>变化</span><strong style="color:${vsPrevMonthColor}">${vsPrevMonthText}</strong>
            </div>
          `;
        }
        
        return `
          <div style="min-width:${isMobile ? 148 : 172}px">
            <div style="margin-bottom:7px;font-weight:700;color:${colors.textStrong}">${point.axisValue}</div>
            <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px;color:${colors.muted}">
              <span>总用电</span><strong style="color:${colors.textStrong}">${dataItem.used_kwh} kWh</strong>
            </div>
            ${deviceTooltipRows(dataItem.device_breakdown)}
            ${comparisonHtml}
          </div>
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.month.replace(/^(\d{4})-(\d{2})$/, '$1/$2')),
      axisLabel: {
        rotate: 0,
        interval: createSparseCategoryInterval(data.length, isMobile ? 4 : 6),
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: true,
        margin: isMobile ? 9 : 11,
        color: colors.muted,
        fontFamily: 'inherit',
        fontSize: isMobile ? 10 : 11,
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
        fontSize: isMobile ? 9 : 11
      },
      axisLabel: {
        color: colors.muted,
        fontFamily: 'inherit',
        fontSize: isMobile ? 9 : 11
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
    legend: {
      data: ['总用电', '空调', '热水器', '其他'],
      top: 0,
      itemWidth: 10,
      itemHeight: 6,
      itemGap: isMobile ? 10 : 16,
      icon: 'roundRect',
      textStyle: { color: colors.muted, fontFamily: 'inherit', fontSize: isMobile ? 10 : 11 }
    },
    series: [
      {
        name: '空调', type: 'bar', stack: 'devices', barMaxWidth: isMobile ? 12 : 18,
        data: data.map(item => normalizeDeviceBreakdown(item.device_breakdown).air_conditioner_kwh),
        itemStyle: { color: deviceSeriesColors.airConditioner, opacity: 0.82 }
      },
      {
        name: '热水器', type: 'bar', stack: 'devices', barMaxWidth: isMobile ? 12 : 18,
        data: data.map(item => normalizeDeviceBreakdown(item.device_breakdown).water_heater_kwh),
        itemStyle: { color: deviceSeriesColors.waterHeater, opacity: 0.82 }
      },
      {
        name: '其他', type: 'bar', stack: 'devices', barMaxWidth: isMobile ? 12 : 18,
        data: data.map(item => normalizeDeviceBreakdown(item.device_breakdown).other_kwh),
        itemStyle: { color: deviceSeriesColors.other, opacity: 0.78, borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '总用电', type: 'line', data: data.map(item => item.used_kwh), smooth: true,
        symbol: 'none', z: 5,
        lineStyle: { color: colors.series, width: isMobile ? 2 : 2.25 },
        itemStyle: { color: colors.series, borderColor: colors.pointBorder, borderWidth: 1 }
      }
    ],
    grid: {
      left: isMobile ? 42 : 54,
      right: isMobile ? 12 : 20,
      bottom: isMobile ? 28 : 34,
      top: 38,
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
      <ChartCardHeader
        title="12个月趋势"
        description="月度用电对比"
        value={`本月 ${currentMonthUsage.toFixed(1)} kWh`}
      />
      <Chart
        ariaLabel="最近 12 个月用电趋势图"
        summary={`图表包含 ${data.length} 个月数据，本月用电 ${currentMonthUsage.toFixed(1)} kWh。`}
        option={chartOption} 
        style={{ height: isMobile ? '230px' : '300px' }}
        className="chart-container"
        notMerge={false}
        lazyUpdate={true}
      />
    </div>
  );
};

export default React.memo(MonthlyTrend);

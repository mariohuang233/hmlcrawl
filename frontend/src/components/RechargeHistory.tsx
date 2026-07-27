import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchAPI, retryRequest, formatErrorMessage, RechargeHistoryData } from '../utils/api';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface RechargeHistoryProps {
  isMobile?: boolean;
  refreshKey?: number;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const formatDuration = (durationMs: number, compact = false) => {
  const totalMinutes = Math.max(1, Math.round(durationMs / MINUTE_MS));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return compact || hours === 0 ? `${days}天` : `${days}天${hours}小时`;
  }
  if (hours > 0) {
    return compact || minutes === 0 ? `${hours}小时` : `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
};

const RechargeHistory: React.FC<RechargeHistoryProps> = ({ isMobile = false, refreshKey = 0 }) => {
  const [data, setData] = useState<RechargeHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { elementRef, hasTriggered } = useIntersectionObserver({
    threshold: 0.01,
    rootMargin: '50px'
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await retryRequest(() =>
        fetchAPI<{ success: boolean; data: RechargeHistoryData }>('/api/recharge-history?limit=50')
      , 2, 500);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setData({ total: 0, totalRechargeKwh: 0, records: [] });
      }
      setError(null);
    } catch (err) {
      setError(formatErrorMessage(err));
      console.error('Error fetching recharge history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric'
    });
  };

  const getAmountColor = (amount: number) => {
    if (amount >= 50) return '#10b981';
    if (amount >= 20) return '#0ea5e9';
    return '#8b5cf6';
  };

  const records = useMemo(() => {
    if (!data) return [];
    return [...data.records].sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );
  }, [data]);

  const cadence = useMemo(() => {
    if (records.length < 2) return null;

    const intervals = records
      .map((record, index) => {
        if (record.intervalSincePreviousMs !== undefined) {
          return record.intervalSincePreviousMs;
        }
        const previousRecharge = records[index + 1];
        return previousRecharge
          ? new Date(record.time).getTime() - new Date(previousRecharge.time).getTime()
          : null;
      })
      .filter((interval): interval is number => (
        interval !== null && Number.isFinite(interval) && interval > 0
      ))
      .sort((a, b) => a - b);

    if (intervals.length === 0) return null;

    const middle = Math.floor(intervals.length / 2);
    const medianInterval = intervals.length % 2 === 0
      ? (intervals[middle - 1] + intervals[middle]) / 2
      : intervals[middle];
    const latestRechargeAt = new Date(records[0].time).getTime();
    const expectedNextAt = latestRechargeAt + medianInterval;
    const remainingMs = expectedNextAt - Date.now();

    return {
      medianInterval,
      typicalText: formatDuration(medianInterval, true),
      nextText: remainingMs >= 0
        ? `${formatDate(new Date(expectedNextAt).toISOString())}左右`
        : `已超${formatDuration(Math.abs(remainingMs), true)}`
    };
  }, [records]);

  const getCycleInfo = (index: number) => {
    const record = records[index];
    const previousRecharge = records[index + 1];

    if (!record) {
      return {
        intervalText: '暂无周期数据',
        dailyUsageText: null
      };
    }

    const intervalMs = record.intervalSincePreviousMs ?? (
      previousRecharge
        ? new Date(record.time).getTime() - new Date(previousRecharge.time).getTime()
        : null
    );
    if (intervalMs === null) {
      return {
        intervalText: '首次充值记录',
        dailyUsageText: null
      };
    }

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return {
        intervalText: '间隔数据异常',
        dailyUsageText: null
      };
    }

    const consumedKwh = record.cycleConsumedKwh ?? (
      previousRecharge ? Math.max(0, previousRecharge.afterKwh - record.beforeKwh) : null
    );
    const intervalDays = intervalMs / DAY_MS;
    const dailyUsage = record.cycleDailyUsageKwh ?? (
      intervalDays > 0 && consumedKwh !== null ? consumedKwh / intervalDays : null
    );

    return {
      intervalText: formatDuration(intervalMs),
      dailyUsageText: dailyUsage !== null && Number.isFinite(dailyUsage)
        ? `期间日均 ${dailyUsage.toFixed(2)} kWh`
        : null
    };
  };

  if (error) {
    return (
      <div
        className={`card ${hasTriggered ? 'animate-in' : ''}`}
        ref={elementRef as React.RefObject<HTMLDivElement>}
      >
        <h2 className="card-title">充值记录</h2>
        <div className="recharge-error">
          <strong>加载失败</strong>
          <span>加载失败：{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card ${hasTriggered ? 'animate-in' : ''}`}
      ref={elementRef as React.RefObject<HTMLDivElement>}
    >
      <h2 className="card-title">充值记录</h2>

      {loading ? (
        <div className="recharge-loading">
          <div className="skeleton skeleton-line"></div>
          <div className="skeleton skeleton-line short"></div>
        </div>
      ) : data && data.records.length > 0 ? (
        <>
          <div className="recharge-summary">
            <div className="recharge-summary-item">
              <div className="summary-code">次数</div>
              <div className="summary-content">
                <div className="summary-value">{data.total}</div>
                <div className="summary-label">累计充值次数</div>
              </div>
            </div>
            <div className="recharge-summary-item">
              <div className="summary-code">电量</div>
              <div className="summary-content">
                <div className="summary-value">
                  {data.totalRechargeKwh.toFixed(1)}
                  <span className="summary-unit">kWh</span>
                </div>
                <div className="summary-label">累计充值电量</div>
              </div>
            </div>
            <div className="recharge-summary-item">
              <div className="summary-code">间隔</div>
              <div className="summary-content">
                <div className="summary-value">{cadence?.typicalText ?? '—'}</div>
                <div className="summary-label">
                  {cadence ? '典型充值间隔 · 中位数' : '记录不足，继续积累'}
                </div>
              </div>
            </div>
            <div className="recharge-summary-item">
              <div className="summary-code">预计</div>
              <div className="summary-content">
                <div className={`summary-value ${cadence ? 'recent' : ''}`}>
                  {cadence?.nextText ?? '—'}
                </div>
                <div className="summary-label">
                  {cadence ? '按历史充值节奏估算' : '至少需要两次充值'}
                </div>
              </div>
            </div>
          </div>

          <div className="recharge-timeline">
            {records.map((record, index) => {
              const cycleInfo = getCycleInfo(index);
              return (
                <div
                  key={`${record.time}-${index}`}
                  className="timeline-item"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="timeline-dot" style={{ backgroundColor: getAmountColor(record.amountKwh) }}>
                    {index === 0 && <div className="timeline-pulse"></div>}
                  </div>

                  {index < records.length - 1 && (
                    <div className="timeline-line"></div>
                  )}

                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span className="recharge-amount" style={{ color: getAmountColor(record.amountKwh) }}>
                        +{record.amountKwh.toFixed(2)} kWh
                      </span>
                      <span className="recharge-date">
                        {isMobile ? formatDate(record.time) : formatDateTime(record.time)}
                      </span>
                    </div>
                    <div className="timeline-detail">
                      <span className="detail-item">
                        <span className="detail-label">充值前</span>
                        <span className="detail-value">{record.beforeKwh.toFixed(2)} kWh</span>
                      </span>
                      <span className="detail-arrow">→</span>
                      <span className="detail-item">
                        <span className="detail-label">充值后</span>
                        <span className="detail-value after">{record.afterKwh.toFixed(2)} kWh</span>
                      </span>
                    </div>
                    <div className="recharge-cycle">
                      <span className="recharge-cycle-label">距上一次充值</span>
                      <strong className="recharge-cycle-value">{cycleInfo.intervalText}</strong>
                      {cycleInfo.dailyUsageText && (
                        <span className="recharge-cycle-meta">{cycleInfo.dailyUsageText}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {data.records.length >= 50 && (
            <div className="recharge-more-hint">
              显示最近 50 条记录，更多历史数据请联系管理员
            </div>
          )}
        </>
      ) : (
        <div className="recharge-empty">
          <div className="empty-mark">暂无记录</div>
          <div className="empty-text">暂无充值记录</div>
          <div className="empty-subtitle">检测到充值后会自动显示在这里</div>
        </div>
      )}
    </div>
  );
};

export default RechargeHistory;

import React, { useState, useEffect, useCallback } from 'react';
import { fetchAPI, retryRequest, formatErrorMessage, RechargeHistoryData } from '../utils/api';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface RechargeHistoryProps {
  isMobile?: boolean;
  refreshKey?: number;
}

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

  const getRecentRechargeInfo = () => {
    if (!data || data.records.length === 0) return null;
    const latest = data.records[0];
    const now = new Date();
    const rechargeDate = new Date(latest.time);
    const diffDays = Math.floor((now.getTime() - rechargeDate.getTime()) / (1000 * 60 * 60 * 24));
    
    let timeText = '';
    if (diffDays === 0) {
      timeText = '今天';
    } else if (diffDays === 1) {
      timeText = '昨天';
    } else if (diffDays < 7) {
      timeText = `${diffDays}天前`;
    } else {
      timeText = formatDate(latest.time);
    }
    
    return {
      amount: latest.amountKwh,
      timeText,
      date: formatDateTime(latest.time)
    };
  };

  const recentInfo = getRecentRechargeInfo();

  if (error) {
    return (
      <div
        className={`card ${hasTriggered ? 'animate-in' : ''}`}
        ref={elementRef as React.RefObject<HTMLDivElement>}
      >
        <h2 className="card-title">充值记录</h2>
        <div className="recharge-error">
          <span className="error-icon">⚠️</span>
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
              <div className="summary-icon">💰</div>
              <div className="summary-content">
                <div className="summary-value">{data.total}</div>
                <div className="summary-label">累计充值次数</div>
              </div>
            </div>
            <div className="recharge-summary-item">
              <div className="summary-icon">⚡</div>
              <div className="summary-content">
                <div className="summary-value">
                  {data.totalRechargeKwh.toFixed(1)}
                  <span className="summary-unit">kWh</span>
                </div>
                <div className="summary-label">累计充值电量</div>
              </div>
            </div>
            {recentInfo && (
              <div className="recharge-summary-item">
                <div className="summary-icon">📅</div>
                <div className="summary-content">
                  <div className="summary-value recent">
                    {recentInfo.timeText}
                  </div>
                  <div className="summary-label">最近充值</div>
                </div>
              </div>
            )}
          </div>

          <div className="recharge-timeline">
            {data.records.map((record, index) => (
              <div
                key={`${record.time}-${index}`}
                className="timeline-item"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div className="timeline-dot" style={{ backgroundColor: getAmountColor(record.amountKwh) }}>
                  {index === 0 && <div className="timeline-pulse"></div>}
                </div>
                
                {index < data.records.length - 1 && (
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
                </div>
              </div>
            ))}
          </div>

          {data.records.length >= 50 && (
            <div className="recharge-more-hint">
              显示最近 50 条记录，更多历史数据请联系管理员
            </div>
          )}
        </>
      ) : (
        <div className="recharge-empty">
          <div className="empty-icon">📭</div>
          <div className="empty-text">暂无充值记录</div>
          <div className="empty-subtitle">检测到充值后会自动显示在这里</div>
        </div>
      )}
    </div>
  );
};

export default RechargeHistory;

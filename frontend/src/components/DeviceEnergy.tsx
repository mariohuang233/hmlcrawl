import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAPI, formatErrorMessage, retryRequest } from '../utils/api';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface DeviceEnergyItem {
  device_id: string;
  device_name: string;
  today_kwh: number;
  month_kwh: number;
  updated_at: string | null;
  coverage: {
    today_complete: boolean;
    month_complete: boolean;
  };
}

interface DeviceEnergySummary {
  success: boolean;
  configured: boolean;
  updated_at: string | null;
  devices: DeviceEnergyItem[];
  totals: {
    today_kwh: number;
    month_kwh: number;
    monitored_today_kwh: number;
    monitored_month_kwh: number;
    other_today_kwh: number;
    other_month_kwh: number;
    monitored_month_cost: number;
  };
}

interface DeviceEnergyProps {
  refreshKey?: number;
}

const formatKwh = (value: number) => Number.isFinite(value) ? value.toFixed(2) : '0.00';

const DeviceEnergy: React.FC<DeviceEnergyProps> = ({ refreshKey = 0 }) => {
  const [data, setData] = useState<DeviceEnergySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { elementRef, hasTriggered } = useIntersectionObserver({ threshold: 0.01, rootMargin: '160px' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await retryRequest(
        () => fetchAPI<DeviceEnergySummary>('/api/device-energy/summary'),
        2,
        500
      );
      setData(result);
      setError(null);
    } catch (loadError) {
      setError(formatErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const cards = useMemo(() => {
    if (!data) return [];
    const devices = data.devices.map(device => ({
      id: device.device_id,
      name: device.device_name,
      today: device.today_kwh,
      month: device.month_kwh,
      incomplete: !device.coverage.today_complete || !device.coverage.month_complete,
      tone: device.device_id === 'air_conditioner' ? 'cool' : 'warm'
    }));
    if (data.devices.length > 0) {
      devices.push({
        id: 'other',
        name: '其他未监测电器',
        today: data.totals.other_today_kwh,
        month: data.totals.other_month_kwh,
        incomplete: false,
        tone: 'neutral'
      });
    }
    return devices;
  }, [data]);

  const updatedLabel = data?.updated_at
    ? new Date(data.updated_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <section
      className={`card device-energy-card ${hasTriggered ? 'animate-in' : ''}`}
      ref={elementRef as React.RefObject<HTMLElement>}
      aria-labelledby="device-energy-title"
    >
      <div className="device-energy-heading">
        <div>
          <div className="device-energy-kicker">米家设备</div>
          <h2 id="device-energy-title" className="card-title">设备用电</h2>
        </div>
        {updatedLabel && <span className="device-energy-updated">更新于 {updatedLabel}</span>}
      </div>

      {loading ? (
        <div className="device-energy-grid" aria-label="设备用电加载中">
          {[0, 1, 2].map(item => <div className="device-energy-skeleton skeleton" key={item}></div>)}
        </div>
      ) : error ? (
        <div className="device-energy-state is-error">
          <strong>设备用电暂时无法加载</strong>
          <span>{error}</span>
        </div>
      ) : !data?.configured ? (
        <div className="device-energy-state">
          <strong>等待连接米家设备</strong>
          <span>完成一次米家连接后，这里会自动显示空调与热水器的用电量。</span>
        </div>
      ) : cards.length === 0 ? (
        <div className="device-energy-state">
          <strong>已连接，正在积累首批数据</strong>
          <span>后台正在同步米家日用电记录，请稍后刷新。</span>
        </div>
      ) : (
        <>
          <div className="device-energy-grid">
            {cards.map(card => (
              <article className={`device-energy-item tone-${card.tone}`} key={card.id}>
                <div className="device-energy-name-row">
                  <span className="device-energy-dot" aria-hidden="true"></span>
                  <h3>{card.name}</h3>
                  {card.incomplete && <span className="device-energy-partial">数据积累中</span>}
                </div>
                <div className="device-energy-primary">
                  <strong>{formatKwh(card.month)}</strong>
                  <span>kWh</span>
                </div>
                <div className="device-energy-period">本月用电</div>
                <div className="device-energy-today">
                  <span>今日</span>
                  <strong>{formatKwh(card.today)} kWh</strong>
                </div>
              </article>
            ))}
          </div>
          <p className="device-energy-note">
            “其他未监测电器”由全屋总表减去空调和热水器得出，受采样时间差影响，仅作参考。
          </p>
        </>
      )}
    </section>
  );
};

export default DeviceEnergy;

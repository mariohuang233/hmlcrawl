export interface DeviceBreakdown {
  air_conditioner_kwh: number;
  water_heater_kwh: number;
  other_kwh: number;
  available?: boolean;
}

export const emptyDeviceBreakdown: DeviceBreakdown = {
  air_conditioner_kwh: 0,
  water_heater_kwh: 0,
  other_kwh: 0,
  available: false
};

export function normalizeDeviceBreakdown(value?: Partial<DeviceBreakdown> | null): DeviceBreakdown {
  return {
    air_conditioner_kwh: Number(value?.air_conditioner_kwh) || 0,
    water_heater_kwh: Number(value?.water_heater_kwh) || 0,
    other_kwh: Number(value?.other_kwh) || 0,
    available: value?.available !== false && value != null
  };
}

export const deviceSeriesColors = {
  airConditioner: '#32ade6',
  waterHeater: '#ff9f0a',
  other: '#c7c7cc'
};

export function deviceTooltipRows(value?: Partial<DeviceBreakdown> | null) {
  const item = normalizeDeviceBreakdown(value);
  if (!item.available) {
    return '<div style="color:#8e8e93">米家设备数据待重新同步</div>';
  }
  return `
    <div style="display:flex;justify-content:space-between;gap:16px;color:#32ade6"><span>空调</span><strong>${item.air_conditioner_kwh.toFixed(2)} kWh</strong></div>
    <div style="display:flex;justify-content:space-between;gap:16px;color:#ff9f0a"><span>热水器</span><strong>${item.water_heater_kwh.toFixed(2)} kWh</strong></div>
    <div style="display:flex;justify-content:space-between;gap:16px;color:#8e8e93"><span>其他</span><strong>${item.other_kwh.toFixed(2)} kWh</strong></div>
  `;
}

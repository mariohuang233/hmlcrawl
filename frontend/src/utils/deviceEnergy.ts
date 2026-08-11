export interface DeviceBreakdown {
  air_conditioner_kwh: number;
  water_heater_kwh: number;
  other_kwh: number;
}

export const emptyDeviceBreakdown: DeviceBreakdown = {
  air_conditioner_kwh: 0,
  water_heater_kwh: 0,
  other_kwh: 0
};

export function normalizeDeviceBreakdown(value?: Partial<DeviceBreakdown> | null): DeviceBreakdown {
  return {
    air_conditioner_kwh: Number(value?.air_conditioner_kwh) || 0,
    water_heater_kwh: Number(value?.water_heater_kwh) || 0,
    other_kwh: Number(value?.other_kwh) || 0
  };
}

export const deviceSeriesColors = {
  airConditioner: '#3b82f6',
  waterHeater: '#f59e0b',
  other: '#94a3b8'
};

export function deviceTooltipRows(value?: Partial<DeviceBreakdown> | null) {
  const item = normalizeDeviceBreakdown(value);
  return `
    <div style="display:flex;justify-content:space-between;gap:16px;color:#3b82f6"><span>空调</span><strong>${item.air_conditioner_kwh.toFixed(2)} kWh</strong></div>
    <div style="display:flex;justify-content:space-between;gap:16px;color:#f59e0b"><span>热水器</span><strong>${item.water_heater_kwh.toFixed(2)} kWh</strong></div>
    <div style="display:flex;justify-content:space-between;gap:16px;color:#94a3b8"><span>其他</span><strong>${item.other_kwh.toFixed(2)} kWh</strong></div>
  `;
}

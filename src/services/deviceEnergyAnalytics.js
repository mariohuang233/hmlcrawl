const DeviceEnergyReading = require('../models/DeviceEnergyReading');
const { roundKwh } = require('./deviceEnergy');

const DEVICE_KEYS = {
  air_conditioner: 'air_conditioner_kwh',
  water_heater: 'water_heater_kwh'
};

function beijingDateKey(date) {
  return new Date(new Date(date).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function monthKey(dateKey) {
  return String(dateKey).slice(0, 7);
}

function emptyBreakdown() {
  return { air_conditioner_kwh: 0, water_heater_kwh: 0, other_kwh: 0 };
}

async function getDeviceDailyMap(start, end) {
  const rows = await DeviceEnergyReading.find({
    reading_type: 'daily',
    device_id: { $in: Object.keys(DEVICE_KEYS) },
    collected_at: { $gte: start, $lte: end }
  }).select('device_id energy_kwh collected_at').lean();
  const map = new Map();
  for (const row of rows) {
    const key = beijingDateKey(row.collected_at);
    const value = map.get(key) || emptyBreakdown();
    value[DEVICE_KEYS[row.device_id]] = roundKwh(Number(row.energy_kwh || 0));
    map.set(key, value);
  }
  return map;
}

function withOther(breakdown, totalUsage) {
  const result = { ...emptyBreakdown(), ...(breakdown || {}) };
  result.air_conditioner_kwh = roundKwh(result.air_conditioner_kwh);
  result.water_heater_kwh = roundKwh(result.water_heater_kwh);
  result.other_kwh = roundKwh(Math.max(
    0,
    Number(totalUsage || 0) - result.air_conditioner_kwh - result.water_heater_kwh
  ));
  return result;
}

async function getDevicePeriodBreakdown(start, end, totalUsage) {
  const map = await getDeviceDailyMap(start, end);
  const totals = emptyBreakdown();
  for (const value of map.values()) {
    totals.air_conditioner_kwh += value.air_conditioner_kwh;
    totals.water_heater_kwh += value.water_heater_kwh;
  }
  return withOther(totals, totalUsage);
}

async function getDeviceMonthlyMap(start, end) {
  const daily = await getDeviceDailyMap(start, end);
  const monthly = new Map();
  for (const [date, value] of daily) {
    const key = monthKey(date);
    const total = monthly.get(key) || emptyBreakdown();
    total.air_conditioner_kwh += value.air_conditioner_kwh;
    total.water_heater_kwh += value.water_heater_kwh;
    monthly.set(key, total);
  }
  return monthly;
}

module.exports = {
  beijingDateKey,
  withOther,
  getDeviceDailyMap,
  getDeviceMonthlyMap,
  getDevicePeriodBreakdown
};

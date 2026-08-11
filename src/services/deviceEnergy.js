const DeviceEnergyReading = require('../models/DeviceEnergyReading');

function roundKwh(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function calculateCumulativeUsage(readings, hasBaseline = false) {
  if (!Array.isArray(readings) || readings.length < 2) {
    return {
      usageKwh: 0,
      dataPoints: Array.isArray(readings) ? readings.length : 0,
      resetCount: 0,
      complete: false
    };
  }

  const sorted = [...readings].sort(
    (a, b) => new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime()
  );
  let usage = 0;
  let resetCount = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = Number(sorted[index - 1].energy_kwh);
    const current = Number(sorted[index].energy_kwh);
    if (!Number.isFinite(previous) || !Number.isFinite(current) || previous < 0 || current < 0) continue;

    if (current >= previous) {
      usage += current - previous;
    } else {
      // 累计传感器清零或设备重新配网后，从新的零点继续累计。
      usage += current;
      resetCount += 1;
    }
  }

  return {
    usageKwh: roundKwh(usage),
    dataPoints: sorted.length,
    resetCount,
    complete: Boolean(hasBaseline)
  };
}

async function getDevicePeriodUsage(deviceId, startDate, endDate) {
  const { baseline, readings } = await DeviceEnergyReading.getPeriodReadings(deviceId, startDate, endDate);
  return calculateCumulativeUsage(readings, Boolean(baseline));
}

async function getDeviceDailyUsage(deviceId, startDate, endDate) {
  const readings = await DeviceEnergyReading.find({
    device_id: deviceId,
    reading_type: 'daily',
    collected_at: { $gte: startDate, $lte: endDate }
  }).sort({ collected_at: 1 }).lean();
  return {
    usageKwh: roundKwh(readings.reduce((sum, item) => sum + Number(item.energy_kwh || 0), 0)),
    dataPoints: readings.length,
    resetCount: 0,
    complete: readings.length > 0
  };
}

async function getDeviceDailyPeriods(deviceId, todayStart, monthStart, endDate) {
  const readings = await DeviceEnergyReading.find({
    device_id: deviceId,
    reading_type: 'daily',
    collected_at: { $gte: monthStart, $lte: endDate }
  }).select('energy_kwh collected_at').sort({ collected_at: 1 }).lean();
  const summarize = rows => ({
    usageKwh: roundKwh(rows.reduce((sum, item) => sum + Number(item.energy_kwh || 0), 0)),
    dataPoints: rows.length,
    resetCount: 0,
    complete: rows.length > 0
  });
  return {
    today: summarize(readings.filter(item => item.collected_at >= todayStart)),
    month: summarize(readings)
  };
}

module.exports = {
  roundKwh,
  calculateCumulativeUsage,
  getDevicePeriodUsage,
  getDeviceDailyUsage,
  getDeviceDailyPeriods
};

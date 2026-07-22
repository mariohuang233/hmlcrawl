const AlertState = require('../models/AlertState');
const CrawlerLog = require('../models/CrawlerLog');
const alerter = require('../utils/alerter');
const logger = require('../utils/logger');
const {
  getConfig,
  normalizeSource,
  isFreshReading
} = require('./batteryAlertPolicy');

const ALERT_STATE_ID = 'low-battery';
const LOCK_DURATION_MS = 60 * 1000;

async function addLog({ source, action, level = 'info', message, data }) {
  try {
    await CrawlerLog.addLog({
      timestamp: new Date(),
      source: normalizeSource(source),
      action,
      level,
      message,
      data
    });
  } catch (error) {
    logger.warn(`写入爬虫结构化日志失败: ${error.message}`);
  }
}

async function recordReading({ remainingKwh, source, meterId, collectedAt, ingestion = 'api' }) {
  return addLog({
    source,
    action: 'reading_received',
    message: `收到电量读数: ${remainingKwh} kWh`,
    data: {
      remaining_kwh: remainingKwh,
      meter_id: meterId,
      collected_at: collectedAt,
      ingestion
    }
  });
}

async function processReading({ remainingKwh, source, meterId, collectedAt = new Date(), ingestion = 'crawler' }) {
  const value = Number(remainingKwh);
  if (!Number.isFinite(value) || value <= 0) {
    return { status: 'invalid' };
  }

  const normalizedSource = normalizeSource(source);
  const config = getConfig();
  await recordReading({ remainingKwh: value, source: normalizedSource, meterId, collectedAt, ingestion });

  if (value > config.threshold) {
    return { status: 'above_threshold', threshold: config.threshold };
  }

  if (!isFreshReading(collectedAt, config.maxDataAgeMinutes)) {
    await addLog({
      source: normalizedSource,
      action: 'battery_alert_skipped',
      level: 'warn',
      message: `低电量读数已过期，跳过通知: ${value} kWh`,
      data: { remaining_kwh: value, collected_at: collectedAt, reason: 'stale' }
    });
    return { status: 'stale', threshold: config.threshold };
  }

  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - config.cooldownHours * 60 * 60 * 1000);
  await AlertState.updateOne(
    { _id: ALERT_STATE_ID },
    { $setOnInsert: { last_sent_at: null, locked_until: null } },
    { upsert: true }
  );

  const lock = await AlertState.findOneAndUpdate(
    {
      _id: ALERT_STATE_ID,
      $and: [
        { $or: [{ last_sent_at: null }, { last_sent_at: { $lte: cooldownCutoff } }] },
        { $or: [{ locked_until: null }, { locked_until: { $lte: now } }] }
      ]
    },
    {
      $set: {
        locked_until: new Date(now.getTime() + LOCK_DURATION_MS),
        last_value: value,
        last_source: normalizedSource,
        last_error: null
      }
    },
    { new: true }
  );

  if (!lock) {
    await addLog({
      source: normalizedSource,
      action: 'battery_alert_skipped',
      message: `低电量通知处于冷却或发送中: ${value} kWh`,
      data: { remaining_kwh: value, reason: 'cooldown_or_locked' }
    });
    return { status: 'cooldown', threshold: config.threshold };
  }

  try {
    const sent = await alerter.alertLowBattery(value, config.threshold, {
      source: normalizedSource,
      meter_id: meterId,
      collected_at: collectedAt
    });

    if (!sent) {
      throw new Error('通知通道返回发送失败');
    }

    await AlertState.updateOne(
      { _id: ALERT_STATE_ID },
      { $set: { last_sent_at: now, locked_until: null, last_error: null } }
    );
    await addLog({
      source: normalizedSource,
      action: 'battery_alert',
      message: `低电量通知已发送: ${value} kWh`,
      data: { remaining_kwh: value, threshold: config.threshold, status: 'sent' }
    });
    return { status: 'sent', threshold: config.threshold };
  } catch (error) {
    await AlertState.updateOne(
      { _id: ALERT_STATE_ID },
      { $set: { locked_until: null, last_error: error.message } }
    );
    await addLog({
      source: normalizedSource,
      action: 'battery_alert_failed',
      level: 'error',
      message: `低电量通知发送失败: ${error.message}`,
      data: { remaining_kwh: value, threshold: config.threshold, status: 'failed' }
    });
    return { status: 'failed', threshold: config.threshold, error: error.message };
  }
}

module.exports = {
  recordReading,
  processReading
};

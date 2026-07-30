const crypto = require('crypto');
const ReportDelivery = require('../models/ReportDelivery');

const DEFAULT_LOCK_MS = 2 * 60 * 1000;

function buildDeliveryId(reportType, meterId, periodKey) {
  return `${reportType}:${meterId}:${periodKey}`;
}

async function acquireDelivery({
  reportType,
  meterId,
  periodKey,
  lockMs = DEFAULT_LOCK_MS
}) {
  const deliveryId = buildDeliveryId(reportType, meterId, periodKey);
  const now = new Date();
  const lockToken = crypto.randomUUID();

  try {
    await ReportDelivery.updateOne(
      { _id: deliveryId },
      {
        $setOnInsert: {
          report_type: reportType,
          meter_id: meterId,
          period_key: periodKey,
          status: 'pending',
          attempt_count: 0
        }
      },
      { upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const delivery = await ReportDelivery.findOneAndUpdate(
    {
      _id: deliveryId,
      status: { $ne: 'sent' },
      $or: [
        { locked_until: null },
        { locked_until: { $exists: false } },
        { locked_until: { $lte: now } }
      ]
    },
    {
      $set: {
        status: 'sending',
        lock_token: lockToken,
        locked_until: new Date(now.getTime() + lockMs),
        last_error: null
      },
      $inc: { attempt_count: 1 }
    },
    { new: true }
  ).lean();

  return delivery ? { deliveryId, lockToken, delivery } : null;
}

async function markDeliverySent(lock, providerMessageId = null) {
  if (!lock) return false;
  const result = await ReportDelivery.updateOne(
    { _id: lock.deliveryId, lock_token: lock.lockToken },
    {
      $set: {
        status: 'sent',
        sent_at: new Date(),
        provider_message_id: providerMessageId,
        locked_until: null,
        lock_token: null,
        last_error: null
      }
    }
  );
  return result.modifiedCount === 1;
}

async function markDeliveryFailed(lock, error) {
  if (!lock) return false;
  const message = error instanceof Error ? error.message : String(error);
  const result = await ReportDelivery.updateOne(
    { _id: lock.deliveryId, lock_token: lock.lockToken },
    {
      $set: {
        status: 'failed',
        locked_until: null,
        lock_token: null,
        last_error: message.substring(0, 1000)
      }
    }
  );
  return result.modifiedCount === 1;
}

function getDelivery(reportType, meterId, periodKey) {
  return ReportDelivery.findById(
    buildDeliveryId(reportType, meterId, periodKey)
  ).lean();
}

module.exports = {
  buildDeliveryId,
  acquireDelivery,
  markDeliverySent,
  markDeliveryFailed,
  getDelivery
};

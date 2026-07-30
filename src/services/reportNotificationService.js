const { sendServerChan } = require('../utils/alerter');
const { crawlerLogger } = require('../utils/logger');
const {
  acquireDelivery,
  markDeliverySent,
  markDeliveryFailed
} = require('./reportDeliveryService');

const FALLBACK_ALERTS = new Set();

class ReportDataError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ReportDataError';
    this.details = details;
  }
}

async function sendDataAnomalyAlertOnce({
  reportType,
  meterId,
  periodKey,
  error
}) {
  const alertPeriodKey = `${reportType}-data-${periodKey}`;
  let alertLock;
  const details = error.details || {};
  const title = `⚠️ ${reportType}报告数据异常`;
  const message = [
    `报告类型：${reportType}`,
    `统计周期：${periodKey}`,
    `电表：${meterId}`,
    `异常原因：${error.message}`,
    details.dataPoints !== undefined ? `采样数量：${details.dataPoints}` : null,
    details.latestCollectedAt
      ? `最后采集：${new Date(details.latestCollectedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      : null,
    '',
    '本次仅发送数据异常告警，不会将业务报告标记为已发送；数据恢复后系统仍会继续补发。'
  ].filter(Boolean).join('\n');

  try {
    alertLock = await acquireDelivery({
      reportType: 'system_alert',
      meterId,
      periodKey: alertPeriodKey
    });
    if (!alertLock) return false;

    const sent = await sendServerChan(title, message);
    if (!sent) {
      throw new Error('数据异常告警发送失败');
    }
    await markDeliverySent(alertLock);
    return true;
  } catch (alertError) {
    if (alertLock) {
      try {
        await markDeliveryFailed(alertLock, alertError);
      } catch (stateError) {
        crawlerLogger.error(`记录数据异常告警失败状态时出错: ${stateError.message}`);
      }
    } else if (!FALLBACK_ALERTS.has(alertPeriodKey)) {
      // MongoDB 故障时无法使用数据库幂等键，退化为单进程一次性告警。
      FALLBACK_ALERTS.add(alertPeriodKey);
      const sent = await sendServerChan(title, message);
      if (sent) {
        crawlerLogger.warn(`${reportType}数据异常告警已通过无数据库降级路径发送`);
        return true;
      }
    }
    crawlerLogger.error(`发送${reportType}数据异常告警失败: ${alertError.message}`);
    return false;
  }
}

async function deliverReport({
  reportType,
  meterId,
  periodKey,
  buildReport
}) {
  let lock;
  try {
    lock = await acquireDelivery({ reportType, meterId, periodKey });
  } catch (error) {
    const stateError = new ReportDataError(
      `报告投递状态数据库不可用：${error.message}`
    );
    crawlerLogger.error(`${reportType}报告无法取得幂等锁: ${error.message}`);
    await sendDataAnomalyAlertOnce({
      reportType,
      meterId,
      periodKey,
      error: stateError
    });
    return { sent: false, status: 'data_error', error: stateError.message };
  }
  if (!lock) {
    crawlerLogger.info(`${reportType}报告 ${periodKey} 已发送或正在发送，跳过`);
    return { sent: false, status: 'duplicate_or_locked' };
  }

  try {
    const report = await buildReport();
    const sent = await sendServerChan(report.title, report.message);
    if (!sent) {
      throw new Error('通知通道返回发送失败');
    }

    await markDeliverySent(lock);
    crawlerLogger.info(`${reportType}报告 ${periodKey} 发送成功`);
    return { sent: true, status: 'sent', report };
  } catch (error) {
    try {
      await markDeliveryFailed(lock, error);
    } catch (stateError) {
      crawlerLogger.error(`记录${reportType}报告失败状态时出错: ${stateError.message}`);
    }
    crawlerLogger.error(`${reportType}报告 ${periodKey} 发送失败: ${error.message}`);

    if (error instanceof ReportDataError) {
      await sendDataAnomalyAlertOnce({
        reportType,
        meterId,
        periodKey,
        error
      });
      return { sent: false, status: 'data_error', error: error.message };
    }

    return { sent: false, status: 'failed', error: error.message };
  }
}

module.exports = {
  ReportDataError,
  sendDataAnomalyAlertOnce,
  deliverReport
};

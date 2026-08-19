const cron = require('node-cron');
const DeviceEnergyReading = require('../models/DeviceEnergyReading');
const logger = require('../utils/logger');
const xiaomiCloudAuthStore = require('./xiaomiCloudAuthStore');
const { LegacySession } = require('./xiaomiHistoryProbe');
const dataEvents = require('./dataEvents');
const { sendServerChan } = require('../utils/alerter');
const {
  signingSecret: xiaomiReauthSigningSecret,
  issueAccessToken: issueXiaomiReauthAccessToken,
  publicBaseUrl: xiaomiReauthPublicBaseUrl
} = require('./xiaomiReauthAccess');

const DEVICE_IDS = {
  'lumi.acpartner.mcn02': { id: 'air_conditioner', name: '空调' },
  'cuco.plug.v3': { id: 'water_heater', name: '热水器' }
};

class XiaomiEnergySync {
  constructor() {
    this.task = null;
    this.running = false;
  }

  async isConfigured() {
    return Boolean(await xiaomiCloudAuthStore.status());
  }

  async sync({ forceDays } = {}) {
    if (this.running) return [];
    this.running = true;
    try {
      const auth = await xiaomiCloudAuthStore.load();
      if (!auth) return [];
      const credentialStatus = await xiaomiCloudAuthStore.status();
      const days = forceDays || (credentialStatus?.backfill_completed_at ? 32 : 370);
      const session = LegacySession.fromAuth(auth);
      const result = await session.readEnergy({ days });
      const operations = [];
      for (const reading of result.readings) {
        const identity = DEVICE_IDS[reading.model];
        if (!identity) continue;
        for (const candidate of reading.candidates) {
          if (!Number.isFinite(candidate.kwh) || !Number.isFinite(Number(candidate.time))) continue;
          const collectedAt = new Date(Number(candidate.time) * 1000);
          operations.push({
            updateOne: {
              filter: { device_id: identity.id, collected_at: collectedAt },
              update: {
                $set: {
                  device_name: identity.name,
                  entity_id: reading.model,
                  energy_kwh: candidate.kwh,
                  source: 'xiaomi-cloud',
                  reading_type: 'daily'
                },
                $setOnInsert: {
                  device_id: identity.id,
                  collected_at: collectedAt
                }
              },
              upsert: true
            }
          });
        }
      }
      if (operations.length) {
        await DeviceEnergyReading.bulkWrite(operations, { ordered: false });
        dataEvents.emit('device-energy:stored', { source: 'xiaomi-cloud', count: operations.length });
      }
      await xiaomiCloudAuthStore.updateStatus({ success: true, backfill: days >= 370 });
      session.destroy();
      logger.info(`米家设备用电同步完成：写入或更新 ${operations.length} 条日统计${days >= 370 ? '，已完成近 12 个月回填' : ''}`);
      return result.readings;
    } catch (error) {
      if (error.kind === 'credentials') {
        await xiaomiCloudAuthStore.markReauthRequired(error.message).catch(() => {});
        const shouldAlert = await xiaomiCloudAuthStore.claimReauthAlert().catch(() => false);
        if (shouldAlert) {
          const baseUrl = xiaomiReauthPublicBaseUrl();
          const secret = xiaomiReauthSigningSecret();
          const reauthUrl = baseUrl && secret
            ? `${baseUrl}/api/xiaomi/history-probe?access=${encodeURIComponent(issueXiaomiReauthAccessToken(secret))}`
            : null;
          const action = reauthUrl
            ? `请在 2 小时内通过下面的安全链接重新连接；开始登录后，请在 15 分钟内完成验证码：\n\n[打开米家授权页面](${reauthUrl})`
            : '请在运行本项目的电脑上打开 /api/xiaomi/history-probe，重新连接米家账号。';
          sendServerChan(
            '米家授权已过期',
            `空调和热水器的今日用电已停止同步，历史数据仍被保留，页面不会再用 0 冒充缺失值。\n\n${action}`
          ).catch(alertError => logger.warn(`米家重新授权提醒发送失败：${alertError.message}`));
        }
      } else {
        await xiaomiCloudAuthStore.updateStatus({ success: false, error: error.message }).catch(() => {});
      }
      throw error;
    } finally {
      this.running = false;
    }
  }

  start() {
    const schedule = process.env.XIAOMI_ENERGY_SYNC_CRON || '*/15 * * * *';
    if (!cron.validate(schedule)) throw new Error(`XIAOMI_ENERGY_SYNC_CRON 无效：${schedule}`);
    this.sync().catch(error => logger.warn(`米家设备首次同步失败：${error.message}`));
    this.task = cron.schedule(schedule, () => {
      this.sync().catch(error => logger.warn(`米家设备用电同步失败：${error.message}`));
    }, { timezone: 'Asia/Shanghai' });
    logger.info(`米家设备用电同步已启动（${schedule}）`);
  }

  stop() {
    this.task?.stop();
    this.task = null;
  }
}

module.exports = new XiaomiEnergySync();
module.exports.XiaomiEnergySync = XiaomiEnergySync;

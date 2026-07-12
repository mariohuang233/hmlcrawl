const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Usage = require('../models/Usage');
const { crawlerLogger } = require('../utils/logger');
const {
  toBeijingTime,
  getBeijingTodayStart,
  getBeijingTodayEnd,
  formatBeijingTime,
  getBeijingHour,
  getBeijingMinute
} = require('../utils/timezone');
const { sendServerChan } = require('../utils/alerter');

const CONFIG = {
  reportHour: 23,
  reportMinute: 59,
  cooldownHours: 23,
  // 启动后若已过当天报告时间且未发送，在此宽限窗口内(分钟)补发
  startupGraceMinutes: 30,
  // 备份检测间隔(分钟)：用 setInterval 兜底，防止 setTimeout 因容器重启而错过
  backupCheckMinutes: 5,
  stateFilePath: path.join(__dirname, '../../.daily_report_state.json')
};

let lastReportDate = null;
let timer = null;
let backupInterval = null;
let sending = false; // 防止并发发送

function ensureStateFile() {
  try {
    if (!fs.existsSync(path.dirname(CONFIG.stateFilePath))) {
      fs.mkdirSync(path.dirname(CONFIG.stateFilePath), { recursive: true });
    }
    if (!fs.existsSync(CONFIG.stateFilePath)) {
      fs.writeFileSync(CONFIG.stateFilePath, JSON.stringify({ lastReportDate: null }, null, 2));
    }
  } catch (err) {
    crawlerLogger.warn(`无法创建状态文件: ${err.message}`);
  }
}

function loadLastReportDate() {
  try {
    ensureStateFile();
    const content = fs.readFileSync(CONFIG.stateFilePath, 'utf8');
    const state = JSON.parse(content);
    lastReportDate = state.lastReportDate;
    if (lastReportDate) {
      crawlerLogger.info(`加载上次报告日期: ${lastReportDate}`);
    }
  } catch (err) {
    crawlerLogger.warn(`加载状态文件失败: ${err.message}`);
    lastReportDate = null;
  }
}

function saveLastReportDate(dateStr) {
  try {
    ensureStateFile();
    fs.writeFileSync(CONFIG.stateFilePath, JSON.stringify({ lastReportDate: dateStr }, null, 2));
    crawlerLogger.info(`保存报告日期: ${dateStr}`);
  } catch (err) {
    crawlerLogger.warn(`保存状态文件失败: ${err.message}`);
  }
}

function calculateRemainingDuration(remainingKwh, dailyUsage) {
  if (dailyUsage <= 0) {
    return { hours: null, days: null, text: '数据不足' };
  }
  const hours = remainingKwh / (dailyUsage / 24);
  const days = hours / 24;
  let text = '';
  if (days >= 1) {
    const remainingHours = Math.round((days - Math.floor(days)) * 24);
    text = remainingHours > 0 ? `${Math.floor(days)}天${remainingHours}小时` : `${Math.floor(days)}天`;
  } else {
    text = `${Math.round(hours)}小时`;
  }
  return { hours: Math.round(hours * 10) / 10, days: Math.round(days * 100) / 100, text };
}

async function fetchDailyData(meterId) {
  try {
    const now = new Date();
    const todayStart = getBeijingTodayStart(now);

    const [todayStats, latestUsage] = await Promise.all([
      Usage.calculateUsageStats(meterId, todayStart, now),
      Usage.getLatestUsage(meterId)
    ]);

    const remainingKwh = latestUsage ? latestUsage.remaining_kwh : null;
    const todayUsage = todayStats.totalUsage;

    const remaining = calculateRemainingDuration(remainingKwh, todayUsage);

    return {
      success: true,
      todayUsage,
      remainingKwh,
      remainingDuration: remaining,
      timestamp: now
    };
  } catch (error) {
    crawlerLogger.error(`获取每日数据失败: ${error.message}`);
    return {
      success: false,
      error: error.message,
      timestamp: new Date()
    };
  }
}

function generateReportMessage(data) {
  if (!data.success) {
    return {
      title: '⚠️ 用电日报获取失败',
      message: `数据获取失败，请检查系统状态。\n\n错误信息: ${data.error}`
    };
  }

  const beijingDate = formatBeijingTime(data.timestamp, 'date');

  let message = `📊 用电日报 - ${beijingDate}\n\n`;
  message += `┌──────────────────────────┐\n`;
  message += `│ 今日用电量: ${data.todayUsage.toFixed(2)} kWh\n`;
  message += `│ 当前剩余: ${data.remainingKwh.toFixed(2)} kWh\n`;
  message += `│ 预计可用: ${data.remainingDuration.text}\n`;
  message += `└──────────────────────────┘\n\n`;

  if (data.remainingKwh <= 5) {
    message += `⚠️ 警告：电量不足，请及时充值！\n`;
  } else if (data.remainingKwh <= 10) {
    message += `ℹ️ 提示：电量偏低，建议充值。\n`;
  }

  message += `\n📅 数据更新时间: ${formatBeijingTime(data.timestamp, 'datetime')}`;

  return {
    title: `📊 用电日报 ${beijingDate}`,
    message: message
  };
}

async function sendDailyReport() {
  // 防止并发重复发送
  if (sending) {
    crawlerLogger.info(`已有报告发送任务进行中，跳过本次`);
    return false;
  }
  sending = true;

  try {
    const today = new Date();
    const beijingDateStr = formatBeijingTime(today, 'date');

    if (lastReportDate === beijingDateStr) {
      crawlerLogger.info(`今日(${beijingDateStr})已发送过日报，跳过`);
      return false;
    }

    crawlerLogger.info(`开始发送每日用电报告...`);

    const meterId = process.env.METER_ID || '18100071580';
    const data = await fetchDailyData(meterId);

    const report = generateReportMessage(data);

    const sent = await sendServerChan(report.title, report.message);

    if (sent) {
      crawlerLogger.info(`每日用电报告发送成功`);
      lastReportDate = beijingDateStr;
      saveLastReportDate(lastReportDate);
      return true;
    } else {
      crawlerLogger.error(`每日用电报告发送失败`);
      return false;
    }
  } finally {
    sending = false;
  }
}

/**
 * 计算距离下一次报告的延迟(毫秒)
 * 关键：必须用 Date.UTC + 北京日期分量计算，再减8h得到真实UTC时刻。
 * 旧实现用 setHours/setMinutes 会按服务器本地时区解释，在 UTC 服务器(Railway)上
 * 会导致触发时间偏移数小时，甚至产生负延迟→1秒死循环。
 */
function calculateNextReportDelay() {
  const now = new Date();
  const beijingNow = toBeijingTime(now); // 偏移后的 Date，其 UTC 分量即北京日期/时间分量

  // 目标：北京日期的 23:59，先用 Date.UTC 当作北京时间构造，再减8h换算为真实 UTC 时刻
  let targetUtcMs = Date.UTC(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth(),
    beijingNow.getUTCDate(),
    CONFIG.reportHour,
    CONFIG.reportMinute,
    0, 0
  ) - 8 * 60 * 60 * 1000;

  // 若目标时刻已过，顺延到明天同一时刻
  if (targetUtcMs <= now.getTime()) {
    targetUtcMs += 24 * 60 * 60 * 1000;
  }

  return Math.max(1000, targetUtcMs - now.getTime());
}

function scheduleReport() {
  clearTimeout(timer);

  const delay = calculateNextReportDelay();
  const delayMinutes = Math.round(delay / 60000);
  const nextFire = new Date(Date.now() + delay);

  crawlerLogger.info(`距离下次报告还有 ${delayMinutes} 分钟，将在 ${formatBeijingTime(nextFire, 'datetime')} (北京时间) 触发`);

  timer = setTimeout(() => {
    sendDailyReport().catch(err => {
      crawlerLogger.error(`发送报告时发生未捕获错误: ${err.message}`);
    });
    // 重新调度下一次（无论本次成功与否）
    scheduleReport();
  }, delay);
}

/**
 * 备份兜底检测：每隔几分钟检查一次
 * 场景：容器在 23:59 附近重启，setTimeout 错过窗口。
 * 仅当当前北京时间已过报告时间、当天未发送、且在宽限窗口内时补发。
 */
function startBackupChecker() {
  if (backupInterval) return;

  backupInterval = setInterval(() => {
    try {
      const now = new Date();
      const beijingHour = getBeijingHour(now);
      const beijingMinute = getBeijingMinute(now);
      const beijingDateStr = formatBeijingTime(now, 'date');

      // 当天已发送，无需补发
      if (lastReportDate === beijingDateStr) return;

      // 当前北京时间已过 23:59 ?
      const passedReportTime =
        beijingHour > CONFIG.reportHour ||
        (beijingHour === CONFIG.reportHour && beijingMinute >= CONFIG.reportMinute);

      if (!passedReportTime) return;

      // 计算距离 23:59 已过多少分钟
      const beijingNow = toBeijingTime(now);
      const reportUtcMs = Date.UTC(
        beijingNow.getUTCFullYear(),
        beijingNow.getUTCMonth(),
        beijingNow.getUTCDate(),
        CONFIG.reportHour,
        CONFIG.reportMinute, 0, 0
      ) - 8 * 60 * 60 * 1000;
      const elapsedMinutes = (now.getTime() - reportUtcMs) / 60000;

      if (elapsedMinutes <= CONFIG.startupGraceMinutes) {
        crawlerLogger.info(`备份检测：当天未发送且已过报告时间 ${Math.round(elapsedMinutes)} 分钟，触发补发`);
        sendDailyReport().catch(err => {
          crawlerLogger.error(`备份补发失败: ${err.message}`);
        });
      } else {
        // 超过宽限窗口，可能是服务器长时间宕机，记录但不补发，避免在凌晨乱推
        crawlerLogger.warn(`当天未发送报告但已超过宽限窗口(${Math.round(elapsedMinutes)}分钟)，本次不补发`);
      }
    } catch (err) {
      crawlerLogger.error(`备份检测异常: ${err.message}`);
    }
  }, CONFIG.backupCheckMinutes * 60 * 1000);
}

function start() {
  if (timer) {
    crawlerLogger.warn(`每日报告服务已在运行`);
    return;
  }

  loadLastReportDate();

  const hasServerChanKey = !!process.env.SERVER_CHAN_KEY;
  const beijingTime = formatBeijingTime(new Date(), 'datetime');

  crawlerLogger.info(`==============================`);
  crawlerLogger.info(`每日报告服务启动`);
  crawlerLogger.info(`当前北京时间: ${beijingTime}`);
  crawlerLogger.info(`报告时间: 每天 ${CONFIG.reportHour}:${CONFIG.reportMinute.toString().padStart(2, '0')} (北京时间)`);
  crawlerLogger.info(`Server酱推送: ${hasServerChanKey ? '✅ 已配置' : '❌ 未配置(SERVER_CHAN_KEY)'}`);
  crawlerLogger.info(`数据源 MeterID: ${process.env.METER_ID || '18100071580 (默认)'}`);
  crawlerLogger.info(`==============================`);

  if (!hasServerChanKey) {
    crawlerLogger.error(`⚠️⚠️⚠️ 关键：未配置 SERVER_CHAN_KEY 环境变量，每日报告将无法推送到微信！请在 Railway Variables 中设置。`);
  }

  scheduleReport();
  startBackupChecker();
}

function stop() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    crawlerLogger.info(`每日报告定时器已停止`);
  }
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
    crawlerLogger.info(`备份检测器已停止`);
  }
}

async function testReport(useMockData = true) {
  crawlerLogger.info(`测试每日报告发送... (模式: ${useMockData ? '模拟数据' : '真实数据'})`);

  let data;
  if (useMockData) {
    data = {
      success: true,
      todayUsage: 3.74,
      remainingKwh: 26.03,
      remainingDuration: calculateRemainingDuration(26.03, 3.74),
      timestamp: new Date()
    };
  } else {
    const meterId = process.env.METER_ID || '18100071580';
    data = await fetchDailyData(meterId);
  }

  const report = generateReportMessage(data);

  crawlerLogger.info(`测试报告标题: ${report.title}`);

  const sent = await sendServerChan(report.title, report.message);

  if (sent) {
    crawlerLogger.info(`测试报告发送成功`);
  } else {
    crawlerLogger.error(`测试报告发送失败，请检查 SERVER_CHAN_KEY 配置与网络`);
  }

  return { sent, report };
}

function getStatus() {
  const now = new Date();
  const nextDelay = calculateNextReportDelay();
  return {
    running: !!timer,
    backupCheckerRunning: !!backupInterval,
    lastReportDate: lastReportDate,
    todayBeijingDate: formatBeijingTime(now, 'date'),
    alreadySentToday: lastReportDate === formatBeijingTime(now, 'date'),
    reportTime: `${CONFIG.reportHour}:${CONFIG.reportMinute.toString().padStart(2, '0')} (北京时间)`,
    nextFireBeijingTime: formatBeijingTime(new Date(Date.now() + nextDelay), 'datetime'),
    minutesUntilNextFire: Math.round(nextDelay / 60000),
    serverChanConfigured: !!process.env.SERVER_CHAN_KEY,
    meterId: process.env.METER_ID || '18100071580'
  };
}

module.exports = {
  start,
  stop,
  testReport,
  getStatus,
  sendDailyReport,
  calculateNextReportDelay
};

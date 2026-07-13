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

function calculateSmartRemainingDuration(remainingKwh, dailyStats, hourlyPattern) {
  if (!remainingKwh || remainingKwh <= 0) {
    return { hours: null, days: null, text: '电量已耗尽', method: 'none', confidence: 0 };
  }

  const now = new Date();
  const currentHour = getBeijingHour(now);
  const currentMinute = getBeijingMinute(now);

  const validDailyStats = dailyStats.filter(d => d.usageKwh > 0);
  const hasDailyData = validDailyStats.length > 0;
  const hasHourlyData = hourlyPattern.some(h => h.avgKwh > 0);

  if (!hasDailyData && !hasHourlyData) {
    return { hours: null, days: null, text: '数据不足', method: 'none', confidence: 0 };
  }

  let baseDailyUsage = 0;
  let confidence = 0;

  if (hasDailyData) {
    const weights = validDailyStats.map((_, i) => i + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedSum = validDailyStats.reduce((sum, stat, i) => sum + stat.usageKwh * weights[i], 0);
    baseDailyUsage = weightedSum / totalWeight;

    const stdDev = Math.sqrt(validDailyStats.reduce((sum, stat) => sum + Math.pow(stat.usageKwh - baseDailyUsage, 2), 0) / validDailyStats.length);
    const cv = stdDev / baseDailyUsage;

    confidence = Math.min(100, Math.round((1 - cv) * 100));
  } else {
    baseDailyUsage = hourlyPattern.reduce((sum, h) => sum + h.avgKwh, 0);
    confidence = hourlyPattern.filter(h => h.count > 0).length * 4;
  }

  confidence = Math.max(20, Math.min(95, confidence));

  let predictedUsage = 0;
  let hoursRemaining = 0;
  let currentDayUsage = 0;

  if (hasHourlyData) {
    for (let h = currentHour; h < 24; h++) {
      const hourFactor = h === currentHour ? (60 - currentMinute) / 60 : 1;
      predictedUsage += hourlyPattern[h].avgKwh * hourFactor;
      hoursRemaining += hourFactor;
    }

    currentDayUsage = predictedUsage;
  }

  if (currentDayUsage > remainingKwh) {
    const hoursLeftToday = (remainingKwh / (currentDayUsage / hoursRemaining));
    const hours = Math.round(hoursLeftToday * 10) / 10;
    return {
      hours: hours,
      days: 0,
      text: `${hours.toFixed(1)}小时`,
      method: 'hourly',
      confidence: confidence,
      details: {
        baseDaily: baseDailyUsage.toFixed(2),
        todayPredicted: currentDayUsage.toFixed(2),
        hoursRemainingToday: hoursRemaining.toFixed(1)
      }
    };
  }

  const remainingAfterToday = remainingKwh - currentDayUsage;
  const fullDays = Math.floor(remainingAfterToday / baseDailyUsage);
  const remainderKwh = remainingAfterToday % baseDailyUsage;

  let extraHours = 0;
  if (fullDays >= 0 && remainderKwh > 0) {
    const avgHourlyRate = baseDailyUsage / 24;
    extraHours = remainderKwh / avgHourlyRate;
  }

  const totalHours = hoursRemaining + fullDays * 24 + extraHours;

  let text = '';
  if (fullDays >= 1) {
    const remainingHoursInt = Math.round(extraHours);
    if (remainingHoursInt > 0) {
      text = `${fullDays}天${remainingHoursInt}小时`;
    } else {
      text = `${fullDays}天`;
    }
  } else {
    text = `${Math.round(totalHours)}小时`;
  }

  return {
    hours: Math.round(totalHours * 10) / 10,
    days: Math.round((totalHours / 24) * 100) / 100,
    text: text,
    method: 'smart',
    confidence: confidence,
    details: {
      baseDaily: baseDailyUsage.toFixed(2),
      todayPredicted: currentDayUsage.toFixed(2),
      days: fullDays,
      extraHours: Math.round(extraHours),
      remainingAfterToday: remainingAfterToday.toFixed(2)
    }
  };
}

async function fetchDailyData(meterId) {
  try {
    const now = new Date();
    const todayStart = getBeijingTodayStart(now);

    const [todayStats, latestUsage, dailyStats, hourlyPattern] = await Promise.all([
      Usage.calculateUsageStats(meterId, todayStart, now),
      Usage.getLatestUsage(meterId),
      Usage.getDailyUsageStats(meterId, 7),
      Usage.getHourlyUsagePattern(meterId, 7)
    ]);

    const remainingKwh = latestUsage ? latestUsage.remaining_kwh : null;
    const todayUsage = todayStats.totalUsage;

    const remaining = calculateSmartRemainingDuration(remainingKwh, dailyStats, hourlyPattern);

    const avgDailyUsage = dailyStats.filter(d => d.usageKwh > 0).length > 0
      ? dailyStats.filter(d => d.usageKwh > 0).reduce((sum, d) => sum + d.usageKwh, 0) / dailyStats.filter(d => d.usageKwh > 0).length
      : 0;

    return {
      success: true,
      todayUsage,
      remainingKwh,
      remainingDuration: remaining,
      avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
      dailyStats,
      hourlyPattern,
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
  const duration = data.remainingDuration;

  let message = `📊 用电日报 - ${beijingDate}\n\n`;
  message += `┌──────────────────────────┐\n`;
  message += `│ 今日用电量: ${data.todayUsage.toFixed(2)} kWh\n`;
  message += `│ 日均用电: ${data.avgDailyUsage.toFixed(2)} kWh\n`;
  message += `│ 当前剩余: ${data.remainingKwh.toFixed(2)} kWh\n`;
  message += `└──────────────────────────┘\n\n`;

  message += `⏰ 预计可用: ${duration.text}`;
  if (duration.confidence > 0) {
    message += ` (置信度 ${duration.confidence}%)`;
  }
  message += `\n\n`;

  if (duration.details) {
    message += `📈 预测详情:\n`;
    message += `  • 基准日均: ${duration.details.baseDaily} kWh\n`;
    if (duration.details.todayPredicted) {
      message += `  • 今日剩余预测: ${duration.details.todayPredicted} kWh\n`;
    }
    if (duration.details.days !== undefined && duration.details.days > 0) {
      message += `  • 完整天数: ${duration.details.days} 天\n`;
    }
    message += `\n`;
  }

  if (data.remainingKwh <= 5) {
    message += `⚠️⚠️⚠️ 警告：电量严重不足！预计不到1天耗尽，请立即充值！\n`;
  } else if (data.remainingKwh <= 10) {
    message += `⚠️ 提示：电量偏低，建议尽快充值。\n`;
  } else if (data.remainingKwh <= 20) {
    message += `ℹ️ 提醒：剩余电量约${Math.round(data.remainingKwh / data.avgDailyUsage)}天，请留意。\n`;
  }

  const maxUsageDay = data.dailyStats && data.dailyStats.length > 0
    ? data.dailyStats.reduce((max, d) => d.usageKwh > max.usageKwh ? d : max, data.dailyStats[0])
    : null;
  if (maxUsageDay && maxUsageDay.usageKwh > 0) {
    message += `\n📊 近7天最高单日用电: ${maxUsageDay.usageKwh.toFixed(2)} kWh`;
  }

  message += `\n\n📅 数据更新时间: ${formatBeijingTime(data.timestamp, 'datetime')}`;

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
    const mockDailyStats = [
      { date: '2026-07-06', usageKwh: 3.2, dayOfWeek: 0 },
      { date: '2026-07-07', usageKwh: 4.1, dayOfWeek: 1 },
      { date: '2026-07-08', usageKwh: 3.8, dayOfWeek: 2 },
      { date: '2026-07-09', usageKwh: 4.5, dayOfWeek: 3 },
      { date: '2026-07-10', usageKwh: 3.6, dayOfWeek: 4 },
      { date: '2026-07-11', usageKwh: 4.2, dayOfWeek: 5 },
      { date: '2026-07-12', usageKwh: 3.7, dayOfWeek: 6 }
    ];

    const mockHourlyPattern = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      avgKwh: i >= 22 || i <= 6 ? 0.08 : (i >= 8 && i <= 11) || (i >= 18 && i <= 21) ? 0.25 : 0.15,
      count: 7
    }));

    const remaining = calculateSmartRemainingDuration(26.03, mockDailyStats, mockHourlyPattern);

    data = {
      success: true,
      todayUsage: 3.74,
      remainingKwh: 26.03,
      remainingDuration: remaining,
      avgDailyUsage: 3.87,
      dailyStats: mockDailyStats,
      hourlyPattern: mockHourlyPattern,
      timestamp: new Date()
    };
  } else {
    const meterId = process.env.METER_ID || '18100071580';
    data = await fetchDailyData(meterId);
  }

  const report = generateReportMessage(data);

  crawlerLogger.info(`测试报告标题: ${report.title}`);
  crawlerLogger.info(`测试报告内容:\n${report.message}`);

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
  calculateNextReportDelay,
  calculateSmartRemainingDuration
};

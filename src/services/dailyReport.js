const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Usage = require('../models/Usage');
const { crawlerLogger } = require('../utils/logger');
const { 
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
  stateFilePath: path.join(__dirname, '../../.daily_report_state.json')
};

let lastReportDate = null;
let timer = null;

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

function isSameDay(date1, date2) {
  return date1.toDateString() === date2.toDateString();
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
}

function calculateNextReportDelay() {
  const now = new Date();
  const beijingHour = getBeijingHour(now);
  const beijingMinute = getBeijingMinute(now);
  const beijingSecond = new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCSeconds();
  
  let targetTime = new Date(now.getTime());
  targetTime.setHours(beijingHour);
  targetTime.setMinutes(CONFIG.reportMinute);
  targetTime.setSeconds(0);
  targetTime.setMilliseconds(0);
  
  if (beijingHour > CONFIG.reportHour || 
      (beijingHour === CONFIG.reportHour && beijingMinute >= CONFIG.reportMinute)) {
    targetTime = new Date(targetTime.getTime() + 24 * 60 * 60 * 1000);
  }
  
  const delay = targetTime.getTime() - now.getTime();
  return Math.max(1000, delay);
}

function scheduleReport() {
  clearTimeout(timer);
  
  const delay = calculateNextReportDelay();
  const delayMinutes = Math.round(delay / 60000);
  
  crawlerLogger.info(`距离下次报告还有 ${delayMinutes} 分钟，将在 ${formatBeijingTime(new Date(Date.now() + delay), 'datetime')} 触发`);
  
  timer = setTimeout(() => {
    sendDailyReport().catch(err => {
      crawlerLogger.error(`发送报告时发生未捕获错误: ${err.message}`);
    });
    scheduleReport();
  }, delay);
}

function start() {
  if (timer) {
    crawlerLogger.warn(`每日报告服务已在运行`);
    return;
  }
  
  loadLastReportDate();
  
  const hasServerChanKey = !!process.env.SERVER_CHAN_KEY;
  if (!hasServerChanKey) {
    crawlerLogger.warn(`⚠️ 未配置SERVER_CHAN_KEY环境变量，每日报告将无法推送！`);
  }
  
  const beijingTime = formatBeijingTime(new Date(), 'datetime');
  crawlerLogger.info(`每日报告服务启动`);
  crawlerLogger.info(`当前北京时间: ${beijingTime}`);
  crawlerLogger.info(`报告时间: 每天 ${CONFIG.reportHour}:${CONFIG.reportMinute} (北京时间)`);
  crawlerLogger.info(`Server酱推送: ${hasServerChanKey ? '已配置' : '未配置'}`);
  
  scheduleReport();
}

function stop() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    crawlerLogger.info(`每日报告定时器已停止`);
  }
}

async function testReport(useMockData = true) {
  crawlerLogger.info(`测试每日报告发送...`);
  
  let data;
  if (useMockData) {
    crawlerLogger.info(`使用模拟数据进行测试`);
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
  
  crawlerLogger.info(`测试报告内容:`);
  crawlerLogger.info(`标题: ${report.title}`);
  crawlerLogger.info(`消息: ${report.message}`);
  
  const sent = await sendServerChan(report.title, report.message);
  
  if (sent) {
    crawlerLogger.info(`测试报告发送成功`);
  } else {
    crawlerLogger.error(`测试报告发送失败`);
  }
  
  return sent;
}

function getStatus() {
  return {
    running: !!timer,
    lastReportDate: lastReportDate,
    reportTime: `${CONFIG.reportHour}:${CONFIG.reportMinute} (北京时间)`,
    nextReportDate: lastReportDate ? new Date(new Date(lastReportDate).getTime() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN') : '尚未发送',
    serverChanConfigured: !!process.env.SERVER_CHAN_KEY
  };
}

module.exports = {
  start,
  stop,
  testReport,
  getStatus,
  sendDailyReport
};
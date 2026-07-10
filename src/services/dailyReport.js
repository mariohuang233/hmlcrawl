/**
 * 每日用电报告服务
 * 
 * 功能：每天北京时间23:59自动推送用电报告
 * 包含：今日用电量、当前剩余电量、预计剩余电量可用时长
 * 
 * 使用：
 *   const dailyReport = require('./services/dailyReport');
 *   dailyReport.start();
 */

const mongoose = require('mongoose');
const Usage = require('../models/Usage');
const { crawlerLogger } = require('../utils/logger');
const { 
  getBeijingTodayStart, 
  getBeijingTodayEnd,
  formatBeijingTime 
} = require('../utils/timezone');
const { sendServerChan } = require('../utils/alerter');

const CONFIG = {
  reportHour: 23,
  reportMinute: 59,
  cooldownHours: 23
};

let lastReportDate = null;
let timer = null;

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
    return true;
  } else {
    crawlerLogger.error(`每日用电报告发送失败`);
    return false;
  }
}

function scheduleReport() {
  clearInterval(timer);
  
  timer = setInterval(async () => {
    const now = new Date();
    const beijingHour = new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCHours();
    const beijingMinute = new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCMinutes();
    const beijingDateStr = formatBeijingTime(now, 'date');
    
    if (beijingHour === CONFIG.reportHour && beijingMinute === CONFIG.reportMinute) {
      if (lastReportDate !== beijingDateStr) {
        crawlerLogger.info(`检测到北京时间 ${CONFIG.reportHour}:${CONFIG.reportMinute}，触发每日报告`);
        await sendDailyReport();
      }
    }
  }, 60000);
  
  crawlerLogger.info(`每日报告定时器已启动，每天北京时间 ${CONFIG.reportHour}:${CONFIG.reportMinute} 自动推送`);
}

function start() {
  if (timer) {
    crawlerLogger.warn(`每日报告服务已在运行`);
    return;
  }
  
  scheduleReport();
}

function stop() {
  if (timer) {
    clearInterval(timer);
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
    nextReportDate: lastReportDate ? new Date(new Date(lastReportDate).getTime() + 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN') : '尚未发送'
  };
}

module.exports = {
  start,
  stop,
  testReport,
  getStatus,
  sendDailyReport
};
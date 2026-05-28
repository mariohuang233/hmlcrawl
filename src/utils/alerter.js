/**
 * 监控告警系统 - 支持 Telegram Bot 告警
 *
 * 环境变量配置:
 *   TELEGRAM_BOT_TOKEN - Telegram Bot Token
 *   TELEGRAM_CHAT_ID   - 接收告警的 Chat ID
 *   ALERT_LEVEL        - 告警级别: error | warn | info (默认: warn)
 *
 * 使用:
 *   const alerter = require('./utils/alerter');
 *   await alerter.alert('error', '爬虫连续5次失败');
 *   await alerter.alert('warn', '内存使用过高: 500MB');
 */

const https = require('https');
const { URL } = require('url');
const { crawlerLogger } = require('./logger');

const CONFIG = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  alertLevel: process.env.ALERT_LEVEL || 'warn',
  hostname: require('os').hostname(),
  cooldownMs: 5 * 60 * 1000
};

const LEVELS = { error: 0, warn: 1, info: 2 };
const THROTTLE = new Map();

function shouldAlert(level) {
  const levelNum = LEVELS[level] ?? 1;
  const configLevelNum = LEVELS[CONFIG.alertLevel] ?? 1;
  return levelNum <= configLevelNum;
}

function isThrottled(key) {
  const last = THROTTLE.get(key);
  if (last && Date.now() - last < CONFIG.cooldownMs) {
    return true;
  }
  THROTTLE.set(key, Date.now());
  return false;
}

async function sendTelegram(message) {
  if (!CONFIG.telegramBotToken || !CONFIG.telegramChatId) {
    return false;
  }

  return new Promise((resolve) => {
    const urlObj = new URL(`https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendMessage`);
    const body = JSON.stringify({
      chat_id: CONFIG.telegramChatId,
      text: message,
      parse_mode: 'HTML',
      disable_notification: false
    });

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

function formatAlert(level, message, details = {}) {
  const emoji = { error: '🚨', warn: '⚠️', info: 'ℹ️' };
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  let text = `${emoji[level] || '📢'} <b>[${level.toUpperCase()}] 电量监控告警</b>\n`;
  text += `└ 主机: ${CONFIG.hostname}\n`;
  text += `└ 时间: ${ts}\n`;
  text += `└ 消息: ${message}\n`;

  if (details.remaining_kwh !== undefined) {
    text += `└ 电量: ${details.remaining_kwh} kWh\n`;
  }
  if (details.uptime !== undefined) {
    text += `└ 运行: ${Math.round(details.uptime / 3600)}小时\n`;
  }
  if (details.duration !== undefined) {
    text += `└ 耗时: ${details.duration}ms\n`;
  }
  if (details.error) {
    text += `└ 错误: ${details.error}\n`;
  }
  if (details.stack) {
    text += `\n<code>${details.stack.substring(0, 500)}</code>`;
  }

  return text;
}

async function alert(level, message, details = {}) {
  if (!shouldAlert(level)) return false;

  const throttleKey = `${level}:${message}`;
  if (isThrottled(throttleKey)) {
    return false;
  }

  crawlerLogger.info(`[ALERT:${level}] ${message}`);

  const text = formatAlert(level, message, details);
  const sent = await sendTelegram(text);

  if (sent) {
    crawlerLogger.info(`告警已发送 (${level}): ${message}`);
  } else {
    crawlerLogger.warn(`告警发送失败 (${level}), 仅记录日志: ${message}`);
  }

  return sent;
}

async function alertCrawlSuccess(stats) {
  return alert('info', '爬取成功', stats);
}

async function alertCrawlFailed(stats) {
  return alert('error', '爬取失败，已达最大重试次数', stats);
}

async function alertMemoryHigh(memMB) {
  return alert('warn', `内存使用过高: ${memMB}MB`, { uptime: process.uptime() });
}

async function alertCrawlerRestarted() {
  return alert('warn', '爬虫进程已重启', { uptime: 0 });
}

async function alertMongoDisconnected() {
  return alert('error', 'MongoDB 连接断开', { uptime: process.uptime() });
}

function getConfig() {
  return {
    configured: !!(CONFIG.telegramBotToken && CONFIG.telegramChatId),
    alertLevel: CONFIG.alertLevel,
    hostname: CONFIG.hostname
  };
}

module.exports = {
  alert,
  alertCrawlSuccess,
  alertCrawlFailed,
  alertMemoryHigh,
  alertCrawlerRestarted,
  alertMongoDisconnected,
  getConfig
};

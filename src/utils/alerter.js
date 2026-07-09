/**
 * 监控告警系统 - Server酱微信推送
 *
 * 环境变量配置:
 *   SERVER_CHAN_KEY       - Server酱SendKey（微信推送）
 *   ALERT_LEVEL           - 告警级别: error | warn | info (默认: warn)
 *
 * 使用:
 *   const alerter = require('./utils/alerter');
 *   await alerter.alert('error', '爬虫连续5次失败');
 *   await alerter.alertLowBattery(0.95, 1);
 */

const https = require('https');
const { URL } = require('url');
const { crawlerLogger } = require('./logger');

const CONFIG = {
  serverChanKey: process.env.SERVER_CHAN_KEY || '',
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

async function sendServerChan(title, message) {
  if (!CONFIG.serverChanKey) {
    return false;
  }

  return new Promise((resolve) => {
    const urlObj = new URL(`https://sctapi.ftqq.com/${CONFIG.serverChanKey}.send`);
    
    const desp = formatServerChanDesp(message);
    const short = message.substring(0, 64).replace(/\n/g, ' ');

    const body = JSON.stringify({
      title: title.substring(0, 32),
      desp: desp,
      short: short,
      noip: 1
    });

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code === 0 || result.errno === 0) {
            crawlerLogger.info(`Server酱推送成功: pushid=${result.data?.pushid}`);
            resolve(true);
          } else {
            crawlerLogger.error(`Server酱推送失败: ${result.message || result.error}`);
            resolve(false);
          }
        } catch {
          resolve(res.statusCode === 200);
        }
      });
    });
    req.on('error', (err) => {
      crawlerLogger.error(`Server酱请求失败: ${err.message}`);
      resolve(false);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

function formatServerChanDesp(message) {
  return message
    .replace(/\n/g, '\n\n')
    .replace(/└ /g, '- ')
    .replace(/\[(\w+)\]/g, '**$1**')
    .substring(0, 32768);
}

function formatAlert(level, message, details = {}) {
  const emoji = { error: '🚨', warn: '⚠️', info: 'ℹ️' };
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  let text = `${emoji[level] || '📢'} [${level.toUpperCase()}] 电量监控告警\n`;
  text += `└ 主机: ${CONFIG.hostname}\n`;
  text += `└ 时间: ${ts}\n`;
  text += `└ 消息: ${message}\n`;

  if (details.remaining_kwh !== undefined) {
    text += `└ 电量: ${details.remaining_kwh} kWh\n`;
  }
  if (details.threshold !== undefined) {
    text += `└ 阈值: ${details.threshold} kWh\n`;
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
    text += `\n${details.stack.substring(0, 500)}`;
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

  if (!CONFIG.serverChanKey) {
    crawlerLogger.warn(`告警发送失败 (${level}), 未配置SERVER_CHAN_KEY: ${message}`);
    return false;
  }

  const text = formatAlert(level, message, details);
  const title = `${level.toUpperCase()} - ${message.substring(0, 30)}${message.length > 30 ? '...' : ''}`;
  
  const sent = await sendServerChan(title, text);
  
  if (sent) {
    crawlerLogger.info(`Server酱告警已发送`);
  } else {
    crawlerLogger.warn(`Server酱告警发送失败`);
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

async function alertLowBattery(remainingKwh, threshold = 1) {
  const percentage = Math.round((remainingKwh / threshold) * 100);
  const message = `电量低于阈值！当前剩余 ${remainingKwh} kWh（阈值: ${threshold} kWh），剩余 ${percentage}%`;
  return alert('error', message, { 
    remaining_kwh: remainingKwh, 
    threshold: threshold,
    uptime: process.uptime() 
  });
}

async function alertCrawlerRestarted() {
  return alert('warn', '爬虫进程已重启', { uptime: 0 });
}

async function alertMongoDisconnected() {
  return alert('error', 'MongoDB 连接断开', { uptime: process.uptime() });
}

function getConfig() {
  return {
    configured: !!CONFIG.serverChanKey,
    channels: CONFIG.serverChanKey ? ['serverchan'] : [],
    alertLevel: CONFIG.alertLevel,
    hostname: CONFIG.hostname
  };
}

module.exports = {
  alert,
  alertCrawlSuccess,
  alertCrawlFailed,
  alertMemoryHigh,
  alertLowBattery,
  alertCrawlerRestarted,
  alertMongoDisconnected,
  getConfig
};
const http = require('http');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');
const { JSDOM } = require('jsdom');
const cron = require('node-cron');
const Usage = require('../models/Usage');
const CrawlerLog = require('../models/CrawlerLog');
const { crawlerLogger } = require('../utils/logger');
const Format = require('../utils/crawler-format');
const alerter = require('../utils/alerter');

const IS_CLOUD_RUNTIME = !!(
  process.env.RAILWAY_SERVICE_NAME ||
  process.env.RAILWAY_STATIC_URL ||
  process.env.ZEABUR_SERVICE_NAME ||
  process.env.ZEABUR_DOMAIN ||
  process.env.RENDER ||
  process.env.VERCEL
);
const CRAWLER_LOG_SOURCE = IS_CLOUD_RUNTIME ? 'cloud-crawler' : 'local-crawler';

const CONFIG = {
  PROXY_URL: process.env.PROXY_URL || process.env.VERCEL_PROXY_URL,
  USE_PROXY: !!process.env.PROXY_URL || !!process.env.VERCEL_PROXY_URL,
  HTTP_PROXY: process.env.HTTP_PROXY || process.env.HTTPS_PROXY,
  USE_DIRECT_IP: process.env.USE_DIRECT_IP === 'true',
  DIRECT_IPS: [
    '121.41.227.153',
    '47.99.204.107',
    '120.26.164.242',
    '47.99.209.106',
    '47.97.48.100'
  ],
  TARGET_URL: `https://www.wap.cnyiot.com/nat/pay.aspx?mid=${process.env.METER_ID || '18100071580'}`,
  METER_ID: process.env.METER_ID || '18100071580',
  METER_NAME: process.env.METER_NAME || '2759弄18号402阳台',
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 5000,
  MAX_LOG_ENTRIES: 200,
  TARGET_HOST: 'www.wap.cnyiot.com',
  REQUEST_TIMEOUT: 30000,
  KEEP_ALIVE_MS: 15000,
  MAX_SOCKETS: 10,
  CRAWL_INTERVAL_MINUTES: 15,
  RANDOM_DELAY_MAX_SECONDS: 300,
  BATTERY_ALERT_THRESHOLD: parseFloat(process.env.BATTERY_ALERT_THRESHOLD) || 1,
  BATTERY_ALERT_COOLDOWN_HOURS: parseInt(process.env.BATTERY_ALERT_COOLDOWN_HOURS) || 4,
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 5,
    RESET_TIMEOUT: 60000,
    HALF_OPEN_MAX: 2
  },
  FAILOVER: {
    ENABLED: process.env.CRAWLER_FAILOVER !== 'false',
    MAX_CONSECUTIVE_FAILURES: 3,
    COOLDOWN_MINUTES: 30
  }
};

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD;
    this.resetTimeout = options.resetTimeout || CONFIG.CIRCUIT_BREAKER.RESET_TIMEOUT;
    this.halfOpenMax = options.halfOpenMax || CONFIG.CIRCUIT_BREAKER.HALF_OPEN_MAX;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenSuccessCount = 0;
  }

  get isOpen() {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenSuccessCount = 0;
        crawlerLogger.info('断路器进入半开状态，允许试探请求');
      }
    }
    return this.state === 'OPEN';
  }

  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccessCount++;
      if (this.halfOpenSuccessCount >= this.halfOpenMax) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        crawlerLogger.info('断路器闭合，恢复正常');
      }
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      crawlerLogger.warn(`断路器断开（${this.failureCount}次失败），暂停爬取 ${this.resetTimeout / 1000}秒`);
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

class HttpAgentPool {
  constructor() {
    this.agents = new Map();
  }

  getAgent(hostname, isHttps, skipVerify = false) {
    const key = `${isHttps ? 'https' : 'http'}://${hostname}${skipVerify ? ':skip' : ''}`;
    if (this.agents.has(key)) {
      return this.agents.get(key);
    }
    const module = isHttps ? https : http;
    const agent = new module.Agent({
      keepAlive: true,
      maxSockets: CONFIG.MAX_SOCKETS,
      keepAliveMsecs: CONFIG.KEEP_ALIVE_MS,
      scheduling: 'lifo',
      ...(skipVerify && isHttps ? { rejectUnauthorized: false, checkServerIdentity: () => undefined } : {})
    });
    this.agents.set(key, agent);
    return agent;
  }

  destroyAll() {
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();
  }
}

class ElectricityCrawler {
  constructor() {
    this.proxyUrl = CONFIG.PROXY_URL;
    this.useProxy = CONFIG.USE_PROXY;
    this.proxy = CONFIG.HTTP_PROXY;
    this.useDirectIP = CONFIG.USE_DIRECT_IP;
    this.directIPs = CONFIG.DIRECT_IPS;
    this.currentIPIndex = 0;
    this.meterId = CONFIG.METER_ID;
    this.meterName = CONFIG.METER_NAME;
    this.maxRetries = CONFIG.MAX_RETRIES;
    this.initialRetryDelay = CONFIG.INITIAL_RETRY_DELAY;
    this.batteryAlertThreshold = CONFIG.BATTERY_ALERT_THRESHOLD;
    this.batteryAlertCooldownHours = CONFIG.BATTERY_ALERT_COOLDOWN_HOURS;
    this.lastBatteryAlertTime = null;

    this.circuitBreaker = new CircuitBreaker();
    this.agentPool = new HttpAgentPool();
    this.crawlSemaphore = 0;
    this.lastCrawlResult = null;

    this.consecutiveFailures = 0;
    this.failoverEnabled = CONFIG.FAILOVER.ENABLED;
    this.maxFailoverFailures = CONFIG.FAILOVER.MAX_CONSECUTIVE_FAILURES;
    this.failoverCooldownMs = CONFIG.FAILOVER.COOLDOWN_MINUTES * 60 * 1000;
    this.lastFailoverTime = 0;
    this.failoverCount = 0;
    this.originalMode = null;
    this.currentMode = null;

    this.logEntries = [];
    this.maxLogEntries = CONFIG.MAX_LOG_ENTRIES;
    this.stats = {
      totalCrawls: 0,
      successfulCrawls: 0,
      failedCrawls: 0,
      retryCount: 0,
      proxySwitches: 0,
      ipSwitches: 0,
      lastCrawlTime: null,
      lastSuccessfulCrawl: null,
      batteryAlerts: 0,
      modeSwitches: 0
    };

    this._initMode();
    this._updateUrl();
    crawlerLogger.info(`爬虫配置: 使用代理=${this.useProxy}, 直连IP=${this.useDirectIP}, 故障转移=${this.failoverEnabled}, 电量告警阈值=${this.batteryAlertThreshold}kWh`);
  }

  _initMode() {
    if (this.useProxy) {
      this.originalMode = 'proxy';
      this.currentMode = 'proxy';
    } else if (this.useDirectIP) {
      this.originalMode = 'direct_ip';
      this.currentMode = 'direct_ip';
    } else {
      this.originalMode = 'direct';
      this.currentMode = 'direct';
    }
  }

  switchMode(mode) {
    const oldMode = this.currentMode;
    if (mode === oldMode) return false;

    if (mode === 'proxy' && !this.proxyUrl) {
      crawlerLogger.warn('切换到代理模式失败: 未配置代理地址');
      return false;
    }

    if (mode === 'proxy') {
      this.useProxy = true;
      this.useDirectIP = false;
    } else if (mode === 'direct_ip') {
      this.useProxy = false;
      this.useDirectIP = true;
    } else {
      this.useProxy = false;
      this.useDirectIP = false;
    }

    this.currentMode = mode;
    this._updateUrl();
    this.circuitBreaker = new CircuitBreaker();
    this.consecutiveFailures = 0;
    this.stats.modeSwitches++;
    this.lastFailoverTime = Date.now();

    crawlerLogger.info(`爬虫模式切换: ${oldMode} → ${mode}, URL: ${this.url}`);
    return true;
  }

  _tryFailover() {
    if (!this.failoverEnabled) return false;
    if (this.consecutiveFailures < this.maxFailoverFailures) return false;
    if (Date.now() - this.lastFailoverTime < this.failoverCooldownMs) return false;

    if (this.currentMode === 'proxy' && CONFIG.DIRECT_IPS.length > 0) {
      crawlerLogger.warn(`代理模式连续失败${this.consecutiveFailures}次，自动故障转移到直连IP模式`);
      this.failoverCount++;
      return this.switchMode('direct_ip');
    }

    if (this.currentMode === 'direct' && this.proxyUrl) {
      crawlerLogger.warn(`直连模式连续失败${this.consecutiveFailures}次，自动故障转移到代理模式`);
      this.failoverCount++;
      return this.switchMode('proxy');
    }

    return false;
  }

  _updateUrl() {
    if (this.useProxy) {
      this.url = this.proxyUrl;
    } else if (this.useDirectIP) {
      this.url = `https://${this.directIPs[this.currentIPIndex]}/nat/pay.aspx?mid=${this.meterId}`;
    } else {
      this.url = CONFIG.TARGET_URL;
    }
  }

  async addLogEntry(entry) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.logEntries.unshift(logEntry);
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.pop();
    }
    crawlerLogger.info(JSON.stringify(logEntry));
    try {
      await CrawlerLog.addLog({
        timestamp: logEntry.timestamp,
        level: entry.action === 'error' || entry.action === 'failed' ? 'error' : 'info',
        action: entry.action || 'unknown',
        message: entry.error || entry.info || JSON.stringify(entry.data),
        data: entry.data,
        source: CRAWLER_LOG_SOURCE
      });
    } catch (e) {
      /* ignore */
    }
  }

  async getLogs(limit = 100, source = CRAWLER_LOG_SOURCE) {
    try {
      const dbLogs = await CrawlerLog.getRecentLogs(limit, source);
      if (dbLogs && dbLogs.length > 0) {
        return dbLogs.map(log => ({
          timestamp: log.timestamp,
          level: log.level,
          message: log.message,
          action: log.action,
          data: log.data,
          source: log.source,
          hostname: log.hostname
        }));
      }
    } catch (e) {
      /* ignore */
    }
    if (source !== CRAWLER_LOG_SOURCE) {
      return [];
    }
    return this.logEntries.slice(0, limit).map(log => ({
      ...log,
      source: CRAWLER_LOG_SOURCE
    }));
  }

  getStats() {
    return {
      ...this.stats,
      currentUrl: this.url,
      useProxy: this.useProxy,
      useDirectIP: this.useDirectIP,
      currentIP: this.useDirectIP ? this.directIPs[this.currentIPIndex] : null,
      directIPCount: this.directIPs.length,
      logCount: this.logEntries.length,
      circuitBreaker: this.circuitBreaker.getState(),
      currentMode: this.currentMode,
      originalMode: this.originalMode,
      consecutiveFailures: this.consecutiveFailures,
      failoverEnabled: this.failoverEnabled,
      failoverCount: this.failoverCount,
      lastFailoverTime: this.lastFailoverTime ? new Date(this.lastFailoverTime).toISOString() : null
    };
  }

  updateStats(statName, value = 1) {
    if (statName === 'lastCrawlTime' || statName === 'lastSuccessfulCrawl') {
      this.stats[statName] = new Date().toISOString();
    } else {
      this.stats[statName] = (this.stats[statName] || 0) + value;
    }
  }

  start() {
    crawlerLogger.info('开始启动爬虫定时任务...');
    this.crawlData().catch(error => {
      crawlerLogger.error(`初始爬取失败: ${error.message}`);
    });
    try {
      const minutes = CONFIG.CRAWL_INTERVAL_MINUTES;
      const pattern = Array.from({ length: 60 / minutes }, (_, i) => i * minutes).join(',');
      cron.schedule(`${pattern} * * * *`, () => {
        const delay = Math.floor(Math.random() * CONFIG.RANDOM_DELAY_MAX_SECONDS) * 1000;
        crawlerLogger.info(`定时任务触发，随机延迟 ${Math.round(delay / 1000)}秒后执行`);
        setTimeout(() => this.crawlData(), delay);
      }, { timezone: 'Asia/Shanghai' });
      crawlerLogger.info(`爬虫定时任务已启动，每${minutes}分钟执行一次（带随机延迟）`);
    } catch (error) {
      crawlerLogger.error(`定时任务启动失败: ${error.message}`);
    }
  }

  async crawlData() {
    if (this.crawlSemaphore > 0) {
      crawlerLogger.warn('爬取正在进行中，跳过本次触发');
      return;
    }
    if (this.circuitBreaker.isOpen) {
      crawlerLogger.warn('断路器断开，尝试故障转移...');
      if (this._tryFailover()) {
        crawlerLogger.info('故障转移成功，继续执行爬取');
      } else {
        crawlerLogger.warn('故障转移不可用或冷却中，跳过本次爬取');
        return;
      }
    }

    this.crawlSemaphore++;
    let retryCount = 0;
    const startTime = Date.now();

    try {
      while (retryCount < this.maxRetries) {
        try {
          this.updateStats('totalCrawls');
          await this.addLogEntry({
            timestamp: new Date(),
            action: 'crawl_start',
            retryCount: retryCount + 1,
            url: this.url,
            mode: this.currentMode
          });

          const data = await this.fetchElectricityData();
          if (data) {
            await this.saveData(data);
            const duration = Date.now() - startTime;
            this.circuitBreaker.onSuccess();
            this.consecutiveFailures = 0;
            this.updateStats('successfulCrawls');
            this.updateStats('lastSuccessfulCrawl');
            this.lastCrawlResult = { success: true, data, duration };

            await this._checkBatteryAlert(data.remaining_kwh);

            await this.addLogEntry({
              timestamp: new Date(),
              action: 'success',
              duration: `${duration}ms`,
              data,
              retryCount: retryCount + 1,
              mode: this.currentMode
            });
            return;
          }
        } catch (error) {
          retryCount++;
          this.updateStats('retryCount');
          crawlerLogger.error(`第${retryCount}次尝试失败: ${error.message}`);

          await this.addLogEntry({
            timestamp: new Date(),
            action: 'error',
            error: error.message,
            retryCount,
            mode: this.currentMode
          });

          if (retryCount < this.maxRetries) {
            const delay = this.initialRetryDelay * Math.pow(1.5, retryCount - 1);
            crawlerLogger.info(`${Math.round(delay / 1000)}秒后重试...`);
            await this.delay(delay);
          }
        }
      }

      this.circuitBreaker.onFailure();
      this.consecutiveFailures++;
      this.updateStats('failedCrawls');
      crawlerLogger.error(`爬取失败，已重试${this.maxRetries}次 (连续失败${this.consecutiveFailures}次)`);

      if (this._tryFailover()) {
        crawlerLogger.info('已自动切换模式，将在下一轮重试');
      }

      await this.addLogEntry({
        timestamp: new Date(),
        action: 'failed',
        error: `已重试${this.maxRetries}次均失败`,
        retryCount: this.maxRetries,
        consecutiveFailures: this.consecutiveFailures,
        mode: this.currentMode
      });
    } finally {
      this.crawlSemaphore--;
    }
  }

  async fetchElectricityData() {
    try {
      const html = await this.makeHttpRequest(this.url);
      crawlerLogger.info(`获取HTML成功，长度: ${html.length} 字符`);

      if (this._isBlocked(html)) {
        this._handleBlocked();
        throw new Error('请求被安全防护拦截');
      }

      await this.addLogEntry({
        timestamp: new Date(),
        action: 'debug',
        info: `HTML长度: ${html.length}字符`,
        htmlPreview: html.substring(0, 200)
      });

      const remainingKwh = this._smartParse(html);
      if (remainingKwh === null) {
        await this.addLogEntry({
          timestamp: new Date(),
          action: 'parse_failed',
          info: '无法解析剩余电量',
          htmlPreview: html.substring(0, 1000)
        });
        throw new Error('无法从网页中解析出剩余电量数据');
      }

      crawlerLogger.info(`解析到剩余电量: ${remainingKwh} kWh`);
      return {
        meter_id: this.meterId,
        meter_name: this.meterName,
        remaining_kwh: remainingKwh,
        collected_at: new Date()
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  _isBlocked(html) {
    const blockKeywords = ['blocked', '安全威胁', '被阻断', 'Tunnel website ahead!', '405'];
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1];
      if (blockKeywords.some(k => title.includes(k))) return true;
    }
    return false;
  }

  _handleBlocked() {
    this.useDirectIP = true;
    this.currentIPIndex = (this.currentIPIndex + 1) % this.directIPs.length;
    this._updateUrl();
    this.updateStats('ipSwitches');
    crawlerLogger.warn(`被拦截，切换到下一个IP: ${this.directIPs[this.currentIPIndex]}`);
  }

  _smartParse(html) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const allText = doc.body ? doc.body.textContent : '';
    crawlerLogger.info(`提取文本长度: ${allText.length}`);

    const strategies = [
      () => this._parseByRegex(allText),
      () => this._parseByDom(doc),
      () => this._parseByKeyword(doc),
      () => this._parseByNumberHeuristic(allText)
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result !== null) {
        crawlerLogger.info(`解析成功: ${result} kWh`);
        return result;
      }
    }
    return null;
  }

  _parseByRegex(text) {
    const patterns = [
      /剩余电量[:：]\s*([\d.]+)\s*kWh?/i,
      /剩余[:：]\s*([\d.]+)\s*kWh?/i,
      /剩余\s*([\d.]+)\s*kWh?/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const val = parseFloat(match[1]);
        if (val > 0 && val < 1000) return val;
      }
    }
    return null;
  }

  _parseByDom(doc) {
    const el = Array.from(doc.querySelectorAll('*')).find(el =>
      el.textContent.includes('剩余电量')
    );
    if (el) {
      const parentText = (el.parentElement ? el.parentElement.textContent : el.textContent);
      const match = parentText.match(/剩余电量[:：]\s*([\d.]+)/);
      if (match) {
        const val = parseFloat(match[1]);
        if (val > 0 && val < 100) return val;
      }
    }
    return null;
  }

  _parseByKeyword(doc) {
    const el = Array.from(doc.querySelectorAll('*')).find(el => {
      const t = el.textContent.trim();
      return t.includes('剩余') && t.includes('电量');
    });
    if (el) {
      const match = el.textContent.trim().match(/([\d.]+)/);
      if (match) {
        const val = parseFloat(match[1]);
        if (val > 0 && val < 100) return val;
      }
    }
    return null;
  }

  _parseByNumberHeuristic(text) {
    const numbers = text.match(/\d+\.?\d*/g);
    if (!numbers) return null;
    const valid = numbers
      .map(n => parseFloat(n))
      .filter(n => n > 0.5 && n < 100 && n.toString().includes('.'))
      .sort((a, b) => a - b);
    if (valid.length === 0) return null;
    return valid[Math.floor(valid.length / 2)];
  }

  async saveData(data) {
    const record = Format.createRecord({
      meter_id: data.meter_id,
      meter_name: data.meter_name,
      remaining_kwh: data.remaining_kwh,
      collected_at: data.collected_at,
      source: Format.SOURCES.LOCAL
    });
    const usageData = Format.toUsageModel(record);
    try {
      const usage = new Usage(usageData);
      await usage.save();
      crawlerLogger.info(`数据已保存: ${JSON.stringify(usageData)} (crawl_id: ${record.crawl_id})`);
    } catch (error) {
      if (error.code === 11000) {
        crawlerLogger.warn('数据已存在（重复），跳过保存');
        return;
      }
      throw new Error(`数据库保存失败: ${error.message}`);
    }
  }

  makeHttpRequest(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      const targetHost = CONFIG.TARGET_HOST;
      const proxyHosts = ['loca.lt', 'localhost', '127.0.0.1', 'vercel.app', 'ngrok-free.app'];
      const isProxyHost = proxyHosts.some(h => urlObj.hostname.endsWith(h));
      const skipVerify = isHttps && ['loca.lt', 'localhost', '127.0.0.1'].some(h => urlObj.hostname.endsWith(h));

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': `https://${targetHost}/`,
          'Host': isProxyHost ? urlObj.hostname : targetHost
        },
        timeout: CONFIG.REQUEST_TIMEOUT,
        agent: this.agentPool.getAgent(urlObj.hostname, isHttps, skipVerify)
      };

      const delay = Math.floor(Math.random() * 1000) + 500;
      setTimeout(() => {
        const req = httpModule.request(options, (res) => {
          const chunks = [];
          const encoding = (res.headers['content-encoding'] || '').toLowerCase();

          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (encoding === 'gzip') {
              zlib.gunzip(buffer, (err, result) => err ? reject(err) : resolve(result.toString()));
            } else if (encoding === 'deflate') {
              zlib.inflate(buffer, (err, result) => err ? reject(err) : resolve(result.toString()));
            } else if (encoding === 'br') {
              zlib.brotliDecompress(buffer, (err, result) => err ? reject(err) : resolve(result.toString()));
            } else {
              resolve(buffer.toString());
            }
          });
        });

        req.on('error', (error) => reject(error));
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        req.end();
      }, delay);
    });
  }

  async _checkBatteryAlert(remainingKwh) {
    if (remainingKwh <= this.batteryAlertThreshold) {
      const now = Date.now();
      const cooldownMs = this.batteryAlertCooldownHours * 60 * 60 * 1000;
      
      if (!this.lastBatteryAlertTime || now - this.lastBatteryAlertTime >= cooldownMs) {
        crawlerLogger.warn(`电量低于阈值！当前 ${remainingKwh} kWh，阈值 ${this.batteryAlertThreshold} kWh，发送告警`);
        const sent = await alerter.alertLowBattery(remainingKwh, this.batteryAlertThreshold);
        if (sent) {
          this.lastBatteryAlertTime = now;
          this.updateStats('batteryAlerts');
          await this.addLogEntry({
            timestamp: new Date(),
            action: 'battery_alert',
            info: `电量告警已发送: ${remainingKwh} kWh`,
            data: { remaining_kwh: remainingKwh, threshold: this.batteryAlertThreshold }
          });
        }
      } else {
        const remainingCooldown = Math.round((cooldownMs - (now - this.lastBatteryAlertTime)) / 3600000);
        crawlerLogger.info(`电量低于阈值但处于冷却期，${remainingCooldown}小时后可再次发送告警`);
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async manualCrawl() {
    crawlerLogger.info('手动触发数据爬取');
    await this.crawlData();
  }

  startCloudBackup() {
    const randomDelay = Math.floor(Math.random() * 30) * 60 * 1000;
    crawlerLogger.info(`云端保障爬虫将在 ${Math.round(randomDelay / 60000)} 分钟后开始首次采集`);
    setTimeout(() => {
      this.crawlData().catch(e => crawlerLogger.error(`云端首次采集失败: ${e.message}`));
      cron.schedule('0,30 * * * *', () => {
        setTimeout(() => this.crawlData(), Math.floor(Math.random() * 120) * 1000);
      }, { timezone: 'Asia/Shanghai' });
      crawlerLogger.info('云端保障爬虫已启动，每30分钟执行一次');
    }, randomDelay);
  }

  async gracefulShutdown() {
    crawlerLogger.info('正在优雅关闭爬虫...');
    this.agentPool.destroyAll();
    crawlerLogger.info('HTTP连接池已关闭');
  }
}

async function parseHtml(html) {
  const meterId = CONFIG.METER_ID;
  const meterName = CONFIG.METER_NAME;
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const allText = doc.body ? doc.body.textContent : '';

  let remainingKwh = null;

  const reMatch = allText.match(/剩余电量[:：]\s*([\d.]+)\s*kWh?/i);
  if (reMatch) {
    remainingKwh = parseFloat(reMatch[1]);
  }

  if (remainingKwh === null) {
    const el = Array.from(doc.querySelectorAll('*')).find(el => el.textContent.includes('剩余电量'));
    if (el) {
      const text = el.parentElement ? el.parentElement.textContent : el.textContent;
      const m = text.match(/剩余电量[:：]\s*([\d.]+)/i);
      if (m) {
        const v = parseFloat(m[1]);
        if (v > 0 && v < 100) remainingKwh = v;
      }
    }
  }

  if (remainingKwh === null) {
    const el = Array.from(doc.querySelectorAll('*')).find(el => {
      const t = el.textContent.trim();
      return t.includes('剩余') && t.includes('电量');
    });
    if (el) {
      const m = el.textContent.trim().match(/([\d.]+)/);
      if (m) {
        const v = parseFloat(m[1]);
        if (v > 0 && v < 100) remainingKwh = v;
      }
    }
  }

  if (remainingKwh === null) {
    const nums = allText.match(/\d+\.?\d*/g);
    if (nums) {
      const valid = nums.map(n => parseFloat(n)).filter(n => n > 0.5 && n < 50 && n.toString().includes('.')).sort((a, b) => a - b);
      if (valid.length > 0) remainingKwh = valid[Math.floor(valid.length / 2)];
    }
  }

  if (remainingKwh === null) throw new Error('无法解析剩余电量');
  return {
    meter_id: meterId,
    meter_name: meterName,
    remaining_kwh: remainingKwh,
    collected_at: new Date()
  };
}

module.exports = Object.assign(new ElectricityCrawler(), { parseHtml });

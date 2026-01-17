// Puppeteer版本的爬虫 - 完全模拟真实浏览器
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const Usage = require('../models/Usage');
const { crawlerLogger } = require('../utils/logger');

class ElectricityCrawlerPuppeteer {
  constructor() {
    this.url = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
    this.meterId = '18100071580';
    this.meterName = '2759弄18号402阳台';
    this.maxRetries = 3;
    this.retryDelay = 5000;
    
    // 存储最近的日志
    this.logEntries = [];
    this.maxLogEntries = 100;
  }
  
  addLogEntry(entry) {
    this.logEntries.unshift(entry);
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.pop();
    }
  }
  
  getLogs(limit = 100) {
    return this.logEntries.slice(0, limit);
  }

  start() {
    cron.schedule('*/15 * * * *', () => {
      const randomDelay = Math.floor(Math.random() * 300) * 1000;
      setTimeout(() => {
        this.crawlData();
      }, randomDelay);
    }, {
      timezone: 'Asia/Shanghai'
    });
    
    crawlerLogger.info('Puppeteer爬虫定时任务已启动（每15分钟执行一次）');
    
    const initialDelay = Math.floor(Math.random() * 60 + 30) * 1000;
    setTimeout(() => {
      this.crawlData();
    }, initialDelay);
  }

  async crawlData() {
    let retryCount = 0;
    const startTime = new Date();
    
    while (retryCount < this.maxRetries) {
      try {
        const logEntry = {
          timestamp: new Date(),
          action: 'crawl_start',
          retryCount: retryCount + 1,
          url: this.url
        };
        this.addLogEntry(logEntry);
        
        const data = await this.fetchElectricityData();
        if (data) {
          await this.saveData(data);
          const duration = Date.now() - startTime.getTime();
          crawlerLogger.info('数据爬取并保存成功');
          
          const successLog = {
            timestamp: new Date(),
            action: 'success',
            duration: `${duration}ms`,
            data: data,
            retryCount: retryCount + 1
          };
          this.addLogEntry(successLog);
          
          return;
        }
      } catch (error) {
        retryCount++;
        crawlerLogger.error(`第${retryCount}次尝试失败: ${error.message}`);
        
        const errorLog = {
          timestamp: new Date(),
          action: 'error',
          error: error.message,
          retryCount: retryCount
        };
        this.addLogEntry(errorLog);
        
        if (retryCount < this.maxRetries) {
          crawlerLogger.info(`${this.retryDelay/1000}秒后重试...`);
          await this.delay(this.retryDelay);
        } else {
          crawlerLogger.error(`爬取失败，已重试${this.maxRetries}次: ${error.message}`);
          
          const failLog = {
            timestamp: new Date(),
            action: 'failed',
            error: error.message,
            retryCount: retryCount
          };
          this.addLogEntry(failLog);
        }
      }
    }
  }

  async fetchElectricityData() {
    let browser = null;
    
    try {
      crawlerLogger.info('启动Puppeteer浏览器...');
      
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--window-size=1920,1080'
        ]
      });
      
      const page = await browser.newPage();
      
      // 设置真实的浏览器特征
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1');
      
      // 设置视口
      await page.setViewport({ width: 375, height: 812 });
      
      // 伪造WebDriver属性
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });
      
      crawlerLogger.info(`访问目标URL: ${this.url}`);
      
      // 访问页面，等待加载完成
      await page.goto(this.url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // 等待页面完全加载
      await page.waitForSelector('body', { timeout: 10000 });
      
      // 额外等待JavaScript执行
      await page.waitForTimeout(2000);
      
      // 获取页面内容
      const html = await page.content();
      const text = await page.evaluate(() => document.body.innerText);
      
      crawlerLogger.info(`获取HTML成功，长度: ${html.length} 字符`);
      
      this.addLogEntry({
        timestamp: new Date(),
        action: 'debug',
        info: `HTML长度: ${html.length}`,
        textPreview: text.substring(0, 300)
      });
      
      // 检查是否被拦截
      if (html.includes('blocked') || html.includes('<title>405</title>') || html.includes('安全威胁')) {
        throw new Error('请求被安全防护拦截');
      }
      
      // 解析电量数据
      const remainingKwh = await this.parseElectricityData(text);
      
      if (remainingKwh === null) {
        throw new Error('无法从网页中解析出剩余电量数据');
      }
      
      crawlerLogger.info(`成功解析电量: ${remainingKwh} kWh`);
      
      return {
        meter_id: this.meterId,
        meter_name: this.meterName,
        remaining_kwh: remainingKwh,
        collected_at: new Date()
      };
      
    } catch (error) {
      crawlerLogger.error('Puppeteer错误:', error.message);
      throw new Error(`Puppeteer爬取失败: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
        crawlerLogger.info('浏览器已关闭');
      }
    }
  }
  
  async parseElectricityData(text) {
    // 尝试正则匹配
    const regex = /(\d+\.?\d*)\s*kWh/i;
    const match = text.match(regex);
    
    if (match) {
      return parseFloat(match[1]);
    }
    
    // 尝试查找包含"剩余"的数字
    const numberMatches = text.match(/\d+\.?\d*/g);
    if (numberMatches) {
      const validNumbers = numberMatches
        .map(num => parseFloat(num))
        .filter(num => num > 0 && num < 1000 && num.toString().includes('.'))
        .sort((a, b) => b - a);
      
      if (validNumbers.length > 0) {
        return validNumbers[0];
      }
    }
    
    return null;
  }

  async saveData(data) {
    try {
      const usage = new Usage(data);
      await usage.save();
      crawlerLogger.info(`数据已保存: ${JSON.stringify(data)}`);
    } catch (error) {
      throw new Error(`数据库保存失败: ${error.message}`);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async manualCrawl() {
    crawlerLogger.info('手动触发数据爬取');
    await this.crawlData();
  }
}

module.exports = new ElectricityCrawlerPuppeteer();


// 使用Node.js内置http模块，完全避免undici问题
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { JSDOM } = require('jsdom');
const cron = require('node-cron');
const Usage = require('../models/Usage');
const { crawlerLogger } = require('../utils/logger');

class ElectricityCrawler {
  constructor() {
    this.url = 'http://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
    this.meterId = '18100071580';
    this.meterName = '2759弄18号402阳台';
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5秒
  }

  // 启动定时任务
  start() {
    // 每10分钟执行一次
    cron.schedule('*/10 * * * *', () => {
      this.crawlData();
    });
    
    crawlerLogger.info('爬虫定时任务已启动，每10分钟执行一次');
    
    // 立即执行一次
    this.crawlData();
  }

  // 爬取数据
  async crawlData() {
    let retryCount = 0;
    
    while (retryCount < this.maxRetries) {
      try {
        crawlerLogger.info(`开始爬取数据，第${retryCount + 1}次尝试`);
        
        const data = await this.fetchElectricityData();
        if (data) {
          await this.saveData(data);
          crawlerLogger.info('数据爬取并保存成功');
          return;
        }
      } catch (error) {
        retryCount++;
        crawlerLogger.error(`第${retryCount}次尝试失败: ${error.message}`);
        
        if (retryCount < this.maxRetries) {
          crawlerLogger.info(`${this.retryDelay/1000}秒后重试...`);
          await this.delay(this.retryDelay);
        } else {
          crawlerLogger.error(`爬取失败，已重试${this.maxRetries}次: ${error.message}`);
        }
      }
    }
  }

  // 获取电力数据
  async fetchElectricityData() {
    try {
      const html = await this.makeHttpRequest(this.url);
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // 解析剩余电量数据
      let remainingKwh = null;
      
      // 首先尝试查找所有数字，然后筛选出合理的电量值
      const allText = document.body.textContent;
      const numberMatches = allText.match(/\d+\.?\d*/g);
      
      if (numberMatches) {
        // 筛选出合理的电量值（通常在0-1000之间，且包含小数点）
        const validNumbers = numberMatches
          .map(num => parseFloat(num))
          .filter(num => num > 0 && num < 1000 && num.toString().includes('.'))
          .sort((a, b) => b - a); // 按降序排列，取最大值
        
        if (validNumbers.length > 0) {
          remainingKwh = validNumbers[0];
          crawlerLogger.info(`从网页中找到电量数字: ${validNumbers.join(', ')}`);
        }
      }

      // 如果上述方法没找到，尝试查找包含特定关键词的元素
      if (remainingKwh === null) {
        const keywords = ['剩余', '余额', '电量', 'kWh', '度'];
        for (const keyword of keywords) {
          const elements = document.querySelectorAll('*');
          for (const element of elements) {
            const text = element.textContent.trim();
            if (text.includes(keyword)) {
              const match = text.match(/(\d+\.?\d*)/);
              if (match) {
                const num = parseFloat(match[1]);
                if (num > 0 && num < 1000) {
                  remainingKwh = num;
                  crawlerLogger.info(`通过关键词"${keyword}"找到电量: ${num}`);
                  break;
                }
              }
            }
          }
          if (remainingKwh !== null) break;
        }
      }

      if (remainingKwh === null) {
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
      throw new Error(`HTTP请求失败: ${error.message}`);
    }
  }

  // 保存数据到数据库
  async saveData(data) {
    try {
      const usage = new Usage(data);
      await usage.save();
      crawlerLogger.info(`数据已保存: ${JSON.stringify(data)}`);
    } catch (error) {
      throw new Error(`数据库保存失败: ${error.message}`);
    }
  }

  // 使用Node.js内置http模块发送请求
  makeHttpRequest(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 30000
      };

      const req = httpModule.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  // 延迟函数
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 手动触发爬取（用于测试）
  async manualCrawl() {
    crawlerLogger.info('手动触发数据爬取');
    await this.crawlData();
  }
}

module.exports = new ElectricityCrawler();

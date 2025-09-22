// 使用Node.js内置fetch替代axios
const fetch = require('node-fetch');
const cheerio = require('cheerio');
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
      const response = await fetch(this.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 30000
      });

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // 解析剩余电量数据
      // 需要根据实际网页结构调整选择器
      let remainingKwh = null;
      
      // 尝试多种可能的选择器
      const selectors = [
        '.remaining-kwh',
        '.kwh-remaining', 
        '.balance',
        '.amount',
        '[class*="kwh"]',
        '[class*="remaining"]',
        '[class*="balance"]',
        'td:contains("剩余")',
        'span:contains("kWh")',
        'div:contains("度")'
      ];

      for (const selector of selectors) {
        const element = $(selector);
        if (element.length > 0) {
          const text = element.text().trim();
          const match = text.match(/(\d+\.?\d*)/);
          if (match) {
            remainingKwh = parseFloat(match[1]);
            break;
          }
        }
      }

      // 如果上述选择器都没找到，尝试查找包含数字的文本
      if (remainingKwh === null) {
        $('*').each(function() {
          const text = $(this).text().trim();
          if (text.match(/\d+\.?\d*\s*(kWh|度|千瓦时)/i)) {
            const match = text.match(/(\d+\.?\d*)/);
            if (match) {
              remainingKwh = parseFloat(match[1]);
              return false; // 跳出循环
            }
          }
        });
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

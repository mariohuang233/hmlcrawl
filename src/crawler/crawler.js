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
    // 如果Railway IP被封，可以尝试直连IP
    this.useDirectIP = process.env.USE_DIRECT_IP === 'true';
    this.directIP = process.env.DIRECT_IP || '113.59.225.83'; // 备用IP（如果有）
    
    this.url = this.useDirectIP && this.directIP 
      ? `https://${this.directIP}/nat/pay.aspx?mid=18100071580`
      : 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
    
    this.meterId = '18100071580';
    this.meterName = '2759弄18号402阳台';
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5秒
    
    // 存储最近的日志（最多100条）
    this.logEntries = [];
    this.maxLogEntries = 100;
  }
  
  // 添加日志条目
  addLogEntry(entry) {
    this.logEntries.unshift(entry);
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.pop();
    }
  }
  
  // 获取日志
  getLogs(limit = 100) {
    return this.logEntries.slice(0, limit);
  }

  // 启动定时任务
  start() {
    // 改为15分钟执行一次，并添加随机延迟
    cron.schedule('*/15 * * * *', () => {
      // 添加随机延迟 0-300秒（0-5分钟）
      const randomDelay = Math.floor(Math.random() * 300) * 1000;
      setTimeout(() => {
        this.crawlData();
      }, randomDelay);
    }, {
      timezone: 'Asia/Shanghai'
    });
    
    crawlerLogger.info('爬虫定时任务已启动，每15分钟执行一次（带随机延迟）');
    
    // 启动时也添加随机延迟
    const initialDelay = Math.floor(Math.random() * 60 + 30) * 1000; // 30-90秒
    setTimeout(() => {
      this.crawlData();
    }, initialDelay);
  }

  // 爬取数据
  async crawlData() {
    let retryCount = 0;
    const startTime = new Date();
    
    while (retryCount < this.maxRetries) {
      try {
        crawlerLogger.info(`开始爬取数据，第${retryCount + 1}次尝试`);
        
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

  // 获取电力数据
  async fetchElectricityData() {
    try {
      const html = await this.makeHttpRequest(this.url);
      crawlerLogger.info(`获取HTML成功，长度: ${html.length} 字符`);
      
      // 检查是否被拦截
      if (html.includes('blocked') || html.includes('<title>405</title>') || html.includes('安全威胁') || html.includes('被阻断')) {
        this.addLogEntry({
          timestamp: new Date(),
          action: 'blocked',
          info: '请求被安全防护拦截',
          htmlPreview: html.substring(0, 300)
        });
        throw new Error('请求被安全防护拦截，返回405错误页面');
      }
      
      // 添加调试日志到日志记录
      this.addLogEntry({
        timestamp: new Date(),
        action: 'debug',
        info: `HTML长度: ${html.length}字符`,
        htmlPreview: html.substring(0, 300)
      });
      
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // 解析剩余电量数据
      let remainingKwh = null;
      
      // 首先尝试查找所有数字，然后筛选出合理的电量值
      const allText = document.body ? document.body.textContent : '';
      crawlerLogger.info(`提取的文本长度: ${allText.length}`);
      
      this.addLogEntry({
        timestamp: new Date(),
        action: 'debug',
        info: `文本长度: ${allText.length}字符`,
        textPreview: allText.substring(0, 300)
      });
      
      const numberMatches = allText.match(/\d+\.?\d*/g);
      crawlerLogger.info(`找到数字匹配: ${numberMatches ? numberMatches.length : 0} 个`);
      
      this.addLogEntry({
        timestamp: new Date(),
        action: 'debug',
        info: `找到数字: ${numberMatches ? numberMatches.length : 0} 个`,
        numbers: numberMatches ? numberMatches.slice(0, 20) : []
      });
      
      if (numberMatches) {
        // 筛选出合理的电量值（通常在0-1000之间，且包含小数点）
        const validNumbers = numberMatches
          .map(num => parseFloat(num))
          .filter(num => num > 0 && num < 1000 && num.toString().includes('.'))
          .sort((a, b) => b - a); // 按降序排列，取最大值
        
        crawlerLogger.info(`有效数字: ${validNumbers.length} 个`);
        
        if (validNumbers.length > 0) {
          remainingKwh = validNumbers[0];
          crawlerLogger.info(`从网页中找到电量数字: ${validNumbers.join(', ')}`);
        }
      }

      // 如果上述方法没找到，尝试查找包含特定关键词的元素
      if (remainingKwh === null) {
        crawlerLogger.info('尝试通过关键词搜索剩余电量...');
        // 查找包含"剩余电量:"的文本
        const allText = document.body.textContent || document.body.innerText || '';
        const remainingMatch = allText.match(/剩余电量:\s*(\d+\.?\d*)\s*kWh/i);
        if (remainingMatch) {
          remainingKwh = parseFloat(remainingMatch[1]);
          crawlerLogger.info(`通过正则找到剩余电量: ${remainingKwh} kWh`);
        } else {
          // 备用方法：查找所有包含"剩余"的元素
          const keywords = ['剩余', '余额', '电量', 'kWh'];
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
      }

      if (remainingKwh === null) {
        // 记录解析失败的详细信息
        this.addLogEntry({
          timestamp: new Date(),
          action: 'parse_failed',
          info: '无法解析剩余电量',
          allTextPreview: allText.substring(0, 1000)
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
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'max-age=0',
          'Connection': 'keep-alive',
          'Priority': 'u=0, i',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          // 不发送Cookie，让服务器生成新会话
          'Referer': 'http://www.wap.cnyiot.com/',
          'Host': 'www.wap.cnyiot.com'  // 始终使用原始Host，即使直连IP

        },
        timeout: 45000 // 增加超时时间
      };

      // 添加更长的随机延迟，模拟真实用户
      const delay = Math.floor(Math.random() * 3000) + 2000; // 2-5秒随机延迟
      
      setTimeout(() => {
        const req = httpModule.request(options, (res) => {
          let data = '';
          
          // 处理gzip压缩
          if (res.headers['content-encoding'] === 'gzip') {
            const zlib = require('zlib');
            const gunzip = zlib.createGunzip();
            res.pipe(gunzip);
            gunzip.on('data', (chunk) => {
              data += chunk.toString();
            });
            gunzip.on('end', () => {
              resolve(data);
            });
            gunzip.on('error', (error) => {
              reject(error);
            });
          } else if (res.headers['content-encoding'] === 'deflate') {
            const zlib = require('zlib');
            const inflate = zlib.createInflate();
            res.pipe(inflate);
            inflate.on('data', (chunk) => {
              data += chunk.toString();
            });
            inflate.on('end', () => {
              resolve(data);
            });
            inflate.on('error', (error) => {
              reject(error);
            });
          } else {
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              resolve(data);
            });
          }
        });

        req.on('error', (error) => {
          crawlerLogger.error('HTTP请求错误:', error.message);
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          crawlerLogger.error('HTTP请求超时');
          reject(new Error('Request timeout'));
        });

        req.end();
      }, delay);

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

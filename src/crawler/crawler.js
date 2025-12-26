// 使用Node.js内置http模块，完全避免undici问题
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { JSDOM } = require('jsdom');
const cron = require('node-cron');
const Usage = require('../models/Usage');
const { crawlerLogger } = require('../utils/logger');

// 爬虫配置常量
const CONFIG = {
  // 代理配置
  PROXY_URL: process.env.PROXY_URL || process.env.VERCEL_PROXY_URL,
  USE_PROXY: !!process.env.PROXY_URL || !!process.env.VERCEL_PROXY_URL,
  
  // HTTP代理
  HTTP_PROXY: process.env.HTTP_PROXY || process.env.HTTPS_PROXY,
  
  // 直连IP配置
  USE_DIRECT_IP: process.env.USE_DIRECT_IP === 'true',
  DIRECT_IPS: [
    '121.41.227.153',
    '47.99.204.107',
    '120.26.164.242',
    '47.99.209.106',
    '47.97.48.100'
  ],
  
  // 目标配置
  TARGET_URL: 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580',
  METER_ID: '18100071580',
  METER_NAME: '2759弄18号402阳台',
  
  // 重试配置
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 5000, // 5秒
  
  // 日志配置
  MAX_LOG_ENTRIES: 200,
  
  // 代理主机列表
  PROXY_HOSTS: ['loca.lt', 'localhost', '127.0.0.1', 'vercel.app', 'ngrok-free.app'],
  
  // 跳过TLS验证的主机
  SKIP_TLS_HOSTS: ['loca.lt', 'localhost', '127.0.0.1'],
  
  // 目标主机
  TARGET_HOST: 'www.wap.cnyiot.com',
  
  // Agent配置
  AGENT_OPTIONS: {
    keepAlive: true,
    maxSockets: 5,
    keepAliveMsecs: 10000
  },
  
  // 随机延迟配置
  MIN_DELAY: 500, // 0.5秒
  MAX_DELAY: 1500, // 1.5秒
  
  // 请求超时
  REQUEST_TIMEOUT: 30000 // 30秒
};

class ElectricityCrawler {
  constructor() {
    // 通用代理配置
    this.proxyUrl = CONFIG.PROXY_URL;
    this.useProxy = CONFIG.USE_PROXY;
    
    // 代理配置
    this.proxy = CONFIG.HTTP_PROXY;
    
    // 直连IP配置
    this.useDirectIP = CONFIG.USE_DIRECT_IP;
    this.directIPs = CONFIG.DIRECT_IPS;
    this.currentIPIndex = 0;
    
    // 计算当前使用的URL
    this.targetUrl = CONFIG.TARGET_URL;
    this.url = this.useProxy 
      ? this.proxyUrl
      : this.useDirectIP 
        ? `https://${this.directIPs[this.currentIPIndex]}/nat/pay.aspx?mid=${CONFIG.METER_ID}`
        : this.targetUrl;
    
    this.meterId = CONFIG.METER_ID;
    this.meterName = CONFIG.METER_NAME;
    this.maxRetries = CONFIG.MAX_RETRIES;
    this.initialRetryDelay = CONFIG.INITIAL_RETRY_DELAY;
    
    // 存储最近的日志
    this.logEntries = [];
    this.maxLogEntries = CONFIG.MAX_LOG_ENTRIES;
    
    // 统计信息
    this.stats = {
      totalCrawls: 0,
      successfulCrawls: 0,
      failedCrawls: 0,
      retryCount: 0,
      proxySwitches: 0,
      ipSwitches: 0,
      lastCrawlTime: null,
      lastSuccessfulCrawl: null
    };
    
    crawlerLogger.info(`爬虫配置: 使用代理=${this.useProxy}, 直连IP=${this.useDirectIP}`);
  }
  
  // 添加日志条目
  addLogEntry(entry) {
    // 确保条目包含时间戳
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };
    
    this.logEntries.unshift(logEntry);
    
    // 限制日志条目数量
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.pop();
    }
    
    // 同时记录到日志文件
    crawlerLogger.info(JSON.stringify(logEntry));
  }
  
  // 获取日志
  getLogs(limit = 100) {
    return this.logEntries.slice(0, limit);
  }
  
  // 获取爬虫统计信息
  getStats() {
    return {
      ...this.stats,
      currentUrl: this.url,
      useProxy: this.useProxy,
      useDirectIP: this.useDirectIP,
      currentIP: this.useDirectIP ? this.directIPs[this.currentIPIndex] : null,
      directIPCount: this.directIPs.length,
      logCount: this.logEntries.length
    };
  }
  
  // 更新统计信息
  updateStats(statName, value = 1) {
    if (statName === 'lastCrawlTime' || statName === 'lastSuccessfulCrawl') {
      this.stats[statName] = new Date().toISOString();
    } else {
      this.stats[statName] = (this.stats[statName] || 0) + value;
    }
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
      if (html.includes('blocked') || html.includes('<title>405</title>') || html.includes('安全威胁') || html.includes('被阻断') || html.includes('Tunnel website ahead!')) {
        this.addLogEntry({
          timestamp: new Date(),
          action: 'blocked',
          info: '请求被安全防护拦截',
          htmlPreview: html.substring(0, 300)
        });
        
        // 如果当前使用代理且是localtunnel，优先切换到VERCEL代理
        const vercelUrl = process.env.VERCEL_PROXY_URL;
        if (this.useProxy && typeof this.proxyUrl === 'string' && this.proxyUrl.includes('loca.lt') && vercelUrl) {
          this.url = vercelUrl;
          this.proxyUrl = vercelUrl;
          crawlerLogger.warn(`代理被拦截，切换到Vercel代理: ${vercelUrl}`);
          throw new Error('请求被安全防护拦截，切换Vercel代理重试');
        }

        // 如果使用直连IP且还有备用IP，尝试切换到下一个
        if (this.useDirectIP && this.currentIPIndex < this.directIPs.length - 1) {
          this.currentIPIndex++;
          this.url = `https://${this.directIPs[this.currentIPIndex]}/nat/pay.aspx?mid=18100071580`;
          crawlerLogger.warn(`切换到备用IP: ${this.directIPs[this.currentIPIndex]}`);
          throw new Error('请求被安全防护拦截，已切换到下一个IP');
        }

        // 如果当前使用代理但没有Vercel代理，尝试回退到直连IP
        if (this.useProxy && !vercelUrl) {
          this.useDirectIP = true;
          this.currentIPIndex = 0;
          this.url = `https://${this.directIPs[this.currentIPIndex]}/nat/pay.aspx?mid=18100071580`;
          crawlerLogger.warn(`代理被拦截，回退到直连IP: ${this.directIPs[this.currentIPIndex]}`);
          throw new Error('请求被安全防护拦截，回退直连IP重试');
        }
        
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
      
      // 获取所有文本
      const allText = document.body ? document.body.textContent : '';
      crawlerLogger.info(`提取的文本长度: ${allText.length}`);
      
      this.addLogEntry({
        timestamp: new Date(),
        action: 'debug',
        info: `文本长度: ${allText.length}字符`,
        textPreview: allText.substring(0, 300)
      });
      
      // 1. 优先使用更灵活的正则匹配（处理不同格式）
      const remainingMatch = allText.match(/剩余电量[:：]\s*([\d.]+)\s*kWh?/i);
      if (remainingMatch) {
        remainingKwh = parseFloat(remainingMatch[1]);
        crawlerLogger.info(`通过正则找到剩余电量: ${remainingKwh} kWh`);
      } else {
        // 2. 备用：通过DOM选择器精确查找包含"剩余电量"的元素
        crawlerLogger.info('尝试通过DOM选择器查找剩余电量...');
        const elements = document.querySelectorAll('*');
        for (const element of elements) {
          const text = element.textContent.trim();
          if (text.includes('剩余电量')) {
            // 查找包含"剩余电量"的父元素或相邻元素
            const parentElement = element.parentElement;
            if (parentElement) {
              const parentText = parentElement.textContent;
              const match = parentText.match(/剩余电量[:：]\s*([\d.]+)/);
              if (match) {
                remainingKwh = parseFloat(match[1]);
                crawlerLogger.info(`通过父元素找到剩余电量: ${remainingKwh} kWh`);
                break;
              }
            }
          }
        }
      }
      
      // 3. 备用：查找所有包含"剩余"和"电量"的元素
      if (remainingKwh === null) {
        crawlerLogger.info('尝试通过关键词组合查找剩余电量...');
        const elements = document.querySelectorAll('*');
        for (const element of elements) {
          const text = element.textContent.trim();
          if (text.includes('剩余') && text.includes('电量')) {
            const match = text.match(/([\d.]+)/);
            if (match) {
              remainingKwh = parseFloat(match[1]);
              crawlerLogger.info(`通过关键词组合找到剩余电量: ${remainingKwh} kWh`);
              break;
            }
          }
        }
      }
      
      // 4. 最后才考虑数字规则（兜底），但改进规则使其更智能
      if (remainingKwh === null) {
        const numberMatches = allText.match(/\d+\.?\d*/g);
        crawlerLogger.info(`找到数字匹配: ${numberMatches ? numberMatches.length : 0} 个`);
        
        this.addLogEntry({
          timestamp: new Date(),
          action: 'debug',
          info: `找到数字: ${numberMatches ? numberMatches.length : 0} 个`,
          numbers: numberMatches ? numberMatches.slice(0, 20) : []
        });
        
        if (numberMatches) {
          // 筛选出合理的电量值（缩小范围到0-100kWh）
          const validNumbers = numberMatches
            .map(num => parseFloat(num))
            .filter(num => num > 0 && num <= 100 && num.toString().includes('.')) // 缩小范围到0-100
            .sort((a, b) => a - b); // 按升序排序，更可能找到实际电量
          
          crawlerLogger.info(`有效数字: ${validNumbers.length} 个`);
          
          // 尝试找到最接近上一次记录或最合理的电量值
          if (validNumbers.length > 0) {
            remainingKwh = validNumbers[0];
            crawlerLogger.info(`从网页中找到电量数字: ${validNumbers.join(', ')}`);
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
      
      const targetHost = 'www.wap.cnyiot.com';
      const proxyHosts = ['loca.lt', 'localhost', '127.0.0.1', 'vercel.app', 'ngrok-free.app'];
      const isProxyHost = proxyHosts.some(h => urlObj.hostname.endsWith(h));

      // 重用Agent以提高性能
      const agentOptions = {
        keepAlive: true,
        maxSockets: 5,
        keepAliveMsecs: 10000
      };

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', // 简化Accept头
          'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': isProxyHost ? `${urlObj.protocol}//${urlObj.hostname}/` : `https://${targetHost}/`,
          'Host': isProxyHost ? urlObj.hostname : targetHost
        },
        timeout: 30000, // 调整超时时间为30秒
        agent: isHttps ? 
          new https.Agent(agentOptions) : 
          new http.Agent(agentOptions)
      };

      // 在通过 localtunnel/本地代理时跳过自签名证书校验
      try {
        if (isHttps) {
          const skipHosts = ['loca.lt', 'localhost', '127.0.0.1'];
          const shouldSkipTlsVerify = skipHosts.some(h => options.hostname.endsWith(h));
          if (shouldSkipTlsVerify) {
            options.agent = new https.Agent({ 
              ...agentOptions, 
              rejectUnauthorized: false,
              checkServerIdentity: () => undefined
            });
          }
        }
      } catch (_) {
        // 兜底：忽略设置失败，保持默认行为
      }

      // 减少随机延迟，平衡性能和反爬策略
      const delay = Math.floor(Math.random() * 1000) + 500; // 0.5-1.5秒随机延迟
      
      setTimeout(() => {
        const req = httpModule.request(options, (res) => {
          let chunks = [];
          
          // 处理gzip/deflate/br压缩
          const encoding = (res.headers['content-encoding'] || '').toLowerCase();
          
          // 优先收集Buffer，最后再转换为字符串以提高性能
          res.on('data', (chunk) => {
            chunks.push(chunk);
          });
          
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            
            if (encoding === 'gzip') {
              const zlib = require('zlib');
              zlib.gunzip(buffer, (err, result) => {
                if (err) reject(err);
                else resolve(result.toString());
              });
            } else if (encoding === 'deflate') {
              const zlib = require('zlib');
              zlib.inflate(buffer, (err, result) => {
                if (err) reject(err);
                else resolve(result.toString());
              });
            } else if (encoding === 'br') {
              const zlib = require('zlib');
              zlib.brotliDecompress(buffer, (err, result) => {
                if (err) reject(err);
                else resolve(result.toString());
              });
            } else {
              resolve(buffer.toString());
            }
          });
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

// 新增: 仅解析HTML用于前端用户上报逻辑，不关心url，只处理html文本
async function parseHtml(html) {
  const { JSDOM } = require('jsdom');
  const meterId = '18100071580';    // 如需动态传，可扩展参数
  const meterName = '2759弄18号402阳台';

  const dom = new JSDOM(html);
  const document = dom.window.document;
  let remainingKwh = null;
  const allText = document.body ? document.body.textContent : '';

  // 1. 优先使用更精确的正则匹配，确保只匹配主要的剩余电量（排除其他干扰项）
  // 改进正则：匹配"剩余电量"后紧跟的数字，并且确保前面没有其他电量相关词汇
  const remainingMatch = allText.match(/^(?:(?!(?:今日|本月|上月|历史|累计)电量).)*剩余电量[:：]\s*([\d.]+)\s*kWh?/i);
  if (remainingMatch) {
    remainingKwh = parseFloat(remainingMatch[1]);
    console.log('✨ 通过精确正则匹配找到剩余电量:', remainingKwh);
  } else {
    // 2. 备用：通过DOM选择器查找特定的电量显示区域
    // 通常剩余电量会在特定的容器或标签中，如div, span等
    console.log('🔍 尝试通过DOM结构查找剩余电量...');
    
    // 先尝试查找所有包含"剩余电量"的元素
    const remainingElements = Array.from(document.querySelectorAll('*'))
      .filter(el => el.textContent && el.textContent.includes('剩余电量'));
    
    for (const element of remainingElements) {
      // 获取包含剩余电量的完整文本
      const fullText = element.parentElement ? element.parentElement.textContent : element.textContent;
      
      // 从完整文本中提取数字，并且确保这个数字是紧跟在"剩余电量"后面的
      const match = fullText.match(/剩余电量[:：]\s*([\d.]+)/i);
      if (match) {
        const num = parseFloat(match[1]);
        // 验证数字的合理性（通常剩余电量不会太大或太小）
        if (num > 0 && num < 100) {
          remainingKwh = num;
          console.log('✨ 通过DOM结构找到剩余电量:', remainingKwh);
          break;
        }
      }
    }
  }
  
  // 3. 备用：查找所有包含"剩余"和"电量"的元素，但增加合理性检查
  if (remainingKwh === null) {
    console.log('🔍 尝试通过关键词组合查找剩余电量...');
    const elements = Array.from(document.querySelectorAll('*'))
      .filter(el => el.textContent && el.textContent.includes('剩余') && el.textContent.includes('电量'));
    
    for (const element of elements) {
      const text = element.textContent.trim();
      const match = text.match(/([\d.]+)/);
      if (match) {
        const num = parseFloat(match[1]);
        // 增加合理性检查：剩余电量通常在0-100kWh之间
        if (num > 0 && num < 100) {
          remainingKwh = num;
          console.log('✨ 通过关键词组合找到剩余电量:', remainingKwh);
          break;
        }
      }
    }
  }
  
  // 4. 最后才考虑数字规则（兜底），但大幅提高筛选条件
  if (remainingKwh === null) {
    console.log('🔍 尝试通过数字规则查找剩余电量...');
    const numberMatches = allText.match(/\d+\.?\d*/g);
    if (numberMatches) {
      const validNumbers = numberMatches
        .map(num => parseFloat(num))
        .filter(num => {
          // 更严格的筛选条件：
          // 1. 电量在0.5-50kWh之间（根据实际使用情况调整）
          // 2. 必须包含小数点（剩余电量通常有小数）
          // 3. 小数位数不超过3位
          const numStr = num.toString();
          return num > 0.5 && num < 50 && 
                 numStr.includes('.') && 
                 numStr.split('.')[1]?.length <= 3;
        })
        .sort((a, b) => a - b); // 按升序排序
      
      console.log('筛选后的有效数字:', validNumbers);
      
      // 如果有多个有效数字，优先选择中间范围的（通常剩余电量不会是最大或最小值）
      if (validNumbers.length > 0) {
        // 选择中间位置的数字
        const midIndex = Math.floor(validNumbers.length / 2);
        remainingKwh = validNumbers[midIndex];
        console.log('✨ 通过兜底规则找到剩余电量:', remainingKwh);
      }
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


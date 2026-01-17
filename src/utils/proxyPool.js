// 代理池管理模块
const http = require('http');
const https = require('https');
const { URL } = require('url');
const logger = require('./logger');

// HTTP和HTTPS代理agent缓存
const httpAgents = new Map();
const httpsAgents = new Map();

class ProxyPool {
  constructor() {
    // 代理列表
    this.proxies = [];
    this.currentIndex = 0;
    this.failedProxies = new Map(); // 使用Map存储失败次数
    this.maxRetriesPerProxy = 2;
    this.checkedProxies = new Set(); // 已测试的代理
    this.lastRefreshTime = 0;
    this.refreshInterval = 3600000; // 1小时刷新一次代理列表
    
    // 初始化代理列表
    this.initializeProxies();
  }
  
  // 初始化代理列表
  async initializeProxies() {
    // 检查是否需要刷新代理列表
    const now = Date.now();
    if (now - this.lastRefreshTime > this.refreshInterval) {
      this.lastRefreshTime = now;
      this.checkedProxies.clear();
    }
    
    // 从环境变量获取固定代理
    const fixedProxies = this.getProxiesFromEnv();
    
    // 从API获取临时代理（如果有实现）
    let apiProxies = [];
    try {
      apiProxies = await this.fetchProxiesFromAPI();
    } catch (error) {
      logger.error('从API获取代理失败:', error.message);
    }
    
    // 合并代理列表，去重
    this.proxies = this.mergeAndDeduplicateProxies([...fixedProxies, ...apiProxies]);
    
    logger.info(`代理池初始化，共有 ${this.proxies.length} 个代理`);
    
    // 异步测试代理可用性
    this.testProxiesInBackground();
  }
  
  // 合并并去重代理
  mergeAndDeduplicateProxies(proxies) {
    const uniqueProxies = new Map();
    proxies.forEach(proxy => {
      const key = `${proxy.host}:${proxy.port}`;
      if (!uniqueProxies.has(key)) {
        uniqueProxies.set(key, proxy);
      }
    });
    return Array.from(uniqueProxies.values());
  }
  
  // 从环境变量获取代理
  getProxiesFromEnv() {
    const proxies = [];
    
    // 支持多个代理，用逗号分隔
    const proxyString = process.env.PROXY_LIST;
    if (proxyString) {
      const proxyPairs = proxyString.split(',');
      for (const pair of proxyPairs) {
        const [host, port] = pair.trim().split(':');
        if (host && port && !isNaN(port)) {
          proxies.push({ host, port: parseInt(port), type: 'http' });
        }
      }
    }
    
    return proxies;
  }
  
  // 从免费代理API获取代理列表（可选实现）
  async fetchProxiesFromAPI() {
    try {
      // 这里可以实现获取免费代理的逻辑
      // 例如从 http://www.89ip.cn 等免费代理网站抓取
      // 由于代理网站结构经常变化，这里只提供一个框架
      
      return [];
    } catch (error) {
      logger.error('获取代理列表失败:', error.message);
      return [];
    }
  }
  
  // 异步测试代理可用性（后台运行，不阻塞主线程）
  async testProxiesInBackground() {
    if (this.proxies.length === 0) return;
    
    const testPromises = this.proxies
      .filter(proxy => !this.checkedProxies.has(`${proxy.host}:${proxy.port}`))
      .map(proxy => this.testProxy(proxy));
    
    await Promise.allSettled(testPromises);
  }
  
  // 测试代理是否可用
  async testProxy(proxy) {
    const proxyKey = `${proxy.host}:${proxy.port}`;
    
    try {
      // 设置较短的超时时间
      const options = {
        hostname: proxy.host,
        port: proxy.port,
        method: 'CONNECT',
        path: 'www.baidu.com:443',
        timeout: 3000 // 缩短超时时间为3秒
      };
      
      return new Promise((resolve) => {
        const req = http.request(options);
        
        req.on('connect', (res, socket, head) => {
          socket.destroy();
          this.checkedProxies.add(proxyKey);
          this.failedProxies.delete(proxyKey); // 清除失败记录
          resolve(true); // 代理可用
        });
        
        req.on('timeout', () => {
          req.destroy();
          this.checkedProxies.add(proxyKey);
          resolve(false); // 代理不可用
        });
        
        req.on('error', () => {
          this.checkedProxies.add(proxyKey);
          resolve(false); // 代理不可用
        });
        
        req.end();
      });
    } catch (error) {
      this.checkedProxies.add(proxyKey);
      return false;
    }
  }
  
  // 创建并缓存HTTP/HTTPS代理agent
  createProxyAgent(proxy, isHttps = false) {
    const proxyKey = `${proxy.host}:${proxy.port}`;
    const agents = isHttps ? httpsAgents : httpAgents;
    
    // 如果agent已存在，直接返回
    if (agents.has(proxyKey)) {
      return agents.get(proxyKey);
    }
    
    // 创建新的agent
    const agentOptions = {
      host: proxy.host,
      port: proxy.port,
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 15000
    };
    
    const AgentClass = isHttps ? https.Agent : http.Agent;
    const agent = new AgentClass(agentOptions);
    
    // 缓存agent
    agents.set(proxyKey, agent);
    
    return agent;
  }
  
  // 获取下一个可用代理
  async getNextProxy() {
    if (this.proxies.length === 0) {
      return null;
    }
    
    // 如果所有代理都达到最大失败次数，重置失败计数
    let allFailed = true;
    for (const proxy of this.proxies) {
      const key = `${proxy.host}:${proxy.port}`;
      const failedCount = this.failedProxies.get(key) || 0;
      if (failedCount < this.maxRetriesPerProxy) {
        allFailed = false;
        break;
      }
    }
    
    if (allFailed) {
      logger.info('所有代理都达到最大失败次数，重置失败计数');
      this.failedProxies.clear();
      this.currentIndex = 0;
      
      // 重新测试所有代理
      this.testProxiesInBackground();
    }
    
    // 轮询选择代理
    let attempts = 0;
    while (attempts < this.proxies.length * 2) { // 增加尝试次数
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      attempts++;
      
      const key = `${proxy.host}:${proxy.port}`;
      const failedCount = this.failedProxies.get(key) || 0;
      
      // 如果代理未失败或失败次数未达上限，返回
      if (failedCount < this.maxRetriesPerProxy) {
        // 如果代理已测试并可用，直接返回
        if (this.checkedProxies.has(key) && !this.failedProxies.has(key)) {
          return proxy;
        }
        // 否则返回待测试的代理
        return proxy;
      }
    }
    
    // 如果都失败过，返回第一个
    return this.proxies[0];
  }
  
  // 标记代理为失败
  markProxyFailed(proxy) {
    if (proxy) {
      const key = `${proxy.host}:${proxy.port}`;
      const failedCount = this.failedProxies.get(key) || 0;
      
      if (failedCount < this.maxRetriesPerProxy) {
        this.failedProxies.set(key, failedCount + 1);
      }
      
      logger.debug(`代理 ${proxy.host}:${proxy.port} 标记为失败，失败次数: ${failedCount + 1}`);
    }
  }
  
  // 标记代理为成功
  markProxySuccess(proxy) {
    if (proxy) {
      const key = `${proxy.host}:${proxy.port}`;
      this.failedProxies.delete(key);
      this.checkedProxies.add(key);
    }
  }
  
  // 使用代理发送HTTP请求
  async requestWithProxy(targetUrl, options = {}) {
    let attempts = 0;
    const maxAttempts = Math.min(this.proxies.length * 2, 10); // 限制最大尝试次数
    
    while (attempts < maxAttempts) {
      const proxy = await this.getNextProxy();
      
      if (!proxy) {
        throw new Error('没有可用的代理');
      }
      
      try {
        logger.debug(`尝试使用代理: ${proxy.host}:${proxy.port}`);
        
        const result = await this._makeRequestThroughProxy(targetUrl, proxy, options);
        
        // 成功，标记代理可用
        this.markProxySuccess(proxy);
        return result;
        
      } catch (error) {
        logger.debug(`代理 ${proxy.host}:${proxy.port} 请求失败:`, error.message);
        this.markProxyFailed(proxy);
        attempts++;
        
        // 短暂延迟后重试
        await new Promise(resolve => setTimeout(resolve, 100 * attempts));
      }
    }
    
    throw new Error('所有代理都尝试失败');
  }
  
  // 通过代理发送请求
  async _makeRequestThroughProxy(targetUrl, proxy, options) {
    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(targetUrl);
        const isHttps = urlObj.protocol === 'https:';
        const httpModule = isHttps ? https : http;
        
        // 使用缓存的代理agent
        const agent = this.createProxyAgent(proxy, isHttps);
        
        const requestOptions = {
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: options.method || 'GET',
          headers: { ...options.headers },
          agent: agent,
          timeout: options.timeout || 15000
        };
        
        const req = httpModule.request(requestOptions, (res) => {
          let chunks = [];
          
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            try {
              const data = Buffer.concat(chunks);
              resolve(data.toString('utf8'));
            } catch (error) {
              reject(new Error('解析响应数据失败'));
            }
          });
          
          res.on('error', reject);
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        
        // 如果有请求体，写入请求
        if (options.body) {
          req.write(options.body);
        }
        
        req.end();
        
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = new ProxyPool();




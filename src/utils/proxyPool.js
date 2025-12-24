// 代理池管理模块
const http = require('http');
const https = require('https');
const { URL } = require('url');

class ProxyPool {
  constructor() {
    // 代理列表
    this.proxies = [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
    this.maxRetriesPerProxy = 2;
    
    // 初始化代理列表
    this.initializeProxies();
  }
  
  // 初始化代理列表
  initializeProxies() {
    // 免费的HTTP代理列表
    // 注意：这些是示例，实际使用时可能需要获取最新的列表
    this.proxies = [
      // 格式: { host: 'ip', port: 端口, type: 'http' }
      // 注意：以下只是示例，实际需要从代理池API获取
      
      // 可以从环境变量添加固定代理
      ...this.getProxiesFromEnv(),
      
      // 可以从免费代理API获取（需要实现）
      // ...this.fetchProxiesFromAPI(),
    ];
    
    console.log(`代理池初始化，共有 ${this.proxies.length} 个代理`);
  }
  
  // 从环境变量获取代理
  getProxiesFromEnv() {
    const proxies = [];
    
    // 支持多个代理，用逗号分隔
    const proxyString = process.env.PROXY_LIST;
    if (proxyString) {
      const proxyPairs = proxyString.split(',');
      proxyPairs.forEach(pair => {
        const [host, port] = pair.trim().split(':');
        if (host && port) {
          proxies.push({ host, port: parseInt(port), type: 'http' });
        }
      });
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
      console.error('获取代理列表失败:', error.message);
      return [];
    }
  }
  
  // 测试代理是否可用
  async testProxy(proxy) {
    return new Promise((resolve) => {
      try {
        // 使用代理请求一个简单的URL来测试
        const options = {
          hostname: proxy.host,
          port: proxy.port,
          method: 'CONNECT',
          path: 'www.baidu.com:443',
          timeout: 5000
        };
        
        const req = http.request(options);
        
        req.on('connect', (res, socket, head) => {
          socket.destroy();
          resolve(true); // 代理可用
        });
        
        req.on('timeout', () => {
          req.destroy();
          resolve(false); // 代理不可用
        });
        
        req.on('error', () => {
          resolve(false); // 代理不可用
        });
        
        req.end();
      } catch (error) {
        resolve(false);
      }
    });
  }
  
  // 获取下一个可用代理
  async getNextProxy() {
    if (this.proxies.length === 0) {
      return null;
    }
    
    // 如果所有代理都失败过，重置失败列表
    if (this.failedProxies.size >= this.proxies.length) {
      console.log('所有代理都失败过，重置失败列表');
      this.failedProxies.clear();
      this.currentIndex = 0;
    }
    
    // 尝试找一个没失败过的代理
    let attempts = 0;
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      attempts++;
      
      if (!this.failedProxies.has(`${proxy.host}:${proxy.port}`)) {
        return proxy;
      }
    }
    
    // 如果都失败过，返回第一个
    return this.proxies[0];
  }
  
  // 标记代理为失败
  markProxyFailed(proxy) {
    if (proxy) {
      this.failedProxies.add(`${proxy.host}:${proxy.port}`);
      console.log(`代理 ${proxy.host}:${proxy.port} 标记为失败`);
    }
  }
  
  // 标记代理为成功
  markProxySuccess(proxy) {
    if (proxy) {
      this.failedProxies.delete(`${proxy.host}:${proxy.port}`);
    }
  }
  
  // 使用代理发送HTTP请求
  async requestWithProxy(targetUrl, options = {}) {
    let attempts = 0;
    const maxAttempts = this.proxies.length || 1;
    
    while (attempts < maxAttempts) {
      const proxy = await this.getNextProxy();
      
      if (!proxy) {
        throw new Error('没有可用的代理');
      }
      
      try {
        console.log(`尝试使用代理: ${proxy.host}:${proxy.port}`);
        
        const result = await this._makeRequestThroughProxy(targetUrl, proxy, options);
        
        // 成功，标记代理可用
        this.markProxySuccess(proxy);
        return result;
        
      } catch (error) {
        console.error(`代理 ${proxy.host}:${proxy.port} 请求失败:`, error.message);
        this.markProxyFailed(proxy);
        attempts++;
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
        
        // 使用http-proxy-agent需要额外安装包
        // 这里使用简单的隧道代理方式
        const proxyOptions = {
          hostname: proxy.host,
          port: proxy.port,
          path: targetUrl,
          method: 'GET',
          headers: options.headers || {}
        };
        
        const req = http.request(proxyOptions, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        
        req.end();
        
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = new ProxyPool();




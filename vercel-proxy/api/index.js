// Vercel代理 - 完整浏览器模拟版本
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // 尝试多个URL和策略
  const targetUrls = [
    'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580',
    'http://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580',
  ];
  
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');
  const zlib = require('zlib');
  
  // 完整的浏览器请求头
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };
  
  // 尝试请求一个URL
  const tryRequest = (url, isHttps) => {
    return new Promise((resolve, reject) => {
      const httpModule = isHttps ? https : http;
      const urlObj = new URL(url);
      
      const headers = { ...browserHeaders };
      if (isHttps) {
        headers['Host'] = urlObj.hostname;
        headers['Referer'] = `https://${urlObj.hostname}/`;
      } else {
        headers['Host'] = urlObj.hostname;
        headers['Referer'] = `http://${urlObj.hostname}/`;
      }
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: headers,
        timeout: 10000
      };
      
      console.log(`尝试请求: ${url}`);
      
      const proxyReq = httpModule.get(options, (proxyRes) => {
        let data = '';
        
        // 处理gzip/deflate压缩
        let stream = proxyRes;
        const encoding = proxyRes.headers['content-encoding'];
        
        if (encoding === 'gzip') {
          stream = zlib.createGunzip();
          proxyRes.pipe(stream);
        } else if (encoding === 'deflate') {
          stream = zlib.createInflate();
          proxyRes.pipe(stream);
        } else {
          proxyRes.on('data', chunk => data += chunk);
        }
        
        if (stream !== proxyRes) {
          stream.on('data', (chunk) => {
            data += chunk.toString();
          });
        }
        
        stream.on('end', () => {
          resolve({
            success: true,
            url: url,
            status: proxyRes.statusCode,
            headers: proxyRes.headers,
            data: data,
            isBlocked: data.includes('<title>405</title>') || data.includes('安全防护')
          });
        });
        
        stream.on('error', (error) => {
          reject(error);
        });
      });
      
      proxyReq.on('error', (error) => {
        reject(error);
      });
      
      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        reject(new Error('Request timeout'));
      });
    });
  };
  
  // 依次尝试不同的URL
  for (let i = 0; i < targetUrls.length; i++) {
    const url = targetUrls[i];
    const isHttps = url.startsWith('https');
    
    try {
      const result = await tryRequest(url, isHttps);
      
      if (result.isBlocked) {
        console.log(`URL ${i+1} 被拦截: ${url}`);
        // 继续尝试下一个
        continue;
      }
      
      // 成功获取数据
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(result.data);
      
    } catch (error) {
      console.log(`URL ${i+1} 请求失败: ${error.message}`);
      // 继续尝试下一个
      continue;
    }
  }
  
  // 所有尝试都失败
  res.status(500).json({
    error: '所有请求都被拦截或失败',
    message: '目标网站AQ阻止了所有请求',
    suggestion: '请尝试使用本地代理或更换目标URL'
  });
};

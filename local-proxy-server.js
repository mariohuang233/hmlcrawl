#!/usr/bin/env node
/**
 * 本地代理服务器
 * 在你的电脑上运行这个脚本，然后Railway通过你的IP访问目标网站
 * 
 * 使用方法:
 * 1. 运行: node local-proxy-server.js
 * 2. 配置Railway环境变量: PROXY_URL=http://你的公网IP:3000
 * 3. 确保路由器端口转发3000端口到你的电脑
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');

const PORT = Number(process.env.PORT) || 3000;
const TARGET_URL = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';

const server = http.createServer((req, res) => {
  // 允许CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  
  // 只处理GET请求
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  
  console.log(`[${new Date().toISOString()}] 收到请求: ${req.url}`);
  
  const targetUrl = TARGET_URL;
  const urlObj = new URL(targetUrl);
  const isHttps = urlObj.protocol === 'https:';
  const httpModule = isHttps ? https : http;
  
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Host': urlObj.hostname,
    'Referer': `${urlObj.protocol}//${urlObj.hostname}/`
  };
  
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: browserHeaders,
    timeout: 30000
  };
  
  console.log(`转发请求到: ${targetUrl}`);
  
  const proxyReq = httpModule.get(options, (proxyRes) => {
    console.log(`收到响应: ${proxyRes.statusCode}`);
    console.log(`响应头:`, proxyRes.headers);
    
    let data = '';
    let stream = proxyRes;
    
    const encoding = proxyRes.headers['content-encoding'];
    if (encoding === 'gzip') {
      stream = zlib.createGunzip();
      proxyRes.pipe(stream);
    } else if (encoding === 'deflate') {
      stream = zlib.createInflate();
      proxyRes.pipe(stream);
    }
    
    if (stream !== proxyRes) {
      stream.on('data', (chunk) => {
        data += chunk.toString();
      });
    } else {
      proxyRes.on('data', (chunk) => {
        data += chunk.toString();
      });
    }
    
    stream.on('end', () => {
      console.log(`响应长度: ${data.length}`);
      console.log(`响应预览: ${data.substring(0, 200)}`);
      
      // 检查是否被拦截
      if (data.includes('<title>405</title>') || data.includes('安全防护')) {
        console.log('⚠️  被安全防护拦截');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: '被拦截',
          html: data.substring(0, 1000),
          isBlocked: true
        }));
      } else {
        console.log('✅ 成功获取数据');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(data);
      }
    });
    
    stream.on('error', (error) => {
      console.error('解压错误:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: error.message }));
    });
  });
  
  proxyReq.on('error', (error) => {
    console.error('请求错误:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: error.message }));
  });
  
  proxyReq.on('timeout', () => {
    console.error('请求超时');
    proxyReq.destroy();
    res.writeHead(504, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Request timeout' }));
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('=========================================');
  console.log('本地代理服务器启动成功!');
  console.log('');
  console.log(`监听端口: ${PORT}`);
  console.log(`代理地址: http://localhost:${PORT}`);
  console.log('');
  console.log('Railway配置:');
  console.log(`PROXY_URL=http://你的公网IP:${PORT}`);
  console.log('');
  console.log('或使用ngrok获取公网地址:');
  console.log('ngrok http 3000');
  console.log('=========================================');
  console.log('');
});


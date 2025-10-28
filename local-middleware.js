// 本地中间层 - 在你的电脑上运行这个脚本
// 可以从Railway调用本地服务（如果你有固定IP或使用ngrok）

const https = require('https');
const http = require('http');
const { URL } = require('url');

const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';

const server = http.createServer((req, res) => {
  // 允许CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  console.log('收到请求:', new Date().toISOString());
  
  const urlObj = new URL(targetUrl);
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || 443,
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Host': urlObj.hostname
    }
  };
  
  const proxyReq = https.request(options, (proxyRes) => {
    let data = '';
    
    proxyRes.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    proxyRes.on('end', () => {
      console.log('返回长度:', data.length);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  });
  
  proxyReq.on('error', (error) => {
    console.error('代理错误:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  });
  
  proxyReq.end();
});

const PORT = process.env.PORT || 8888;
server.listen(PORT, () => {
  console.log(`本地中间层已启动: http://localhost:${PORT}`);
  console.log(`Railway调用地址: http://YOUR_PUBLIC_IP:${PORT}`);
  console.log('如果使用ngrok: ngrok http', PORT);
});

// 保持运行
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  server.close();
  process.exit(0);
});


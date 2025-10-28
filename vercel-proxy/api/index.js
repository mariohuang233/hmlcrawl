// Vercel代理 - 完整版本
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
  
  try {
    const https = require('https');
    const { URL } = require('url');
    const zlib = require('zlib');
    
    const urlObj = new URL(targetUrl);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Host': urlObj.hostname
      }
    };
    
    return new Promise((resolve) => {
      const proxyReq = https.get(options, (proxyRes) => {
        let data = '';
        
        // 处理gzip压缩
        let stream = proxyRes;
        if (proxyRes.headers['content-encoding'] === 'gzip') {
          stream = zlib.createGunzip();
          proxyRes.pipe(stream);
        } else if (proxyRes.headers['content-encoding'] === 'deflate') {
          stream = zlib.createInflate();
          proxyRes.pipe(stream);
        }
        
        stream.on('data', (chunk) => {
          data += chunk.toString();
        });
        
        stream.on('end', () => {
          // 检查是否返回405错误页面
          if (data.includes('<title>405</title>')) {
            res.status(500).json({ 
              error: '目标网站返回405错误',
              html: data.substring(0, 500),
              headers: proxyRes.headers
            });
          } else {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(data);
          }
          resolve();
        });
        
        stream.on('error', (error) => {
          res.status(500).json({ error: '解压错误: ' + error.message });
          resolve();
        });
      });
      
      proxyReq.on('error', (error) => {
        res.status(500).json({ error: error.message });
        resolve();
      });
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

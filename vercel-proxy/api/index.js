// 更简单的测试版本
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
  
  try {
    const https = require('https');
    const { URL } = require('url');
    
    const urlObj = new URL(targetUrl);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5)'
      }
    };
    
    return new Promise((resolve, reject) => {
      https.get(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          res.setHeader('Content-Type', 'text/html');
          res.send(data);
          resolve();
        });
      }).on('error', (error) => {
        res.status(500).json({ error: error.message });
        resolve();
      });
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


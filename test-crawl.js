const https = require('https');
const zlib = require('zlib');

const options = {
  hostname: 'www.wap.cnyiot.com',
  port: 443,
  path: '/nat/pay.aspx?mid=18100071580',
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
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1'
  }
};

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Content-Encoding:', res.headers['content-encoding']);
  
  let stream = res;
  
  if (res.headers['content-encoding'] === 'gzip') {
    stream = zlib.createGunzip();
    res.pipe(stream);
  }
  
  let data = '';
  stream.on('data', (chunk) => {
    data += chunk.toString();
  });
  
  stream.on('end', () => {
    console.log('\nResponse length:', data.length);
    console.log('\nContains 剩余电量:', data.includes('剩余电量'));
    console.log('\nContains <title>405</title>:', data.includes('<title>405</title>'));
    
    if (data.includes('剩余电量')) {
      const match = data.match(/剩余电量:\s*(\d+\.?\d*)\s*kWh/i);
      if (match) {
        console.log('\n✅ 成功提取电量:', match[1], 'kWh');
      }
    } else if (data.includes('<title>405</title>')) {
      console.log('\n❌ 被拦截: 405错误');
    } else {
      console.log('\nFirst 1000 chars:\n', data.substring(0, 1000));
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.end();

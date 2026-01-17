const https = require('https');
const http = require('http');

// 辅助函数：使用Promise封装http/https请求
function fetch(url, options = {}) {
  const lib = url.startsWith('https://') ? https : http;
  const urlObj = new URL(url);
  
  const defaults = {
    method: 'GET',
    headers: {},
    hostname: urlObj.hostname,
    port: urlObj.port || (url.startsWith('https://') ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
  };
  
  const opts = { ...defaults, ...options, headers: { ...defaults.headers, ...options.headers } };
  
  return new Promise((resolve, reject) => {
    const req = lib.request(opts, (res) => {
      let chunks = [];
      
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const data = buffer.toString();
        
        // 模拟fetch的Response对象
        const response = {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          async text() { return data; },
          async json() { return JSON.parse(data); }
        };
        
        resolve(response);
      });
    });
    
    req.on('error', (err) => reject(err));
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// 模拟前端手动爬取流程
async function testManualCrawl() {
  try {
    console.log('开始模拟手动爬取流程...');
    
    // 1. 模拟浏览器从目标网站获取HTML
    console.log('1. 尝试从目标网站获取HTML...');
    const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
    
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        throw new Error(`获取目标网站HTML失败: ${response.status}`);
      }
      const htmlData = await response.text();
      console.log('✅ 成功获取目标网站HTML');
      console.log('   HTML长度:', htmlData.length, '字符');
      
      // 2. 模拟浏览器将HTML提交到后端
      console.log('\n2. 尝试将HTML提交到后端...');
      const apiBase = 'http://localhost:3000'; // 开发环境
      const reportUrl = `${apiBase}/api/reportData`;
      
      try {
        const submitResponse = await fetch(reportUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: htmlData })
        });
        
        const submitResult = await submitResponse.json();
        if (submitResponse.ok) {
          console.log('✅ 成功将HTML提交到后端');
          console.log('   后端响应:', submitResult);
        } else {
          console.error('❌ 提交到后端失败:', submitResult.error);
        }
      } catch (submitError) {
        console.error('❌ 提交到后端时发生错误:', submitError.message);
        console.error('   可能的原因: 后端未运行、API地址错误或网络问题');
      }
      
    } catch (targetError) {
      console.error('❌ 从目标网站获取HTML时发生错误:', targetError.message);
      console.error('   可能的原因: 目标网站CORS限制、网络问题或网站不可访问');
    }
    
  } catch (error) {
    console.error('❌ 模拟手动爬取流程时发生未预期错误:', error.message);
  }
}

// 执行测试
testManualCrawl();

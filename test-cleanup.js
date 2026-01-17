const http = require('http');
const https = require('https');
const { URL } = require('url');

async function callCleanupAPI() {
  try {
    console.log('🧹 调用数据清理API...');
    
    const apiUrl = 'http://localhost:3000/api/cleanup';
    const urlObj = new URL(apiUrl);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const response = await new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { resolve({ statusCode: res.statusCode, data }); });
      });
      req.on('error', reject);
      req.end();
    });

    if (response.statusCode === 200) {
      const result = JSON.parse(response.data);
      console.log('✅ 清理结果:');
      console.log(`- 消息: ${result.message}`);
      console.log(`- 总数据条数: ${result.totalData}`);
      console.log(`- 异常数据条数: ${result.abnormalData}`);
      if (result.deletedCount !== undefined) {
        console.log(`- 已删除条数: ${result.deletedCount}`);
      }
    } else {
      console.error('❌ API调用失败:', response.statusCode, response.data);
    }
    
  } catch (error) {
    console.error('❌ 调用清理API时出错:', error.message);
  }
}

callCleanupAPI();

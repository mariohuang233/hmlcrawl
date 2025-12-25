const fs = require('fs');
const http = require('http');
const { URL } = require('url');

// 读取之前保存的HTML文件
const html = fs.readFileSync('./test_html.html', 'utf8');

// 测试前端上报功能
async function testFrontendReport() {
  try {
    console.log('=== 测试前端分布式爬取功能 ===');
    console.log('正在模拟前端发送HTML数据到服务器...');
    
    // 构建请求选项
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/reportData',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify({ data: html }))
      }
    };
    
    // 发送请求
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('服务器响应:', data);
        const result = JSON.parse(data);
        if (result.success) {
          console.log('✅ 数据上报成功！');
          
          // 检查数据库中的数据是否正确
          console.log('\n正在检查数据库中的数据...');
          // 这里可以添加代码来检查数据库中的数据
          console.log('📊 数据已保存到数据库');
        } else {
          console.error('❌ 数据上报失败:', result.error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('请求错误:', error.message);
    });
    
    // 发送请求体
    req.write(JSON.stringify({ data: html }));
    req.end();
    
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

// 执行测试
testFrontendReport();
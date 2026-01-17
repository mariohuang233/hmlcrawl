// 测试分布式爬取功能
const axios = require('axios');
const { JSDOM } = require('jsdom');

async function testDistributedCrawl() {
  console.log('=== 测试分布式爬取功能 ===');
  
  try {
    // 1. 模拟浏览器爬取：获取目标页面HTML
    console.log('1. 模拟浏览器爬取目标页面...');
    const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
    
    const response = await axios.get(targetUrl, {
      timeout: 30000
    });
    
    const htmlData = response.data;
    console.log('✅ 成功获取目标页面HTML:', htmlData.length, '字符');
    
    // 2. 测试新的解析逻辑
    console.log('\n2. 测试新的剩余电量解析逻辑...');
    
    // 导入并使用新的parseHtml函数
    const { parseHtml } = require('./src/crawler/crawler.js');
    
    try {
      const parsedData = await parseHtml(htmlData);
      console.log('✅ 解析成功！剩余电量:', parsedData.remaining_kwh, 'kWh');
      
      // 3. 测试提交到后端API
      console.log('\n3. 测试提交到后端API...');
      
      const apiResponse = await axios.post('http://localhost:3000/api/reportData', {
        data: htmlData
      });
      
      console.log('✅ 数据成功提交到后端！');
      console.log('API响应:', apiResponse.data);
      
      console.log('\n🎉 分布式爬取测试全部通过！');
      return parsedData.remaining_kwh;
      
    } catch (parseError) {
      console.error('❌ 解析HTML失败:', parseError.message);
      
      // 输出HTML预览以便调试
      console.log('HTML预览:', htmlData.substring(0, 1000));
      throw parseError;
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error);
    throw error;
  }
}

// 运行测试
testDistributedCrawl().then(remainingKwh => {
  console.log(`\n📊 最终解析到的剩余电量: ${remainingKwh} kWh`);
  process.exit(0);
}).catch(error => {
  console.error('\n❌ 测试执行失败:', error.message);
  process.exit(1);
});

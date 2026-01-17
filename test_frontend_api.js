// 测试前端API调用功能
const axios = require('axios');

async function testFrontendApi() {
  console.log('=== 测试前端API调用功能 ===');
  
  try {
    // 1. 测试获取概览数据
    console.log('1. 测试获取概览数据...');
    
    const overviewResponse = await axios.get('http://localhost:3000/api/overview', {
      timeout: 10000
    });
    
    console.log('✅ 成功获取概览数据！');
    console.log('剩余电量:', overviewResponse.data.current_remaining, 'kWh');
    
    // 2. 测试手动爬取功能
    console.log('\n2. 测试手动爬取功能...');
    
    // 模拟浏览器爬取
    const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
    const pageResponse = await axios.get(targetUrl, {
      timeout: 30000
    });
    
    const htmlData = pageResponse.data;
    
    // 提交到后端
    const reportResponse = await axios.post('http://localhost:3000/api/reportData', {
      data: htmlData
    }, {
      timeout: 10000
    });
    
    console.log('✅ 手动爬取功能测试成功！');
    console.log('API响应:', reportResponse.data);
    
    // 3. 再次获取概览数据，验证是否更新
    console.log('\n3. 验证数据是否更新...');
    
    const updatedOverview = await axios.get('http://localhost:3000/api/overview', {
      timeout: 10000
    });
    
    console.log('✅ 更新后的概览数据：');
    console.log('剩余电量:', updatedOverview.data.current_remaining, 'kWh');
    
    console.log('\n🎉 所有API测试全部通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error.response ? error.response.data : error);
    throw error;
  }
}

// 运行测试
testFrontendApi().then(() => {
  console.log('\n📊 测试完成！');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ 测试执行失败:', error.message);
  process.exit(1);
});

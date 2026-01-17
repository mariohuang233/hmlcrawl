const axios = require('axios');

const API_BASE = 'http://localhost:3000';

async function testAPI() {
  console.log('🧪 开始测试API接口...\n');

  try {
    // 测试总览接口
    console.log('1. 测试总览接口...');
    const overviewResponse = await axios.get(`${API_BASE}/api/overview`);
    console.log('✅ 总览接口正常:', overviewResponse.data);

    // 测试24小时趋势
    console.log('\n2. 测试24小时趋势接口...');
    const trend24hResponse = await axios.get(`${API_BASE}/api/trend/24h`);
    console.log('✅ 24小时趋势接口正常，数据条数:', trend24hResponse.data.length);

    // 测试当天用电
    console.log('\n3. 测试当天用电接口...');
    const todayResponse = await axios.get(`${API_BASE}/api/trend/today`);
    console.log('✅ 当天用电接口正常，数据条数:', todayResponse.data.length);

    // 测试30天趋势
    console.log('\n4. 测试30天趋势接口...');
    const dailyResponse = await axios.get(`${API_BASE}/api/trend/30d`);
    console.log('✅ 30天趋势接口正常，数据条数:', dailyResponse.data.length);

    // 测试月度趋势
    console.log('\n5. 测试月度趋势接口...');
    const monthlyResponse = await axios.get(`${API_BASE}/api/trend/monthly`);
    console.log('✅ 月度趋势接口正常，数据条数:', monthlyResponse.data.length);

    // 测试最新数据
    console.log('\n6. 测试最新数据接口...');
    const latestResponse = await axios.get(`${API_BASE}/api/latest`);
    console.log('✅ 最新数据接口正常:', latestResponse.data);

    console.log('\n🎉 所有API接口测试通过！');

  } catch (error) {
    console.error('❌ API测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

async function testCrawler() {
  console.log('\n🕷️ 测试爬虫功能...');
  
  try {
    const response = await axios.post(`${API_BASE}/api/crawl`);
    console.log('✅ 爬虫触发成功:', response.data);
  } catch (error) {
    console.error('❌ 爬虫测试失败:', error.message);
  }
}

async function main() {
  console.log('🚀 家庭用电监控系统测试');
  console.log('========================\n');

  await testAPI();
  await testCrawler();

  console.log('\n📝 测试完成！');
  console.log('💡 提示：如果看到数据为空，这是正常的，因为系统刚开始运行，还没有采集到数据。');
  console.log('💡 等待10分钟后，爬虫会自动采集数据，然后API就会返回实际数据。');
}

main().catch(console.error);

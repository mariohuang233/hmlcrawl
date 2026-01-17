const fetch = require('node-fetch');

// 模拟手动爬取流程
async function testManualCrawl() {
  console.log('开始测试手动爬取功能...');
  
  try {
    // 步骤1: 从目标网站获取原始HTML
    console.log('1. 正在从目标网站获取HTML...');
    const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
    const htmlResponse = await fetch(targetUrl);
    
    if (!htmlResponse.ok) {
      throw new Error(`获取目标HTML失败: ${htmlResponse.status}`);
    }
    
    const htmlData = await htmlResponse.text();
    console.log(`✅ 成功获取HTML数据，大小: ${htmlData.length} 字符`);
    
    // 步骤2: 提交HTML到后端API
    console.log('2. 正在提交HTML到后端API...');
    const apiUrl = 'https://thoryierbubu.up.railway.app/api/reportData';
    const submitResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: htmlData })
    });
    
    const submitResult = await submitResponse.json();
    
    if (submitResponse.ok) {
      console.log('✅ 成功提交HTML数据到后端');
      console.log('📊 后端响应:', submitResult);
      console.log('🎉 手动爬取功能测试成功！');
    } else {
      console.error('❌ 提交HTML数据失败:', submitResponse.status);
      console.error('💥 后端错误:', submitResult);
    }
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  }
}

// 运行测试
testManualCrawl();

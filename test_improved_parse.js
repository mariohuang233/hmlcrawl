const fs = require('fs');
const { parseHtml } = require('./src/crawler/crawler');

// 读取之前保存的HTML文件
const html = fs.readFileSync('./test_html.html', 'utf8');

// 测试改进后的parseHtml函数
async function testParseHtml() {
  try {
    console.log('=== 测试改进后的parseHtml函数 ===');
    console.log('正在解析HTML内容...');
    
    const result = await parseHtml(html);
    
    console.log('解析成功！');
    console.log('剩余电量:', result.remaining_kwh, 'kWh');
    console.log('电表ID:', result.meter_id);
    console.log('电表名称:', result.meter_name);
    console.log('采集时间:', result.collected_at);
    
    return result;
  } catch (error) {
    console.error('解析失败:', error.message);
    return null;
  }
}

// 执行测试
testParseHtml();
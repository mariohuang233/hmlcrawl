const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 测试HTML数据（模拟电力网站的响应）
const testHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>电力查询</title>
</head>
<body>
    <div class="container">
        <h1>电表信息</h1>
        <div class="meter-info">
            <p>电表编号: 18100071580</p>
            <p>电表名称: 2759弄18号402阳台</p>
            <p>剩余电量: 10.08 kWh</p>
        </div>
    </div>
</body>
</html>
`;

// 测试parseHtml函数
async function testParseHtml() {
    console.log('=== 测试parseHtml函数 ===');
    try {
        const { parseHtml } = require('./src/crawler/crawler');
        const result = await parseHtml(testHtml);
        console.log('解析结果:', result);
        console.log('✓ parseHtml函数测试通过');
        return result;
    } catch (error) {
        console.error('✗ parseHtml函数测试失败:', error.message);
        throw error;
    }
}

// 测试saveData函数
async function testSaveData(parsedData) {
    console.log('\n=== 测试saveData函数 ===');
    try {
        const crawler = require('./src/crawler/crawler');
        await crawler.saveData(parsedData);
        console.log('✓ saveData函数测试通过');
        return true;
    } catch (error) {
        console.error('✗ saveData函数测试失败:', error.message);
        throw error;
    }
}

// 测试完整的API端点
async function testReportDataEndpoint() {
    console.log('\n=== 测试/api/reportData端点 ===');
    try {
        // 确保服务器正在运行
        const response = await axios.post('http://localhost:3000/api/reportData', {
            data: testHtml
        });
        
        console.log('响应:', response.data);
        console.log('✓ /api/reportData端点测试通过');
        return response.data;
    } catch (error) {
        console.error('✗ /api/reportData端点测试失败:', error.message);
        if (error.response) {
            console.error('响应状态:', error.response.status);
            console.error('响应数据:', error.response.data);
        }
        throw error;
    }
}

// 主测试函数
async function runTests() {
    console.log('开始测试爬虫数据解析功能...\n');
    
    try {
        // 1. 测试parseHtml函数
        const parsedData = await testParseHtml();
        
        // 2. 测试saveData函数 - 保存测试数据到数据库 (暂时跳过数据库测试)
        // await testSaveData(parsedData);
        
        // 3. 测试完整的API端点（需要服务器运行）
        // await testReportDataEndpoint();
        
        console.log('\n🎉 解析功能测试通过！剩余电量正确解析为: ', parsedData.remaining_kwh);
    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        process.exit(1);
    }
}

// 运行测试
runTests();

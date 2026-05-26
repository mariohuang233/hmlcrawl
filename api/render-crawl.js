// Render Cron Job - 爬虫定时执行脚本
// 由 Render Cron Job 每15分钟调用一次
// 直接使用爬虫模块采集数据，不依赖 Web 服务
const mongoose = require('mongoose');
const path = require('path');

// 加载 .env.local（如果在本地测试）
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
} catch (e) {
  // 生产环境由 Render 环境变量提供
}

const crawler = require('../src/crawler/crawler');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error(`[${new Date().toISOString()}] [RENDER-CRAWL] 错误: 未配置 MONGO_URI`);
  process.exit(1);
}

async function run() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] [RENDER-CRAWL] 爬虫任务开始`);

  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 60000,
    connectTimeoutMS: 15000
  });

  console.log(`[${new Date().toISOString()}] [RENDER-CRAWL] MongoDB 连接成功`);

  try {
    await crawler.crawlData();
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] [RENDER-CRAWL] 爬取完成，耗时 ${duration}ms`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [RENDER-CRAWL] 爬取失败: ${error.message}`);
  }

  await mongoose.disconnect();
  console.log(`[${new Date().toISOString()}] [RENDER-CRAWL] MongoDB 断开连接`);

  const totalDuration = Date.now() - startTime;
  console.log(`[${new Date().toISOString()}] [RENDER-CRAWL] 任务结束，总耗时 ${totalDuration}ms`);
}

run().catch(error => {
  console.error(`[${new Date().toISOString()}] [RENDER-CRAWL] 未捕获错误: ${error.message}`);
  process.exit(1);
});

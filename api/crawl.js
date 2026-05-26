// Vercel Cron Trigger - 爬虫定时触发函数
// 由 Vercel Cron Jobs 或外部定时服务调用
const mongoose = require('mongoose');
const crawler = require('../src/crawler/crawler');

const MONGO_URI = process.env.MONGO_URI;

let cached = global._mongoConn;
if (!cached) cached = global._mongoConn = { conn: null, promise: null };

async function connectMongo() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 15000,
      maxPoolSize: 3,
      minPoolSize: 1
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = async (req, res) => {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return res.status(200).end();
  }

  if (!MONGO_URI) {
    return res.status(500).json({
      success: false,
      error: '未配置 MONGO_URI 环境变量',
      timestamp: new Date().toISOString()
    });
  }

  try {
    await connectMongo();
  } catch (error) {
    return res.status(500).json({
      success: false,
      stage: 'mongo_connect',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  try {
    await crawler.crawlData();
    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      source: 'vercel-cron'
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    return res.status(500).json({
      success: false,
      stage: 'crawl',
      error: error.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  }
};

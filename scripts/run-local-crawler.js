require('dotenv').config({ path: process.env.LOCAL_ENV_PATH || '.env.local' });

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');
const crawler = require('../src/crawler/crawler');

// 环境变量准备
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/electricity';
const USE_DIRECT_IP = process.env.USE_DIRECT_IP ?? 'true';

// 提示当前配置
logger.info(`本地爬虫启动配置: MONGO_URI=${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);
logger.info(`USE_DIRECT_IP=${USE_DIRECT_IP}，PROXY_URL=${process.env.PROXY_URL || ''}`);

// 连接 MongoDB 后启动爬虫
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

mongoose.connect(MONGO_URI, mongooseOptions)
  .then(() => {
    logger.info('MongoDB连接成功（本地）');
    // 周期性爬取（与服务内一致）
    crawler.start();
    logger.info('本地爬虫已启动，按 Ctrl+C 退出');
  })
  .catch((error) => {
    logger.error('MongoDB连接失败（本地）:', error.message);
    process.exit(1);
  });

// 优雅退出
const gracefulExit = (signal) => {
  logger.info(`收到${signal}，准备退出本地爬虫...`);
  mongoose.connection.close(false, () => {
    logger.info('MongoDB连接已关闭');
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulExit('SIGINT'));
process.on('SIGTERM', () => gracefulExit('SIGTERM'));
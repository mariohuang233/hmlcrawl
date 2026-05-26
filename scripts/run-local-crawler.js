require('dotenv').config({ path: process.env.LOCAL_ENV_PATH || '.env.local' });

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');
const crawler = require('../src/crawler/crawler');

// 环境变量准备
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/electricity';
const USE_DIRECT_IP = process.env.USE_DIRECT_IP ?? 'true';

// 重连配置
const RECONNECT_CONFIG = {
  maxAttempts: Infinity,
  initialDelay: 3000,
  maxDelay: 60000,
  delayFactor: 1.5
};

// 提示当前配置
logger.info(`本地爬虫启动配置: MONGO_URI=${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);
logger.info(`USE_DIRECT_IP=${USE_DIRECT_IP}，PROXY_URL=${process.env.PROXY_URL || ''}`);

const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 60000,
  connectTimeoutMS: 15000,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 10,
  minPoolSize: 2,
  waitQueueTimeoutMS: 5000
};

// 爬虫状态
let crawlerStarted = false;

async function connectWithRetry(attempt = 1) {
  try {
    await mongoose.connect(MONGO_URI, mongooseOptions);
    logger.info('MongoDB连接成功（本地）');
    onMongoConnected();
  } catch (error) {
    const delay = Math.min(
      RECONNECT_CONFIG.initialDelay * Math.pow(RECONNECT_CONFIG.delayFactor, attempt - 1),
      RECONNECT_CONFIG.maxDelay
    );
    logger.error(`MongoDB连接失败（第${attempt}次）: ${error.message}，${Math.round(delay / 1000)}秒后重试...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    connectWithRetry(attempt + 1);
  }
}

function onMongoConnected() {
  if (!crawlerStarted) {
    crawler.start();
    crawlerStarted = true;
    logger.info('本地爬虫已启动，将持续运行（Ctrl+C 退出）');
  }
}

// MongoDB 连接事件监听
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB连接已断开，尝试重连...');
  crawlerStarted = false;
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB已重新连接');
  onMongoConnected();
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB连接错误:', err.message);
});

// 启动连接
connectWithRetry();

// 优雅退出
const gracefulExit = async (signal) => {
  logger.info(`收到${signal}，准备退出本地爬虫...`);
  try {
    await mongoose.connection.close();
    logger.info('MongoDB连接已关闭');
  } catch (e) {
    logger.error('关闭MongoDB连接时出错:', e.message);
  }
  process.exit(0);
};

process.on('SIGINT', () => gracefulExit('SIGINT'));
process.on('SIGTERM', () => gracefulExit('SIGTERM'));

// 未捕获异常处理 - 防止进程意外退出
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error.message);
  logger.error(error.stack);
});

process.on('unhandledRejection', (reason) => {
  logger.error('未处理的Promise拒绝:', reason instanceof Error ? reason.message : reason);
});
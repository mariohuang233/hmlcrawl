const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const compression = require('compression');
require('dotenv').config({ path: process.env.LOCAL_ENV_PATH || '.env.local' });

const logger = require('./src/utils/logger');
const crawler = require('./src/crawler/crawler');
const apiRoutes = require('./src/api/routes');
const dailyReport = require('./src/services/dailyReport');
// 云端环境检测
const IS_RAILWAY = !!process.env.RAILWAY_SERVICE_NAME || !!process.env.RAILWAY_STATIC_URL;
const IS_ZEABUR = !!process.env.ZEABUR_SERVICE_NAME || !!process.env.ZEABUR_DOMAIN;
const IS_RENDER = !!process.env.RENDER || process.env.RENDER === 'true';
const IS_VERCEL = !!process.env.VERCEL || process.env.VERCEL === '1';
const IS_CLOUD = IS_RAILWAY || IS_ZEABUR || IS_RENDER || IS_VERCEL;

// 云端始终启用爬虫，本地需要显式设置 ENABLE_CRAWLER=true
const ENABLE_CRAWLER = process.env.ENABLE_CRAWLER === undefined
  ? IS_CLOUD
  : process.env.ENABLE_CRAWLER === 'true';

const app = express();

const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "http:", "https:"]
    }
  }
}));
app.use(compression());
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(morgan('combined', { 
  stream: { write: message => logger.info(message.trim()) }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    crawler: ENABLE_CRAWLER ? 'enabled' : 'disabled',
    environment: IS_RENDER ? 'render' : IS_RAILWAY ? 'railway' : IS_ZEABUR ? 'zeabur' : IS_VERCEL ? 'vercel' : 'local',
    node_version: process.version
  });
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, 'frontend/build'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  cacheControl: true
}));

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'frontend/build', 'index.html');
  res.sendFile(indexPath);
});

app.use((error, req, res, next) => {
  if (error.originalError) {
    logger.error('全局错误处理 - 原始错误:', error.originalError);
  } else {
    logger.error('全局错误处理 - 错误:', error);
  }
  
  const statusCode = error.statusCode || 500;
  const errorMessage = error.message || '服务器内部错误';
  const errorType = error.errorType || 'internal_error';
  
  res.status(statusCode).json({
    error: errorType,
    message: errorMessage,
    status: statusCode,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    ...(process.env.NODE_ENV === 'development' && error.stack ? { stack: error.stack.split('\n') } : {})
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: '请求的API端点不存在',
    status: 404,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  });
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/electricity';

if (!MONGO_URI) {
  logger.error('错误: 未配置MONGO_URI环境变量');
  process.exit(1);
}

const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 10,
  minPoolSize: 2,
  waitQueueTimeoutMS: 3000
};

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`服务器已启动在端口 ${PORT}`);
  logger.info(`健康检查端点: http://localhost:${PORT}/health`);
  logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);

  // 通知服务立即启动，不依赖 MongoDB 连接
  // 这样即使 MongoDB 异常，报告仍会尝试发送（失败时会推送错误提示）
  dailyReport.start();

  if (IS_CLOUD && ENABLE_CRAWLER) {
    const cloudName = IS_RENDER ? 'Render' : IS_RAILWAY ? 'Railway' : IS_ZEABUR ? 'Zeabur' : 'Vercel';
    logger.info(`==============================`);
    logger.info(`${cloudName} 云端保障爬虫已激活`);
    logger.info(`爬虫将在15分钟后开始周期性采集`);
    logger.info(`同时作为本地爬虫的备份保障`);
    logger.info(`==============================`);
  }
});

mongoose.connect(MONGO_URI, mongooseOptions)
.then(() => {
  logger.info('MongoDB连接成功');
  logger.info(`连接地址: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);

  logger.info('每日用电报告服务已在服务器启动时启动');

  if (IS_CLOUD && ENABLE_CRAWLER) {
    const cloudName = IS_RENDER ? 'Render' : IS_RAILWAY ? 'Railway' : IS_ZEABUR ? 'Zeabur' : 'Vercel';
    logger.info(`${cloudName} 云端实例: 自动启动保障爬虫`);
    crawler.start();
    if (!IS_RENDER) {
      crawler.startCloudBackup?.();
    } else {
      logger.info('Render 环境: 使用 Cron Job 定时触发爬虫，跳过内置备份');
    }
  } else if (ENABLE_CRAWLER) {
    logger.info('ENABLE_CRAWLER=true，启动定时爬虫');
    crawler.start();
  } else {
    logger.info('ENABLE_CRAWLER=false，当前实例不自动启动爬虫');
  }
})
.catch((error) => {
  logger.error('MongoDB连接失败:', error.message);
  logger.error('请确保MongoDB正在运行并且连接字符串正确');
  logger.warn('服务器将继续运行，但数据功能将不可用');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB运行时错误:', err.message);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB连接已断开');
});

let isShuttingDown = false;
const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`收到${signal}信号，正在关闭服务器...`);
  
  server.close(async () => {
    logger.info('HTTP服务器已关闭');
    await mongoose.connection.close(false);
    logger.info('MongoDB连接已关闭');
    process.exit(0);
  });
  
  setTimeout(() => {
    logger.error('无法优雅关闭，强制退出');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;

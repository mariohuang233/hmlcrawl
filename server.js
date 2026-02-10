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
const ENABLE_CRAWLER = process.env.ENABLE_CRAWLER === 'true';

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
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
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
});

mongoose.connect(MONGO_URI, mongooseOptions)
.then(() => {
  logger.info('MongoDB连接成功');
  logger.info(`连接地址: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);
  
  if (ENABLE_CRAWLER) {
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

const gracefulShutdown = (signal) => {
  logger.info(`收到${signal}信号，正在关闭服务器...`);
  
  server.close(() => {
    logger.info('HTTP服务器已关闭');
    mongoose.connection.close(false);
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

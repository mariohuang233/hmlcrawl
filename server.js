const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const compression = require('compression');
require('dotenv').config();

const logger = require('./src/utils/logger');
const crawler = require('./src/crawler/crawler');
const apiRoutes = require('./src/api/routes');
const ENABLE_CRAWLER = process.env.ENABLE_CRAWLER === 'true';

const app = express();

const PORT = process.env.PORT || 3000;

// 中间件
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
app.use(compression()); // 添加响应压缩中间件
app.use(cors({
  origin: true, // 动态允许请求来源，支持credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// 或者更严格的配置，明确允许特定来源
// app.use(cors({
//   origin: ['https://thoryierbubu.up.railway.app', 'http://localhost:3000'],
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   credentials: true
// }));
app.use(morgan('combined', { 
  stream: { write: message => logger.info(message.trim()) },
  skip: (req, res) => res.statusCode < 400 // 只记录错误响应
}));
app.use(express.json({ limit: '1mb' })); // 限制JSON请求大小
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 健康检查端点（用于Zeabur等平台）- 必须在静态文件之前
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 根路径也返回OK状态（用于Zeabur探针）
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// API路由
app.use('/api', apiRoutes);

// 静态文件服务（前端构建文件）
app.use(express.static(path.join(__dirname, 'frontend/build'), {
  maxAge: '1d', // 设置静态文件缓存1天
  etag: true, // 启用ETag
  lastModified: true, // 启用Last-Modified
  cacheControl: true // 启用Cache-Control头
}));

// 前端路由（React Router）- 必须放在最后
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'frontend/build', 'index.html');
  res.sendFile(indexPath);
});

// 全局错误处理中间件
app.use((error, req, res, next) => {
  // 使用日志记录详细错误信息（包括原始错误）
  if (error.originalError) {
    logger.error('全局错误处理 - 原始错误:', error.originalError);
  } else {
    logger.error('全局错误处理 - 错误:', error);
  }
  
  // 设置响应状态码和错误信息
  const statusCode = error.statusCode || 500;
  const errorMessage = error.message || '服务器内部错误';
  const errorType = error.errorType || 'internal_error';
  
  // 返回友好的JSON错误响应
  res.status(statusCode).json({
    error: errorType,
    message: errorMessage,
    status: statusCode,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    // 生产环境不返回详细错误信息
    ...(process.env.NODE_ENV === 'development' && error.stack ? { stack: error.stack.split('\n') } : {})
  });
});

// 404处理中间件
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

// MongoDB连接配置
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/electricity';

// 验证MongoDB URI
if (!MONGO_URI) {
  logger.error('错误: 未配置MONGO_URI环境变量');
  process.exit(1);
}

// MongoDB连接选项
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // 5秒超时
  socketTimeoutMS: 45000, // 45秒socket超时
  connectTimeoutMS: 10000, // 10秒连接超时
  heartbeatFrequencyMS: 10000, // 10秒心跳检测
  maxPoolSize: 10, // 连接池最大10个连接
  minPoolSize: 2, // 连接池最小2个连接
  waitQueueTimeoutMS: 3000, // 连接池等待超时3秒
};

// 启动服务器（即使MongoDB连接失败也启动，但会记录错误）
// 监听 0.0.0.0 以便在容器环境中接受外部请求
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`服务器已启动在端口 ${PORT}`);
  logger.info(`健康检查端点: http://localhost:${PORT}/health`);
  logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
});

// MongoDB连接（异步，不阻塞服务器启动）
mongoose.connect(MONGO_URI, mongooseOptions)
.then(() => {
  logger.info('MongoDB连接成功');
  logger.info(`连接地址: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}`); // 隐藏密码
  
  // 启动定时爬虫（由环境变量控制）
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

// 监听MongoDB连接错误
mongoose.connection.on('error', (err) => {
  logger.error('MongoDB运行时错误:', err.message);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB连接已断开');
});

// 优雅关闭
const gracefulShutdown = (signal) => {
  logger.info(`收到${signal}信号，正在关闭服务器...`);
  
  server.close(() => {
    logger.info('HTTP服务器已关闭');
    
    // 新版本Mongoose不再支持close()方法的回调函数
    mongoose.connection.close(false);
    logger.info('MongoDB连接已关闭');
    process.exit(0);
  });
  
  // 强制关闭超时
  setTimeout(() => {
    logger.error('无法优雅关闭，强制退出');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;

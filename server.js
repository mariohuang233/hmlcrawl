const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const logger = require('./src/utils/logger');
const crawler = require('./src/crawler/crawler');
const apiRoutes = require('./src/api/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(cors());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json());

// 健康检查端点（用于Zeabur等平台）
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 静态文件服务（前端构建文件）
app.use(express.static(path.join(__dirname, 'frontend/build')));

// API路由
app.use('/api', apiRoutes);

// 前端路由（React Router）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
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
  
  // 启动定时爬虫
  crawler.start();
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
    
    mongoose.connection.close(false, () => {
      logger.info('MongoDB连接已关闭');
      process.exit(0);
    });
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

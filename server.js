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

// MongoDB连接
mongoose.connect(MONGO_URI, mongooseOptions)
.then(() => {
  logger.info('MongoDB连接成功');
  logger.info(`连接地址: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}`); // 隐藏密码
  
  // 启动定时爬虫
  crawler.start();
  
  // 启动服务器
  app.listen(PORT, () => {
    logger.info(`服务器运行在端口 ${PORT}`);
  });
})
.catch((error) => {
  logger.error('MongoDB连接失败:', error.message);
  logger.error('请确保MongoDB正在运行并且连接字符串正确');
  process.exit(1);
});

// 监听MongoDB连接错误
mongoose.connection.on('error', (err) => {
  logger.error('MongoDB运行时错误:', err.message);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB连接已断开');
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，正在关闭服务器...');
  mongoose.connection.close(() => {
    logger.info('MongoDB连接已关闭');
    process.exit(0);
  });
});

module.exports = app;

// Vercel Serverless Entry Point
// 适配 Vercel 无服务器环境的 Express 应用
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const apiRoutes = require('../src/api/routes');

const app = express();

// 在 Vercel 冷启动时初始化 MongoDB 连接
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
  let cached = global._vercelMongo;
  if (!cached) cached = global._vercelMongo = { conn: null, promise: null };
  
  if (!cached.conn && !cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 5,
      minPoolSize: 1
    }).then(m => m);
  }
}

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    platform: 'vercel',
    node_version: process.version,
    mongodb_status: 'check /api/crawler/status'
  });
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.use('/api', apiRoutes);

// Vercel Cron 健康检查 - 无日志写入
app.get('/cron/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(frontendBuildPath, {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  cacheControl: true
}));

app.get('*', (req, res) => {
  const indexPath = path.join(frontendBuildPath, 'index.html');
  res.sendFile(indexPath);
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const errorMessage = error.message || '服务器内部错误';
  res.status(statusCode).json({
    error: error.errorType || 'internal_error',
    message: errorMessage,
    status: statusCode,
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: '请求的API端点不存在',
    status: 404,
    timestamp: new Date().toISOString()
  });
});

module.exports = app;

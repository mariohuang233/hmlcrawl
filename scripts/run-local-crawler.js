require('dotenv').config({ path: process.env.LOCAL_ENV_PATH || '.env.local' });

const mongoose = require('mongoose');
const http = require('http');
const logger = require('../src/utils/logger');
const crawler = require('../src/crawler/crawler');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/electricity';
const USE_DIRECT_IP = process.env.USE_DIRECT_IP ?? 'true';
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '0', 10) || 0;

const RECONNECT_CONFIG = {
  maxAttempts: Infinity,
  initialDelay: 3000,
  maxDelay: 60000,
  delayFactor: 1.5
};

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

let crawlerStarted = false;
let healthServer = null;
let memoryMonitor = null;

function logMemoryUsage() {
  const usage = process.memoryUsage();
  const heapMB = (usage.heapUsed / 1024 / 1024).toFixed(1);
  const rssMB = (usage.rss / 1024 / 1024).toFixed(1);
  const extMB = (usage.external / 1024 / 1024).toFixed(1);
  logger.info(`内存状态: heap=${heapMB}MB, rss=${rssMB}MB, external=${extMB}MB`);
  if (usage.heapUsed > 500 * 1024 * 1024) {
    logger.warn(`内存使用过高 (${heapMB}MB)，建议重启`);
  }
}

function startHealthServer() {
  const port = HEALTH_PORT > 0 ? HEALTH_PORT : 0;
  healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      const stats = crawler.getStats ? crawler.getStats() : {};
      const mem = process.memoryUsage();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        pid: process.pid,
        memory: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024)
        },
        mongoState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        crawler: {
          running: crawlerStarted,
          stats
        }
      }));
    } else if (req.url === '/metrics') {
      const stats = crawler.getStats ? crawler.getStats() : {};
      const mem = process.memoryUsage();
      const lines = [
        `# HELP crawler_total_crawls Total crawl attempts`,
        `# TYPE crawler_total_crawls counter`,
        `crawler_total_crawls ${stats.totalCrawls || 0}`,
        `crawler_successful_crawls ${stats.successfulCrawls || 0}`,
        `crawler_failed_crawls ${stats.failedCrawls || 0}`,
        `crawler_retry_count ${stats.retryCount || 0}`,
        `process_heap_mb ${(mem.heapUsed / 1024 / 1024).toFixed(1)}`,
        `process_rss_mb ${(mem.rss / 1024 / 1024).toFixed(1)}`,
        `process_uptime_seconds ${process.uptime()}`
      ];
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(lines.join('\n'));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  healthServer.listen(port, '127.0.0.1', () => {
    const actualPort = healthServer.address().port;
    logger.info(`健康检查HTTP服务已启动: http://127.0.0.1:${actualPort}/health`);
    logger.info(`监控指标地址: http://127.0.0.1:${actualPort}/metrics`);
    if (HEALTH_PORT === 0) {
      logger.info(`HEALTH_PORT 未设置，使用随机端口 ${actualPort}`);
      logger.info(`如需固定端口，设置环境变量 HEALTH_PORT=端口号`);
    }
  });
  healthServer.on('error', (err) => {
    logger.error(`健康检查HTTP服务启动失败: ${err.message}`);
    healthServer = null;
  });
}

logger.info(`本地爬虫启动配置: MONGO_URI=${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);
logger.info(`USE_DIRECT_IP=${USE_DIRECT_IP}，PROXY_URL=${process.env.PROXY_URL || ''}`);

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
    setImmediate(() => connectWithRetry(attempt + 1));
  }
}

function onMongoConnected() {
  if (!crawlerStarted) {
    crawler.start();
    crawlerStarted = true;
    logger.info('本地爬虫已启动，将持续运行（Ctrl+C 退出）');
    logMemoryUsage();
    memoryMonitor = setInterval(logMemoryUsage, 30 * 60 * 1000);
  }
}

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

connectWithRetry();
startHealthServer();

async function gracefulExit(signal) {
  logger.info(`收到${signal}，准备退出本地爬虫...`);
  if (memoryMonitor) clearInterval(memoryMonitor);
  try {
    if (crawler.gracefulShutdown) {
      await crawler.gracefulShutdown();
    }
  } catch (e) {
    logger.error('爬虫关闭时出错:', e.message);
  }
  try {
    await mongoose.connection.close();
    logger.info('MongoDB连接已关闭');
  } catch (e) {
    logger.error('关闭MongoDB连接时出错:', e.message);
  }
  if (healthServer) {
    healthServer.close();
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulExit('SIGINT'));
process.on('SIGTERM', () => gracefulExit('SIGTERM'));
process.on('SIGHUP', () => {
  logger.info('收到SIGHUP，重新加载配置');
  logMemoryUsage();
});

process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error.message);
  logger.error(error.stack);
});

process.on('unhandledRejection', (reason) => {
  logger.error('未处理的Promise拒绝:', reason instanceof Error ? reason.message : reason);
});

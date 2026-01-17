#!/usr/bin/env node
/**
 * 一键运行脚本
 * - 直连模式（默认）：不依赖公网入口，直接用目标站直连IP抓取
 * - 代理模式：启动本地代理 + 尝试 localtunnel 暴露公网地址（失败则提示使用 ngrok）
 *
 * 使用：
 *   npm run oneclick               # 默认直连模式
 *   ONECLICK_MODE=proxy npm run oneclick   # 代理模式（如需公网入口）
 *   LOCAL_ENV_PATH=.env.local npm run oneclick # 指定本地环境文件
 */

const path = require('path');
const { spawn } = require('child_process');
const localtunnel = require('localtunnel');

// 载入本地环境（可选）
const envPath = process.env.LOCAL_ENV_PATH || '.env.local';
require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const logger = require('../src/utils/logger');

const MODE = (process.env.ONECLICK_MODE || 'direct').toLowerCase();
const PORT = Number(process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/electricity';

logger.info(`一键运行模式: ${MODE}`);
logger.info(`Mongo连接: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);

async function startProxyServer() {
  return new Promise((resolve, reject) => {
    logger.info('启动本地代理服务器...');
    const proxyProcess = spawn(process.execPath, [path.join(__dirname, '..', 'local-proxy-server.js')], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proxyProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      process.stdout.write(msg);
      if (msg.includes('本地代理服务器启动成功')) {
        resolve(proxyProcess);
      }
    });
    proxyProcess.stderr.on('data', (d) => process.stderr.write(d.toString()));
    proxyProcess.on('error', reject);
    proxyProcess.on('exit', (code) => {
      if (code !== 0) logger.warn(`本地代理进程退出: ${code}`);
    });
  });
}

async function startLocalTunnel() {
  try {
    const subdomain = process.env.SUBDOMAIN || 'elec-proxy';
    const tunnel = await localtunnel({ port: PORT, subdomain });
    logger.info(`LocalTunnel 已启动: ${tunnel.url}`);
    return { tunnel, url: tunnel.url };
  } catch (err) {
    logger.error(`LocalTunnel 启动失败: ${err.message}`);
    return null;
  }
}

async function connectMongoAndStartCrawler(env) {
  const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  await mongoose.connect(MONGO_URI, mongooseOptions);
  logger.info('MongoDB连接成功');

  // 在加载爬虫前设置运行环境
  Object.assign(process.env, env);
  logger.info(`爬虫启动参数: USE_DIRECT_IP=${process.env.USE_DIRECT_IP || 'false'} PROXY_URL=${process.env.PROXY_URL || ''}`);

  // 动态加载爬虫，确保读取到最新环境变量
  const crawler = require('../src/crawler/crawler');
  crawler.start();
  logger.info('爬虫定时任务已启动；按 Ctrl+C 退出');
  // 立即执行一次手动采集，便于验证
  await crawler.manualCrawl();
}

(async () => {
  try {
    if (MODE === 'proxy') {
      // 代理模式：启动本地代理 + localtunnel
      const proxyProc = await startProxyServer();
      const lt = await startLocalTunnel();

      if (lt && lt.url) {
        await connectMongoAndStartCrawler({ PROXY_URL: lt.url });
        logger.info(`Railway 可配置 PROXY_URL=${lt.url}`);
      } else {
        logger.warn('LocalTunnel 不可用，建议使用 ngrok：\n  ngrok http 3000');
        await connectMongoAndStartCrawler({ PROXY_URL: `http://localhost:${PORT}` });
      }

      // 保持进程运行
      process.on('SIGINT', () => {
        logger.info('收到SIGINT，退出...');
        proxyProc.kill('SIGTERM');
        process.exit(0);
      });
    } else {
      // 直连模式：不依赖公网入口，使用直连IP抓取
      // 在模块加载前设置直连模式
      process.env.USE_DIRECT_IP = process.env.USE_DIRECT_IP || 'true';
      await connectMongoAndStartCrawler({ USE_DIRECT_IP: process.env.USE_DIRECT_IP });
      logger.info('当前为直连模式，已避开 localtunnel 的 405 安全页拦截风险');
      logger.info('如需公网入口再切换：ONECLICK_MODE=proxy npm run oneclick');
      
      // 保持进程运行
      process.on('SIGINT', () => {
        logger.info('收到SIGINT，退出...');
        process.exit(0);
      });
      
      // 保持进程不退出
      await new Promise(() => {});
    }
  } catch (err) {
    logger.error(`一键运行失败: ${err.message}`);
    process.exit(1);
  }
})();
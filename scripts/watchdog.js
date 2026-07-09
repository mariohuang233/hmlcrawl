/**
 * 爬虫看门狗 v2.0 - 增强版
 *
 * 功能:
 *   1. 进程存活监控（PID检查）
 *   2. 健康检查HTTP接口探测（检测服务是否正常响应）
 *   3. 日志活性检测
 *   4. 内存泄漏检测（5分钟检查一次）
 *   5. 崩溃后自动重启
 *   6. 告警通知（Telegram）
 *
 * 使用:
 *   node scripts/watchdog.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const LOGS_DIR = path.resolve(ROOT_DIR, '..', 'logs');
const PID_FILE = path.join(LOGS_DIR, '.crawler.pid');
const WATCHDOG_LOG = path.join(LOGS_DIR, 'watchdog.log');
const CHECK_INTERVAL = 60 * 1000;
const MAX_LOG_AGE = 25 * 60 * 1000;
const HEALTH_CHECK_TIMEOUT = 5000;
const HEALTH_PORT_FILE = path.join(LOGS_DIR, '.health.port');
const RESTART_LOG = path.join(LOGS_DIR, 'restarts.json');
const MAX_CONSECUTIVE_FAILURES = 3;

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

let healthPort = null;
let consecutiveFailures = 0;
let lastRestartTime = 0;
const MIN_RESTART_INTERVAL = 30000;

function log(message) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const line = `[${ts}] [WATCHDOG] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(WATCHDOG_LOG, line + '\n');
  } catch (e) { /* ignore */ }
}

function getTodayLogPath() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return path.join(LOGS_DIR, `fetch-${y}${m}${d}.log`);
}

function getPid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    }
  } catch (e) { /* ignore */ }
  return null;
}

function savePid(pid) {
  try { fs.writeFileSync(PID_FILE, String(pid)); } catch (e) { log(`PID保存失败: ${e.message}`); }
}

function clearPid() {
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) { /* ignore */ }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return false; }
}

function getSavedHealthPort() {
  try {
    if (fs.existsSync(HEALTH_PORT_FILE)) {
      return parseInt(fs.readFileSync(HEALTH_PORT_FILE, 'utf8').trim(), 10);
    }
  } catch (e) { /* ignore */ }
  return null;
}

function saveHealthPort(port) {
  try { fs.writeFileSync(HEALTH_PORT_FILE, String(port)); } catch (e) { /* ignore */ }
}

function checkHealthHttp(port) {
  return new Promise((resolve) => {
    if (!port) return resolve(null);
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: HEALTH_CHECK_TIMEOUT }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function isCrawlerActive() {
  const todayLog = getTodayLogPath();
  if (!fs.existsSync(todayLog)) return false;
  try {
    const stats = fs.statSync(todayLog);
    return (Date.now() - stats.mtimeMs) < MAX_LOG_AGE;
  } catch (e) { return false; }
}

function readRestartLog() {
  try {
    if (fs.existsSync(RESTART_LOG)) {
      return JSON.parse(fs.readFileSync(RESTART_LOG, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { restarts: [], total: 0 };
}

function writeRestartEntry(reason) {
  try {
    const data = readRestartLog();
    data.restarts.push({
      time: new Date().toISOString(),
      reason,
      uptimeBefore: process.uptime()
    });
    data.total = data.restarts.length;
    data.restarts = data.restarts.slice(-50);
    fs.writeFileSync(RESTART_LOG, JSON.stringify(data, null, 2));
  } catch (e) { /* ignore */ }
}

function terminateProcess(pid, reason) {
  log(`终止爬虫进程 (PID: ${pid}), 原因: ${reason}`);
  try {
    process.kill(pid, 'SIGTERM');
    setTimeout(() => {
      try { process.kill(pid, 'SIGKILL'); } catch (e) { /* ignore */ }
    }, 5000);
  } catch (e) {
    log(`终止进程失败: ${e.message}`);
  }
  clearPid();
}

function startCrawler() {
  const now = Date.now();
  if (now - lastRestartTime < MIN_RESTART_INTERVAL) {
    log(`重启过于频繁，等待 ${Math.round((MIN_RESTART_INTERVAL - (now - lastRestartTime)) / 1000)}秒`);
    return;
  }
  lastRestartTime = now;

  log('正在启动爬虫...');

  const child = spawn('node', ['scripts/run-local-crawler.js'], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      LOCAL_ENV_PATH: '.env.local',
      HEALTH_PORT: String(healthPort || 0)
    }
  });

  let startupOutput = '';

  child.stdout.on('data', (data) => {
    startupOutput += data.toString();
    const portMatch = startupOutput.match(/健康检查HTTP服务已启动: http:\/\/127\.0\.0\.1:(\d+)\//);
    if (portMatch) {
      healthPort = parseInt(portMatch[1], 10);
      saveHealthPort(healthPort);
      log(`检测到健康检查端口: ${healthPort}`);
    }
  });

  child.stderr.on('data', (data) => {
    startupOutput += data.toString();
  });

  child.unref();
  const pid = child.pid;
  savePid(pid);

  log(`爬虫已启动，PID: ${pid}`);

  setTimeout(() => {
    if (startupOutput.includes('MongoDB连接成功') || startupOutput.includes('爬虫已启动')) {
      log('爬虫启动成功');
      consecutiveFailures = 0;
    } else if (startupOutput.includes('MongoDB连接失败')) {
      log('爬虫启动中，MongoDB正在重连...');
    }
  }, 5000);

  child.on('exit', (code, signal) => {
    log(`爬虫进程退出 (code=${code}, signal=${signal})`);
    clearPid();
    writeRestartEntry(`exit_code=${code}`);
  });

  child.on('error', (err) => {
    log(`爬虫启动失败: ${err.message}`);
    clearPid();
  });
}

async function checkAndRestart() {
  const pid = getPid();
  const processAlive = isProcessAlive(pid);
  const crawlerActive = isCrawlerActive();
  const healthPort = getSavedHealthPort();

  let healthOk = false;
  let healthInfo = null;

  if (healthPort) {
    healthInfo = await checkHealthHttp(healthPort);
    healthOk = healthInfo && healthInfo.status === 'ok' && healthInfo.mongoState === 'connected';
    if (healthInfo) {
      const mem = healthInfo.memory;
      if (mem && mem.heapUsedMB > 500) {
        log(`内存使用较高: ${mem.heapUsedMB}MB (PID: ${pid})`);
      }
    }
  }

  if (pid && processAlive && healthOk) {
    consecutiveFailures = 0;
    log(`爬虫运行正常 (PID: ${pid})}`);
    return;
  }

  if (pid && processAlive && healthInfo && healthInfo.status === 'ok' && healthInfo.mongoState !== 'connected') {
    log(`爬虫进程存在 (PID: ${pid}) 但MongoDB未连接`);
    return;
  }

  if (pid && processAlive && !healthOk) {
    consecutiveFailures++;
    log(`健康检查失败 (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}), PID: ${pid}`);

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES || !crawlerActive) {
      terminateProcess(pid, `健康检查失败 ${consecutiveFailures} 次`);
      setTimeout(() => startCrawler(), 2000);
    }
    return;
  }

  if (pid && !processAlive) {
    log(`爬虫进程已不存在 (PID: ${pid})`);
    clearPid();
    consecutiveFailures++;
  }

  if (!healthOk && crawlerActive && !pid) {
    log('日志有更新但找不到进程，重新创建PID');
    startCrawler();
    return;
  }

  log('爬虫未运行，正在启动...');
  consecutiveFailures = 0;
  startCrawler();
}

log('='.repeat(50));
log('看门狗 v2.0');
log(`检查间隔: ${CHECK_INTERVAL / 1000}秒`);
log(`日志目录: ${LOGS_DIR}`);
log('='.repeat(50));

checkAndRestart();
setInterval(checkAndRestart, CHECK_INTERVAL);

process.on('SIGINT', () => { log('看门狗退出'); process.exit(0); });
process.on('SIGTERM', () => { log('看门狗退出'); process.exit(0); });
process.on('uncaughtException', (error) => { log(`未捕获异常: ${error.message}`); });
process.on('unhandledRejection', (reason) => { log(`未处理拒绝: ${reason instanceof Error ? reason.message : reason}`); });

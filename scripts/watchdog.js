/**
 * 爬虫看门狗 - 监控爬虫进程并在崩溃时自动重启
 * 
 * 使用方式:
 *   node scripts/watchdog.js
 * 
 * 或者通过 PM2 启动:
 *   pm2 start scripts/watchdog.js --name watchdog
 * 
 * 工作方式:
 *   1. 每5分钟检查一次爬虫进程是否存活
 *   2. 检查爬虫日志是否在最近15分钟内有更新
 *   3. 如果爬虫挂了或无响应，自动重启
 *   4. 记录看门狗自身的日志
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const LOGS_DIR = path.resolve(ROOT_DIR, '..', 'logs');
const PID_FILE = path.join(LOGS_DIR, '.crawler.pid');
const WATCHDOG_LOG = path.join(LOGS_DIR, 'watchdog.log');

const CHECK_INTERVAL = 5 * 60 * 1000;
const MAX_LOG_AGE = 20 * 60 * 1000;

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const line = `[${timestamp}] [WATCHDOG] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(WATCHDOG_LOG, line + '\n');
  } catch (e) {
    // ignore file write errors
  }
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
  } catch (e) {
    // ignore
  }
  return null;
}

function savePid(pid) {
  try {
    fs.writeFileSync(PID_FILE, String(pid));
  } catch (e) {
    log(`无法保存PID文件: ${e.message}`);
  }
}

function clearPid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (e) {
    // ignore
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function isCrawlerActive() {
  const todayLog = getTodayLogPath();
  if (!fs.existsSync(todayLog)) return false;

  try {
    const stats = fs.statSync(todayLog);
    const age = Date.now() - stats.mtimeMs;
    return age < MAX_LOG_AGE;
  } catch (e) {
    return false;
  }
}

function startCrawler() {
  log('正在启动爬虫...');

  const child = spawn('node', ['scripts/run-local-crawler.js'], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      LOCAL_ENV_PATH: '.env.local'
    }
  });

  child.unref();

  const pid = child.pid;
  savePid(pid);

  log(`爬虫已启动，PID: ${pid}`);

  child.on('exit', (code, signal) => {
    log(`爬虫进程退出 (code=${code}, signal=${signal})，将在下次检查时重启`);
    clearPid();
  });

  child.on('error', (err) => {
    log(`爬虫启动失败: ${err.message}`);
    clearPid();
  });

  return pid;
}

function checkAndRestart() {
  const pid = getPid();
  const processAlive = isProcessAlive(pid);
  const crawlerActive = isCrawlerActive();

  if (pid && processAlive) {
    if (crawlerActive) {
      log(`爬虫运行正常 (PID: ${pid})`);
      return;
    }
    log(`爬虫进程存在 (PID: ${pid}) 但日志无更新，可能已卡死`);
    try {
      process.kill(pid, 'SIGKILL');
      log(`已终止卡死的爬虫进程 (PID: ${pid})`);
    } catch (e) {
      log(`终止进程失败: ${e.message}`);
    }
    clearPid();
    setTimeout(() => startCrawler(), 2000);
    return;
  }

  if (pid && !processAlive) {
    log(`爬虫进程已不存在 (PID: ${pid})，准备重启`);
    clearPid();
  }

  if (crawlerActive) {
    log('爬虫日志有更新但找不到进程，重新创建PID记录');
    startCrawler();
    return;
  }

  log('爬虫未运行，正在启动...');
  startCrawler();
}

log('='.repeat(50));
log(`爬虫看门狗已启动`);
log(`检查间隔: ${CHECK_INTERVAL / 1000}秒`);
log(`日志目录: ${LOGS_DIR}`);
log('='.repeat(50));

checkAndRestart();
setInterval(checkAndRestart, CHECK_INTERVAL);

process.on('SIGINT', () => {
  log('看门狗收到SIGINT信号，退出');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('看门狗收到SIGTERM信号，退出');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  log(`未捕获异常: ${error.message}`);
});

process.on('unhandledRejection', (reason) => {
  log(`未处理拒绝: ${reason instanceof Error ? reason.message : reason}`);
});

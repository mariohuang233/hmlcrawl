/**
 * 可靠上传队列 - 用于本地爬虫向云端批量同步数据
 *
 * 功能:
 *   1. 指数退避重试
 *   2. 基于 crawl_id 去重
 *   3. 批量上传（减少请求次数）
 *   4. 本地文件持久化备份
 *   5. 上传进度统计
 *
 * 使用:
 *   const uploadQueue = require('./upload-queue');
 *   await uploadQueue.enqueue(record);
 *   await uploadQueue.flush();
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const Format = require('./crawler-format');
const { crawlerLogger } = require('./logger');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const QUEUE_DIR = path.join(ROOT_DIR, 'upload_queue');

class UploadQueue {
  constructor(options = {}) {
    this.backendUrls = options.backendUrls || [];
    this.batchSize = options.batchSize || 20;
    this.maxRetries = options.maxRetries || 5;
    this.initialRetryDelay = options.initialRetryDelay || 5000;
    this.flushInterval = options.flushInterval || 60000;
    this.maxQueueSize = options.maxQueueSize || 500;

    this.queue = [];
    this.uploadedIds = new Set();
    this.flushTimer = null;
    this.isFlushing = false;

    this.stats = {
      enqueued: 0,
      uploaded: 0,
      skipped: 0,
      failed: 0,
      lastUploadTime: null
    };

    if (!fs.existsSync(QUEUE_DIR)) {
      fs.mkdirSync(QUEUE_DIR, { recursive: true });
    }

    this._startFlushTimer();
    this._loadPersistedQueue();
    crawlerLogger.info(`上传队列已初始化 (backend=${this.backendUrls.length}个, batch=${this.batchSize})`);
  }

  _getQueueFilePath() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return path.join(QUEUE_DIR, `queue-${y}${m}${d}.jsonl`);
  }

  _persistRecord(record) {
    try {
      const filepath = this._getQueueFilePath();
      fs.appendFileSync(filepath, Format.toJsonLine(record) + '\n', 'utf-8');
    } catch (e) {
      crawlerLogger.error(`持久化队列写入失败: ${e.message}`);
    }
  }

  _loadPersistedQueue() {
    try {
      const files = fs.readdirSync(QUEUE_DIR)
        .filter(f => f.startsWith('queue-') && f.endsWith('.jsonl'))
        .sort()
        .slice(-2);

      let count = 0;
      for (const file of files) {
        const data = fs.readFileSync(path.join(QUEUE_DIR, file), 'utf-8');
        for (const line of data.split('\n').filter(Boolean)) {
          const record = Format.fromJsonLine(line);
          if (record && this.queue.length < this.maxQueueSize) {
            if (record.crawl_id && !this.uploadedIds.has(record.crawl_id)) {
              this.queue.push(record);
              this.uploadedIds.add(record.crawl_id);
              count++;
            }
          }
        }
      }
      if (count > 0) {
        crawlerLogger.info(`从持久化队列恢复 ${count} 条待上传记录`);
      }
    } catch (e) {
      /* ignore */
    }
  }

  _cleanOldQueueFiles() {
    try {
      const files = fs.readdirSync(QUEUE_DIR)
        .filter(f => f.startsWith('queue-') && f.endsWith('.jsonl'))
        .sort()
        .reverse();

      const keepFiles = files.slice(0, 3);
      for (const file of files) {
        if (!keepFiles.includes(file)) {
          fs.unlinkSync(path.join(QUEUE_DIR, file));
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  _startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
    this.flushTimer.unref();
  }

  enqueue(record) {
    if (record.crawl_id && this.uploadedIds.has(record.crawl_id)) {
      this.stats.skipped++;
      return;
    }

    this.queue.push(record);
    if (record.crawl_id) {
      this.uploadedIds.add(record.crawl_id);
    }
    this.stats.enqueued++;

    this._persistRecord(record);

    if (this.queue.length >= this.batchSize) {
      setImmediate(() => this.flush());
    }
  }

  async flush() {
    if (this.isFlushing || this.queue.length === 0) return;
    if (this.backendUrls.length === 0) return;

    this.isFlushing = true;
    const batch = this.queue.splice(0, this.batchSize);

    try {
      let successCount = 0;
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        const remaining = batch.slice(successCount);
        if (remaining.length === 0) break;

        const results = await Promise.allSettled(
          remaining.map(record => this._uploadSingle(record))
        );

        successCount = 0;
        for (let i = 0; i < results.length; i++) {
          if (results[i].status === 'fulfilled' && results[i].value) {
            successCount++;
          }
        }

        if (successCount === batch.length) break;

        if (attempt < this.maxRetries - 1) {
          const delay = this.initialRetryDelay * Math.pow(2, attempt);
          crawlerLogger.info(`上传 ${successCount}/${batch.length} 成功，${Math.round(delay / 1000)}秒后重试剩余...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      this.stats.uploaded += successCount;
      this.stats.failed += (batch.length - successCount);
      this.stats.lastUploadTime = new Date().toISOString();

      if (successCount < batch.length) {
        const failedRecords = batch.slice(successCount);
        failedRecords.forEach(r => this._persistRecord(r));
        crawlerLogger.warn(`上传完成: ${successCount}/${batch.length} 成功, ${failedRecords.length} 条已重新入队`);
      } else {
        this._cleanOldQueueFiles();
        crawlerLogger.info(`批量上传完成: ${successCount} 条`);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  _uploadSingle(record) {
    return new Promise((resolve) => {
      const tryNext = (urlIndex) => {
        if (urlIndex >= this.backendUrls.length) {
          resolve(false);
          return;
        }

        const url = this.backendUrls[urlIndex];
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const module = isHttps ? https : http;
        const body = JSON.stringify(record);

        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-Source': record.source || 'local',
            'X-Format-Version': String(record.format_version || 1),
            'X-Crawl-Id': record.crawl_id || '',
            'X-Deduplicate': 'true',
            'User-Agent': 'hmlcrawl-upload-queue/2.0'
          },
          timeout: 15000
        };

        const req = module.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200 || res.statusCode === 201) {
              resolve(true);
            } else if (res.statusCode === 409) {
              resolve(true);
            } else {
              tryNext(urlIndex + 1);
            }
          });
        });

        req.on('error', () => tryNext(urlIndex + 1));
        req.on('timeout', () => { req.destroy(); tryNext(urlIndex + 1); });
        req.write(body);
        req.end();
      };

      tryNext(0);
    });
  }

  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.length,
      backendCount: this.backendUrls.length,
      uploadedIdsCount: this.uploadedIds.size
    };
  }

  stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    crawlerLogger.info('上传队列已停止');
  }
}

let instance = null;

function getInstance(options) {
  if (!instance) {
    const urls = [];
    if (process.env.BACKEND_URL) urls.push(process.env.BACKEND_URL);
    if (process.env.BACKEND_URLS) {
      process.env.BACKEND_URLS.split(',').forEach(u => {
        const trimmed = u.trim();
        if (trimmed) urls.push(trimmed);
      });
    }
    instance = new UploadQueue({
      backendUrls: urls,
      ...options
    });
  }
  return instance;
}

module.exports = { UploadQueue, getInstance };

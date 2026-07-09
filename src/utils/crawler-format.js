/**
 * 统一数据格式标准 - 两端爬虫共享的数据规范
 *
 * 数据格式版本: 1.0
 *
 * 所有爬虫（本地JS爬虫、iPad Python爬虫）采集的数据必须遵循此标准。
 * 上报时使用此模块进行验证和序列化，确保数据一致性。
 *
 * === 数据字段定义 ===
 *
 * @typedef {Object} CrawlerRecord
 * @property {string}   meter_id       - 电表ID（必填）
 * @property {string}   meter_name     - 电表名称（必填）
 * @property {number}   remaining_kwh  - 剩余电量，精确到2位小数（必填）
 * @property {string}   collected_at   - ISO 8601 采集时间（必填）
 * @property {string}   source         - 数据来源: 'local' | 'ipad' | 'cloud'（必填）
 * @property {string}   crawl_id       - 爬取唯一ID，用于去重: {source}_{timestamp}_{随机数}（必填）
 * @property {number}   format_version - 格式版本号，当前为 1（必填）
 * @property {string}   [checksum]     - 数据校验和，防篡改（可选）
 *
 * === 数据范围约束 ===
 * remaining_kwh: 0 < x < 1000 (kWh)
 * collected_at: ISO 8601 格式
 * meter_id: 字符串，长度 1-50
 * source: 'local' | 'ipad' | 'cloud'
 */

const crypto = require('crypto');

const FORMAT_VERSION = 1;

const SOURCES = {
  LOCAL: 'local',
  IPAD: 'ipad',
  CLOUD: 'cloud'
};

const CONSTRAINTS = {
  MIN_KWH: 0,
  MAX_KWH: 1000,
  MAX_METER_ID_LENGTH: 50,
  MAX_METER_NAME_LENGTH: 200
};

function generateCrawlId(source) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).readUInt32BE(0).toString(36);
  return `${source}_${timestamp}_${random}`;
}

function computeChecksum(record) {
  const sorted = {
    meter_id: record.meter_id,
    meter_name: record.meter_name,
    remaining_kwh: record.remaining_kwh,
    collected_at: record.collected_at,
    source: record.source,
    crawl_id: record.crawl_id,
    format_version: record.format_version
  };
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex').substring(0, 16);
}

function validate(record) {
  const errors = [];

  if (!record.meter_id || typeof record.meter_id !== 'string') {
    errors.push('meter_id 是必填字符串');
  } else if (record.meter_id.length > CONSTRAINTS.MAX_METER_ID_LENGTH) {
    errors.push(`meter_id 长度不能超过 ${CONSTRAINTS.MAX_METER_ID_LENGTH}`);
  }

  if (!record.meter_name || typeof record.meter_name !== 'string') {
    errors.push('meter_name 是必填字符串');
  } else if (record.meter_name.length > CONSTRAINTS.MAX_METER_NAME_LENGTH) {
    errors.push(`meter_name 长度不能超过 ${CONSTRAINTS.MAX_METER_NAME_LENGTH}`);
  }

  if (record.remaining_kwh === undefined || record.remaining_kwh === null) {
    errors.push('remaining_kwh 是必填项');
  } else if (typeof record.remaining_kwh !== 'number' || isNaN(record.remaining_kwh)) {
    errors.push('remaining_kwh 必须是有效数字');
  } else if (record.remaining_kwh <= CONSTRAINTS.MIN_KWH || record.remaining_kwh >= CONSTRAINTS.MAX_KWH) {
    errors.push(`remaining_kwh 必须在 ${CONSTRAINTS.MIN_KWH}-${CONSTRAINTS.MAX_KWH} 之间`);
  }

  if (!record.collected_at) {
    errors.push('collected_at 是必填项');
  } else {
    const d = new Date(record.collected_at);
    if (isNaN(d.getTime())) {
      errors.push('collected_at 必须是有效日期');
    }
  }

  if (record.crawl_id && typeof record.crawl_id !== 'string') {
    errors.push('crawl_id 必须是字符串');
  }

  if (record.checksum && typeof record.checksum !== 'string') {
    errors.push('checksum 必须是字符串');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function normalizeKwh(value) {
  return Math.round(parseFloat(value) * 100) / 100;
}

function createRecord({ meter_id, meter_name, remaining_kwh, collected_at, source }) {
  const record = {
    meter_id,
    meter_name,
    remaining_kwh: normalizeKwh(remaining_kwh),
    collected_at: collected_at instanceof Date ? collected_at.toISOString() : collected_at,
    source: source || SOURCES.LOCAL,
    crawl_id: generateCrawlId(source || SOURCES.LOCAL),
    format_version: FORMAT_VERSION
  };
  record.checksum = computeChecksum(record);
  return record;
}

function verifyChecksum(record) {
  if (!record.checksum) return true;
  const expected = computeChecksum(record);
  return record.checksum === expected;
}

function toUsageModel(record) {
  return {
    meter_id: record.meter_id,
    meter_name: record.meter_name,
    remaining_kwh: record.remaining_kwh,
    collected_at: new Date(record.collected_at)
  };
}

function toJsonLine(record) {
  return JSON.stringify(record);
}

function fromJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

module.exports = {
  FORMAT_VERSION,
  SOURCES,
  CONSTRAINTS,
  generateCrawlId,
  computeChecksum,
  validate,
  normalizeKwh,
  createRecord,
  verifyChecksum,
  toUsageModel,
  toJsonLine,
  fromJsonLine
};

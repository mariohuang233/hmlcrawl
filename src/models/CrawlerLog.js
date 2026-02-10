const mongoose = require('mongoose');

const crawlerLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  level: {
    type: String,
    enum: ['info', 'warn', 'error', 'debug'],
    default: 'info'
  },
  action: {
    type: String,
    required: true
  },
  message: {
    type: String
  },
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  source: {
    type: String,
    default: 'local'
  },
  hostname: {
    type: String
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// 索引优化查询
crawlerLogSchema.index({ timestamp: -1 });
crawlerLogSchema.index({ action: 1, timestamp: -1 });
crawlerLogSchema.index({ level: 1, timestamp: -1 });

// 静态方法：获取最近的日志
crawlerLogSchema.statics.getRecentLogs = async function(limit = 100) {
  return this.find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

// 静态方法：添加日志
crawlerLogSchema.statics.addLog = async function(logData) {
  const log = new this({
    timestamp: logData.timestamp || new Date(),
    level: logData.level || 'info',
    action: logData.action || 'unknown',
    message: logData.message || logData.info || logData.error,
    data: logData.data,
    source: logData.source || 'local',
    hostname: require('os').hostname()
  });
  return log.save();
};

module.exports = mongoose.model('CrawlerLog', crawlerLogSchema);

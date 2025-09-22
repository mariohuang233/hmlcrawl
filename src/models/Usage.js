const mongoose = require('mongoose');

const usageSchema = new mongoose.Schema({
  meter_id: {
    type: String,
    required: true,
    index: true
  },
  meter_name: {
    type: String,
    required: true
  },
  remaining_kwh: {
    type: Number,
    required: true,
    min: 0
  },
  collected_at: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// 复合索引优化查询性能
usageSchema.index({ meter_id: 1, collected_at: -1 });
usageSchema.index({ collected_at: -1 });

// 静态方法：获取指定时间范围的用电数据
usageSchema.statics.getUsageInRange = function(meterId, startDate, endDate) {
  return this.find({
    meter_id: meterId,
    collected_at: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ collected_at: 1 });
};

// 静态方法：获取最新的用电数据
usageSchema.statics.getLatestUsage = function(meterId) {
  return this.findOne({
    meter_id: meterId
  }).sort({ collected_at: -1 });
};

// 静态方法：计算用电量统计
usageSchema.statics.calculateUsageStats = async function(meterId, startDate, endDate) {
  const data = await this.getUsageInRange(meterId, startDate, endDate);
  
  if (data.length < 2) {
    return {
      totalUsage: 0,
      averageUsage: 0,
      dataPoints: data.length
    };
  }

  let totalUsage = 0;
  let validPoints = 0;

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const diff = prev.remaining_kwh - curr.remaining_kwh;
    
    // 如果差值为负，说明是充值，不计入用电量
    if (diff >= 0) {
      totalUsage += diff;
      validPoints++;
    }
  }

  return {
    totalUsage: Math.round(totalUsage * 100) / 100, // 保留2位小数
    averageUsage: validPoints > 0 ? Math.round((totalUsage / validPoints) * 100) / 100 : 0,
    dataPoints: data.length,
    validPoints
  };
};

module.exports = mongoose.model('Usage', usageSchema);

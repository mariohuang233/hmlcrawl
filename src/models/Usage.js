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
    min: 0,
    max: 1000
  },
  collected_at: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  crawl_id: {
    type: String,
    trim: true,
    maxlength: 128
  },
  source: {
    type: String,
    trim: true,
    maxlength: 32,
    default: 'unknown'
  },
  format_version: {
    type: String,
    trim: true,
    maxlength: 16
  }
}, {
  timestamps: true
});

// 复合唯一索引：用于去重（同电表同一时刻只能有一条记录）
usageSchema.index({ meter_id: 1, collected_at: -1 }, { unique: true });
usageSchema.index(
  { meter_id: 1, crawl_id: 1 },
  { unique: true, partialFilterExpression: { crawl_id: { $type: 'string' } } }
);

// 静态方法：获取指定时间范围的用电数据
usageSchema.statics.getUsageInRange = function(meterId, startDate, endDate) {
  return this.find({
    meter_id: meterId,
    collected_at: {
      $gte: startDate,
      $lte: endDate
    }
  })
    .select('meter_id meter_name remaining_kwh collected_at source crawl_id')
    .sort({ collected_at: 1 })
    .lean();
};

// 静态方法：获取最新的用电数据
usageSchema.statics.getLatestUsage = function(meterId) {
  return this.findOne({
    meter_id: meterId
  })
    .select('meter_id meter_name remaining_kwh collected_at source crawl_id')
    .sort({ collected_at: -1 })
    .lean();
};

// 静态方法：计算用电量统计（使用聚合查询优化性能）
usageSchema.statics.calculateUsageStats = async function(meterId, startDate, endDate) {
  try {
    // 使用MongoDB聚合查询直接在数据库端计算统计信息
    const result = await this.aggregate([
      // 1. 筛选指定时间段和电表的数据
      {
        $match: {
          meter_id: meterId,
          collected_at: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      // 2. 按时间升序排序
      {
        $sort: { collected_at: 1 }
      },
      // 3. 计算相邻记录的电量差值
      {
        $group: {
          _id: null,
          data: { $push: '$$ROOT' },
          dataPoints: { $sum: 1 }
        }
      },
      // 4. 使用$reduce计算总用电量和有效数据点
      {
        $project: {
          dataPoints: 1,
          stats: {
            $reduce: {
              input: { $slice: ['$data', 1, { $size: '$data' }] }, // 从第二个元素开始
              initialValue: {
                prev: { $arrayElemAt: ['$data', 0] }, // 第一个元素作为初始值
                totalUsage: 0,
                validPoints: 0
              },
              in: {
                prev: '$$this',
                totalUsage: {
                  $cond: {
                    if: { $gte: [{ $subtract: ['$$value.prev.remaining_kwh', '$$this.remaining_kwh'] }, 0] },
                    then: { $add: ['$$value.totalUsage', { $subtract: ['$$value.prev.remaining_kwh', '$$this.remaining_kwh'] }] },
                    else: '$$value.totalUsage'
                  }
                },
                validPoints: {
                  $cond: {
                    if: { $gte: [{ $subtract: ['$$value.prev.remaining_kwh', '$$this.remaining_kwh'] }, 0] },
                    then: { $add: ['$$value.validPoints', 1] },
                    else: '$$value.validPoints'
                  }
                }
              }
            }
          }
        }
      },
      // 5. 最终计算并格式化结果
      {
        $project: {
          dataPoints: 1,
          totalUsage: {
            $round: ['$stats.totalUsage', 2]
          },
          averageUsage: {
            $cond: {
              if: { $gt: ['$stats.validPoints', 0] },
              then: { $round: [{ $divide: ['$stats.totalUsage', '$stats.validPoints'] }, 2] },
              else: 0
            }
          },
          validPoints: '$stats.validPoints'
        }
      }
    ]).exec();

    if (result.length === 0 || result[0].dataPoints < 2) {
      return {
        totalUsage: 0,
        averageUsage: 0,
        dataPoints: result.length > 0 ? result[0].dataPoints : 0,
        validPoints: 0
      };
    }

    return result[0];
  } catch (error) {
    // 异常情况下回退到原来的实现
    console.error('聚合查询失败，回退到传统计算:', error.message);
    
    const data = await this.getUsageInRange(meterId, startDate, endDate);
    
    if (data.length < 2) {
      return {
        totalUsage: 0,
        averageUsage: 0,
        dataPoints: data.length,
        validPoints: 0
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
  }
};

usageSchema.statics.getDailyUsageStats = async function(meterId, daysCount = 7) {
  try {
    const now = new Date();
    const todayStart = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    todayStart.setHours(0, 0, 0, 0);
    todayStart.setTime(todayStart.getTime() - 8 * 60 * 60 * 1000);

    const startDate = new Date(todayStart.getTime() - daysCount * 24 * 60 * 60 * 1000);

    const data = await this.getUsageInRange(meterId, startDate, now);

    const dailyUsage = {};
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const diff = prev.remaining_kwh - curr.remaining_kwh;
      if (diff < 0) continue;

      const beijingTime = new Date(curr.collected_at.getTime() + 8 * 60 * 60 * 1000);
      const dateStr = beijingTime.toISOString().split('T')[0];

      if (!dailyUsage[dateStr]) {
        dailyUsage[dateStr] = 0;
      }
      dailyUsage[dateStr] += diff;
    }

    const result = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const date = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
      const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const dateStr = beijingDate.toISOString().split('T')[0];

      result.push({
        date: dateStr,
        usageKwh: Math.round((dailyUsage[dateStr] || 0) * 100) / 100,
        dayOfWeek: beijingDate.getDay()
      });
    }

    return result;
  } catch (error) {
    console.error('获取每日用电量统计失败:', error.message);
    return [];
  }
};

usageSchema.statics.getHourlyUsagePattern = async function(meterId, daysCount = 7) {
  try {
    const now = new Date();
    const todayStart = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    todayStart.setHours(0, 0, 0, 0);
    todayStart.setTime(todayStart.getTime() - 8 * 60 * 60 * 1000);

    const startDate = new Date(todayStart.getTime() - daysCount * 24 * 60 * 60 * 1000);

    const data = await this.getUsageInRange(meterId, startDate, now);

    const hourlyPattern = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const diff = prev.remaining_kwh - curr.remaining_kwh;
      if (diff < 0) continue;

      const beijingHour = Math.floor((curr.collected_at.getTime() + 8 * 60 * 60 * 1000) / (1000 * 60 * 60)) % 24;
      if (beijingHour >= 0 && beijingHour < 24) {
        hourlyPattern[beijingHour].total += diff;
        hourlyPattern[beijingHour].count++;
      }
    }

    return hourlyPattern.map(h => ({
      hour: h.hour !== undefined ? h.hour : hourlyPattern.indexOf(h),
      avgKwh: h.count > 0 ? Math.round((h.total / h.count) * 100) / 100 : 0,
      count: h.count
    }));
  } catch (error) {
    console.error('获取用电时段模式失败:', error.message);
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, avgKwh: 0, count: 0 }));
  }
};

// 获取今天实际的小时用电分布
usageSchema.statics.getTodayHourlyUsage = async function(meterId) {
  try {
    const now = new Date();
    const todayStart = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    todayStart.setHours(0, 0, 0, 0);
    todayStart.setTime(todayStart.getTime() - 8 * 60 * 60 * 1000);

    const data = await this.getUsageInRange(meterId, todayStart, now);

    const hourlyUsage = Array.from({ length: 24 }, (_, i) => ({ hour: i, kwh: 0, count: 0 }));

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const diff = prev.remaining_kwh - curr.remaining_kwh;
      if (diff < 0) continue;

      const beijingHour = Math.floor((curr.collected_at.getTime() + 8 * 60 * 60 * 1000) / (1000 * 60 * 60)) % 24;
      if (beijingHour >= 0 && beijingHour < 24) {
        hourlyUsage[beijingHour].kwh += diff;
        hourlyUsage[beijingHour].count++;
      }
    }

    return hourlyUsage.map(h => ({
      hour: h.hour,
      kwh: Math.round(h.kwh * 100) / 100,
      count: h.count
    }));
  } catch (error) {
    console.error('获取今日小时用电分布失败:', error.message);
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, kwh: 0, count: 0 }));
  }
};

usageSchema.statics.getRechargeHistory = async function(meterId, limit = 50) {
  try {
    const data = await this.find({ meter_id: meterId })
      .sort({ collected_at: 1 })
      .select('remaining_kwh collected_at meter_name')
      .lean();

    if (data.length < 2) {
      return {
        total: 0,
        totalRechargeKwh: 0,
        records: []
      };
    }

    const recharges = [];
    let totalRechargeKwh = 0;

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const diff = curr.remaining_kwh - prev.remaining_kwh;

      if (diff > 0.1) {
        const rechargeAmount = Math.round(diff * 100) / 100;
        recharges.push({
          time: curr.collected_at,
          amountKwh: rechargeAmount,
          beforeKwh: Math.round(prev.remaining_kwh * 100) / 100,
          afterKwh: Math.round(curr.remaining_kwh * 100) / 100,
          meter_name: curr.meter_name || prev.meter_name
        });
        totalRechargeKwh += rechargeAmount;
      }
    }

    recharges.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const limitedRecords = limit > 0 ? recharges.slice(0, limit) : recharges;

    return {
      total: recharges.length,
      totalRechargeKwh: Math.round(totalRechargeKwh * 100) / 100,
      records: limitedRecords
    };
  } catch (error) {
    console.error('获取充值记录失败:', error.message);
    return {
      total: 0,
      totalRechargeKwh: 0,
      records: [],
      error: error.message
    };
  }
};

module.exports = mongoose.model('Usage', usageSchema);

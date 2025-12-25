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

module.exports = mongoose.model('Usage', usageSchema);

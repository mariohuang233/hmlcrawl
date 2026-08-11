const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Usage = require('../models/Usage');
const CrawlerLog = require('../models/CrawlerLog');
const logger = require('../utils/logger');
const crawler = require('../crawler/crawler');
const Format = require('../utils/crawler-format');
const dailyReport = require('../services/dailyReport');
const summaryReport = require('../services/summaryReport');
const batteryAlertService = require('../services/batteryAlertService');
const dataEvents = require('../services/dataEvents');
const electricityAssistant = require('../services/electricityAssistant');
const DeviceEnergyReading = require('../models/DeviceEnergyReading');
const xiaomiHistoryProbe = require('../services/xiaomiHistoryProbe');
const xiaomiEnergySync = require('../services/xiaomiEnergySync');
const {
  getDeviceDailyMap,
  getDeviceMonthlyMap,
  getDevicePeriodBreakdown,
  withOther
} = require('../services/deviceEnergyAnalytics');
const { getDevicePeriodUsage, getDeviceDailyPeriods, roundKwh } = require('../services/deviceEnergy');
const { parseCollectedAt } = require('../utils/collectedAt');
const {
  getBeijingHour,
  getBeijingTodayStart,
  getBeijingTodayEnd,
  getBeijingWeekStart,
  getBeijingWeekEnd,
  getBeijingMonthStart,
  getBeijingMonthEnd
} = require('../utils/timezone');

// 改进的内存缓存系统
class Cache {
  constructor(maxSize = 200, defaultTTL = 2 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.hits = 0;
    this.misses = 0;
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // 每5分钟清理一次过期缓存
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    this.hits++;
    return entry.data;
  }

  set(key, data, ttl = this.defaultTTL) {
    // 如果缓存已满，清理最旧的10%条目
    if (this.cache.size >= this.maxSize) {
      const entriesToRemove = Math.ceil(this.maxSize * 0.1);
      const oldestKeys = [...this.cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, entriesToRemove)
        .map(entry => entry[0]);
      
      oldestKeys.forEach(key => this.cache.delete(key));
    }
    
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`缓存清理: 移除了 ${cleaned} 个过期条目, 当前缓存大小: ${this.cache.size}`);
    }
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    return size;
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses) * 100).toFixed(1) + '%' : '0%'
    };
  }
}

// 创建全局缓存实例
const cache = new Cache(200, 2 * 60 * 1000);
const CACHE_TTL = 2 * 60 * 1000; // 2分钟缓存
const inFlightCacheLoads = new Map();

dataEvents.on('reading:stored', () => {
  const cleared = cache.clear();
  if (cleared > 0) {
    logger.info(`新读数已写入，清除 ${cleared} 个接口缓存`);
  }
});
dataEvents.on('device-energy:stored', () => {
  cache.clear();
});

/**
 * 缓存中间件
 * @param {string} key 缓存键
 * @param {number} ttl 过期时间（毫秒）
 */
function cacheMiddleware(key, ttl = CACHE_TTL) {
  return async (req, res, next) => {
    const cacheKey = `${key}_${req.url}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return res.json(cachedData);
    }

    const pending = inFlightCacheLoads.get(cacheKey);
    if (pending) {
      const result = await pending;
      if (result.ok) return res.json(result.data);
      return next();
    }

    let finishLoad;
    const load = new Promise(resolve => { finishLoad = resolve; });
    inFlightCacheLoads.set(cacheKey, load);
    let settled = false;
    const settle = result => {
      if (settled) return;
      settled = true;
      if (inFlightCacheLoads.get(cacheKey) === load) inFlightCacheLoads.delete(cacheKey);
      finishLoad(result);
    };
    
    // 重写res.json以缓存响应
    const originalJson = res.json;
    res.json = function(data) {
      if (this.statusCode >= 200 && this.statusCode < 300) {
        cache.set(cacheKey, data, ttl);
        settle({ ok: true, data });
      } else {
        settle({ ok: false });
      }
      return originalJson.call(this, data);
    };
    res.once('finish', () => settle({ ok: false }));
    res.once('close', () => settle({ ok: false }));
    
    next();
  };
}

/**
 * 增强型错误处理包装器
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(error => {
      // 分类错误类型，提供更友好的错误信息
      let errorMessage = error.message;
      let statusCode = 500;
      let errorType = 'internal_error';
      
      // 数据库错误
      if (error.name === 'MongoError' || error.name === 'MongooseError') {
        errorMessage = '数据库操作失败，请稍后重试';
        errorType = 'database_error';
      }
      
      // 验证错误
      else if (error.name === 'ValidationError') {
        errorMessage = '数据验证失败: ' + Object.values(error.errors).map(err => err.message).join(', ');
        statusCode = 400;
        errorType = 'validation_error';
      }
      
      // 路径参数错误
      else if (error.name === 'CastError') {
        errorMessage = '无效的参数格式';
        statusCode = 400;
        errorType = 'parameter_error';
      }
      
      // 404错误
      else if (error.name === 'NotFoundError') {
        errorMessage = '请求的资源不存在';
        statusCode = 404;
        errorType = 'not_found';
      }
      
      // 创建自定义错误对象
      const customError = new Error(errorMessage);
      customError.originalError = error;
      customError.statusCode = statusCode;
      customError.errorType = errorType;
      
      next(customError);
    });
  };
}

/**
 * 计算电量预计用完时间（升级版多窗口预测）
 * @param {string} meterId 电表ID
 * @param {Date} currentTime 当前时间
 * @returns {Object} 预测结果
 */
async function calculateElectricityPrediction(meterId, currentTime, preloadedLatest = null) {
  try {
    // 获取不同时间窗口的数据（优化：直接从数据库获取最近7天数据，避免重复查询）
    const days7Ago = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // 获取7天内的所有数据（用于预测）
    const data7Days = await Usage.find({
      meter_id: meterId,
      collected_at: {
        $gte: days7Ago,
        $lte: currentTime
      }
    }).select('remaining_kwh collected_at').sort({ collected_at: 1 }).lean(); // 仅传输预测需要的字段

    const latestData = preloadedLatest || data7Days.at(-1) || await Usage.getLatestUsage(meterId);
    if (!latestData) {
      return {
        predicted_time: null,
        hours_remaining: null,
        consumption_rate: null,
        status: 'insufficient_data',
        message: '数据不足，无法预测',
        data_points: 0
      };
    }
    const currentRemaining = latestData.remaining_kwh;
    
    if (data7Days.length < 2) {
      return {
        predicted_time: null,
        hours_remaining: null,
        consumption_rate: null,
        status: 'insufficient_data',
        message: '数据不足，无法预测',
        data_points: data7Days.length
      };
    }
    
    // 预处理数据：移除充值异常点
    const cleanedData = removeRechargeAnomalies(data7Days);
    
    if (cleanedData.length < 2) {
      return {
        predicted_time: null,
        hours_remaining: null,
        consumption_rate: null,
        status: 'no_consumption',
        message: '清理异常数据后，有效数据不足',
        data_points: cleanedData.length,
        has_recharge: data7Days.length > cleanedData.length
      };
    }
    
    // 预计算时间窗口边界（避免重复计算）
    const now = currentTime.getTime();
    const hours6Ago = new Date(now - 6 * 60 * 60 * 1000);
    const hours24Ago = new Date(now - 24 * 60 * 60 * 1000);
    
    // 计算多窗口消耗速率
    const shortTermRate = calculateConsumptionRate(cleanedData, hours6Ago, currentTime);
    const mediumTermRate = calculateConsumptionRate(cleanedData, hours24Ago, currentTime);
    const longTermRate = calculateWeeklyPatternRate(cleanedData, currentTime);
    
    // 动态权重调整
    const weights = calculateDynamicWeights(shortTermRate, mediumTermRate, longTermRate);
    
    // 加权平均预测速率
    const weightedRate = 
      weights.short * shortTermRate.rate + 
      weights.medium * mediumTermRate.rate + 
      weights.long * longTermRate.rate;
    
    if (weightedRate <= 0) {
      return {
        predicted_time: null,
        hours_remaining: null,
        consumption_rate: weightedRate,
        status: 'no_consumption',
        message: '未检测到有效电量消耗',
        data_points: cleanedData.length,
        analysis: {
          short_term: shortTermRate,
          medium_term: mediumTermRate,
          long_term: longTermRate,
          weights: weights
        }
      };
    }
    
    // 计算预计剩余小时数
    const hoursRemaining = currentRemaining / weightedRate;
    
    // 计算预计用完时间
    const predictedDepletionTime = new Date(now + hoursRemaining * 60 * 60 * 1000);
    
    // 检查预测是否有效
    if (predictedDepletionTime <= currentTime || hoursRemaining < 0) {
      return {
        predicted_time: null,
        hours_remaining: hoursRemaining,
        consumption_rate: Math.round(weightedRate * 1000) / 1000,
        status: 'invalid_prediction',
        message: '预测结果无效',
        data_points: cleanedData.length,
        analysis: {
          short_term: shortTermRate,
          medium_term: mediumTermRate,
          long_term: longTermRate,
          weights: weights
        }
      };
    }
    
    return {
      predicted_time: predictedDepletionTime,
      hours_remaining: Math.round(hoursRemaining * 10) / 10,
      consumption_rate: Math.round(weightedRate * 1000) / 1000,
      status: 'success',
      message: getAnalysisMessage(weights, shortTermRate, longTermRate),
      data_points: cleanedData.length,
      has_recharge: data7Days.length > cleanedData.length,
      analysis: {
        short_term: shortTermRate,
        medium_term: mediumTermRate,
        long_term: longTermRate,
        weights: weights,
        prediction_method: 'multi_window_weighted'
      }
    };
    
  } catch (error) {
    return {
      predicted_time: null,
      hours_remaining: null,
      consumption_rate: null,
      status: 'error',
      message: error.message,
      data_points: 0
    };
  }
}

/**
 * 移除充值异常点
 * @param {Array} data 原始数据
 * @returns {Array} 清理后的数据
 */
function removeRechargeAnomalies(data) {
  if (data.length < 2) return data;
  
  const cleanedData = [data[0]]; // 保留第一个数据点
  
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    
    // 如果电量增加，说明有充值，跳过这个数据点
    if (curr.remaining_kwh <= prev.remaining_kwh) {
      cleanedData.push(curr);
    }
    // 如果电量突然大幅增加（充值），从充值后的点重新开始
    else if (curr.remaining_kwh > prev.remaining_kwh) {
      // 清空之前的数据，从充值点重新开始
      cleanedData.length = 0;
      cleanedData.push(curr);
    }
  }
  
  return cleanedData;
}

/**
 * 计算指定时间窗口的消耗速率
 * @param {Array} data 数据数组
 * @param {Date} startTime 开始时间
 * @param {Date} endTime 结束时间
 * @returns {Object} 消耗速率信息
 */
function calculateConsumptionRate(data, startTime, endTime) {
  const windowData = data.filter(d => d.collected_at >= startTime && d.collected_at <= endTime);
  
  if (windowData.length < 2) {
    return { rate: 0, dataPoints: windowData.length, valid: false };
  }
  
  let totalConsumption = 0;
  let totalHours = 0;
  
  for (let i = 1; i < windowData.length; i++) {
    const prev = windowData[i - 1];
    const curr = windowData[i];
    const timeDiff = (curr.collected_at - prev.collected_at) / (1000 * 60 * 60);
    const energyDiff = prev.remaining_kwh - curr.remaining_kwh;
    
    if (energyDiff > 0 && timeDiff > 0) {
      totalConsumption += energyDiff;
      totalHours += timeDiff;
    }
  }
  
  return {
    rate: totalHours > 0 ? totalConsumption / totalHours : 0,
    dataPoints: windowData.length,
    valid: totalHours > 0,
    consumption: totalConsumption,
    hours: totalHours
  };
}

/**
 * 计算7天同时段模式的消耗速率
 * @param {Array} data 数据数组
 * @param {Date} currentTime 当前时间
 * @returns {Object} 周期性消耗速率
 */
function calculateWeeklyPatternRate(data, currentTime) {
  if (data.length < 2) {
    return { rate: 0, dataPoints: 0, valid: false };
  }
  
  // 获取当前小时
  const currentHour = currentTime.getHours();
  
  // 预先计算时间窗口边界，避免重复计算
  const hourLowerBound = (currentHour - 2 + 24) % 24;
  const hourUpperBound = (currentHour + 2) % 24;
  
  // 筛选相同时段的数据（±2小时容差）
  const patternData = [];
  for (const d of data) {
    const hour = d.collected_at.getHours();
    if ((hourLowerBound <= hourUpperBound && hour >= hourLowerBound && hour <= hourUpperBound) ||
        (hourLowerBound > hourUpperBound && (hour >= hourLowerBound || hour <= hourUpperBound))) {
      patternData.push(d);
    }
  }
  
  return calculateConsumptionRate(patternData, new Date(0), new Date());
}

/**
 * 计算动态权重
 * @param {Object} shortTerm 短期速率
 * @param {Object} mediumTerm 中期速率
 * @param {Object} longTerm 长期速率
 * @returns {Object} 权重配置
 */
function calculateDynamicWeights(shortTerm, mediumTerm, longTerm) {
  // 默认权重
  let shortWeight = 0.5;
  let mediumWeight = 0.3;
  let longWeight = 0.2;
  
  // 检查数据有效性
  const validRates = [shortTerm.valid, mediumTerm.valid, longTerm.valid];
  const validCount = validRates.filter(v => v).length;
  
  if (validCount === 0) {
    return { short: 0, medium: 0, long: 0 };
  }
  
  // 如果某些数据无效，重新分配权重
  if (!shortTerm.valid) {
    mediumWeight = 0.7;
    longWeight = 0.3;
    shortWeight = 0;
  } else if (!mediumTerm.valid) {
    shortWeight = 0.7;
    longWeight = 0.3;
    mediumWeight = 0;
  } else if (!longTerm.valid) {
    shortWeight = 0.6;
    mediumWeight = 0.4;
    longWeight = 0;
  }
  
  // 动态调整：如果短期速率远高于长期速率，增加短期权重
  if (shortTerm.valid && longTerm.valid && shortTerm.rate > 0 && longTerm.rate > 0) {
    const ratio = shortTerm.rate / longTerm.rate;
    
    if (ratio > 2) { // 短期耗电速率是长期的2倍以上
      shortWeight = Math.min(0.7, shortWeight + 0.2);
      longWeight = Math.max(0.1, longWeight - 0.1);
      mediumWeight = 1 - shortWeight - longWeight;
    } else if (ratio < 0.5) { // 短期耗电速率不到长期的一半
      longWeight = Math.min(0.5, longWeight + 0.2);
      shortWeight = Math.max(0.2, shortWeight - 0.1);
      mediumWeight = 1 - shortWeight - longWeight;
    }
  }
  
  return {
    short: Math.round(shortWeight * 100) / 100,
    medium: Math.round(mediumWeight * 100) / 100,
    long: Math.round(longWeight * 100) / 100
  };
}

/**
 * 生成分析消息
 * @param {Object} weights 权重
 * @param {Object} shortTerm 短期速率
 * @param {Object} longTerm 长期速率
 * @returns {string} 分析消息
 */
function getAnalysisMessage(weights, shortTerm, longTerm) {
  if (!shortTerm.valid && !longTerm.valid) {
    return '基于有限数据的预测';
  }
  
  if (weights.short > 0.6) {
    return '检测到用电量变化，已增加短期权重';
  } else if (weights.long > 0.4) {
    return '基于长期使用模式的稳定预测';
  } else {
    return '多时段加权分析预测';
  }
}

/**
 * 获取前一天的日期字符串
 * @param {string} dateStr YYYY-MM-DD格式的日期字符串
 * @returns {string} 前一天的日期字符串
 */
function getPrevDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

/**
 * 计算百分比变化
 * @param {number} current 当前值
 * @param {number} previous 之前的值
 * @returns {number} 百分比变化（正数表示增加，负数表示减少）
 */
function calculatePercentageChange(current, previous) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

/**
 * 计算本月预计费用（智能预测）
 * @param {Object} monthStats 本月统计数据
 * @param {Date} currentTime 当前时间
 * @param {Date} monthStart 本月开始时间
 * @returns {Object} 预测结果
 */
function calculateMonthCostPrediction(monthStats, currentTime, monthStart) {
  const now = new Date(currentTime);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0); // 设置为本月最后一天
  
  // 计算本月已过天数
  const daysPassed = Math.floor((now - monthStart) / (1000 * 60 * 60 * 24)) + 1;
  const totalDaysInMonth = monthEnd.getDate();
  const daysRemaining = totalDaysInMonth - daysPassed;
  
  // 如果本月已过完，直接返回已用费用
  if (daysRemaining <= 0) {
    return {
      estimated_cost: monthStats.totalUsage * 1,
      used_cost: monthStats.totalUsage * 1,
      prediction_method: 'month_completed',
      confidence: 1.0
    };
  }
  
  // 计算日均用电量
  const dailyAverage = monthStats.totalUsage / daysPassed;
  
  // 基于日均用电量预测剩余天数用电量
  const predictedRemainingUsage = dailyAverage * daysRemaining;
  
  // 预测本月总用电量
  const predictedTotalUsage = monthStats.totalUsage + predictedRemainingUsage;
  
  // 计算预计费用（1元/kWh）
  const estimatedCost = predictedTotalUsage * 1;
  const usedCost = monthStats.totalUsage * 1;
  
  // 计算预测置信度（基于已过天数和数据稳定性）
  const progressRatio = daysPassed / totalDaysInMonth;
  const confidence = Math.min(0.95, 0.5 + progressRatio * 0.45); // 0.5-0.95之间
  
  return {
    estimated_cost: Math.round(estimatedCost * 100) / 100,
    used_cost: Math.round(usedCost * 100) / 100,
    predicted_remaining_usage: Math.round(predictedRemainingUsage * 100) / 100,
    daily_average: Math.round(dailyAverage * 100) / 100,
    days_passed: daysPassed,
    days_remaining: daysRemaining,
    prediction_method: 'daily_average',
    confidence: Math.round(confidence * 100) / 100
  };
}

// 获取总览数据
router.get('/overview', cacheMiddleware('overview', 60000), asyncHandler(async (req, res) => {
    // 检查数据库连接状态
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: '数据库连接不可用',
        message: 'MongoDB连接已断开，请稍后重试',
        status: 'database_unavailable'
      });
    }

    const now = new Date();
    const todayStart = getBeijingTodayStart(now);
    const weekStart = getBeijingWeekStart(now);
    const monthStart = getBeijingMonthStart(now);

    // 计算对比时间范围
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = new Date(todayStart.getTime() - 1);
    const lastWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekEnd = new Date(weekStart.getTime() - 1);
    const lastMonthStart = new Date(monthStart.getTime());
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const lastMonthEnd = new Date(monthStart.getTime() - 1);
    
    // 上周同一天（周环比）
    const lastWeekSameDayStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekSameDayEnd = new Date(lastWeekSameDayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    
    const meterId = process.env.METER_ID || '18100071580';
    
    const recentLogStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const overviewStart = new Date(Math.min(lastMonthStart.getTime(), lastWeekStart.getTime()));
    const [hourlyBuckets, latestUsage, earliestData, recentCrawlResults] = await Promise.all([
      Usage.getUsageBuckets(meterId, overviewStart, now, 'hour'),
      Usage.getLatestUsage(meterId),
      Usage.findOne({ meter_id: meterId }).select('collected_at').sort({ collected_at: 1 }).lean(),
      CrawlerLog.find({
        timestamp: { $gte: recentLogStart },
        action: { $in: ['success', 'failed'] }
      })
        .select('action')
        .sort({ timestamp: -1 })
        .limit(100)
        .lean()
    ]);

    const todayStats = usageStatsFromHourlyBuckets(hourlyBuckets, todayStart, now);
    const weekStats = usageStatsFromHourlyBuckets(hourlyBuckets, weekStart, now);
    const monthStats = usageStatsFromHourlyBuckets(hourlyBuckets, monthStart, now);
    const yesterdayStats = usageStatsFromHourlyBuckets(hourlyBuckets, yesterdayStart, yesterdayEnd);
    const lastWeekStats = usageStatsFromHourlyBuckets(hourlyBuckets, lastWeekStart, lastWeekEnd);
    const lastMonthStats = usageStatsFromHourlyBuckets(hourlyBuckets, lastMonthStart, lastMonthEnd);
    const lastWeekSameDayStats = usageStatsFromHourlyBuckets(hourlyBuckets, lastWeekSameDayStart, lastWeekSameDayEnd);
    const prediction = calculatePredictionFromHourlyBuckets(latestUsage, hourlyBuckets, now);

    // 检查数据覆盖范围
    const dataStartDate = earliestData ? earliestData.collected_at : null;
    
    // 判断数据是否完整
    const weekDataComplete = dataStartDate ? dataStartDate <= weekStart : false;
    const monthDataComplete = dataStartDate ? dataStartDate <= monthStart : false;

    // 计算本月预计费用（智能预测）
    const monthPrediction = calculateMonthCostPrediction(monthStats, now, monthStart);
    
    // 计算对比百分比
    const todayVsYesterday = calculatePercentageChange(todayStats.totalUsage, yesterdayStats.totalUsage);
    const todayVsLastWeekSameDay = calculatePercentageChange(todayStats.totalUsage, lastWeekSameDayStats.totalUsage);
    const weekVsLastWeek = calculatePercentageChange(weekStats.totalUsage, lastWeekStats.totalUsage);
    const monthVsLastMonth = calculatePercentageChange(monthStats.totalUsage, lastMonthStats.totalUsage);
    const costVsLastMonth = calculatePercentageChange(monthPrediction.estimated_cost, lastMonthStats.totalUsage * 1);
    const latestCollectedAt = latestUsage ? latestUsage.collected_at : null;
    const dataAgeMinutes = latestCollectedAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(latestCollectedAt).getTime()) / 60000))
      : null;
    const successfulCrawls = recentCrawlResults.filter(log => log.action === 'success').length;
    const recentSuccessRate = recentCrawlResults.length > 0
      ? Math.round((successfulCrawls / recentCrawlResults.length) * 1000) / 10
      : null;

    res.json({
      current_remaining: latestUsage ? latestUsage.remaining_kwh : 0,
      latest_collected_at: latestCollectedAt,
      data_age_minutes: dataAgeMinutes,
      collection_source: latestUsage ? latestUsage.source : null,
      recent_success_rate: recentSuccessRate,
      recent_attempts: recentCrawlResults.length,
      today_usage: todayStats.totalUsage,
      week_usage: weekStats.totalUsage,
      month_usage: monthStats.totalUsage,
      month_cost: monthPrediction.estimated_cost,
      comparisons: {
        today_vs_yesterday: todayVsYesterday,
        today_vs_last_week_same_day: todayVsLastWeekSameDay,
        week_vs_last_week: weekVsLastWeek,
        month_vs_last_month: monthVsLastMonth,
        cost_vs_last_month: costVsLastMonth,
        yesterday_usage: yesterdayStats.totalUsage,
        last_week_same_day_usage: lastWeekSameDayStats.totalUsage,
        last_week_usage: lastWeekStats.totalUsage,
        last_month_usage: lastMonthStats.totalUsage,
        last_month_cost: lastMonthStats.totalUsage * 1
      },
      predicted_depletion: prediction,
      data_coverage: {
        earliest_data: dataStartDate,
        week_data_complete: weekDataComplete,
        month_data_complete: monthDataComplete,
        week_actual_start: dataStartDate && dataStartDate > weekStart ? dataStartDate : weekStart,
        month_actual_start: dataStartDate && dataStartDate > monthStart ? dataStartDate : monthStart
      }
    });
}));

// 获取过去24小时趋势
router.get('/trend/24h', cacheMiddleware('24h', 120000), asyncHandler(async (req, res) => {
    // 检查数据库连接状态
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: '数据库连接不可用',
        message: 'MongoDB连接已断开，请稍后重试',
        status: 'database_unavailable'
      });
    }

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    
    try {
      const data = await Usage.getUsageInRange('18100071580', startTime, endTime);
    
      const trend = [];
      for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1];
        const curr = data[i];
        const usedKwh = Math.max(0, prev.remaining_kwh - curr.remaining_kwh);
        
        // 直接使用原始时间，让前端处理时区
        trend.push({
          time: curr.collected_at.toISOString(),
          used_kwh: Math.round(usedKwh * 100) / 100,
          remaining_kwh: curr.remaining_kwh
        });
      }
      
      res.json(trend);
    } catch (error) {
      logger.error('24h趋势API错误:', error);
      res.status(500).json({
        error: '服务器内部错误',
        message: '获取24小时趋势数据时发生错误，请稍后重试',
        status: 'internal_error'
      });
    }
}));

// 获取当天用电（按小时）
router.get('/trend/today', cacheMiddleware('today', 120000), asyncHandler(async (req, res) => {
    const now = new Date();
    const todayStart = getBeijingTodayStart(now);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    
    // 获取过去30天的数据用于计算历史平均
    const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const hourlyBuckets = await Usage.getUsageBuckets('18100071580', thirtyDaysAgo, now, 'hour');
    const todayKey = new Date(todayStart.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const yesterdayKey = new Date(yesterdayStart.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const hourlyUsage = new Array(24).fill(0);
    const yesterdayHourlyUsage = new Array(24).fill(0);
    const historicalHourlyUsage = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
    for (const bucket of hourlyBuckets) {
      const hour = Number(bucket.hour);
      const usage = Number(bucket.used_kwh || 0);
      if (bucket.key === todayKey) hourlyUsage[hour] = usage;
      else {
        if (bucket.key === yesterdayKey) yesterdayHourlyUsage[hour] = usage;
        if (usage > 0) {
          historicalHourlyUsage[hour].total += usage;
          historicalHourlyUsage[hour].count += 1;
        }
      }
    }
    
    // 计算平均值
    const avgHourlyUsage = historicalHourlyUsage.map(h => 
      h.count > 0 ? h.total / h.count : 0
    );
    
    const result = hourlyUsage.map((usage, hour) => ({
      hour,
      used_kwh: Math.round(usage * 100) / 100,
      yesterday_used_kwh: Math.round(yesterdayHourlyUsage[hour] * 100) / 100,
      avg_used_kwh: Math.round(avgHourlyUsage[hour] * 100) / 100,
      vs_yesterday: calculatePercentageChange(usage, yesterdayHourlyUsage[hour]),
      vs_avg: calculatePercentageChange(usage, avgHourlyUsage[hour])
    }));
    
    const todayTotal = result.reduce((sum, item) => sum + item.used_kwh, 0);
    const deviceBreakdown = await getDevicePeriodBreakdown(todayStart, now, todayTotal);
    res.json(result.map(item => ({ ...item, device_breakdown: deviceBreakdown })));
}));

// 获取最近30天每日用电
router.get('/trend/30d', cacheMiddleware('30d', 300000), asyncHandler(async (req, res) => {
    const now = new Date();
    // 使用北京时间计算今天结束时间，确保包含今天的数据
    const todayEnd = getBeijingTodayEnd(now);
    const startDate = new Date(getBeijingTodayStart(now).getTime() - 29 * 24 * 60 * 60 * 1000);
    
    const dailyBuckets = await Usage.getUsageBuckets('18100071580', startDate, todayEnd, 'day');
    const dailyUsage = Object.fromEntries(dailyBuckets.map(item => [item.key, Number(item.used_kwh || 0)]));
    
    // 获取所有日期
    const dateSet = new Set();
    const beijingStartDate = new Date(startDate.getTime() + 8 * 60 * 60 * 1000);
    const beijingEndDate = new Date(todayEnd.getTime() + 8 * 60 * 60 * 1000);
    
    let currentDate = new Date(beijingStartDate);
    while (currentDate <= beijingEndDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dateSet.add(dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // 生成完整的30天日期范围，添加昨日对比
    const result = [];
    const sortedDates = Array.from(dateSet).sort();
    
    sortedDates.forEach((dateStr, index) => {
      const usage = Math.round((dailyUsage[dateStr] || 0) * 100) / 100;
      const prevDateStr = index > 0 ? sortedDates[index - 1] : null;
      const prevUsage = prevDateStr ? (dailyUsage[prevDateStr] || 0) : 0;
      
      result.push({
        date: dateStr,
        used_kwh: usage,
        prev_day_used_kwh: Math.round(prevUsage * 100) / 100,
        vs_prev_day: prevDateStr ? calculatePercentageChange(usage, prevUsage) : null
      });
    });
    
    const deviceDaily = await getDeviceDailyMap(startDate, todayEnd);
    res.json(result.map(item => ({
      ...item,
      device_breakdown: withOther(deviceDaily.get(item.date), item.used_kwh)
    })));
}));

// 获取最近12个月月用电
router.get('/trend/monthly', cacheMiddleware('monthly', 600000), asyncHandler(async (req, res) => {
    const endDate = new Date();
    const beijingNow = new Date(endDate.getTime() + 8 * 60 * 60 * 1000);
    const firstMonthUtc = new Date(Date.UTC(
      beijingNow.getUTCFullYear(),
      beijingNow.getUTCMonth() - 11,
      1
    ));
    const startDate = new Date(firstMonthUtc.getTime() - 8 * 60 * 60 * 1000);
    
    const monthlyBuckets = await Usage.getUsageBuckets('18100071580', startDate, endDate, 'month');
    const monthlyUsage = Object.fromEntries(monthlyBuckets.map(item => [item.key, Number(item.used_kwh || 0)]));
    
    // 无论某月是否有采集记录，都稳定返回连续 12 个月，避免前端出现空坐标轴或缺月。
    const sortedMonths = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(
        beijingNow.getUTCFullYear(),
        beijingNow.getUTCMonth() - 11 + index,
        1
      ));
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    const result = sortedMonths.map((month, index) => {
      const usage = Math.round((monthlyUsage[month] || 0) * 100) / 100;
      const prevMonth = index > 0 ? sortedMonths[index - 1] : null;
      const prevUsage = prevMonth ? (monthlyUsage[prevMonth] || 0) : 0;
      
      return {
        month,
        used_kwh: usage,
        prev_month_used_kwh: Math.round(prevUsage * 100) / 100,
        vs_prev_month: prevMonth ? calculatePercentageChange(usage, prevUsage) : null
      };
    });
    
    const deviceMonthly = await getDeviceMonthlyMap(startDate, endDate);
    res.json(result.map(item => ({
      ...item,
      device_breakdown: withOther(deviceMonthly.get(item.month), item.used_kwh)
    })));
}));

// 获取最新数据
router.get('/latest', asyncHandler(async (req, res) => {
  const latest = await Usage.getLatestUsage('18100071580');
  if (!latest) {
    return res.status(404).json({ error: '暂无数据' });
  }
  
  res.json({
    meter_id: latest.meter_id,
    meter_name: latest.meter_name,
    remaining_kwh: latest.remaining_kwh,
    collected_at: latest.collected_at
  });
}));

// 布布用电助手：主动提醒与首屏摘要
router.get('/assistant/briefing', cacheMiddleware('assistant_briefing', 60000), asyncHandler(async (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: '数据库连接不可用',
      message: '暂时无法读取用电数据，请稍后重试',
      status: 'database_unavailable'
    });
  }
  res.json(await electricityAssistant.getBriefing());
}));

// 布布用电助手：结构化问答；无 AI 密钥时仍支持核心用电问题
router.post('/assistant/chat', asyncHandler(async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    return res.status(400).json({ error: '请输入用电问题', status: 'invalid_message' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: '问题不能超过 500 个字符', status: 'message_too_long' });
  }

  const intent = electricityAssistant.classifyIntent(message);
  if (mongoose.connection.readyState !== 1 && !['out_of_scope', 'unknown'].includes(intent)) {
    return res.status(503).json({
      error: '数据库连接不可用',
      message: '暂时无法读取用电数据，请稍后重试',
      status: 'database_unavailable'
    });
  }

  res.json(await electricityAssistant.answerQuestion(message));
}));

// 手动触发爬取
router.post('/crawl', async (req, res) => {
  try {
    const crawler = require('../crawler/crawler');
    await crawler.manualCrawl();
    res.json({ message: '爬取任务已触发' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 清理异常数据
router.post('/cleanup', async (req, res) => {
  try {
    console.log('🔍 开始检查异常数据...');
    
    // 查找所有数据
    const allData = await Usage.find({ meter_id: '18100071580' }).sort({ collected_at: -1 });
    console.log(`总数据条数: ${allData.length}`);
    
    // 查找异常数据（剩余电量大于1000的）
    const abnormalData = await Usage.find({ 
      meter_id: '18100071580',
      remaining_kwh: { $gt: 1000 }
    }).sort({ collected_at: -1 });
    
    console.log(`发现异常数据 ${abnormalData.length} 条`);
    
    if (abnormalData.length > 0) {
      console.log('开始清理异常数据...');
      
      // 删除异常数据
      const deleteResult = await Usage.deleteMany({
        meter_id: '18100071580',
        remaining_kwh: { $gt: 1000 }
      });
      
      console.log(`已删除 ${deleteResult.deletedCount} 条异常数据`);
      
      res.json({ 
        message: '数据清理完成',
        deletedCount: deleteResult.deletedCount,
        totalData: allData.length,
        abnormalData: abnormalData.length
      });
    } else {
      res.json({ 
        message: '未发现异常数据',
        totalData: allData.length,
        abnormalData: 0
      });
    }
    
  } catch (error) {
    console.error('清理过程中出现错误:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 获取爬虫日志
router.get('/crawler/logs', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const source = req.query.source || 'local-crawler';
    const allowedSources = new Set(['local', 'local-crawler', 'cloud-crawler']);
    if (!allowedSources.has(source)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_source',
        message: '日志来源仅支持 local、local-crawler 或 cloud-crawler'
      });
    }
    logger.info(`获取爬虫日志请求，来源: ${source}，限制: ${limit} 条`);
    const logs = await crawler.getLogs(limit, source);
    logger.info(`返回 ${logs.length} 条日志记录`);
    res.json({ success: true, source, logs, count: logs.length });
  } catch (error) {
    logger.error('获取爬虫日志失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 手动触发爬取
router.post('/crawler/trigger', async (req, res) => {
  try {
    logger.info('收到手动触发爬取请求');
    crawler.manualCrawl().then(() => {
      logger.info('手动爬取完成');
    }).catch((error) => {
      logger.error('手动爬取失败:', error.message);
    });
    res.json({ success: true, message: '爬取任务已触发' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 切换爬虫模式
router.post('/crawler/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode || !['proxy', 'direct_ip', 'direct'].includes(mode)) {
      return res.status(400).json({ error: '无效的模式，可选值: proxy, direct_ip, direct' });
    }
    const success = crawler.switchMode(mode);
    if (success) {
      logger.info(`爬虫模式已手动切换为: ${mode}`);
      res.json({ success: true, message: `已切换到${mode}模式`, mode, stats: crawler.getStats() });
    } else {
      res.status(400).json({ success: false, error: '切换失败，可能未配置对应模式的参数' });
    }
  } catch (error) {
    logger.error('切换爬虫模式失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 爬虫状态信息
router.get('/crawler/status', async (req, res) => {
  try {
    const stats = crawler.getStats();
    const IS_RAILWAY = !!process.env.RAILWAY_SERVICE_NAME;
    const IS_ZEABUR = !!process.env.ZEABUR_SERVICE_NAME;
    const IS_RENDER = !!process.env.RENDER;
    const IS_VERCEL = !!process.env.VERCEL;
    const platform = IS_RENDER ? 'render' : IS_RAILWAY ? 'railway' : IS_ZEABUR ? 'zeabur' : IS_VERCEL ? 'vercel' : 'local';
    res.json({
      success: true,
      stats,
      environment: IS_RENDER || IS_RAILWAY || IS_ZEABUR || IS_VERCEL ? 'cloud' : 'local',
      platform,
      uptime: process.uptime(),
      server_time: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 米家设备日用电总览。这里只返回 kWh，不暴露实时功率。
router.get('/device-energy/summary', asyncHandler(async (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: '数据库连接不可用' });
  }

  const now = new Date();
  const todayStart = getBeijingTodayStart(now);
  const monthStart = getBeijingMonthStart(now);
  const meterId = process.env.METER_ID || '18100071580';
  const deviceIds = await DeviceEnergyReading.distinct('device_id');

  const [totalBuckets, devices] = await Promise.all([
    Usage.getUsageBuckets(meterId, monthStart, now, 'day'),
    Promise.all(deviceIds.map(async deviceId => {
      const [latest, latestDaily] = await Promise.all([
        DeviceEnergyReading.findOne({ device_id: deviceId }).sort({ collected_at: -1 }).lean(),
        DeviceEnergyReading.findOne({ device_id: deviceId, reading_type: 'daily' }).sort({ collected_at: -1 }).lean()
      ]);
      let today;
      let month;
      if (latestDaily) {
        ({ today, month } = await getDeviceDailyPeriods(deviceId, todayStart, monthStart, now));
      } else {
        [today, month] = await Promise.all([
          getDevicePeriodUsage(deviceId, todayStart, now),
          getDevicePeriodUsage(deviceId, monthStart, now)
        ]);
      }
      const displayLatest = latestDaily || latest;
      return {
        device_id: deviceId,
        device_name: displayLatest?.device_name || deviceId,
        entity_id: displayLatest?.entity_id || null,
        today_kwh: today.usageKwh,
        month_kwh: month.usageKwh,
        updated_at: displayLatest?.updatedAt || displayLatest?.collected_at || null,
        coverage: {
          today_complete: today.complete,
          month_complete: month.complete
        }
      };
    }))
  ]);
  const todayKey = new Date(todayStart.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const totalTodayUsage = roundKwh(totalBuckets.find(item => item.key === todayKey)?.used_kwh || 0);
  const totalMonthUsage = roundKwh(totalBuckets.reduce((sum, item) => sum + Number(item.used_kwh || 0), 0));

  devices.sort((a, b) => b.month_kwh - a.month_kwh);
  const monitoredToday = roundKwh(devices.reduce((sum, item) => sum + item.today_kwh, 0));
  const monitoredMonth = roundKwh(devices.reduce((sum, item) => sum + item.month_kwh, 0));
  const price = Number(process.env.ELECTRICITY_PRICE_PER_KWH || 1);

  return res.json({
    success: true,
    configured: deviceIds.length > 0,
    updated_at: devices.reduce((latest, item) => {
      if (!item.updated_at) return latest;
      return !latest || new Date(item.updated_at) > new Date(latest) ? item.updated_at : latest;
    }, null),
    devices,
    totals: {
      today_kwh: totalTodayUsage,
      month_kwh: totalMonthUsage,
      monitored_today_kwh: monitoredToday,
      monitored_month_kwh: monitoredMonth,
      other_today_kwh: roundKwh(Math.max(0, totalTodayUsage - monitoredToday)),
      other_month_kwh: roundKwh(Math.max(0, totalMonthUsage - monitoredMonth)),
      monitored_month_cost: roundKwh(monitoredMonth * (Number.isFinite(price) ? price : 1))
    }
  });
}));

// 可选的受保护上报入口，便于诊断脚本补传累计读数。
router.post('/device-energy/report', requiredApiAuth, asyncHandler(async (req, res) => {
  const readings = Array.isArray(req.body.readings) ? req.body.readings : [req.body];
  if (readings.length === 0 || readings.length > 50) {
    return res.status(400).json({ error: 'readings 数量必须在 1 到 50 之间' });
  }

  const invalidIndex = readings.findIndex(reading => {
    const collectedAt = reading.collected_at ? new Date(reading.collected_at) : new Date();
    return !String(reading.device_id || '').trim()
      || !String(reading.device_name || '').trim()
      || !Number.isFinite(Number(reading.energy_kwh))
      || Number(reading.energy_kwh) < 0
      || Number.isNaN(collectedAt.getTime());
  });
  if (invalidIndex >= 0) {
    return res.status(400).json({ error: `第 ${invalidIndex + 1} 条设备电量数据无效` });
  }

  const operations = readings.map(reading => {
    const deviceId = String(reading.device_id || '').trim();
    const deviceName = String(reading.device_name || '').trim();
    const energyKwh = Number(reading.energy_kwh);
    const collectedAt = reading.collected_at ? new Date(reading.collected_at) : new Date();
    return {
      updateOne: {
        filter: { device_id: deviceId, collected_at: collectedAt },
        update: {
          $setOnInsert: {
            device_id: deviceId,
            device_name: deviceName,
            entity_id: reading.entity_id ? String(reading.entity_id) : undefined,
            energy_kwh: energyKwh,
            collected_at: collectedAt,
            source: reading.source || 'device-report'
          }
        },
        upsert: true
      }
    };
  });

  const result = await DeviceEnergyReading.bulkWrite(operations, { ordered: false });
  cache.clear();
  return res.json({ success: true, stored: result.upsertedCount, received: readings.length });
}));

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function usageStatsFromHourlyBuckets(buckets, startDate, endDate) {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  let totalUsage = 0;
  for (const bucket of buckets) {
    const hour = String(Number(bucket.hour || 0)).padStart(2, '0');
    const bucketMs = Date.parse(`${bucket.key}T${hour}:00:00+08:00`);
    if (bucketMs >= startMs && bucketMs <= endMs) totalUsage += Number(bucket.used_kwh || 0);
  }
  return { totalUsage: Math.round(totalUsage * 100) / 100 };
}

function rateFromHourlyBuckets(buckets, startDate, endDate, hourFilter = null) {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const selected = buckets.filter(bucket => {
    const hour = Number(bucket.hour || 0);
    const bucketMs = Date.parse(`${bucket.key}T${String(hour).padStart(2, '0')}:00:00+08:00`);
    return bucketMs >= startMs && bucketMs <= endMs && (!hourFilter || hourFilter(hour));
  });
  const consumption = selected.reduce((sum, item) => sum + Number(item.used_kwh || 0), 0);
  const hours = hourFilter
    ? Math.max(1, selected.length)
    : Math.max(1, (endMs - startMs) / (60 * 60 * 1000));
  return {
    rate: consumption > 0 ? consumption / hours : 0,
    dataPoints: selected.length,
    valid: consumption > 0,
    consumption,
    hours
  };
}

function calculatePredictionFromHourlyBuckets(latestUsage, buckets, currentTime) {
  if (!latestUsage || buckets.length === 0) {
    return {
      predicted_time: null,
      hours_remaining: null,
      consumption_rate: null,
      status: 'insufficient_data',
      message: '数据不足，无法预测',
      data_points: buckets.length
    };
  }
  const nowMs = currentTime.getTime();
  const shortTerm = rateFromHourlyBuckets(buckets, new Date(nowMs - 6 * 60 * 60 * 1000), currentTime);
  const mediumTerm = rateFromHourlyBuckets(buckets, new Date(nowMs - 24 * 60 * 60 * 1000), currentTime);
  const currentHour = getBeijingHour(currentTime);
  const longTerm = rateFromHourlyBuckets(
    buckets,
    new Date(nowMs - 7 * 24 * 60 * 60 * 1000),
    currentTime,
    hour => Math.min((hour - currentHour + 24) % 24, (currentHour - hour + 24) % 24) <= 2
  );
  const weights = calculateDynamicWeights(shortTerm, mediumTerm, longTerm);
  const weightedRate = weights.short * shortTerm.rate + weights.medium * mediumTerm.rate + weights.long * longTerm.rate;
  const analysis = {
    short_term: shortTerm,
    medium_term: mediumTerm,
    long_term: longTerm,
    weights,
    prediction_method: 'hourly_bucket_weighted'
  };
  if (weightedRate <= 0) {
    return {
      predicted_time: null,
      hours_remaining: null,
      consumption_rate: 0,
      status: 'no_consumption',
      message: '未检测到有效电量消耗',
      data_points: buckets.length,
      analysis
    };
  }
  const hoursRemaining = Number(latestUsage.remaining_kwh || 0) / weightedRate;
  return {
    predicted_time: new Date(nowMs + hoursRemaining * 60 * 60 * 1000),
    hours_remaining: Math.round(hoursRemaining * 10) / 10,
    consumption_rate: Math.round(weightedRate * 1000) / 1000,
    status: 'success',
    message: getAnalysisMessage(weights, shortTerm, longTerm),
    data_points: buckets.length,
    has_recharge: false,
    analysis
  };
}

function probePage(title, content) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#f6f7f9;color:#17191c;font:16px/1.65 system-ui,-apple-system,sans-serif}.card{max-width:680px;margin:8vh auto;padding:28px;background:#fff;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 14px 36px rgba(0,0,0,.07)}h1{font-size:24px;margin:0 0 14px}p{margin:12px 0}.button{display:inline-block;margin-top:10px;padding:11px 18px;border-radius:10px;background:#17191c;color:#fff;text-decoration:none}.result{padding:13px 15px;margin:12px 0;background:#f4f6f8;border-radius:12px}.muted{color:#667085;font-size:14px}code{word-break:break-all}</style></head><body><main class="card">${content}</main></body></html>`;
}

function localOnly(req, res, next) {
  const address = String(req.socket.remoteAddress || '');
  if (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1') return next();
  return res.status(403).send(probePage('仅限本机访问', '<h1>仅限本机访问</h1><p>这个敏感测试页只能通过当前电脑的 <code>127.0.0.1</code> 打开。</p>'));
}

function historyProbeForm(message = '') {
  return probePage('连接米家设备用电', `
    <h1>连接米家设备用电</h1>
    <p>这里只读取两个目标设备的云端日统计，不会控制设备；账号和密码只在本机内存中完成登录，成功后密码立即丢弃，仅将云端会话令牌加密保存，供现有 Web 定时同步。</p>
    ${message ? `<div class="result">${escapeHtml(message)}</div>` : ''}
    <form method="post" action="/api/xiaomi/history-probe/login" autocomplete="off">
      <p><label>小米账号<br><input name="username" required autocomplete="username" style="box-sizing:border-box;width:100%;padding:11px;border:1px solid #ccd1d8;border-radius:9px;font-size:16px"></label></p>
      <p><label>密码<br><input name="password" type="password" required autocomplete="current-password" style="box-sizing:border-box;width:100%;padding:11px;border:1px solid #ccd1d8;border-radius:9px;font-size:16px"></label></p>
      <button class="button" type="submit" style="border:0;font-size:16px;cursor:pointer">连接并同步</button>
    </form>
    <p class="muted">请只在这个本机页面输入密码或验证码，不要把它们发到聊天中。</p>
  `);
}

router.get('/xiaomi/history-probe', localOnly, (req, res) => {
  res.set('Cache-Control', 'no-store').send(historyProbeForm());
});

router.post('/xiaomi/history-probe/login', localOnly, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await xiaomiHistoryProbe.start(String(req.body.username || '').trim(), String(req.body.password || ''));
    if (result.status === 'complete') {
      xiaomiEnergySync.sync({ forceDays: 32 }).catch(error => logger.warn(`米家首次设备数据保存失败：${error.message}`));
    }
    return renderHistoryProbeResult(res, result);
  } catch (error) {
    return res.status(400).send(historyProbeForm(error.message));
  }
});

router.post('/xiaomi/history-probe/continue', localOnly, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await xiaomiHistoryProbe.advance(req.body.flowId, {
      captcha: String(req.body.captcha || '').trim() || undefined,
      verifyTicket: String(req.body.verifyTicket || '').trim() || undefined
    });
    if (result.status === 'complete') {
      xiaomiEnergySync.sync({ forceDays: 32 }).catch(error => logger.warn(`米家首次设备数据保存失败：${error.message}`));
    }
    return renderHistoryProbeResult(res, result);
  } catch (error) {
    return res.status(400).send(historyProbeForm(error.message));
  }
});

function renderHistoryProbeResult(res, result) {
  if (result.status === 'verification') {
    return res.status(202).send(probePage('需要完成小米账号验证', `
      <h1>需要完成账号验证</h1><p>请先打开小米验证页，选择手机或邮箱接收验证码；收到后回到这里，把验证码填入下方再继续。</p>
      <a class="button" href="${escapeHtml(result.verificationUrl)}" target="_blank" rel="noreferrer">打开小米验证页</a>
      <form method="post" action="/api/xiaomi/history-probe/continue"><input type="hidden" name="flowId" value="${escapeHtml(result.flowId)}"><p><label>短信或邮件验证码<br><input name="verifyTicket" required inputmode="numeric" autocomplete="one-time-code" style="padding:11px;border:1px solid #ccd1d8;border-radius:9px;font-size:16px"></label></p><button class="button" type="submit" style="border:0;font-size:16px;cursor:pointer">提交验证码并读取</button></form>
      <p class="muted">临时登录状态只在内存中保留 15 分钟。</p>
    `));
  }
  if (result.status === 'captcha') {
    return res.status(202).send(probePage('请输入小米验证码', `
      <h1>请输入验证码</h1><p><img src="${escapeHtml(result.captchaImage)}" alt="小米登录验证码" style="max-width:240px;border:1px solid #ddd;border-radius:8px"></p>
      <form method="post" action="/api/xiaomi/history-probe/continue"><input type="hidden" name="flowId" value="${escapeHtml(result.flowId)}"><p><input name="captcha" required autocomplete="off" style="padding:11px;border:1px solid #ccd1d8;border-radius:9px;font-size:16px"></p><button class="button" type="submit" style="border:0;font-size:16px;cursor:pointer">提交并继续</button></form>
    `));
  }
  const cards = result.readings.map(item => {
    const candidates = item.candidates.filter(candidate => Number.isFinite(candidate.kwh));
    const details = candidates.length > 0
      ? candidates.slice(0, 4).map(candidate => `<div class="muted">${escapeHtml(candidate.type)}：${escapeHtml(candidate.kwh)} kWh${candidate.time ? `，记录时间 ${escapeHtml(new Date(Number(candidate.time) * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}` : ''}</div>`).join('')
      : `<div class="muted">${escapeHtml(item.candidates.map(candidate => candidate.error).filter(Boolean).join('；') || '接口没有返回可用记录')}</div>`;
    return `<div class="result"><strong>${escapeHtml(item.label)}</strong><br>型号：<code>${escapeHtml(item.model)}</code><br>首选读数：<strong>${item.value === null ? '未读到' : `${escapeHtml(item.value)} kWh`}</strong>${details}</div>`;
  }).join('');
  const missing = result.missingModels.length ? `<p>未找到型号：<code>${result.missingModels.map(escapeHtml).join('</code>、<code>')}</code></p>` : '';
  const inventory = `<p class="muted">本次共扫描到 ${escapeHtml(result.scannedCount ?? 0)} 台设备${result.scannedModels?.length ? `；可见型号：<code>${result.scannedModels.slice(0, 30).map(escapeHtml).join('</code>、<code>')}</code>` : '，但清单中没有返回型号信息'}。</p>`;
  return res.status(result.success ? 200 : 422).send(probePage('米家用电量验证结果', `
    <h1>${result.success ? '云端历史读取已完成' : '没有读到可用历史'}</h1>${missing}${inventory}${cards || '<div class="result">没有找到两个目标设备。</div>'}
    <p>${result.stored ? '连接已经保存：密码和验证码已从内存中丢弃，加密后的云端会话及最近日用电统计已写入现有数据库，系统将在后台继续回填近 12 个月并每 15 分钟自动更新。' : '本次只完成读取，尚未保存连接。'}</p>
    <a class="button" href="/">返回电量页面</a>
  `));
}

// 全局错误处理中间件
router.use((err, req, res, next) => {
  console.error('API错误:', err);
  res.status(err.status || 500).json({ 
    error: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 新增：前端用户代理汇报抓取数据入口
router.post('/reportData', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: '缺少data参数' });
    const parsed = await crawler.parseHtml(data);
    await crawler.saveData(parsed);
    const alertResult = await batteryAlertService.processReading({
      remainingKwh: parsed.remaining_kwh,
      source: 'local-crawler',
      meterId: parsed.meter_id,
      collectedAt: parsed.collected_at || new Date(),
      ingestion: 'reportData'
    });
    res.json({ success: true, alert_status: alertResult.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API认证中间件
function apiAuth(req, res, next) {
  const token = process.env.API_TOKEN;
  if (token) {
    const provided = req.headers['x-api-token'] || req.query.token;
    if (provided !== token) {
      return res.status(401).json({ error: '未授权，请提供有效的 API Token' });
    }
  }
  next();
}

// 设备遥测入口不允许在未配置 Token 时降级为匿名写入。
function requiredApiAuth(req, res, next) {
  const token = process.env.API_TOKEN;
  if (!token) {
    return res.status(503).json({ error: '设备上报接口尚未配置 API Token' });
  }
  const authorization = String(req.headers.authorization || '');
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  const provided = req.headers['x-api-token'] || bearerToken || req.query.token;
  if (provided !== token) {
    return res.status(401).json({ error: '未授权，请提供有效的 API Token' });
  }
  next();
}

// 数据格式验证中间件
function validateReportBody(req, res, next) {
  const { meter_id, remaining_kwh, crawl_id } = req.body;
  if (!meter_id || remaining_kwh === undefined) {
    return res.status(400).json({ error: '缺少必要参数: meter_id, remaining_kwh' });
  }
  const kwh = parseFloat(remaining_kwh);
  if (isNaN(kwh) || kwh <= 0 || kwh >= 1000) {
    return res.status(400).json({ error: `remaining_kwh 超出有效范围: ${kwh}` });
  }
  if (crawl_id && typeof crawl_id !== 'string') {
    return res.status(400).json({ error: 'crawl_id 必须是字符串' });
  }
  req.validatedKwh = kwh;
  next();
}

// 手机端/iPad端数据上报（单条）
router.post('/report', apiAuth, validateReportBody, async (req, res) => {
  try {
    const { meter_id, meter_name, remaining_kwh, collected_at, crawl_id, source, format_version } = req.body;

    let collectedDate;
    try {
      collectedDate = parseCollectedAt(collected_at);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    if (crawl_id) {
      const existing = await Usage.findOne({
        meter_id: meter_id,
        collected_at: collectedDate
      });
      if (existing) {
        logger.info(`重复数据（crawl_id=${crawl_id}），返回409`);
        const alertResult = await batteryAlertService.processReading({
          remainingKwh: req.validatedKwh,
          source: source || 'api',
          meterId: meter_id,
          collectedAt: collectedDate,
          ingestion: 'mobile-api-duplicate'
        });
        return res.status(409).json({
          success: true,
          message: '数据已存在（重复）',
          duplicate: true,
          alert_status: alertResult.status
        });
      }
    }

    const usageData = {
      meter_id: meter_id || process.env.METER_ID || '18100071580',
      meter_name: meter_name || process.env.METER_NAME || '2759弄18号402阳台',
      remaining_kwh: req.validatedKwh,
      collected_at: collectedDate,
      crawl_id,
      source: source || 'api',
      format_version
    };

    const usage = new Usage(usageData);
    await usage.save();
    dataEvents.emit('reading:stored', {
      meterId: usageData.meter_id,
      collectedAt: usageData.collected_at,
      source: usageData.source
    });

    logger.info(`数据上报成功: ${usageData.remaining_kwh} kWh (source=${source || 'unknown'})`);
    const alertResult = await batteryAlertService.processReading({
      remainingKwh: usageData.remaining_kwh,
      source: usageData.source,
      meterId: usageData.meter_id,
      collectedAt: usageData.collected_at,
      ingestion: 'mobile-api'
    });
    res.json({ success: true, message: '数据已接收', alert_status: alertResult.status });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: true, message: '数据已存在（重复）', duplicate: true });
    }
    logger.error('数据上报失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 批量数据上报 - 本地爬虫/iPad爬虫批量同步历史数据
router.post('/report/batch', apiAuth, async (req, res) => {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: '缺少 records 参数或数组为空' });
    }

    if (records.length > 500) {
      return res.status(400).json({ error: '单次最多上报500条记录' });
    }

    const operations = [];
    const alertCandidates = [];
    const identities = new Set();
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        const kwh = parseFloat(record.remaining_kwh);
        if (isNaN(kwh) || kwh <= 0 || kwh >= 1000) {
          skipped++;
          continue;
        }

        const collectedDate = parseCollectedAt(record.collected_at);

        const meterId = record.meter_id || process.env.METER_ID || '18100071580';
        const identity = `${meterId}:${collectedDate.toISOString()}`;
        if (identities.has(identity)) {
          skipped++;
          continue;
        }
        identities.add(identity);
        const usageData = {
          meter_id: meterId,
          meter_name: record.meter_name || process.env.METER_NAME || '2759弄18号402阳台',
          remaining_kwh: kwh,
          collected_at: collectedDate,
          crawl_id: record.crawl_id,
          source: record.source || 'batch',
          format_version: record.format_version
        };
        operations.push({
          updateOne: {
            filter: { meter_id: meterId, collected_at: collectedDate },
            update: { $setOnInsert: usageData },
            upsert: true
          }
        });
        alertCandidates.push(usageData);
      } catch (e) {
        if (e.code === 11000) {
          skipped++;
        } else {
          errors.push({ index: i, error: e.message });
        }
      }
    }

    let saved = 0;
    if (operations.length > 0) {
      const result = await Usage.bulkWrite(operations, { ordered: false });
      saved = result.upsertedCount;
      skipped += operations.length - saved;
      if (saved > 0) {
        dataEvents.emit('reading:stored', {
          meterId: alertCandidates[0]?.meter_id,
          collectedAt: new Date(),
          source: 'batch'
        });
      }
    }

    logger.info(`批量上报: 保存 ${saved} 条, 跳过 ${skipped} 条, 错误 ${errors.length} 条`);
    let alertStatus;
    if (alertCandidates.length > 0) {
      const latest = alertCandidates.reduce((current, candidate) =>
        candidate.collected_at > current.collected_at ? candidate : current
      );
      const alertResult = await batteryAlertService.processReading({
        remainingKwh: latest.remaining_kwh,
        source: latest.source,
        meterId: latest.meter_id,
        collectedAt: latest.collected_at,
        ingestion: 'batch-api'
      });
      alertStatus = alertResult.status;
    }
    res.json({
      success: true,
      saved,
      skipped,
      alert_status: alertStatus,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    logger.error('批量上报失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ 每日报告调试端点 ============

// 获取通知服务状态
router.get('/daily-report/status', async (req, res) => {
  try {
    const status = await dailyReport.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    logger.error('获取报告状态失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 手动触发测试推送（默认模拟数据，?real=true 使用真实数据）
router.post('/daily-report/test', async (req, res) => {
  try {
    const useMock = req.query.real !== 'true';
    const result = await dailyReport.testReport(useMock);
    res.json({
      success: result.sent,
      message: result.sent ? '测试推送已发送，请查看微信' : '测试推送失败，请检查 SERVER_CHAN_KEY 配置',
      serverChanConfigured: !!process.env.SERVER_CHAN_KEY,
      reportTitle: result.report.title
    });
  } catch (err) {
    logger.error('测试报告推送失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 手动立即发送今日报告（忽略时间限制）
router.post('/daily-report/send-now', async (req, res) => {
  try {
    const sent = await dailyReport.sendDailyReport();
    res.json({
      success: sent,
      message: sent ? '今日报告已发送' : '发送失败或今日已发送过'
    });
  } catch (err) {
    logger.error('手动发送报告失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 周报、月报状态及手动触发
router.get('/summary-report/status', async (req, res) => {
  try {
    const status = await summaryReport.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    logger.error('获取周报月报状态失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/weekly-report/send-now', apiAuth, async (req, res) => {
  try {
    const result = await summaryReport.sendWeeklyReport();
    res.json({
      success: result.sent,
      status: result.status,
      message: result.sent ? '上周周报已发送' : '发送失败、已发送或正在发送'
    });
  } catch (err) {
    logger.error('手动发送周报失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/monthly-report/send-now', apiAuth, async (req, res) => {
  try {
    const result = await summaryReport.sendMonthlyReport();
    res.json({
      success: result.sent,
      status: result.status,
      message: result.sent ? '上月月报已发送' : '发送失败、已发送或正在发送'
    });
  } catch (err) {
    logger.error('手动发送月报失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/recharge-history', async (req, res) => {
  try {
    const meterId = req.query.meter_id || '18100071580';
    const limit = parseInt(req.query.limit) || 50;

    const result = await Usage.getRechargeHistory(meterId, limit);

    res.json({
      success: true,
      data: {
        total: result.total,
        totalRechargeKwh: result.totalRechargeKwh,
        records: result.records
      }
    });
  } catch (err) {
    logger.error('获取充值记录失败:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      data: { total: 0, totalRechargeKwh: 0, records: [] }
    });
  }
});

module.exports = router;

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Usage = require('../models/Usage');
const logger = require('../utils/logger');
const crawler = require('../crawler/crawler');
const { 
  getBeijingHour, 
  getBeijingTodayStart, 
  getBeijingTodayEnd,
  getBeijingWeekStart,
  getBeijingWeekEnd,
  getBeijingMonthStart,
  getBeijingMonthEnd
} = require('../utils/timezone');

// 简单的内存缓存
const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2分钟缓存

/**
 * 缓存中间件
 * @param {string} key 缓存键
 * @param {number} ttl 过期时间（毫秒）
 */
function cacheMiddleware(key, ttl = CACHE_TTL) {
  return (req, res, next) => {
    const cacheKey = `${key}_${req.url}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return res.json(cached.data);
    }
    
    // 重写res.json以缓存响应
    const originalJson = res.json;
    res.json = function(data) {
      cache.set(cacheKey, { data, timestamp: Date.now() });
      // 清理过期缓存
      if (cache.size > 100) {
        const now = Date.now();
        for (const [k, v] of cache.entries()) {
          if (now - v.timestamp > ttl) {
            cache.delete(k);
          }
        }
      }
      return originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * 错误处理包装器
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 计算电量预计用完时间（升级版多窗口预测）
 * @param {string} meterId 电表ID
 * @param {Date} currentTime 当前时间
 * @returns {Object} 预测结果
 */
async function calculateElectricityPrediction(meterId, currentTime) {
  try {
    // 获取不同时间窗口的数据
    const hours6Ago = new Date(currentTime.getTime() - 6 * 60 * 60 * 1000);
    const hours24Ago = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);
    const days7Ago = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // 获取数据
    const data7Days = await Usage.getUsageInRange(meterId, days7Ago, currentTime);
    
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
    
    // 获取当前剩余电量
    const latestData = data7Days[data7Days.length - 1];
    const currentRemaining = latestData.remaining_kwh;
    
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
    const predictedDepletionTime = new Date(currentTime.getTime() + hoursRemaining * 60 * 60 * 1000);
    
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
  
  // 筛选相同时段的数据（±2小时容差）
  const patternData = data.filter(d => {
    const hour = d.collected_at.getHours();
    return Math.abs(hour - currentHour) <= 2;
  });
  
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
    const todayStart = getBeijingTodayStart(now); // 使用北京时间计算今天开始时间
    const weekStart = getBeijingWeekStart(now); // 使用北京时间计算本周一开始时间
    const monthStart = getBeijingMonthStart(now); // 使用北京时间计算本月1号开始时间

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
    
    try {
      const [todayStats, weekStats, monthStats, latestUsage, yesterdayStats, lastWeekStats, lastMonthStats, lastWeekSameDayStats] = await Promise.all([
        Usage.calculateUsageStats('18100071580', todayStart, now),
        Usage.calculateUsageStats('18100071580', weekStart, now),
        Usage.calculateUsageStats('18100071580', monthStart, now),
        Usage.getLatestUsage('18100071580'),
        Usage.calculateUsageStats('18100071580', yesterdayStart, yesterdayEnd),
        Usage.calculateUsageStats('18100071580', lastWeekStart, lastWeekEnd),
        Usage.calculateUsageStats('18100071580', lastMonthStart, lastMonthEnd),
        Usage.calculateUsageStats('18100071580', lastWeekSameDayStart, lastWeekSameDayEnd)
      ]);

      // 检查数据覆盖范围
      const earliestData = await Usage.findOne({ meter_id: '18100071580' }).sort({ collected_at: 1 });
      const dataStartDate = earliestData ? earliestData.collected_at : null;
      
      // 判断数据是否完整
      const weekDataComplete = dataStartDate ? dataStartDate <= weekStart : false;
      const monthDataComplete = dataStartDate ? dataStartDate <= monthStart : false;

      // 计算预计用完时间
      const prediction = await calculateElectricityPrediction('18100071580', now);

      // 计算本月预计费用（智能预测）
      const monthPrediction = calculateMonthCostPrediction(monthStats, now, monthStart);
      
      // 计算对比百分比
      const todayVsYesterday = calculatePercentageChange(todayStats.totalUsage, yesterdayStats.totalUsage);
      const todayVsLastWeekSameDay = calculatePercentageChange(todayStats.totalUsage, lastWeekSameDayStats.totalUsage);
      const weekVsLastWeek = calculatePercentageChange(weekStats.totalUsage, lastWeekStats.totalUsage);
      const monthVsLastMonth = calculatePercentageChange(monthStats.totalUsage, lastMonthStats.totalUsage);
      const costVsLastMonth = calculatePercentageChange(monthPrediction.estimated_cost, lastMonthStats.totalUsage * 1);

      res.json({
        current_remaining: latestUsage ? latestUsage.remaining_kwh : 0,
        today_usage: todayStats.totalUsage,
        week_usage: weekStats.totalUsage,
        month_usage: monthStats.totalUsage,
        month_cost: monthPrediction.estimated_cost, // 智能预测的预计费用
        // 对比数据
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
        // 预计用完时间
        predicted_depletion: prediction,
        // 数据完整性信息
        data_coverage: {
          earliest_data: dataStartDate,
          week_data_complete: weekDataComplete,
          month_data_complete: monthDataComplete,
          week_actual_start: dataStartDate && dataStartDate > weekStart ? dataStartDate : weekStart,
          month_actual_start: dataStartDate && dataStartDate > monthStart ? dataStartDate : monthStart
        }
      });
    } catch (error) {
      logger.error('API错误:', error);
      res.status(500).json({
        error: '服务器内部错误',
        message: '获取数据时发生错误，请稍后重试',
        status: 'internal_error'
      });
    }
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
    const yesterdayEnd = new Date(todayStart.getTime() - 1);
    
    // 获取过去30天的数据用于计算历史平均
    const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const [todayData, yesterdayData, historicalData] = await Promise.all([
      Usage.getUsageInRange('18100071580', todayStart, now),
      Usage.getUsageInRange('18100071580', yesterdayStart, yesterdayEnd),
      Usage.getUsageInRange('18100071580', thirtyDaysAgo, yesterdayEnd)
    ]);
    
    // 按小时统计今日用电
    const hourlyUsage = new Array(24).fill(0);
    for (let i = 1; i < todayData.length; i++) {
      const prev = todayData[i - 1];
      const curr = todayData[i];
      const hour = getBeijingHour(curr.collected_at);
      const usedKwh = Math.max(0, prev.remaining_kwh - curr.remaining_kwh);
      hourlyUsage[hour] += usedKwh;
    }
    
    // 按小时统计昨日用电
    const yesterdayHourlyUsage = new Array(24).fill(0);
    for (let i = 1; i < yesterdayData.length; i++) {
      const prev = yesterdayData[i - 1];
      const curr = yesterdayData[i];
      const hour = getBeijingHour(curr.collected_at);
      const usedKwh = Math.max(0, prev.remaining_kwh - curr.remaining_kwh);
      yesterdayHourlyUsage[hour] += usedKwh;
    }
    
    // 计算历史平均（过去30天每个小时的平均用电）
    const historicalHourlyUsage = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
    
    // 按天分组历史数据
    const dailyData = {};
    for (const record of historicalData) {
      const dateStr = new Date(record.collected_at.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
      if (!dailyData[dateStr]) dailyData[dateStr] = [];
      dailyData[dateStr].push(record);
    }
    
    // 计算每天每小时的用电量
    for (const dateStr in dailyData) {
      const dayData = dailyData[dateStr].sort((a, b) => a.collected_at - b.collected_at);
      const dayHourlyUsage = new Array(24).fill(0);
      
      for (let i = 1; i < dayData.length; i++) {
        const prev = dayData[i - 1];
        const curr = dayData[i];
        const hour = getBeijingHour(curr.collected_at);
        const usedKwh = Math.max(0, prev.remaining_kwh - curr.remaining_kwh);
        dayHourlyUsage[hour] += usedKwh;
      }
      
      // 累加到历史统计
      for (let hour = 0; hour < 24; hour++) {
        if (dayHourlyUsage[hour] > 0) {
          historicalHourlyUsage[hour].total += dayHourlyUsage[hour];
          historicalHourlyUsage[hour].count++;
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
    
    res.json(result);
}));

// 获取最近30天每日用电
router.get('/trend/30d', cacheMiddleware('30d', 300000), asyncHandler(async (req, res) => {
    const now = new Date();
    // 使用北京时间计算今天结束时间，确保包含今天的数据
    const todayEnd = getBeijingTodayEnd(now);
    const startDate = new Date(todayEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const data = await Usage.getUsageInRange('18100071580', startDate, todayEnd);
    
    // 按每一天的时间范围计算用电量（确保与总览today_usage保持一致的计算方法）
    const dailyUsage = {};
    
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
    
    // 为每一天计算用电量
    Array.from(dateSet).forEach(dateStr => {
      const dayStart = getBeijingTodayStart(new Date(dateStr + 'T12:00:00Z'));
      const dayEnd = getBeijingTodayEnd(new Date(dateStr + 'T12:00:00Z'));
      
      // 获取这一天的数据
      const dayData = data.filter(d => d.collected_at >= dayStart && d.collected_at <= dayEnd);
      
      let usage = 0;
      for (let i = 1; i < dayData.length; i++) {
        const usedKwh = Math.max(0, dayData[i - 1].remaining_kwh - dayData[i].remaining_kwh);
        usage += usedKwh;
      }
      
      dailyUsage[dateStr] = usage;
    });
    
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
    
    res.json(result);
}));

// 获取最近12个月月用电
router.get('/trend/monthly', cacheMiddleware('monthly', 600000), asyncHandler(async (req, res) => {
    const endDate = new Date();
    const startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), 1);
    
    const data = await Usage.getUsageInRange('18100071580', startDate, endDate);
    
    // 按北京时间的月份分组统计
    const monthlyUsage = {};
    
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      
      // 使用北京时间计算月份
      const beijingDate = getBeijingTodayStart(curr.collected_at);
      const month = beijingDate.toISOString().substring(0, 7); // YYYY-MM
      const usedKwh = Math.max(0, prev.remaining_kwh - curr.remaining_kwh);
      
      if (!monthlyUsage[month]) {
        monthlyUsage[month] = 0;
      }
      monthlyUsage[month] += usedKwh;
    }
    
    const sortedMonths = Object.keys(monthlyUsage).sort();
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
    
    res.json(result);
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
    const limit = parseInt(req.query.limit) || 100;
    const logs = crawler.getLogs(limit);
    res.json({ success: true, logs, count: logs.length });
  } catch (error) {
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


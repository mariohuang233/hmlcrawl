const express = require('express');
const router = express.Router();
const Usage = require('../models/Usage');
const { getBeijingHour, getBeijingTodayStart, getBeijingTodayEnd } = require('../utils/timezone');

// 获取总览数据
router.get('/overview', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = getBeijingTodayStart(now); // 使用北京时间计算今天开始时间
    const todayEnd = getBeijingTodayEnd(now); // 使用北京时间计算今天结束时间
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - todayStart.getDay() + 1); // 本周一
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); // 本月1号

    const [todayStats, weekStats, monthStats, latestUsage] = await Promise.all([
      Usage.calculateUsageStats('18100071580', todayStart, now),
      Usage.calculateUsageStats('18100071580', weekStart, now),
      Usage.calculateUsageStats('18100071580', monthStart, now),
      Usage.getLatestUsage('18100071580')
    ]);

    res.json({
      current_remaining: latestUsage ? latestUsage.remaining_kwh : 0,
      today_usage: todayStats.totalUsage,
      week_usage: weekStats.totalUsage,
      month_usage: monthStats.totalUsage,
      month_cost: monthStats.totalUsage * 1 // 1元/kWh
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取过去24小时趋势
router.get('/trend/24h', async (req, res) => {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    
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
    res.status(500).json({ error: error.message });
  }
});

// 获取当天用电（按小时）
router.get('/trend/today', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = getBeijingTodayStart(now); // 使用北京时间计算今天开始时间
    
    const data = await Usage.getUsageInRange('18100071580', todayStart, now);
    
    // 按小时统计（使用本地时间）
    const hourlyUsage = new Array(24).fill(0);
    
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      // 使用北京时间获取小时
      const hour = getBeijingHour(curr.collected_at);
      const usedKwh = Math.max(0, prev.remaining_kwh - curr.remaining_kwh);
      
      hourlyUsage[hour] += usedKwh;
    }
    
    const result = hourlyUsage.map((usage, hour) => ({
      hour,
      used_kwh: Math.round(usage * 100) / 100
    }));
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取最近30天每日用电
router.get('/trend/30d', async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const data = await Usage.getUsageInRange('18100071580', startDate, endDate);
    
    // 按日期分组统计
    const dailyUsage = {};
    
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const date = curr.collected_at.toISOString().split('T')[0];
      const usedKwh = Math.max(0, prev.remaining_kwh - curr.remaining_kwh);
      
      if (!dailyUsage[date]) {
        dailyUsage[date] = 0;
      }
      dailyUsage[date] += usedKwh;
    }
    
    const result = Object.entries(dailyUsage)
      .map(([date, used_kwh]) => ({
        date,
        used_kwh: Math.round(used_kwh * 100) / 100
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取最近12个月月用电
router.get('/trend/monthly', async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), 1);
    
    const data = await Usage.getUsageInRange('18100071580', startDate, endDate);
    
    // 按月份分组统计
    const monthlyUsage = {};
    
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const month = curr.collected_at.toISOString().substring(0, 7); // YYYY-MM
      const usedKwh = Math.max(0, prev.remaining_kwh - curr.remaining_kwh);
      
      if (!monthlyUsage[month]) {
        monthlyUsage[month] = 0;
      }
      monthlyUsage[month] += usedKwh;
    }
    
    const result = Object.entries(monthlyUsage)
      .map(([month, used_kwh]) => ({
        month,
        used_kwh: Math.round(used_kwh * 100) / 100
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取最新数据
router.get('/latest', async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

module.exports = router;

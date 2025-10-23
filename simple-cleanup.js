const mongoose = require('mongoose');
require('dotenv').config();

const Usage = require('./src/models/Usage');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/electricity';

async function cleanupData() {
  try {
    console.log('开始清理数据...');
    
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB连接成功');
    
    // 北京时间今天14:40 (UTC时间是6:40)
    const cutoffTime = new Date(2025, 9, 23, 6, 40, 0); // 10月23日 6:40 UTC
    
    console.log(`删除阈值（UTC）: ${cutoffTime.toISOString()}`);
    console.log(`删除阈值（北京时间）: ${cutoffTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    
    // 查找要删除的数据
    const toDelete = await Usage.find({ 
      collected_at: { $gte: cutoffTime } 
    }).sort({ collected_at: 1 });
    
    console.log(`找到 ${toDelete.length} 条待删除数据`);
    
    if (toDelete.length > 0) {
      console.log('前5条待删除数据:');
      toDelete.slice(0, 5).forEach((data, i) => {
        console.log(`${i + 1}. ${data.collected_at.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} - ${data.remaining_kwh} kWh`);
      });
      
      // 执行删除
      const result = await Usage.deleteMany({ 
        collected_at: { $gte: cutoffTime } 
      });
      
      console.log(`✅ 成功删除 ${result.deletedCount} 条记录`);
    } else {
      console.log('没有需要删除的数据');
    }
    
    // 显示最新数据
    const latestData = await Usage.find().sort({ collected_at: -1 }).limit(5);
    console.log('最新5条数据:');
    latestData.forEach((data, i) => {
      console.log(`${i + 1}. ${data.collected_at.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} - ${data.remaining_kwh} kWh`);
    });
    
    await mongoose.connection.close();
    console.log('数据清理完成，数据库连接已关闭');
    process.exit(0);
    
  } catch (error) {
    console.error(`数据清理失败: ${error.message}`);
    process.exit(1);
  }
}

cleanupData();

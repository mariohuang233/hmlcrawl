// 清理北京时间今天14:40之后的数据
const mongoose = require('mongoose');
require('dotenv').config();

const Usage = require('./src/models/Usage');
const { logger } = require('./src/utils/logger');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/electricity';

async function cleanupData() {
  try {
    logger.info('开始清理数据...');
    
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    logger.info('MongoDB连接成功');
    
    // 北京时间今天14:40 (UTC时间是6:40)
    const now = new Date();
    const cutoffTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 40, 0);
    
    logger.info(`删除阈值（UTC）: ${cutoffTime.toISOString()}`);
    logger.info(`删除阈值（北京时间）: ${cutoffTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    
    // 查找要删除的数据
    const toDelete = await Usage.find({ 
      collected_at: { $gte: cutoffTime } 
    }).sort({ collected_at: 1 });
    
    logger.info(`找到 ${toDelete.length} 条待删除数据`);
    
    if (toDelete.length > 0) {
      logger.info('前5条待删除数据:');
      toDelete.slice(0, 5).forEach(data => {
        logger.info(`  ${data.collected_at.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} - ${data.remaining_kwh} kWh`);
      });
      
      // 执行删除
      const result = await Usage.deleteMany({ 
        collected_at: { $gte: cutoffTime } 
      });
      
      logger.info(`✅ 成功删除 ${result.deletedCount} 条记录`);
    } else {
      logger.info('没有需要删除的数据');
    }
    
    // 显示最新数据
    const latestData = await Usage.find().sort({ collected_at: -1 }).limit(5);
    logger.info('最新5条数据:');
    latestData.forEach(data => {
      logger.info(`  ${data.collected_at.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} - ${data.remaining_kwh} kWh`);
    });
    
    await mongoose.connection.close();
    logger.info('数据清理完成，数据库连接已关闭');
    process.exit(0);
    
  } catch (error) {
    logger.error(`数据清理失败: ${error.message}`);
    process.exit(1);
  }
}

cleanupData();

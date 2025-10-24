const mongoose = require('mongoose');
const Usage = require('./src/models/Usage');

async function cleanDirtyData() {
  try {
    await mongoose.connect('mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/electricity?retryWrites=true&w=majority&appName=yierbubu');
    console.log('✅ 连接到electricity数据库');
    
    // 计算北京时间昨天16:50-17:00的UTC时间
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const startTime = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 8, 50, 0); // UTC 8:50
    const endTime = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 9, 0, 0); // UTC 9:00
    
    console.log('🕐 清理时间范围:');
    console.log('  北京时间昨天16:50-17:00');
    console.log('  UTC时间范围:', startTime.toISOString(), '到', endTime.toISOString());
    
    // 查找脏数据
    const dirtyData = await Usage.find({
      collected_at: {
        $gte: startTime,
        $lte: endTime
      }
    });
    
    console.log('\\n📊 发现脏数据量:', dirtyData.length);
    
    if (dirtyData.length > 0) {
      console.log('\\n🚨 即将删除的脏数据:');
      dirtyData.forEach((item, index) => {
        const beijingTime = new Date(item.collected_at.getTime() + 8 * 60 * 60 * 1000);
        console.log(`  ${index + 1}. ${beijingTime.toISOString()} | ${item.remaining_kwh} kWh`);
      });
      
      // 删除脏数据
      const result = await Usage.deleteMany({
        collected_at: {
          $gte: startTime,
          $lte: endTime
        }
      });
      
      console.log('\\n🗑️ 删除结果:', result.deletedCount, '条记录');
      
      // 验证删除结果
      const remainingData = await Usage.find({
        collected_at: {
          $gte: startTime,
          $lte: endTime
        }
      });
      
      console.log('\\n✅ 验证结果: 剩余数据量', remainingData.length);
      
    } else {
      console.log('✅ 该时间段没有发现数据，无需清理');
    }
    
    await mongoose.disconnect();
    console.log('🎉 脏数据清理完成！');
    
  } catch (error) {
    console.error('❌ 清理失败:', error.message);
  }
}

cleanDirtyData();

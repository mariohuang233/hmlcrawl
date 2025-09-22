const mongoose = require('mongoose');
require('dotenv').config();

// 连接MongoDB
const mongoUri = process.env.MONGO_URI || 'mongodb+srv://mariohuang:<Huangjw1014>@yierbubu.aha67vc.mongodb.net/?retryWrites=true&w=majority&appName=yierbubu';

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Usage = require('./src/models/Usage');

async function cleanupData() {
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
    
    console.log(`\n🚨 发现异常数据 ${abnormalData.length} 条:`);
    abnormalData.forEach((item, index) => {
      console.log(`${index + 1}. 时间: ${item.collected_at.toISOString()}, 剩余电量: ${item.remaining_kwh}kWh`);
    });
    
    if (abnormalData.length > 0) {
      console.log('\n🗑️ 开始清理异常数据...');
      
      // 删除异常数据
      const deleteResult = await Usage.deleteMany({
        meter_id: '18100071580',
        remaining_kwh: { $gt: 1000 }
      });
      
      console.log(`✅ 已删除 ${deleteResult.deletedCount} 条异常数据`);
      
      // 显示清理后的数据统计
      const remainingData = await Usage.find({ meter_id: '18100071580' }).sort({ collected_at: -1 });
      console.log(`\n📊 清理后数据统计:`);
      console.log(`- 总数据条数: ${remainingData.length}`);
      
      if (remainingData.length > 0) {
        const latest = remainingData[0];
        const oldest = remainingData[remainingData.length - 1];
        console.log(`- 最新数据: ${latest.remaining_kwh}kWh (${latest.collected_at.toISOString()})`);
        console.log(`- 最早数据: ${oldest.remaining_kwh}kWh (${oldest.collected_at.toISOString()})`);
        
        // 显示最近5条数据
        console.log(`\n📋 最近5条数据:`);
        remainingData.slice(0, 5).forEach((item, index) => {
          console.log(`${index + 1}. ${item.collected_at.toISOString()} - ${item.remaining_kwh}kWh`);
        });
      }
    } else {
      console.log('✅ 未发现异常数据');
    }
    
  } catch (error) {
    console.error('❌ 清理过程中出现错误:', error.message);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 数据库连接已关闭');
  }
}

cleanupData();

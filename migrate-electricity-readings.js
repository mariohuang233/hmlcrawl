const mongoose = require('mongoose');

async function migrateElectricityReadings() {
  try {
    console.log('🚀 开始迁移electricityreadings数据...');
    
    // 连接到源数据库（electricity_monitor）
    await mongoose.connect('mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/electricity_monitor?retryWrites=true&w=majority&appName=yierbubu');
    console.log('✅ 连接到源数据库 electricity_monitor');
    
    const sourceDb = mongoose.connection.db;
    const sourceCollection = sourceDb.collection('electricityreadings');
    
    // 获取所有数据
    const allData = await sourceCollection.find({}).toArray();
    console.log(`📊 源数据库数据量: ${allData.length} 条`);
    
    // 连接到目标数据库（electricity）
    await mongoose.disconnect();
    await mongoose.connect('mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/electricity?retryWrites=true&w=majority&appName=yierbubu');
    console.log('✅ 连接到目标数据库 electricity');
    
    const targetDb = mongoose.connection.db;
    const targetCollection = targetDb.collection('usages');
    
    // 清空目标数据库
    await targetCollection.deleteMany({});
    console.log('🗑️ 清空目标数据库');
    
    // 转换数据格式并插入
    if (allData.length > 0) {
      const convertedData = allData.map(item => ({
        meter_id: item.meter_id || '18100071580',
        meter_name: item.meter_name || '2759弄18号402阳台',
        remaining_kwh: item.remaining_kwh || item.kwh || 0,
        collected_at: item.collected_at || item.timestamp || new Date(),
        _id: item._id
      }));
      
      await targetCollection.insertMany(convertedData);
      console.log(`✅ 成功迁移 ${convertedData.length} 条数据`);
    }
    
    // 验证迁移结果
    const count = await targetCollection.countDocuments();
    console.log(`📊 目标数据库数据量: ${count} 条`);
    
    await mongoose.disconnect();
    console.log('🎉 数据迁移完成！');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
  }
}

migrateElectricityReadings();

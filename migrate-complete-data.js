const mongoose = require('mongoose');

async function migrateCompleteData() {
  try {
    console.log('🚀 开始迁移完整数据（test数据库）...');
    
    // 连接到源数据库（test）
    await mongoose.connect('mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/test?retryWrites=true&w=majority&appName=yierbubu');
    console.log('✅ 连接到源数据库 test');
    
    const sourceDb = mongoose.connection.db;
    const sourceCollection = sourceDb.collection('usages');
    
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
    
    // 插入所有数据
    if (allData.length > 0) {
      await targetCollection.insertMany(allData);
      console.log(`✅ 成功迁移 ${allData.length} 条数据`);
    }
    
    // 验证迁移结果
    const count = await targetCollection.countDocuments();
    console.log(`📊 目标数据库数据量: ${count} 条`);
    
    // 验证9月24日到10月22日的数据
    const targetStart = new Date('2025-09-24');
    const targetEnd = new Date('2025-10-22');
    
    const targetCount = await targetCollection.countDocuments({
      collected_at: {
        $gte: targetStart,
        $lte: targetEnd
      }
    });
    console.log(`🎯 9/24-10/22数据量: ${targetCount} 条`);
    
    await mongoose.disconnect();
    console.log('🎉 完整数据迁移完成！');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
  }
}

migrateCompleteData();

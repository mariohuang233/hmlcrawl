const mongoose = require('mongoose');

async function migrateData() {
  try {
    console.log('🚀 开始数据迁移...');
    
    // 连接到源数据库（yierbubu）
    await mongoose.connect('mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/yierbubu?retryWrites=true&w=majority&appName=yierbubu');
    console.log('✅ 连接到源数据库 yierbubu');
    
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
    
    await mongoose.disconnect();
    console.log('🎉 数据迁移完成！');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
  }
}

migrateData();

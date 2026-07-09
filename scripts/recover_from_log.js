const fs = require('fs');
const mongoose = require('mongoose');
const Usage = require('../src/models/Usage');

async function main() {
    console.log('=== 从日志恢复2026年数据 ===');
    
    await mongoose.connect('mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/electricity');
    console.log('MongoDB连接成功');
    
    const logFilePath = '../logs/fetch-20260709.log';
    const content = fs.readFileSync(logFilePath, 'utf8');
    
    const lines = content.split('\n');
    const records = [];
    
    for (const line of lines) {
        const successMatch = line.match(/"action":"success".*"remaining_kwh":([0-9.]+).*"collected_at":"([^"]+)"/);
        if (successMatch) {
            records.push({
                remaining_kwh: parseFloat(successMatch[1]),
                collected_at: new Date(successMatch[2])
            });
        }
    }
    
    console.log(`从日志中提取到 ${records.length} 条记录`);
    
    let inserted = 0;
    let skipped = 0;
    
    for (const record of records) {
        const exists = await Usage.exists({ 
            collected_at: record.collected_at,
            remaining_kwh: record.remaining_kwh
        });
        
        if (!exists) {
            await Usage.create({
                meter_id: '18100071580',
                meter_name: '2759弄18号402阳台',
                remaining_kwh: record.remaining_kwh,
                collected_at: record.collected_at,
                crawl_id: `recovered_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                version: 'v1.0'
            });
            inserted++;
        } else {
            skipped++;
        }
    }
    
    console.log(`成功恢复 ${inserted} 条数据`);
    console.log(`跳过已存在 ${skipped} 条数据`);
    
    const total = await Usage.countDocuments({ collected_at: { $gte: new Date('2026-01-01') } });
    console.log(`2026年数据总量: ${total}`);
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
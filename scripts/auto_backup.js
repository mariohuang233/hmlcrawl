const mongoose = require('mongoose');
const fs = require('fs');

async function main() {
    await mongoose.connect('mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/electricity?retryWrites=true&w=majority&appName=yierbubu');
    const Usage = require('../src/models/Usage');
    
    const backupDir = '../backups';
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const data = await Usage.find({
        collected_at: { $gte: yesterday, $lt: today }
    }).sort({ collected_at: 1 });
    
    if (data.length === 0) {
        console.log('昨天没有数据需要备份');
        process.exit(0);
    }
    
    const backupFile = `${backupDir}/daily_backup_${yesterday.toISOString().split('T')[0]}.json`;
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
    
    console.log(`备份完成: ${data.length} 条记录 -> ${backupFile}`);
    
    const oldBackups = fs.readdirSync(backupDir).filter(f => f.startsWith('daily_backup_'));
    if (oldBackups.length > 7) {
        oldBackups.sort();
        const toDelete = oldBackups.slice(0, oldBackups.length - 7);
        toDelete.forEach(f => {
            fs.unlinkSync(`${backupDir}/${f}`);
            console.log(`删除旧备份: ${f}`);
        });
    }
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
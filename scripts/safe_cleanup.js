const mongoose = require('mongoose');
const fs = require('fs');

async function main() {
    await mongoose.connect('mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/electricity?retryWrites=true&w=majority&appName=yierbubu');
    const Usage = require('../src/models/Usage');
    
    const args = process.argv.slice(2);
    const startTimeStr = args[0];
    const endTimeStr = args[1];
    
    if (!startTimeStr || !endTimeStr) {
        console.error('用法: node safe_cleanup.js <开始时间> <结束时间>');
        console.error('示例: node safe_cleanup.js "2026-07-09T13:00:00" "2026-07-09T14:00:00"');
        process.exit(1);
    }
    
    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);
    
    console.log('=== 安全数据清理工具 ===');
    console.log('时间范围:', startTime.toISOString(), '~', endTime.toISOString());
    
    const candidates = await Usage.find({
        collected_at: { $gte: startTime, $lte: endTime },
        $or: [
            { remaining_kwh: { $lt: 10 } },
            { remaining_kwh: { $in: [3, 7, 27, 2.2] } }
        ]
    }).sort({ collected_at: 1 });
    
    console.log(`\n找到 ${candidates.length} 条待删除的异常数据:`);
    candidates.forEach(d => {
        console.log(`  ${d.collected_at.toISOString()} | ${d.remaining_kwh} kWh | ${d.crawl_id || 'N/A'}`);
    });
    
    if (candidates.length === 0) {
        console.log('\n没有异常数据需要删除');
        process.exit(0);
    }
    
    const backupDir = '../backups';
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupFile = `${backupDir}/backup_${Date.now()}.json`;
    fs.writeFileSync(backupFile, JSON.stringify(candidates, null, 2));
    console.log(`\n已备份到: ${backupFile}`);
    
    const { stdin, stdout } = process;
    stdout.write('\n确定要删除以上数据吗? (yes/no): ');
    
    return new Promise((resolve) => {
        stdin.once('data', async (data) => {
            const answer = data.toString().trim().toLowerCase();
            if (answer === 'yes') {
                const result = await Usage.deleteMany({
                    _id: { $in: candidates.map(c => c._id) }
                });
                console.log(`\n已删除 ${result.deletedCount} 条数据`);
            } else {
                console.log('\n已取消删除操作');
            }
            process.exit(0);
        });
    });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
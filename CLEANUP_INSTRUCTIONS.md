# 数据清理说明

## 🗑️ 清理14:40之后的数据

由于本地无法连接到MongoDB Atlas，需要在Zeabur上执行数据清理。

### 方法1：使用Zeabur Console

1. **打开Zeabur Dashboard**
   - 访问 https://zeabur.com
   - 进入你的项目
   - 选择服务

2. **打开Console（控制台）**
   - 点击服务右上角的 "Console" 或 "Terminal" 按钮
   - 进入命令行界面

3. **运行清理脚本**
   ```bash
   node cleanup-after-1440.js
   ```

4. **查看输出**
   - 脚本会显示删除了多少条数据
   - 显示最新的5条数据

### 方法2：使用API手动触发

如果Zeabur没有Console功能，可以添加一个临时API端点：

1. **临时添加清理端点**（已在server.js中）
   ```javascript
   // 临时清理端点 - 使用后应该删除
   app.post('/api/cleanup-after-1440', async (req, res) => {
     const cutoffTime = new Date(2025, 9, 23, 6, 40, 0); // UTC时间
     const result = await Usage.deleteMany({ 
       collected_at: { $gte: cutoffTime } 
     });
     res.json({ deleted: result.deletedCount });
   });
   ```

2. **触发清理**
   ```bash
   curl -X POST https://your-app.zeabur.app/api/cleanup-after-1440
   ```

### 方法3：使用MongoDB Atlas Web界面

1. **登录MongoDB Atlas**
   - 访问 https://cloud.mongodb.com
   - 登录账号

2. **进入Collections**
   - 选择 `electricity` 数据库
   - 选择 `usages` 集合

3. **使用Filter删除**
   - 点击 "Filter"
   - 输入：
     ```json
     {
       "collected_at": {
         "$gte": {"$date": "2025-10-23T06:40:00.000Z"}
       }
     }
     ```
   - 查看匹配的数据
   - 点击 "Delete" 批量删除

### 验证清理结果

检查最新数据：
```bash
curl https://your-app.zeabur.app/api/latest
```

应该看到最新数据的时间是14:40之前。

---

## ⚠️ 重要提示

1. 数据删除后**无法恢复**
2. 确认删除的时间范围正确
3. 建议先在测试环境验证

---

## 📞 需要帮助？

如果遇到问题，可以：
1. 检查Zeabur Logs
2. 查看MongoDB Atlas日志
3. 确认环境变量 MONGO_URI 正确配置

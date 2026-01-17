# 数据迁移指南：从Zeabur到Railway

## 🎯 迁移目标
将用电监控系统从Zeabur迁移到Railway，保持数据连续性。

## 📊 数据状态检查

### 当前情况
- **MongoDB**: 共享数据库，数据应该一致
- **Zeabur**: 服务不稳定，需要迁移
- **Railway**: 新部署，需要验证数据完整性

### 数据验证步骤

1. **检查数据完整性**
   ```bash
   # 检查总数据量
   node -e "require('./src/models/Usage').countDocuments().then(console.log)"
   
   # 检查时间范围
   node -e "require('./src/models/Usage').findOne().sort({collected_at:1}).then(d => console.log('最早:', d.collected_at))"
   ```

2. **验证API数据**
   ```bash
   # 检查24小时趋势
   curl http://localhost:3000/api/trend24h
   
   # 检查总览数据
   curl http://localhost:3000/api/overview
   ```

## 🚀 Railway部署优化

### 环境变量配置
在Railway Dashboard中设置：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `MONGO_URI` | `mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/electricity?retryWrites=true&w=majority&appName=yierbubu` | MongoDB连接 |
| `CRAWLER_URL` | `http://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580` | 爬虫URL |
| `NODE_ENV` | `production` | 生产环境 |

### 部署验证清单

- [ ] Railway部署成功
- [ ] 健康检查通过 (`/health`)
- [ ] MongoDB连接正常
- [ ] 爬虫自动启动
- [ ] 前端正常显示
- [ ] 历史数据完整显示
- [ ] 新数据正常采集

## 🔧 故障排除

### 常见问题

1. **数据不显示**
   - 检查API过滤逻辑
   - 验证MongoDB连接
   - 查看服务器日志

2. **爬虫不工作**
   - 检查环境变量
   - 查看爬虫日志
   - 验证目标网站可访问性

3. **前端错误**
   - 检查静态文件服务
   - 验证API端点
   - 查看浏览器控制台

## 📈 性能优化

### Railway优势
- 更稳定的服务
- 更好的日志查看
- 更快的部署速度
- 更可靠的连接

### 监控建议
- 定期检查Railway日志
- 监控MongoDB连接状态
- 验证数据采集频率
- 检查API响应时间

## 🎯 迁移完成标准

1. **数据完整性** ✅
   - 所有历史数据正常显示
   - 数据时间范围正确
   - 数据量符合预期

2. **功能正常** ✅
   - 爬虫每10分钟采集
   - 前端实时更新
   - 所有图表正常显示

3. **性能稳定** ✅
   - 无连接超时
   - 响应时间正常
   - 错误率低

---

**迁移完成后，可以安全关闭Zeabur服务！** 🚂

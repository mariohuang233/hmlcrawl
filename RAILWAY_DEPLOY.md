# Railway 部署指南

## 🚂 Railway 部署步骤

### 1. 准备工作

1. **注册Railway账号**
   - 访问 https://railway.app
   - 使用GitHub账号登录

2. **连接GitHub仓库**
   - 在Railway Dashboard点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 选择你的仓库：`mariohuang233/hmlcrawl`

### 2. 配置环境变量

在Railway项目设置中添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `MONGO_URI` | `mongodb+srv://mariohuang:Huangjw1014@yierbubu.aha67vc.mongodb.net/electricity?retryWrites=true&w=majority&appName=yierbubu` | MongoDB连接字符串 |
| `CRAWLER_URL` | `http://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580` | 爬虫目标URL |
| `NODE_ENV` | `production` | 生产环境标志 |
| `PORT` | `3000` | 服务端口（Railway会自动设置） |

### 3. 部署配置

Railway会自动检测到：
- `package.json` - Node.js项目
- `railway.json` - 部署配置
- `Dockerfile` - 容器配置（备选）

### 4. 验证部署

1. **查看部署日志**
   - 在Railway Dashboard查看 "Deployments"
   - 点击最新的部署查看日志

2. **检查服务状态**
   - 访问你的Railway域名
   - 检查 `/health` 端点

3. **验证爬虫工作**
   - 查看日志中是否有爬虫启动信息
   - 等待10分钟检查是否有新数据

### 5. 监控和维护

1. **查看日志**
   - Railway Dashboard → 你的服务 → Logs
   - 实时查看爬虫和API日志

2. **重启服务**
   - 如果需要重启，在Dashboard点击 "Restart"

3. **环境变量更新**
   - 在Settings → Variables中修改
   - 修改后会自动重新部署

## 🔧 故障排除

### 常见问题

1. **爬虫不工作**
   - 检查 `CRAWLER_URL` 环境变量
   - 查看日志中的错误信息
   - 确认MongoDB连接正常

2. **数据不更新**
   - 检查MongoDB连接字符串
   - 查看爬虫日志
   - 确认定时任务已启动

3. **前端不显示**
   - 检查静态文件服务
   - 确认前端构建成功
   - 查看API端点响应

### 日志关键词

成功的日志应该包含：
```
[INFO] 服务器已启动在端口 3000
[INFO] MongoDB连接成功
[INFO] 爬虫定时任务已启动，每10分钟执行一次
[INFO] 数据爬取并保存成功
```

## 📊 Railway vs Zeabur 对比

| 特性 | Railway | Zeabur |
|------|---------|--------|
| **稳定性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **部署速度** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **日志查看** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **环境变量** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **免费额度** | 500小时/月 | 无限制 |
| **自定义域名** | ✅ | ✅ |
| **自动HTTPS** | ✅ | ✅ |

## 🎯 推荐配置

1. **使用Railway作为主部署**
2. **保留Zeabur作为备份**
3. **定期检查两个平台的运行状态**

## 📞 需要帮助？

如果遇到问题：
1. 查看Railway Dashboard的日志
2. 检查环境变量配置
3. 确认GitHub仓库代码是最新的

---

**Railway通常比Zeabur更稳定，建议优先使用！** 🚂

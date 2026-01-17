# Zeabur 部署指南

## 🚀 快速部署

### 1. 环境变量配置

在Zeabur控制台中配置以下环境变量：

```bash
# 必需配置
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/electricity?retryWrites=true&w=majority
PORT=3000
NODE_ENV=production

# 可选配置
TZ=Asia/Shanghai
```

### 2. 服务配置

Zeabur会自动检测以下配置文件：

- `zbpack.json` - Zeabur构建配置
- `package.json` - Node.js项目配置

### 3. 构建流程

Zeabur会按以下顺序执行：

1. **安装依赖**: `npm ci --prefer-offline --no-audit`
2. **构建前端**: `npm run build`
3. **启动服务**: `npm start`

### 4. 健康检查

服务提供健康检查端点：

```
GET /health
```

返回示例：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "mongodb": "connected"
}
```

## 🔧 故障排查

### 问题1: Pod启动失败 (NotTriggerScaleUp)

**原因**: 服务未正确监听或端口配置问题

**✅ 已修复**:
- 服务器现在监听 `0.0.0.0` 而非 `localhost`（容器环境必需）
- 添加了详细的启动日志
- 健康检查端点已配置

**解决方案**:
1. **确认环境变量**:
   ```bash
   PORT=3000
   NODE_ENV=production
   MONGO_URI=mongodb+srv://...
   ```

2. **检查部署日志**:
   - Zeabur控制台 → Deployments → 查看最新日志
   - 应该看到："服务器已启动在端口 3000"

3. **测试健康检查**:
   ```bash
   curl https://your-app.zeabur.app/health
   ```
   应返回：`{"status":"ok",...}`

4. **访问触发启动**:
   - 首次访问域名时容器才会启动
   - 等待10-30秒让容器完全启动
   - 刷新页面确认服务可用

### 问题2: MongoDB连接失败

**原因**: 连接字符串错误或网络问题

**解决方案**:
1. 使用MongoDB Atlas等云数据库
2. 确保MongoDB允许Zeabur的IP访问（0.0.0.0/0）
3. 检查MONGO_URI格式：`mongodb+srv://user:pass@host/db`
4. 服务会继续运行，但数据功能不可用

### 问题3: 前端构建超时

**原因**: 前端依赖安装时间过长

**解决方案**:
1. 已优化：使用 `npm ci` 替代 `npm install`
2. 添加 `--prefer-offline` 参数减少网络请求
3. 添加 `--no-audit` 跳过安全审计

### 问题4: 服务无法访问

**原因**: 端口配置错误

**解决方案**:
1. 确保PORT环境变量设置为3000（或Zeabur分配的端口）
2. 检查健康检查端点: `https://your-app.zeabur.app/health`
3. 查看服务日志确认启动成功

## 📋 部署检查清单

- [ ] MongoDB连接字符串已配置
- [ ] 环境变量PORT已设置
- [ ] 前端已成功构建
- [ ] 健康检查端点返回正常
- [ ] 可以访问主页面
- [ ] API接口正常工作

## 🎯 最佳实践

### 1. 数据库配置
- 使用MongoDB Atlas云数据库
- 设置IP白名单为 `0.0.0.0/0`
- 使用强密码
- 启用副本集

### 2. 环境变量
```bash
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/electricity
PORT=3000
NODE_ENV=production
TZ=Asia/Shanghai
```

### 3. 监控和日志
- 定期检查 `/health` 端点
- 查看Zeabur控制台日志
- 监控MongoDB连接状态
- 设置告警通知

### 4. 性能优化
- 启用MongoDB连接池
- 使用内存缓存减少查询
- 前端资源CDN加速
- 启用Gzip压缩

## 🔄 更新部署

每次推送到GitHub main分支，Zeabur会自动：

1. 拉取最新代码
2. 重新构建
3. 滚动更新服务

## 📞 支持

如果遇到问题：

1. 查看Zeabur控制台日志
2. 检查 `/health` 端点状态
3. 验证环境变量配置
4. 确认MongoDB连接正常

## 🌟 优化建议

1. **使用CDN**: 为静态资源配置CDN
2. **启用HTTPS**: Zeabur自动提供SSL证书
3. **设置域名**: 绑定自定义域名
4. **监控告警**: 配置性能监控和告警
5. **备份数据**: 定期备份MongoDB数据


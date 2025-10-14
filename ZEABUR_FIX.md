# Zeabur NotTriggerScaleUp 彻底解决方案

## 🎯 问题根源

`NotTriggerScaleUp` 错误表示Zeabur的自动伸缩系统无法识别或启动你的服务。

### 核心原因分析

1. **端口识别问题** ❌
   - 服务监听 `localhost` 而非 `0.0.0.0`
   - 未明确暴露端口号

2. **健康检查失败** ❌
   - 探针无法访问健康检查端点
   - 启动时间过长导致超时

3. **容器配置不完整** ❌
   - 缺少Dockerfile明确配置
   - 启动命令不清晰

## ✅ 已实施的完整解决方案

### 1. 服务器配置优化

```javascript
// server.js - 关键修改

// ✅ 监听所有网络接口（容器环境必需）
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`服务器已启动在端口 ${PORT}`);
  logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
});

// ✅ 多个健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', ... });
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});
```

### 2. Dockerfile配置（核心）

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 构建前端
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY . .
RUN npm run build

# ✅ 明确暴露端口（让Zeabur识别）
EXPOSE 3000

# ✅ 健康检查配置
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', ...)"

# ✅ 启动命令
CMD ["node", "server.js"]
```

### 3. Zeabur配置文件

```json
// zbpack.json
{
  "dockerfile": "Dockerfile",
  "port": 3000,
  "health_check": {
    "path": "/health",
    "interval": 30,
    "timeout": 10
  }
}
```

## 🚀 Zeabur部署配置

### 必需的环境变量

```bash
PORT=3000
NODE_ENV=production
MONGO_URI=mongodb+srv://username:password@host/electricity
```

### 可选配置

```bash
TZ=Asia/Shanghai
LOG_LEVEL=info
```

### 关闭自动休眠（推荐）

如果需要7×24小时运行：

1. Zeabur控制台 → 项目 → Settings
2. 找到 "Auto Sleep" 或 "On-demand Scaling"
3. **关闭（Disable）**此选项

这样Pod会持续运行，不会被自动休眠。

## 📋 部署验证清单

### 步骤1: 检查构建日志

```
Zeabur控制台 → Deployments → 查看最新部署
```

✅ 应该看到：
- "Successfully built"
- "Successfully tagged"
- "Pushing to registry"

### 步骤2: 检查运行日志

✅ 应该看到：
```
服务器已启动在端口 3000
健康检查端点: http://localhost:3000/health
环境: production
```

### 步骤3: 测试健康检查

```bash
# 测试健康检查端点
curl https://your-app.zeabur.app/health

# 预期响应
{
  "status": "ok",
  "timestamp": "2024-...",
  "uptime": 123.456,
  "mongodb": "connected"
}

# 测试ping端点
curl https://your-app.zeabur.app/ping
# 预期响应: pong
```

### 步骤4: 访问应用

```
https://your-app.zeabur.app
```

- 首次访问等待10-30秒（容器冷启动）
- 看到电量监控界面即成功

## 🔧 故障排查

### 问题A: 仍然显示NotTriggerScaleUp

**解决方案**：

1. **检查Dockerfile是否被识别**
   ```bash
   # 查看构建日志是否有 "Building with Dockerfile"
   ```

2. **手动重新部署**
   - Zeabur控制台 → Redeploy
   - 确保使用最新代码

3. **验证端口配置**
   - 环境变量 `PORT=3000` 已设置
   - zbpack.json 中 `"port": 3000` 已配置

### 问题B: 容器启动后立即退出

**检查日志中是否有**：
```
Error: Cannot find module ...
MONGO_URI is undefined
EADDRINUSE: address already in use
```

**解决方案**：
- 确保所有依赖已安装
- 检查MONGO_URI环境变量
- 确认端口未被占用

### 问题C: 健康检查失败

**测试本地健康检查**：
```bash
npm run diagnose
```

**确认**：
- `/health` 端点返回200状态
- `/ping` 端点返回 "pong"
- 启动时间 < 40秒

## 🎯 关键配置对比

| 配置项 | ❌ 错误 | ✅ 正确 |
|--------|---------|---------|
| 监听地址 | `localhost` | `0.0.0.0` |
| 端口暴露 | 无EXPOSE | `EXPOSE 3000` |
| 健康检查 | 无配置 | `/health` + `/ping` |
| 启动命令 | 不明确 | `CMD ["node", "server.js"]` |
| 容器配置 | 无Dockerfile | 完整Dockerfile |

## 💡 最佳实践建议

### 1. 使用Dockerfile部署
- ✅ 明确的构建步骤
- ✅ 端口和健康检查配置
- ✅ 环境变量默认值

### 2. 配置多个健康检查端点
```javascript
app.get('/health', ...)  // 详细状态
app.get('/ping', ...)    // 简单探针
app.get('/ready', ...)   // 就绪检查（可选）
```

### 3. 优化启动时间
- 异步连接MongoDB（不阻塞启动）
- 设置合理的启动超时（40秒）
- 使用健康检查的 `start-period` 参数

### 4. 监控和日志
```javascript
logger.info('服务器已启动');
logger.info('健康检查端点可用');
logger.info(`环境: ${process.env.NODE_ENV}`);
```

## 📊 成功标志

部署成功后，你应该看到：

1. ✅ Zeabur显示 "Running" 状态
2. ✅ 日志中有 "服务器已启动" 消息
3. ✅ `/health` 返回 `{"status":"ok"}`
4. ✅ 域名可以正常访问
5. ✅ 没有 NotTriggerScaleUp 错误

## 🆘 仍然失败？

如果以上方案都尝试后仍然失败，请提供：

1. **Zeabur构建日志**（最后50行）
2. **Zeabur运行日志**（最后50行）
3. **环境变量截图**（隐藏敏感信息）

可以直接在Zeabur社区或GitHub Issue中寻求帮助。

---

## 📝 更新日志

- **2024-10-14**: 添加Dockerfile和完整健康检查配置
- **2024-10-14**: 修复监听地址为 0.0.0.0
- **2024-10-14**: 添加 /ping 端点用于简单探针
- **2024-10-14**: 优化zbpack.json配置


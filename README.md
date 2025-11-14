# 家庭用电监控与可视化系统

一个基于Node.js + React的家庭用电监控系统，支持自动数据采集、存储和可视化展示。

## 功能特性

- 🔄 **自动采集**: 每10分钟自动从电力网站抓取电表数据
- 📊 **数据存储**: 使用MongoDB存储历史用电数据，支持索引优化
- 📈 **可视化**: React前端展示用电趋势和统计图表
- 🎯 **智能预测**: 多窗口算法预测电量耗尽时间（短期/中期/长期分析）
- 📉 **对比分析**: 支持今日vs昨日、本周vs上周、本月vs上月对比
- ⚡ **性能优化**: 内存缓存机制，减少数据库查询
- 🚀 **一键部署**: 支持Railway和Zeabur平台部署
- 📱 **响应式**: 支持移动端和桌面端访问，适配暗夜模式
- 🛡️ **健壮性**: 完善的错误处理和边界检查

## 技术栈

### 后端
- Node.js + Express
- MongoDB + Mongoose
- 定时任务 (node-cron)
- 网页爬虫 (axios + cheerio)
- 日志系统 (winston)

### 前端
- React + TypeScript
- ECharts 图表库
- TailwindCSS 样式框架
- Axios HTTP客户端

## 项目结构

```
├── src/
│   ├── crawler/          # 爬虫模块
│   ├── api/             # API接口
│   ├── models/          # 数据模型
│   └── utils/           # 工具函数
├── frontend/            # React前端
├── logs/               # 日志文件
├── server.js           # 服务器入口
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd frontend && npm install
```

### 2. 环境配置

复制环境变量模板：
```bash
cp env.example .env
```

编辑 `.env` 文件，配置MongoDB连接字符串：
```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database
PORT=3000
```

### 3. 构建前端

```bash
cd frontend && npm run build
```

### 4. 启动服务

```bash
npm start
```

访问 http://localhost:3000 查看应用。

## 部署指南

### Railway 部署

1. 连接GitHub仓库到Railway
2. 配置环境变量：
   - `MONGO_URI`: MongoDB连接字符串
   - `PORT`: 端口号（Railway会自动分配）
3. 部署完成后，Railway会自动启动服务

#### 本地爬虫 + Railway 服务

如果你希望在本地电脑进行爬取，并把数据写入同一个 MongoDB，同时把 Web/API 部署到 Railway，请按以下步骤：

- 在 Railway 环境变量中设置：`ENABLE_CRAWLER=false`，让线上实例不自动启动爬虫。
- 在本地创建 `.env.local`（或直接使用系统环境变量）并配置：
  - `MONGO_URI` 指向与 Railway 相同的数据库
  - 可选：`USE_DIRECT_IP=true`（建议直连，不走 localtunnel）
  - 可选：`PROXY_URL=http://localhost:3000`（如使用本地代理）
- 本地启动爬虫：
  ```bash
  npm run crawler:local
  ```
- 验证数据：访问 Railway 的 `/api/latest`，应能看到数据随着本地爬虫周期性更新。

### Zeabur 部署

项目已包含完整的Zeabur配置文件：

1. **连接GitHub仓库**到Zeabur
2. **配置环境变量**：
   ```bash
   PORT=3000
   NODE_ENV=production
   MONGO_URI=mongodb+srv://username:password@host/electricity
   ```
3. **Zeabur会自动识别**：
   - ✅ Dockerfile进行容器化构建
   - ✅ 端口3000自动暴露
   - ✅ 健康检查 `/health` 端点
4. **可选：关闭自动休眠**
   - Settings → Auto Sleep → Disable
   - 适合需要7×24小时运行的服务

详细故障排查请查看 [ZEABUR_FIX.md](./ZEABUR_FIX.md)

## API接口

### 总览数据
```
GET /api/overview
```
返回当前剩余电量、今日/本周/本月用电、费用预估、智能预测、对比数据等

### 24小时趋势
```
GET /api/trend/24h
```
返回过去24小时的用电趋势

### 当天用电（按小时）
```
GET /api/trend/today
```
返回今日每小时用电量，包含与昨日同时段对比

### 30天趋势
```
GET /api/trend/30d
```
返回最近30天每日用电量，包含与前一天对比

### 月度趋势
```
GET /api/trend/monthly
```
返回最近12个月的用电量，包含与上月对比

### 最新数据
```
GET /api/latest
```
获取最新采集的电表数据

### 手动触发爬取
```
POST /api/crawl
```
手动触发一次数据采集

## 核心算法

### 智能预测算法
采用多窗口分析法预测电量耗尽时间：
- **短期窗口（6小时）**: 捕捉最新用电趋势，权重50%
- **中期窗口（24小时）**: 分析日常用电规律，权重30%
- **长期窗口（7天同时段）**: 考虑周期性用电模式，权重20%

动态权重调整：
- 短期用电量激增时，自动增加短期权重
- 检测充值行为，自动过滤异常数据点

### 性能优化
- **数据库索引**: 复合索引优化查询性能
- **内存缓存**: 2-10分钟缓存，减少重复查询
- **并行查询**: Promise.all并行执行多个统计查询
- **懒加载**: 图表组件采用懒更新策略

## 数据模型

### Usage 集合
```javascript
{
  meter_id: String,        // 电表ID
  meter_name: String,      // 电表名称
  remaining_kwh: Number,    // 剩余电量(kWh)
  collected_at: Date       // 采集时间
}
```

## 爬虫配置

系统会自动从指定URL抓取电表数据。如需修改爬取目标，请编辑 `src/crawler/crawler.js` 文件中的URL和解析逻辑。

## 日志系统

- 应用日志: `logs/app.log`
- 错误日志: `logs/error.log`
- 爬虫日志: `logs/fetch-YYYYMMDD.log`

## 开发说明

### 本地开发

```bash
# 启动后端（开发模式）
npm run dev

# 启动前端（开发模式）
cd frontend && npm start
```

### 测试爬虫

```bash
# 手动触发爬取
curl -X POST http://localhost:3000/api/crawl
```

## 故障排除

1. **MongoDB连接失败**: 检查连接字符串和网络访问权限
2. **爬虫失败**: 检查目标网站是否可访问，可能需要调整User-Agent
3. **前端构建失败**: 确保Node.js版本 >= 18.0.0

## 许可证

MIT License

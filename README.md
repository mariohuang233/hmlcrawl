# 家庭用电监控与可视化系统

一个基于Node.js + React的家庭用电监控系统，支持自动数据采集、存储和可视化展示。

## 功能特性

- 🔄 **自动采集**: 每10分钟自动从电力网站抓取电表数据
- 📊 **数据存储**: 使用MongoDB存储历史用电数据
- 📈 **可视化**: React前端展示用电趋势和统计图表
- 🚀 **一键部署**: 支持Railway和Zeabur平台部署
- 📱 **响应式**: 支持移动端和桌面端访问

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

### Zeabur 部署

1. 连接GitHub仓库到Zeabur
2. 配置环境变量：
   - `MONGO_URI`: MongoDB连接字符串
3. 选择Node.js环境，Zeabur会自动构建和部署

## API接口

### 总览数据
```
GET /api/overview
```

### 24小时趋势
```
GET /api/trend/24h
```

### 当天用电
```
GET /api/trend/today
```

### 30天趋势
```
GET /api/trend/30d
```

### 月度趋势
```
GET /api/trend/monthly
```

### 手动触发爬取
```
POST /api/crawl
```

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

# 家庭用电监控系统

这是一个用于采集、存储和展示家庭电表数据的全栈项目。后端基于 Node.js、Express 与 MongoDB，前端基于 React、TypeScript、Vite 和 ECharts；系统包含定时采集、用电趋势、充值记录、电量告警以及日/周/月报告通知。

## 项目结构

```text
.
├── api/                    # Vercel Serverless 入口与定时任务
├── docs/                   # 移动端爬虫使用文档
├── frontend/               # React 前端
│   ├── public/             # 站点图标等静态资源
│   └── src/                # 页面、组件、Hooks 与前端工具
├── scripts/                # 本地/移动端爬虫、看门狗及恢复工具
├── src/
│   ├── api/                # Express API 路由
│   ├── crawler/            # 数据采集逻辑
│   ├── models/             # Mongoose 数据模型
│   ├── services/           # 告警与报告服务
│   └── utils/              # 日志、代理、时区与上传队列
├── server.js               # Web 服务主入口
├── package.json            # 后端依赖与命令
└── frontend/package.json   # 前端依赖与命令
```

## 本地运行

项目要求 Node.js 24 或更高版本，以及可访问的 MongoDB 实例。

```bash
npm ci
cd frontend
npm ci
npm run build
cd ..
```

复制 `.env.local.template` 为 `.env.local`，至少填写 `MONGO_URI`、`METER_ID` 和 `METER_NAME`，然后启动服务：

```bash
npm start
```

默认访问地址为 `http://localhost:3000`，健康检查为 `GET /health`。本地开发前端时，在 `frontend` 目录运行 `npm run dev`，Vite 会把 `/api` 请求代理到 `http://localhost:3000`。

## 常用命令

```bash
npm start                 # 启动后端和生产前端
npm run dev               # 使用 nodemon 启动后端
npm test                  # 运行后端与前端测试
npm run crawler:local     # 仅运行本地爬虫
npm run oneclick          # 启动本地一键采集流程
npm run pm2:start         # 使用 PM2 启动服务

cd frontend
npm test                  # 运行前端测试
npm run build             # 类型检查并构建前端
```

Windows 开机启动和日志脚本说明见 [SCRIPTS_README.md](./SCRIPTS_README.md)，iPad 采集说明见 [docs/IPAD_CRAWLER_GUIDE.md](./docs/IPAD_CRAWLER_GUIDE.md)。

## 主要接口

仪表盘使用的读取接口包括 `/api/overview`、`/api/latest`、`/api/trend/24h`、`/api/trend/today`、`/api/trend/30d`、`/api/trend/monthly` 和 `/api/recharge-history`；采集与运维接口包括 `/api/crawl`、`/api/crawler/trigger`、`/api/crawler/status`、`/api/report` 与 `/api/report/batch`。

若设置了 `API_TOKEN`，移动端上报接口需要通过 `Authorization: Bearer <token>` 或 `X-API-Token` 提交认证信息。不要把 `.env.local`、数据库连接字符串、通知密钥或 API Token 提交到 Git。

## 布布用电助手

助手入口位于看板右下角，支持昨日摘要、今日用电、周期统计、同期对比、用电预测、时段解释和节电建议；桌面端使用浮层面板，移动端使用底部抽屉。`GET /api/assistant/briefing` 返回主动提醒和快捷问题，`POST /api/assistant/chat` 接收 `{ "message": "今天用了多少？" }` 并返回结构化答案、图表数据、统计范围和更新时间。

助手采用三层分流：非用电问题直接拦截，余额、用量、费用、峰值与预测等事实问题由后端确定性计算，原因、规律、比较、总结与建议类问题才调用模型分析。部署环境可配置 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 和可选的 `AI_FALLBACK_MODEL`；服务端按 OpenAI Chat Completions 兼容格式调用模型，密钥不会下发到浏览器。模型失败、超时或返回不完整内容时会自动切换备用模型，再降级到同口径的确定性数据分析。

## 部署

仓库保留了仍可使用的正式部署入口：`railway.json` 与 `nixpacks.toml` 用于 Railway，`render.yaml` 用于 Render，`zeabur.json`、`zbpack.json` 与 `Dockerfile` 用于 Zeabur/容器部署，`vercel.json` 与 `api/` 用于 Vercel。所有平台都需要配置 `MONGO_URI`，生产环境还应按实际需要配置 `METER_ID`、`METER_NAME`、`ENABLE_CRAWLER`、`API_TOKEN` 和通知相关变量。

## 验证

提交前至少运行：

```bash
cd frontend
npm test
npm run build
```

后端启动后可通过 `/health`、`/api/latest` 和 `/api/crawler/status` 验证数据库、数据读取与爬虫状态。

👌 明白啦～既然你决定继续用 Mongo，那我帮你写一个更 **细致、落地** 的 PRD，能直接交给 Cursor 开发，部署时少踩坑。

---

# PRD：家庭用电监控与可视化系统

## 一、项目目标

* **采集**：每 10 分钟自动从电力网页抓取家庭电表数据。
* **存储**：存入 MongoDB，支持历史数据。
* **计算**：提供用电统计（今日、本周、本月）和费用估算。
* **接口**：对外统一 API，前端直接消费。
* **展示**：React 前端展示总览和趋势图表。
* **部署**：主部署在 **Railway**，备用 **Zeabur**，配置保持一致。

---

## 二、功能需求

### 1. 数据采集

* **周期**：每 10 分钟（cron 表达式：`*/10 * * * *`）。
* **采集字段**：

  * `meter_id` (string)
  * `meter_name` (string)
  * `remaining_kwh` (float，单位 kWh)
  * `collected_at` (ISO 时间戳)
* **逻辑**：

  * 每次采集 **新增一条**，不覆盖。
  * 当采集失败时：

    * 自动重试 3 次。
    * 错误写入 `logs/fetch-YYYYMMDD.log`。

---

### 2. 数据存储

* **数据库**：MongoDB（链接：mongodb+srv://mariohuang:<Huangjw1014>@yierbubu.aha67vc.mongodb.net/?retryWrites=true&w=majority&appName=yierbubu)
* **集合**：`usages`
* **数据结构**：

  ```json
  {
    "meter_id": "18100071580",
    "meter_name": "2759弄18号402阳台",
    "remaining_kwh": 9.84,
    "collected_at": "2025-09-18T10:10:00Z"
  }
  ```

---

### 3. 数据处理

* **单小时用电量**：
  `diff = 上一条.remaining_kwh - 当前.remaining_kwh`

  * 若 `diff < 0` → 判定为充值，按 0 处理。
* **统计项**：

  * 今日用电量：当天 00:00 至当前。
  * 本周用电量：周一 00:00 至当前。
  * 本月用电量：当月 1 号 00:00 至当前。
  * 本月预计费用 = 本月用电量 × 1 元/kWh。

---

### 4. API 接口

#### (1) 总览

`GET /api/overview`
返回：

```json
{
  "today_usage": 3.2,
  "week_usage": 21.4,
  "month_usage": 85.6,
  "month_cost": 85.6
}
```

#### (2) 过去 24 小时趋势

`GET /api/trend/24h`
返回：

```json
[
  {"time": "2025-09-18T01:00:00Z", "used_kwh": 0.5, "remaining_kwh": 9.3},
  {"time": "2025-09-18T02:00:00Z", "used_kwh": 0.4, "remaining_kwh": 8.9}
]
```

#### (3) 当天用电（按小时）

`GET /api/trend/today`
返回：

```json
[
  {"hour": 0, "used_kwh": 0.2},
  {"hour": 1, "used_kwh": 0.5}
]
```

#### (4) 最近 30 天每日用电

`GET /api/trend/30d`
返回：

```json
[
  {"date": "2025-09-01", "used_kwh": 2.1},
  {"date": "2025-09-02", "used_kwh": 3.4}
]
```

#### (5) 最近 12 个月月用电

`GET /api/trend/monthly`
返回：

```json
[
  {"month": "2025-07", "used_kwh": 102.4},
  {"month": "2025-08", "used_kwh": 98.7}
]
```

---

### 5. 前端页面

* **技术栈**：React + ECharts + TailwindCSS。
* **页面**：
 都放在同一个页面中
  1. **总览模块**：当前剩余电量、今日、本周、本月用电 + 本月预计费用。
  2. **用电趋势模块**：过去 24 小时（折线 + 柱状）。
  3. **当天用电模块**：0–24 点逐小时统计。
  4. **每日趋势模块**：最近 30 天。
  5. **每月趋势模块**：最近 12 个月。
* **自适应**：支持移动端 & 桌面端。
* **部署方式**：前端打包后放到 Express `public/` 目录下。

---

### 6. 部署与配置

* **统一代码仓库**（一个 Node.js 项目）：

  ```
  /src
    /crawler    # 爬虫任务
    /api        # API
    /frontend   # React 前端
  /logs
  server.js
  ```
* **环境变量**：

  * `MONGO_URI`
  * `PORT`
* **部署流程**：

  * Railway（主环境）：支持定时任务和 Mongo 插件。
  * Zeabur（备用）：同 repo，一键部署。
* **自动化**：可选 GitHub Actions（推送后自动部署两边）。

---

## 三、非功能需求

* **性能**：

  * 支持 50k+ 条数据（约 1 年）。
  * 查询响应 < 1s。
* **安全**：

  * 敏感配置放环境变量，不写死在代码。
* **扩展性**：

  * 未来支持多个电表（`meter_id` 区分）。
* **容错**：

  * 爬虫失败不影响 API 服务。
  * 日志归档保存。

---

👉 这个版本的 PRD 已经能直接交给 Cursor 生成骨架代码，然后你只需要 **补 parser 部分（解析网页 HTML 拿到电量数字）**。

要不要我帮你把 **Mongo 的 Schema + API 查询逻辑的代码** 也写成最小可运行版，你直接复制进去就能跑？

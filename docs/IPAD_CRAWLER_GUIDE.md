# iPad 端爬虫运行指南

## 概述

本指南详细说明如何在 iPad 上运行本地爬虫，实现电量数据的采集与上传。iPad 端爬虫作为备用方案，当电脑端爬虫不可用时自动接管，确保数据采集的连续性。

---

## 前置条件

1. **iPad 设备**：运行 iOS 15 或更高版本
2. **网络环境**：确保 iPad 与爬虫目标网站网络连通
3. **越狱**：非必须，但推荐使用 iSH 或 Termius 等终端工具

---

## 方案一：使用 iSH（推荐）

iSH 是一款在 iOS 上运行的 Alpine Linux 模拟器，无需越狱即可使用。

### 步骤 1：安装 iSH

1. 在 App Store 搜索并下载 **iSH Shell**
2. 打开 iSH，等待初始化完成

### 步骤 2：安装依赖

```bash
apk update
apk add python3 curl git
```

### 步骤 3：克隆项目

```bash
git clone https://github.com/mariohuang233/hmlcrawl.git
cd hmlcrawl
```

### 步骤 4：配置后端地址（可选）

如果需要将数据上传到云端后端，编辑 `scripts/mobile_crawler.py`：

```python
BACKEND_URLS = [
    "https://your-railway-project.up.railway.app/api/report",
    "https://your-zeabur-project.zeabur.app/api/report",
]
```

> **注意**：如果不配置后端地址，数据将仅保存在本地。

### 步骤 5：运行爬虫

```bash
# 单次运行（测试）
python3 scripts/mobile_crawler.py

# 后台守护模式（推荐，异常后自动重启）
python3 scripts/mobile_crawler.py --daemon
```

### 步骤 6：保持运行

在 iSH 中，爬虫会持续运行。如需后台保持：
- 按 Home 键退出 iSH（iOS 会自动挂起）
- 如需后台持续运行，建议配合 **Alpine Linux 的 `screen` 或 `tmux`**

---

## 方案二：使用 Termius（SSH 连接）

如果已有 Linux 服务器，可以通过 Termius 远程连接运行。

### 步骤 1：安装 Termius

1. 在 App Store 搜索并下载 **Termius**
2. 配置 SSH 连接到服务器

### 步骤 2：在服务器上部署

```bash
# 登录服务器后执行
apt update && apt install python3 git
git clone https://github.com/mariohuang233/hmlcrawl.git
cd hmlcrawl
python3 scripts/mobile_crawler.py --daemon
```

---

## 方案三：使用 Pythonista（代码编辑器）

Pythonista 是一款强大的 iOS Python 编辑器。

### 步骤 1：安装 Pythonista

1. 在 App Store 搜索并下载 **Pythonista 3**

### 步骤 2：创建爬虫脚本

将 `scripts/mobile_crawler.py` 的核心代码复制到 Pythonista 中运行。

---

## 配置说明

### 关键配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `METER_ID` | 18100071580 | 电表编号 |
| `METER_NAME` | 2759弄18号402阳台 | 电表名称 |
| `FETCH_INTERVAL` | 900秒（15分钟） | 爬取间隔 |
| `MAX_RETRIES` | 3 | 单次爬取最大重试次数 |
| `BACKEND_URLS` | [] | 后端上传地址列表 |

### 数据存储

- 数据保存在 `mobile_data/` 目录下
- 文件命名格式：`data_YYYYMMDD.jsonl`
- 每条记录为 JSON 格式，包含完整校验信息

---

## 工作原理

### 完整流程

```
爬取 → 解析 → 校验 → 上传 → 本地备份
  │       │       │       │       │
  ↓       ↓       ↓       ↓       ↓
获取网页 → 多策略解析 → 格式校验 → 尝试上传 → 失败则本地保存
```

### 解析策略

爬虫采用四层解析策略，逐级降级：

1. **正则匹配**：精确匹配 "剩余电量: X kWh" 格式
2. **关键词匹配**：查找包含"剩余"关键词的数值
3. **HTML标签解析**：去除标签后提取文本
4. **数字启发式**：查找合理范围内的小数

### 数据格式

```json
{
    "meter_id": "18100071580",
    "meter_name": "2759弄18号402阳台",
    "remaining_kwh": 29.5,
    "collected_at": "2024-01-15T10:30:00",
    "source": "ipad",
    "crawl_id": "ipad_abc123_xyz789",
    "format_version": 1,
    "checksum": "abcdef1234567890"
}
```

---

## 故障排除

### 常见问题

**Q: 爬取失败，显示"请求失败"**

A: 检查网络连接，确保可以访问目标网站。尝试切换 Wi-Fi 或使用蜂窝数据。

**Q: 解析失败，显示"所有解析策略均失败"**

A: 目标网站可能更新了页面结构。联系开发者更新解析规则。

**Q: 上传失败，显示"所有后端不可用"**

A: 检查后端服务是否正常运行，或配置正确的后端地址。

**Q: iSH 退出后爬虫停止运行**

A: iOS 后台限制导致。建议使用方案二（服务器部署）或保持 iSH 在前台运行。

---

## 注意事项

1. **网络稳定性**：建议在稳定的 Wi-Fi 环境下运行
2. **电量消耗**：后台运行会消耗电量，建议连接充电器
3. **数据安全**：本地数据会自动备份，定期检查存储占用
4. **版本更新**：定期拉取最新代码以获取修复和优化

---

## 与电脑端爬虫的协同

iPad 端与电脑端爬虫共享统一数据格式：
- 相同的校验算法（SHA256）
- 相同的爬取间隔（15分钟）
- 相同的解析策略
- 云端自动去重（基于 `crawl_id`）

当两端同时运行时，后端会自动处理重复数据，确保数据完整性。

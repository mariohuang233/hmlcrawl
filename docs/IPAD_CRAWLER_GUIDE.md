# iPad 端爬虫运行指南

## 📖 概述

本指南详细说明如何在 iPad 上运行本地爬虫，实现电量数据的采集与上传到云端 MongoDB 数据库。iPad 端爬虫作为备用方案，当电脑端爬虫不可用时自动接管，确保数据采集的连续性。

---

## ✅ 前置条件

1. **iPad 设备**：运行 iOS 15 或更高版本
2. **网络环境**：确保 iPad 能访问互联网
3. **后端服务**：已部署到 Railway/Zeabur 的后端服务（用于数据上传到 MongoDB）
4. **API Token**：后端服务的 API 认证令牌（联系开发者获取）

---

## 🚀 方案一：使用 iSH（推荐，无需越狱）

iSH 是一款在 iOS 上运行的 Alpine Linux 模拟器，无需越狱即可使用。

### 步骤 1：安装 iSH

1. 打开 **App Store**
2. 搜索 **iSH Shell** 并下载安装
3. 打开 iSH，等待初始化完成（首次打开需要几分钟）

### 步骤 2：安装依赖

在 iSH 终端中输入以下命令：

```bash
apk update
apk add python3 curl git vim
```

### 步骤 3：克隆项目

```bash
git clone https://github.com/mariohuang233/hmlcrawl.git
cd hmlcrawl
```

### 步骤 4：配置后端地址和 API Token（关键！）

这一步是确保数据能上传到 MongoDB 的关键配置。

使用 vim 编辑爬虫配置文件：

```bash
vim scripts/mobile_crawler.py
```

按 `i` 键进入编辑模式，找到以下配置项进行修改：

```python
# ============ 配置 ============
BACKEND_URLS = [
    "https://你的railway项目.up.railway.app/api/report",
]

API_TOKEN = "你的API_TOKEN"
```

**配置说明**：

| 配置项 | 修改内容 | 示例 |
|--------|----------|------|
| `BACKEND_URLS` | 替换为你的后端地址 | `https://hmlcrawl.up.railway.app/api/report` |
| `API_TOKEN` | 替换为你的 API Token | `abc123def456` |

**如何获取后端地址和 API Token**：

1. **后端地址**：登录 Railway/Zeabur，找到你的项目，查看部署的域名
2. **API Token**：查看后端服务的环境变量配置（联系开发者获取）

配置完成后：
- 按 `Esc` 键退出编辑模式
- 输入 `:wq` 保存并退出

### 步骤 5：测试运行

```bash
# 单次运行测试（不会持续运行）
python3 scripts/mobile_crawler.py
```

如果看到类似以下输出，说明配置正确：

```
[2024-01-15 10:30:00] ========================================
[2024-01-15 10:30:00] iPad/手机端爬虫 v2.0
[2024-01-15 10:30:00] 电表: 18100071580 (2759弄18号402阳台)
[2024-01-15 10:30:00] 间隔: 15分钟
[2024-01-15 10:30:00] 来源: ipad
[2024-01-15 10:30:00] 后端: 1 个地址
[2024-01-15 10:30:00] 开始爬取...
[2024-01-15 10:30:02] 策略 [正则匹配] 解析成功: 29.5 kWh
[2024-01-15 10:30:03] 上传成功 -> https://hmlcrawl.up.railway.app/api/report
```

### 步骤 6：后台守护模式运行（推荐）

```bash
python3 scripts/mobile_crawler.py --daemon
```

守护模式特点：
- 每 15 分钟自动爬取一次
- 异常后自动重启
- 数据自动上传到 MongoDB

### 步骤 7：保持运行

在 iSH 中，只要不关闭应用，爬虫会持续运行：
- 按 Home 键可以让 iSH 后台运行
- iOS 可能会在后台挂起应用，建议保持 iSH 在前台运行
- 长时间运行建议连接充电器

---

## 🌐 方案二：使用 Termius（SSH 连接服务器）

如果已有 Linux 服务器，可以通过 Termius 远程连接运行爬虫。

### 步骤 1：安装 Termius

1. 在 App Store 搜索并下载 **Termius**
2. 配置 SSH 连接到你的服务器

### 步骤 2：在服务器上部署

登录服务器后执行：

```bash
# 安装依赖
apt update && apt install python3 git screen

# 克隆项目
git clone https://github.com/mariohuang233/hmlcrawl.git
cd hmlcrawl

# 配置后端地址和 API Token（参考方案一步骤4）
vim scripts/mobile_crawler.py

# 使用 screen 后台运行
screen -S crawler
python3 scripts/mobile_crawler.py --daemon

# 按 Ctrl+A 然后按 D 退出 screen（爬虫继续运行）
```

---

## 📝 方案三：使用 Pythonista（代码编辑器）

Pythonista 是一款强大的 iOS Python 编辑器。

### 步骤 1：安装 Pythonista

1. 在 App Store 搜索并下载 **Pythonista 3**

### 步骤 2：创建爬虫脚本

1. 打开 Pythonista
2. 创建新文件 `mobile_crawler.py`
3. 将项目中 `scripts/mobile_crawler.py` 的完整代码复制进去
4. 修改 `BACKEND_URLS` 和 `API_TOKEN` 配置
5. 点击运行按钮

---

## ⚙️ 配置说明

### 关键配置项

打开 `scripts/mobile_crawler.py`，找到以下配置：

```python
# ============ 配置 ============
BACKEND_URLS = [
    "https://你的railway项目.up.railway.app/api/report",
]

API_TOKEN = "你的API_TOKEN"

METER_ID = "18100071580"
METER_NAME = "2759弄18号402阳台"
FETCH_INTERVAL = 15 * 60  # 爬取间隔（秒）
```

| 配置项 | 默认值 | 说明 | 是否需要修改 |
|--------|--------|------|--------------|
| `BACKEND_URLS` | [] | 后端上传地址 | ✅ **必须修改** |
| `API_TOKEN` | "" | API 认证令牌 | ✅ **必须修改** |
| `METER_ID` | 18100071580 | 电表编号 | 一般不需要 |
| `METER_NAME` | 2759弄18号402阳台 | 电表名称 | 一般不需要 |
| `FETCH_INTERVAL` | 900秒 | 爬取间隔（15分钟） | 一般不需要 |

### 数据流向

```
iPad爬虫 → 爬取网页 → 解析电量 → 上传到后端API → 存储到MongoDB
                                               ↓
                                        前端页面展示
```

### 数据格式

爬虫采集的数据会自动转换为以下格式，确保与电脑端爬虫兼容：

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

## 🔍 故障排除

### 常见问题

**Q: 运行后显示"所有后端不可用，保存到本地"**

A: 后端地址配置错误或后端服务未运行。请检查：
1. 后端地址是否正确（注意不要有拼写错误）
2. 后端服务是否正常运行（登录 Railway/Zeabur 查看状态）
3. 网络是否能访问后端地址

**Q: 显示"未授权，请提供有效的 API Token"**

A: API Token 配置错误。请检查 `API_TOKEN` 是否正确填写。

**Q: 爬取失败，显示"请求失败"**

A: 检查网络连接，确保可以访问目标网站。尝试切换 Wi-Fi 或使用蜂窝数据。

**Q: 解析失败，显示"所有解析策略均失败"**

A: 目标网站可能更新了页面结构。联系开发者更新解析规则。

**Q: iSH 退出后爬虫停止运行**

A: iOS 后台限制导致。建议使用方案二（服务器部署）或保持 iSH 在前台运行。

**Q: 数据上传成功但前端看不到**

A: 数据有 2 分钟缓存，等待几分钟后刷新页面即可。

### 日志查看

爬虫运行日志保存在 `mobile_data/mobile_crawler.log` 文件中：

```bash
cat mobile_data/mobile_crawler.log
```

---

## ⚠️ 注意事项

1. **网络稳定性**：建议在稳定的 Wi-Fi 环境下运行
2. **电量消耗**：后台运行会消耗电量，建议连接充电器
3. **数据安全**：API Token 是敏感信息，不要泄露给他人
4. **版本更新**：定期拉取最新代码以获取修复和优化

---

## 🔄 与电脑端爬虫的协同

iPad 端与电脑端爬虫共享统一数据格式：
- 相同的校验算法（SHA256）
- 相同的爬取间隔（15分钟）
- 相同的解析策略
- 云端自动去重（基于 `crawl_id`）

当两端同时运行时，后端会自动处理重复数据，确保数据完整性。

---

## 📞 联系我们

如果遇到问题，请联系开发者获取帮助：
- 后端服务状态检查
- API Token 获取
- 配置问题排查

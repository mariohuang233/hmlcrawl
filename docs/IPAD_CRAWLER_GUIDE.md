# iPad 端爬虫运行指南

## 📖 概述

本指南详细说明如何在 iPad 上运行本地爬虫，**零配置**实现电量数据采集与上传到 MongoDB。

**为什么电脑端不需要配置？**
- 电脑端爬虫和后端服务器在同一个进程中运行，共享 `.env.local` 配置
- iPad 端是独立的 Python 脚本，之前需要手动配置后端地址和 API Token

**现在的方案（v3.0）：**
- ✅ 直接连接 MongoDB，和电脑端一样简单
- ✅ 零配置，一键启动
- ✅ 数据自动同步到云端数据库

---

## ✅ 前置条件

1. **iPad 设备**：运行 iOS 15 或更高版本
2. **网络环境**：确保 iPad 能访问互联网

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
apk add python3 curl git py3-pip
pip install pymongo
```

### 步骤 3：克隆项目并运行

```bash
git clone https://github.com/mariohuang233/hmlcrawl.git
cd hmlcrawl
python3 scripts/mobile_crawler.py --daemon
```

**完成！** 就这么简单，不需要任何配置！

如果看到类似以下输出，说明运行成功：

```
[2024-01-15 10:30:00] ========================================
[2024-01-15 10:30:00] iPad/手机端爬虫 v3.0
[2024-01-15 10:30:00] 电表: 18100071580 (2759弄18号402阳台)
[2024-01-15 10:30:00] 间隔: 15分钟
[2024-01-15 10:30:00] 来源: ipad
[2024-01-15 10:30:00] MongoDB: 已配置
[2024-01-15 10:30:00] 数据目录: /hmlcrawl/mobile_data
[2024-01-15 10:30:00] ========================================
[2024-01-15 10:30:00] 开始爬取...
[2024-01-15 10:30:02] 策略 [正则匹配] 解析成功: 29.5 kWh
[2024-01-15 10:30:03] MongoDB 连接成功
[2024-01-15 10:30:04] MongoDB 写入成功: 65a0b1c2d3e4f56789012345
```

### 步骤 4：保持运行

在 iSH 中，只要不关闭应用，爬虫会持续运行：
- 每 15 分钟自动爬取一次
- 数据直接写入 MongoDB
- 异常后自动重启
- 建议连接充电器保持运行

### 步骤 5：重启爬虫

如果需要重启爬虫（例如更新代码后）：

```bash
# 按 Ctrl+C 停止当前爬虫
# 然后进入项目目录
cd hmlcrawl

# 更新代码（可选）
git pull

# 重新启动
python3 scripts/mobile_crawler.py --daemon
```

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
apt update && apt install python3 git screen python3-pip
pip3 install pymongo

# 克隆项目并运行
git clone https://github.com/mariohuang233/hmlcrawl.git
cd hmlcrawl

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

### 步骤 2：安装 pymongo

打开 Pythonista，点击左下角的 `+` 号，选择 `Install Package`，搜索并安装 `pymongo`。

### 步骤 3：运行爬虫

1. 创建新文件 `mobile_crawler.py`
2. 将项目中 `scripts/mobile_crawler.py` 的完整代码复制进去
3. 点击运行按钮

---

## ⚙️ 配置说明（高级用户）

默认情况下，所有配置已经内置，无需修改。如果你需要自定义，可以编辑 `scripts/mobile_crawler.py`：

```python
# ============ 配置 ============
MONGO_URI = "mongodb+srv://..."  # MongoDB连接地址（已内置）
METER_ID = "18100071580"        # 电表编号
METER_NAME = "2759弄18号402阳台" # 电表名称
FETCH_INTERVAL = 15 * 60        # 爬取间隔（秒）
```

### 数据流向

```
iPad爬虫 → 爬取网页 → 解析电量 → 直接写入MongoDB
                                               ↓
                                        前端页面展示
```

### 数据格式

```json
{
    "meter_id": "18100071580",
    "meter_name": "2759弄18号402阳台",
    "remaining_kwh": 29.5,
    "collected_at": "2024-01-15T10:30:00",
    "source": "ipad"
}
```

---

## 🔍 故障排除

### 常见问题

**Q: 运行后显示"未安装 pymongo"**

A: 请安装 pymongo：

```bash
pip install pymongo
```

**Q: MongoDB 连接失败**

A: 检查网络连接，确保能访问 MongoDB Atlas。尝试切换 Wi-Fi 或使用蜂窝数据。如果仍然失败，可能是网络防火墙限制了 MongoDB Atlas 的端口。

**Q: 爬取失败，显示"请求失败"**

A: 检查网络连接，确保可以访问目标网站。尝试切换 Wi-Fi 或使用蜂窝数据。

**Q: 解析失败，显示"所有解析策略均失败"**

A: 目标网站可能更新了页面结构。联系开发者更新解析规则。

**Q: 解析出的电量数字明显错误（如 7 kWh）**

A: 这是因为数字启发式策略匹配到了页面上的其他数字。请确保爬取的页面是正确的电表页面，并且包含"剩余电量"字样。如果问题持续，请联系开发者。

**Q: 显示"所有后端不可用"**

A: MongoDB 连接失败且没有配置后端 API 地址。请检查网络连接，确保能访问 MongoDB Atlas。

**Q: iSH 退出后爬虫停止运行**

A: iOS 后台限制导致。建议使用方案二（服务器部署）或保持 iSH 在前台运行。

### 日志查看

爬虫运行日志保存在 `mobile_data/mobile_crawler.log` 文件中：

```bash
cat mobile_data/mobile_crawler.log
```

---

## ⚠️ 注意事项

1. **网络稳定性**：建议在稳定的 Wi-Fi 环境下运行
2. **电量消耗**：后台运行会消耗电量，建议连接充电器
3. **版本更新**：定期拉取最新代码以获取修复和优化

---

## 🔄 与电脑端爬虫的协同

iPad 端与电脑端爬虫共享同一个 MongoDB 数据库：
- 相同的数据格式
- 相同的爬取间隔（15分钟）
- 相同的解析策略
- 自动去重（基于时间戳）

当两端同时运行时，数据会自动合并，确保数据完整性。

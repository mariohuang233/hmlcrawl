# Puppeteer版本部署指南

## 🎯 为什么用Puppeteer？
- ✅ 完全模拟真实浏览器，难以被检测
- ✅ 免费在Railway上运行
- ✅ 不需要额外的代理服务器

## 📦 安装步骤

### 1. 修改package.json
```json
{
  "dependencies": {
    "puppeteer": "^21.0.0"
  }
}
```

### 2. 修改爬虫入口
在 `src/index.js` 或其他启动文件中，替换：
```javascript
// 旧版本
const crawler = require('./crawler/crawler');

// 新版本 - Puppeteer
const crawler = require('./crawler/crawler-puppeteer');
```

### 3. Railway环境变量
确保Railway有足够的资源：
```
NODE_ENV=production
```

Railway会自动检测并安装依赖。

## 🚀 部署到Railway

1. 提交代码：
```bash
git add .
git commit -m "添加Puppeteer版本爬虫"
git push origin main
```

2. Railway会自动部署

3. 查看日志确认Puppeteer正常启动

## ⚠️ 注意事项

### Railway免费tier限制
- Puppeteer需要较多内存
- 如果免费tier不够，考虑升级到付费tier（$5/月起）

### 替代方案：Render.com
如果Railway资源不够，可以部署到Render.com：
1. 注册 https://render.com
2. 连接GitHub仓库
3. 自动部署（完全免费）

## 🧪 测试
在Railway日志中查看：
- "Puppeteer爬虫定时任务已启动"
- "启动Puppeteer浏览器..."
- "成功解析电量: XX.XX kWh"

## 🔧 故障排除

### 错误：Browser launch failed
```
解决方案：Railway免费tier内存不足
→ 升级Railway或改用Render.com
```

### 错误：Request timeout
```
解决方案：增加timeout时间
修改 crawler-puppeteer.js 中的 timeout: 60000
```

### 仍然被拦截
```
尝试添加更多浏览器特征：
- 添加Cookie
- 随机延时
- 更改User-Agent
```

## 📊 性能对比

| 指标 | 旧版本 | Puppeteer版本 |
|------|--------|---------------|
| 检测难度 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 内存占用 | ~50MB | ~300MB |
| 执行速度 | 快 | 较慢 |
| 成功率 | 低（被封） | 高 |

## 🎉 优势
使用Puppeteer后的预期效果：
- ✅ 绕过大部分反爬虫检测
- ✅ 成功率显著提高
- ✅ 不需要额外成本（Railway免费tier）
- ✅ 代码简洁易维护

## 📞 需要帮助？
遇到问题随时问我！


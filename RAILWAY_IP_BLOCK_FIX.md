# Railway IP被封禁解决方案

## 问题
Railway的IP被目标网站（www.wap.cnyiot.com）封禁，导致返回405错误。

## 解决方案

### 方案1：使用直连IP（推荐）

如果知道服务器的直连IP地址：

1. 在Railway环境变量中添加：
   ```
   USE_DIRECT_IP=true
   DIRECT_IP=目标服务器IP
   ```

2. 查询www.wap.cnyiot.com的实际IP：
   ```bash
   nslookup www.wap.cnyiot.com
   # 或
   ping www.wap.cnyiot.com
   ```

3. 将IP地址填入DIRECT_IP环境变量

### 方案2：更换部署平台

Railway的IP可能被大量标记，可以尝试：
- Vercel
- Render  
- Fly.io
- 自建VPS

### 方案3：使用代理服务

如果有可用的HTTP/HTTPS代理

### 方案4：降低爬取频率

增加爬取间隔和随机延迟

## 当前状态

已添加的改进：
- ✅ 直连IP支持
- ✅ 完整的浏览器请求头
- ✅ 随机延迟2-5秒
- ✅ 拦截检测

## 快速测试

在终端运行：
```bash
nslookup www.wap.cnyiot.com
```

将返回的IP地址添加到Railway环境变量DIRECT_IP中。


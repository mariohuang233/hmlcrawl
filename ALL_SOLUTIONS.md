# 绕过Railway IP封禁的所有解决方案

## ✅ 方案1：使用Vercel中间代理（最推荐）

### 为什么有效：
- Vercel的IP池是全新的
- 还没有被目标网站标记
- 免费、快速、稳定

### 实施步骤：

1. **创建Vercel项目**
   ```bash
   # 安装Vercel CLI
   npm i -g vercel
   
   # 登录
   vercel login
   
   # 创建新目录
   mkdir vercel-proxy && cd vercel-proxy
   ```

2. **创建文件**
   
   创建 `api/fetch.js`:
   ```javascript
   export default async (req, res) => {
     res.setHeader('Access-Control-Allow-Origin', '*');
     
     const url = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
     
     try {
       const response = await fetch(url, {
         headers: {
           'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)',
           'Accept': 'text/html,application/xhtml+xml'
         }
       });
       const html = await response.text();
       res.send(html);
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   };
   ```
   
   创建 `package.json`:
   ```json
   {
     "name": "vercel-proxy",
     "version": "1.0.0"
   }
   ```

3. **部署**
   ```bash
   vercel
   ```

4. **修改Railway爬虫**
   
   将 `crawler.js` 中的URL改为：
   ```javascript
   this.url = 'https://your-vercel-project.vercel.app/api/fetch';
   ```

---

## ⚡ 方案2：迁移到Render平台

### 优势：
- Render的IP段是新的
- 免费支持Node.js
- 配置简单

### 步骤：
1. 登录 https://render.com
2. 创建Web Service
3. 连接GitHub仓库
4. 自动部署

---

## 🔄 方案3：使用公共代理服务

### 免费代理列表：
- https://www.proxy-list.download/
- https://free-proxy-list.net/
- https://www.proxy-list.download/zh

### 在Railway环境变量中添加：
```
HTTP_PROXY=http://proxy-ip:port
```

---

## 🚀 方案4：自建VPS（长期方案）

### 推荐VPS：
- 阿里云轻量应用服务器（海外）
- Vultr
- DigitalOcean

### 优势：
- 完全控制IP
- 不会被批量封禁
- 适合生产环境

---

## 🎭 方案5：降低爬取频率

修改 `crawler.js`:
```javascript
// 改为30分钟一次
cron.schedule('*/30 * * * *', () => {
  // ...
});
```

---

## 📦 方案6：使用Puppeteer（终极方案）

安装Puppeteer，使用真实浏览器：
```bash
npm install puppeteer-core
```

修改爬虫使用真实浏览器，但会增加资源消耗。

---

## 🎯 推荐实施顺序

1. **立即执行**：方案1（Vercel代理）- 30分钟内完成
2. **备选方案**：方案2（迁移到Render）- 更稳定
3. **长期方案**：方案4（自建VPS）- 完全控制


# Vercel中间代理完整部署指南

## 步骤1：部署Vercel代理

### 方法A：使用Vercel CLI（推荐）

```bash
cd /Users/huangjiawei/Downloads/elec0922/vercel-proxy

# 安装Vercel CLI（如果还没安装）
npm install -g vercel

# 登录Vercel
vercel login

# 部署到生产环境
vercel --prod
```

部署成功后，你会得到一个URL，例如：
```
https://electricity-middleware.vercel.app/api/fetch
```

### 方法B：使用Web界面

1. 访问 https://vercel.com/new
2. 点击 "Add New" > "Project"
3. 选择 "Upload" 或连接GitHub
4. 上传 `vercel-proxy` 文件夹
5. 点击 "Deploy"

---

## 步骤2：配置Railway环境变量

1. 登录Railway控制台
2. 选择你的项目
3. 点击 "Variables"
4. 添加环境变量：

```
VERCEL_PROXY_URL=https://YOUR_PROJECT.vercel.app/api/fetch
```

**重要**：将 `YOUR_PROJECT` 替换为你实际的Vercel项目名称

---

## 步骤3：测试

1. 等待Railway自动重新部署
2. 访问你的页面
3. 点击"手动爬取"按钮
4. 点击"查看日志"
任务的5. 确认是否成功

---

## 验证部署

访问Vercel部署的URL，应该能看到HTML内容：
```
https://your-project.vercel.app/api/fetch
```

如果看到HTML，说明Vercel代理部署成功！

---

## 故障排查

### 如果Vercel返回错误
- 检查 `api/fetch.js` 代码
- 查看Vercel部署日志

### 如果Railway仍失败
- 检查环境变量 `VERCEL_PROXY_URL` 是否正确
- 查看Railway日志确认URL

### 如果超时
- Vercel免费版有10秒超时限制
- 可能需要升级到Pro版本

---

## 优势

✅ 完全免费（Vercel免费层足够用）
✅ IP池新，不容易被封
✅ 部署快速（1-2分钟）
✅ 无需维护
✅ 全球CDN加速


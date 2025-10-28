# 快速部署Vercel代理 - 3步完成

## 🚀 步骤短短3步！

### 第1步：访问Vercel Web界面
👉 https://vercel.com/new

### 第2步：上传文件
1. 选择 **"Upload"** 或 **"Import Git Repository"**
2. 如果选择Upload：
   - 上传整个 `vercel-proxy` 文件夹
   - 或者创建一个包含以下文件的新项目：
     - `api/fetch.js` 
     - `package.json`
     - `vercel.json`（可选）
3. 点击 **"Deploy"**

### 第3步：配置Railway
1. 等待Vercel部署完成
2. 复制Vercel给你的URL（类似：`https://xxx.vercel.app/api/fetch`）
3. 在Railway环境变量中添加：
   ```
   VERCEL_PROXY_URL=https://xxx.vercel.app/api/fetch
   ```

## ✅ 完成！
Railway会自动重新部署，爬虫会通过Vercel代理访问！

---

## 更简单的方法：使用GitHub

### 1. 在GitHub创建新仓库
   - 名称：`electricity-middleware`
   - 设置为Public

### 2. 上传vercel-proxy文件夹到仓库

### 3. 在Vercel导入GitHub仓库
   - https://vercel.com/new
   - 选择刚创建的GitHub仓库
   - 点击Deploy

### 4. 复制部署URL并配置到Railway

---

## 测试
访问Vercel的URL，应该能看到HTML内容。

如果看到HTML，说明成功！


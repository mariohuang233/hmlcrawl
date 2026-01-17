# Vercel部署超简单指南

## ✅ 最快方法（2步搞定）

### 第1步：在Vercel部署

**选项A：直接上传（最简单）**
1. 访问 https://vercel.com/new
2. 点击 "Upload" 
3. 拖拽整个 `vercel-proxy` 文件夹
4. 点击 "Deploy"
5. 复制部署URL（例如：`https://electricity-middleware.vercel.app/api/fetch`）

**选项B：使用GitHub**
1. 在GitHub创建新仓库，上传 `vercel-proxy` 文件夹内容
2. 在Vercel选择"Import Git Repository"
3. 选择刚创建的仓库
4. 点击 "Deploy"

### 第2步：配置Railway

在Railway环境变量中添加：
```
VERCEL_PROXY_URL=https://你的项目名.vercel.app/api/fetch
```

替换"你的项目名"为实际项目名。

## 🎉 完成！

现在Railway会通过Vercel代理访问，不会被封禁了！

## 📝 目录结构确认

确保 `vercel-proxy` 文件夹包含：
```
vercel-proxy/
  ├── api/
  │   └── fetch.js
  ├── package.json
  ├── vercel.json
  └── README.md
```

## 🧪 测试

访问这个URL应该能看到HTML：
```
https://你的项目.vercel.app/api/fetch
```

如果看到HTML内容，说明部署成功！


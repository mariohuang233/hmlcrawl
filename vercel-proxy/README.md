# 电力数据Vercel中间代理

## 功能
作为中间层代理，绕过Railway IP封禁问题。

## 快速部署

### 方法1：使用Vercel CLI

```bash
# 安装CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel

# 生产部署
vercel --prod
```

### 方法2：使用GitHub集成

1. 创建GitHub仓库
2. 在Vercel控制台导入项目
3. 自动部署

### 方法3：直接上传

1. 登录 https://vercel.com
2. 点击 "Add New" > "Project"
3. 上传 `api/fetch.js` 文件
4. 点击部署

## 使用

部署后会获得URL，例如：
`https://your-project.vercel.app/api/fetch`

在Railway爬虫中使用这个URL即可。

## 环境变量

无需配置环境变量。


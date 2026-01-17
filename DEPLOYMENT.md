# 部署指南

## Railway 部署

### 1. 准备环境变量

在Railway项目中设置以下环境变量：

```
MONGO_URI=mongodb+srv://mariohuang:<Huangjw1014>@yierbubu.aha67vc.mongodb.net/?retryWrites=true&w=majority&appName=yierbubu
PORT=3000
CRAWLER_URL=http://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580
CRAWLER_INTERVAL=*/10 * * * *
LOG_LEVEL=info
```

### 2. 部署步骤

1. 登录 [Railway](https://railway.app)
2. 点击 "New Project" -> "Deploy from GitHub repo"
3. 选择你的GitHub仓库
4. 在项目设置中添加上述环境变量
5. 等待部署完成

### 3. 验证部署

部署完成后，访问你的Railway域名，应该能看到家庭用电监控系统界面。

## Zeabur 部署

### 1. 准备环境变量

在Zeabur项目中设置以下环境变量：

```
MONGO_URI=mongodb+srv://mariohuang:<Huangjw1014>@yierbubu.aha67vc.mongodb.net/?retryWrites=true&w=majority&appName=yierbubu
CRAWLER_URL=http://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580
CRAWLER_INTERVAL=*/10 * * * *
LOG_LEVEL=info
```

### 2. 部署步骤

1. 登录 [Zeabur](https://zeabur.com)
2. 点击 "Create Project"
3. 选择 "Deploy from GitHub"
4. 选择你的GitHub仓库
5. 选择 "Node.js" 环境
6. 在环境变量中添加上述配置
7. 等待部署完成

### 3. 验证部署

部署完成后，访问你的Zeabur域名，应该能看到家庭用电监控系统界面。

## 本地开发

### 1. 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd frontend && npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```
MONGO_URI=mongodb+srv://mariohuang:<Huangjw1014>@yierbubu.aha67vc.mongodb.net/?retryWrites=true&w=majority&appName=yierbubu
PORT=3000
CRAWLER_URL=http://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580
CRAWLER_INTERVAL=*/10 * * * *
LOG_LEVEL=info
```

### 3. 启动服务

```bash
# 构建前端
cd frontend && npm run build

# 启动后端服务
cd .. && npm start
```

访问 http://localhost:3000 查看应用。

## 故障排除

### 1. MongoDB连接失败

- 检查MongoDB连接字符串是否正确
- 确认网络可以访问MongoDB Atlas
- 检查用户名和密码是否正确

### 2. 爬虫无法获取数据

- 检查目标网站是否可访问
- 可能需要调整User-Agent或其他请求头
- 检查网站结构是否发生变化

### 3. 前端构建失败

- 确保Node.js版本 >= 18.0.0
- 删除node_modules重新安装依赖
- 检查是否有语法错误

### 4. 部署失败

- 检查环境变量是否正确设置
- 确认所有依赖都已安装
- 查看部署日志中的错误信息

# 使用官方Node.js镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package.json文件
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# 安装后端依赖
RUN npm install --production

# 安装前端依赖
RUN cd frontend && npm install

# 复制源代码
COPY . .

# 构建前端
RUN cd frontend && npm run build

# 创建日志目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]

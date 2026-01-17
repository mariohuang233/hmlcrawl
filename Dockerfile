# 使用官方Node.js 18镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production --prefer-offline --no-audit

# 复制前端package文件并安装依赖
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --prefer-offline --no-audit

# 复制所有源代码
COPY . .

# 构建前端
RUN npm run build

# 暴露端口（关键：让Zeabur识别服务端口）
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 健康检查（确保容器启动成功）
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动命令
CMD ["node", "server.js"]

#!/bin/bash
# VPS代理服务器一键部署脚本

echo "=========================================="
echo "电力数据代理服务器 - 一键部署"
echo "=========================================="
echo ""

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "正在安装Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node.js版本: $(node -v)"
echo ""

# 创建部署目录
DEPLOY_DIR="/opt/electricity-proxy"
sudo mkdir -p $DEPLOY_DIR
sudo chown $USER:$USER $DEPLOY_DIR
cd $DEPLOY_DIR

echo "部署目录: $DEPLOY_DIR"

# 使用现成的local-proxy-server.js
echo "请将local-proxy-server.js上传到VPS"
echo "或访问: https://github.com/your-repo/electricity-crawler"
echo ""

# 安装PM2
if ! command -v pm2 &> /dev/null; then
    echo "安装PM2..."
    sudo npm install -g pm2
fi

# 创建package.json
cat > $DEPLOY_DIR/package.json << 'EOF'
{
  "name": "electricity-proxy",
  "version": "1.0.0",
  "main": "local-proxy-server.js"
}
EOF

# 启动服务
echo "启动代理服务..."
pm2 delete electricity-proxy 2>/dev/null
pm2 start local-proxy-server.js --name electricity-proxy
pm2 startup
pm2 save

echo ""
echo "服务启动成功"
echo ""

# 配置防火墙
if command -v ufw &> /dev/null; then
    echo "配置防火墙..."
    sudo ufw allow 3000/tcp
    sudo ufw --force enable
fi

# 显示状态
echo ""
echo "=========================================="
echo "部署完成"
echo "=========================================="
echo ""
echo "查看日志: pm2 logs electricity-proxy"
echo "重启服务: pm2 restart electricity-proxy"
echo ""
PUBLIC_IP=$(curl -s ifconfig.me || echo "你的VPS_IP")
echo "代理地址: http://$PUBLIC_IP:3000"
echo ""
echo "在Railway设置环境变量:"
echo "PROXY_URL=http://$PUBLIC_IP:3000"
echo "=========================================="

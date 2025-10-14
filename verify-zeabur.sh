#!/bin/bash

# Zeabur部署验证脚本
# 使用方法: ./verify-zeabur.sh https://your-app.zeabur.app

if [ -z "$1" ]; then
    echo "❌ 错误：请提供Zeabur应用URL"
    echo "使用方法: ./verify-zeabur.sh https://your-app.zeabur.app"
    exit 1
fi

URL=$1
echo "🔍 开始验证Zeabur部署: $URL"
echo ""

# 1. 测试健康检查
echo "1️⃣ 测试健康检查端点..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$URL/health")
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HEALTH_CODE" = "200" ]; then
    echo "✅ /health 端点正常 (HTTP $HEALTH_CODE)"
    echo "   响应: $HEALTH_BODY"
else
    echo "❌ /health 端点失败 (HTTP $HEALTH_CODE)"
    echo "   响应: $HEALTH_BODY"
fi
echo ""

# 2. 测试ping端点
echo "2️⃣ 测试ping端点..."
PING_RESPONSE=$(curl -s -w "\n%{http_code}" "$URL/ping")
PING_CODE=$(echo "$PING_RESPONSE" | tail -n1)
PING_BODY=$(echo "$PING_RESPONSE" | head -n-1)

if [ "$PING_CODE" = "200" ]; then
    echo "✅ /ping 端点正常 (HTTP $PING_CODE)"
    echo "   响应: $PING_BODY"
else
    echo "❌ /ping 端点失败 (HTTP $PING_CODE)"
fi
echo ""

# 3. 测试主页
echo "3️⃣ 测试主页..."
HOME_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")

if [ "$HOME_CODE" = "200" ]; then
    echo "✅ 主页正常 (HTTP $HOME_CODE)"
else
    echo "❌ 主页失败 (HTTP $HOME_CODE)"
fi
echo ""

# 4. 测试API
echo "4️⃣ 测试API端点..."
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api/overview")

if [ "$API_CODE" = "200" ]; then
    echo "✅ API端点正常 (HTTP $API_CODE)"
else
    echo "⚠️  API端点返回 (HTTP $API_CODE) - 可能需要MongoDB连接"
fi
echo ""

# 总结
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 验证总结:"
if [ "$HEALTH_CODE" = "200" ] && [ "$PING_CODE" = "200" ] && [ "$HOME_CODE" = "200" ]; then
    echo "✅ 部署成功！所有检查通过。"
    echo ""
    echo "🎉 你的应用已经正常运行在: $URL"
else
    echo "⚠️  部署可能存在问题，请检查Zeabur日志。"
    echo ""
    echo "🔧 故障排查步骤："
    echo "1. 查看Zeabur控制台的部署日志"
    echo "2. 确认环境变量已正确配置"
    echo "3. 检查MongoDB连接字符串"
    echo "4. 查看 ZEABUR_FIX.md 获取详细帮助"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"


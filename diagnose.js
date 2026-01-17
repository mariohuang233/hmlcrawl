#!/usr/bin/env node

/**
 * Zeabur部署诊断脚本
 * 用于快速检查服务器配置和环境
 */

console.log('🔍 Zeabur部署诊断\n');

// 1. 检查环境变量
console.log('📋 环境变量检查:');
console.log(`  NODE_ENV: ${process.env.NODE_ENV || '未设置 (默认development)'}`);
console.log(`  PORT: ${process.env.PORT || '未设置 (默认3000)'}`);
console.log(`  MONGO_URI: ${process.env.MONGO_URI ? '✅ 已设置' : '❌ 未设置'}`);

// 2. 检查Node.js版本
console.log('\n📦 Node.js版本:');
console.log(`  当前版本: ${process.version}`);
const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
if (nodeVersion >= 18) {
  console.log('  ✅ 版本符合要求 (>=18)');
} else {
  console.log('  ❌ 版本过低，需要 >=18');
}

// 3. 检查关键依赖
console.log('\n📚 关键依赖检查:');
const dependencies = ['express', 'mongoose', 'dotenv', 'winston'];
dependencies.forEach(dep => {
  try {
    require.resolve(dep);
    console.log(`  ✅ ${dep}`);
  } catch (e) {
    console.log(`  ❌ ${dep} - 未安装`);
  }
});

// 4. 检查构建产物
const fs = require('fs');
const path = require('path');

console.log('\n🏗️  前端构建检查:');
const buildPath = path.join(__dirname, 'frontend', 'build');
if (fs.existsSync(buildPath)) {
  const indexHtml = path.join(buildPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    console.log('  ✅ frontend/build/index.html 存在');
  } else {
    console.log('  ❌ frontend/build/index.html 不存在');
  }
} else {
  console.log('  ❌ frontend/build 目录不存在');
  console.log('  💡 请运行: npm run build');
}

// 5. 测试服务器启动
console.log('\n🚀 服务器启动测试:');
console.log('  尝试启动服务器...');

const express = require('express');
const app = express();
const testPort = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', diagnostic: true });
});

const server = app.listen(testPort, '0.0.0.0', () => {
  console.log(`  ✅ 服务器成功启动在 0.0.0.0:${testPort}`);
  console.log(`  ✅ 健康检查端点: http://localhost:${testPort}/health`);
  
  // 测试健康检查
  const http = require('http');
  http.get(`http://localhost:${testPort}/health`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`  ✅ 健康检查响应: ${data}`);
      console.log('\n✨ 诊断完成！服务器配置正常。');
      server.close();
      process.exit(0);
    });
  }).on('error', (err) => {
    console.log(`  ❌ 健康检查失败: ${err.message}`);
    server.close();
    process.exit(1);
  });
}).on('error', (err) => {
  console.log(`  ❌ 启动失败: ${err.message}`);
  if (err.code === 'EADDRINUSE') {
    console.log(`  💡 端口 ${testPort} 已被占用，请更改PORT环境变量`);
  }
  process.exit(1);
});

// 超时保护
setTimeout(() => {
  console.log('\n⏱️  诊断超时');
  server.close();
  process.exit(1);
}, 5000);


// 修复MongoDB连接超时问题
const fs = require('fs');

// 读取server.js
let serverContent = fs.readFileSync('server.js', 'utf8');

// 更新MongoDB连接选项
const newMongoOptions = `const mongoOptions = {
  serverSelectionTimeoutMS: 10000, // 10秒
  socketTimeoutMS: 45000, // 45秒
  heartbeatFrequencyMS: 10000, // 10秒
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  retryWrites: true,
  retryReads: true,
  connectTimeoutMS: 10000, // 10秒
  bufferMaxEntries: 0,
  useNewUrlParser: true,
  useUnifiedTopology: true
};`;

// 替换MongoDB连接选项
serverContent = serverContent.replace(
  /const mongoOptions = \{[\s\S]*?\};/,
  newMongoOptions
);

// 写回文件
fs.writeFileSync('server.js', serverContent);

console.log('✅ MongoDB连接选项已优化');

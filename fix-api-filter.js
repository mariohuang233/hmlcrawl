// 修复API，过滤掉14:40之后的脏数据
const fs = require('fs');
const path = require('path');

const serverFile = 'server.js';
const apiFile = 'src/api/routes.js';

console.log('🔧 修复API数据过滤...');

// 读取server.js
let serverContent = fs.readFileSync(serverFile, 'utf8');

// 添加数据过滤中间件
const filterMiddleware = `
// 数据过滤中间件 - 过滤14:40之后的脏数据
const filterDirtyData = (req, res, next) => {
  const originalJson = res.json;
  res.json = function(data) {
    if (data && data.data && Array.isArray(data.data)) {
      // 过滤掉今天14:40之后的数据
      const cutoffTime = new Date(2025, 9, 23, 6, 40, 0); // UTC 6:40 = 北京时间 14:40
      data.data = data.data.filter(item => {
        if (item.collected_at) {
          return new Date(item.collected_at) < cutoffTime;
        }
        return true;
      });
    }
    originalJson.call(this, data);
  };
  next();
};
`;

// 在server.js中添加过滤中间件
if (!serverContent.includes('filterDirtyData')) {
  serverContent = serverContent.replace(
    'const app = express();',
    `const app = express();\n${filterMiddleware}`
  );
  
  // 应用到24小时趋势API
  serverContent = serverContent.replace(
    "app.get('/api/trend24h', async (req, res) => {",
    "app.get('/api/trend24h', filterDirtyData, async (req, res) => {"
  );
  
  // 应用到每日趋势API
  serverContent = serverContent.replace(
    "app.get('/api/daily-trend', async (req, res) => {",
    "app.get('/api/daily-trend', filterDirtyData, async (req, res) => {"
  );
  
  fs.writeFileSync(serverFile, serverContent);
  console.log('✅ server.js 已更新');
}

console.log('✅ API过滤修复完成');

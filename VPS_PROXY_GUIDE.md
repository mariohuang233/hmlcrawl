# 使用VPS作为长期代理解决方案

## 问题
本地电脑作为代理需要:
- ❌ 电脑不能关机
- ❌ 不能待机
- ❌ 不能断网
- ❌ 耗电量大

## 更好的方案：使用便宜的VPS

### 推荐VPS服务商（性价比高）

#### 1. **Vultr** （推荐）
- **价格**: $6/月（1GB RAM）
- **位置**: 选择日本/新加坡机房（延迟低）
- **优点**: 按小时计费，随时可取消
- **链接**: https://www.vultr.com

#### 2. **DigitalOcean**
- **价格**: $6/月
- **优点**: 稳定可靠，文档完善
- **链接**: https://www.digitalocean.com

#### 3. **阿里云轻量应用服务器**（国内）
- **价格**: ¥24/月
- **优点**: 国内访问快，中文支持
- **链接**: https://www.aliyun.com

#### 4. **腾讯云轻量应用服务器**
- **价格**: ¥24/月
- **优点**: 性价比高
- **链接**: https://cloud.tencent.com

## 快速部署步骤（以Vultr为例）

### 1. 创建VPS实例
```bash
1. 注册Vultr账号
2. 创建新实例（Instance）
3. 选择：
   - OS: Ubuntu 22.04
   - 地区: 日本东京
   - 配置: $6/月（1GB RAM）
   - SSH key: 添加你的公钥
```

### 2. 连接VPS并安装Node.js
```bash
# SSH连接
ssh root@你的VPS_IP

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v
npm -v
```

### 3. 上传并运行代理服务
```bash
# 创建目录
mkdir -p /opt/electricity-proxy
cd /opt/electricity-proxy

# 上传local-proxy-server.js（使用scp）
# 或者直接创建文件
nano proxy.js
```

### 4. 创建代理文件
```javascript
// /opt/electricity-proxy/proxy.js
const http = require('http');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');

const PORT = 3000;
const TARGET_URL = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') return res.end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const urlObj = new URL(TARGET_URL);
  const httpModule = urlObj.protocol === 'https:' ? https : http;
  
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || 443,
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Cache-Control': 'no-cache',
      'Host': urlObj.hostname,
      'Referer': `${urlObj.protocol}//${urlObj.hostname}/`
    }
  };
  
  const proxyReq = httpModule.get(options, (proxyRes) => {
    let data = '';
    let stream = proxyRes;
    
    if (proxyRes.headers['content-encoding'] === 'gzip') {
      stream = zlib.createGunzip();
      proxyRes.pipe(stream);
    }
    
    stream.on('data', chunk => data += chunk.toString());
    stream.on('end', () => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(data);
    });
  });
  
  proxyReq.on('error', error => {
    res.status(500).json({ error: error.message });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`代理服务启动: http://0.0.0.0:${PORT}`);
});
```

### 5. 使用PM2保持运行
```bash
# 安装PM2
npm install -g pm2

# 启动代理服务
pm2 start proxy.js --name electricity-proxy

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs electricity-proxy
```

### 6. 配置防火墙
```bash
# Ubuntu防火墙
sudo ufw allow 3000
sudo ufw enable
```

### 7. 在Railway配置
```
PROXY_URL=http://你的VPS_IP:3000
```

## 成本对比

| 方案 | 月成本 | 稳定性 | 可维护性 |
|------|--------|--------|----------|
| 个人电脑 | 电费+折旧 | ⭐⭐⭐ | ⭐⭐ |
| VPS（$6） | $6 (~¥42) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 付费代理 | $75-1000+ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Puppeteer | Railway资源消耗 | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## 推荐方案排序 VS

1. **🥇 VPS代理** - 最均衡的方案
2. **🥈 Puppeteer** - 如果Railway资源充足
3. **🥉 本地电脑+ngrok** - 短期测试用

## 快速决策树

```
你的预算?
├─ 无预算 → 本地电脑+ngrok（短期测试）
├─ 月预算$6以内 → VPS（推荐Vultr $6/月）
├─ 月预算$100以内 → 付费代理服务
└─ 无预算限制 → Puppeteer + 高配置VPS
```

## 立即行动

1. **今天**: 使用本地电脑+ngrok测试可行性
2. **本周**: 如果测试成功，购买VPS部署
3. **长期**: 在VPS上运行代理服务

需要我帮你配置哪个方案？


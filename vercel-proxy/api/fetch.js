// Vercel Serverless Function
// 导出正确的格式

module.exports = async (req, res) => {
  // 允许CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
  
  try {
    console.log(`[${new Date().toISOString()}] 代理请求`);
    
    // 使用node-fetch或内置fetch
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `HTTP ${response.status}` 
      });
    }
    
    const html = await response.text();
    console.log(`返回HTML长度: ${html.length}`);
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
    
  } catch (error) {
    console.error('代理错误:', error.message);
    return res.status(500).json({ 
      error: error.message
    });
  }
};

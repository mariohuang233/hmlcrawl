// Vercel Edge Function - 中间代理层
// 用于绕过Railway IP封禁问题

export default async function handler(req, res) {
  // 允许CORS，让Railway可以调用
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
    console.log(`[${new Date().toISOString()}] 代理请求: ${targetUrl}`);
    
    // 使用Vercel的边缘函数访问目标网站
    // Vercel的IP池是新的，没有被封禁
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Referer': 'https://www.wap.cnyiot.com/',
      },
      // 添加超时
      signal: AbortSignal.timeout(30000) // 30秒超时
    });
    
    if (!response.ok) {
      console.error(`请求失败: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ 
        error: `HTTP ${response.status}: ${response.statusText}` 
      });
    }
    
    const html = await response.text();
    console.log(`返回HTML长度: ${html.length}`);
    
    // 直接返回HTML内容
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
    
  } catch (error) {
    console.error('代理错误:', error.message);
    return res.status(500).json({ 
      error: error.message,
      details: 'Vercel代理服务错误'
    });
  }
}


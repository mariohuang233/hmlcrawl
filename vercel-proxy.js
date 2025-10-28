// Vercel Edge Function作为中间代理
// 部署到Vercel后，将URL改为这个Edge Function

export default async function handler(req, res) {
  // 允许CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';
  
  try {
    // Vercel的边缘函数使用不同的IP，可以绕过封禁
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      }
    });
    
    const html = await response.text();
    
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}


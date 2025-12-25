const https = require('https');
const { URL } = require('url');
const { JSDOM } = require('jsdom');

// 目标URL
const targetUrl = 'https://www.wap.cnyiot.com/nat/pay.aspx?mid=18100071580';

// 发送HTTP请求获取HTML
function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        // 处理压缩
        const encoding = (res.headers['content-encoding'] || '').toLowerCase();
        if (encoding === 'gzip') {
          const zlib = require('zlib');
          zlib.gunzip(buffer, (err, result) => {
            if (err) reject(err);
            else resolve(result.toString());
          });
        } else if (encoding === 'deflate') {
          const zlib = require('zlib');
          zlib.inflate(buffer, (err, result) => {
            if (err) reject(err);
            else resolve(result.toString());
          });
        } else if (encoding === 'br') {
          const zlib = require('zlib');
          zlib.brotliDecompress(buffer, (err, result) => {
            if (err) reject(err);
            else resolve(result.toString());
          });
        } else {
          resolve(buffer.toString());
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// 解析HTML的函数
function parseHtml(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  let remainingKwh = null;
  const allText = document.body ? document.body.textContent : '';

  console.log('=== 解析过程开始 ===');
  console.log('HTML文本长度:', allText.length);
  
  // 1. 优先使用关键词匹配（最准确）
  console.log('\n1. 尝试使用正则匹配 "剩余电量: X kWh"');
  const remainingMatch = allText.match(/剩余电量:\s*(\d+\.?\d*)\s*kWh/i);
  if (remainingMatch) {
    console.log('匹配成功:', remainingMatch[0]);
    remainingKwh = parseFloat(remainingMatch[1]);
    console.log('提取的电量:', remainingKwh);
  } else {
    console.log('正则匹配失败');
    
    // 2. 备用：查找包含特定关键词的元素
    console.log('\n2. 尝试通过关键词搜索剩余电量...');
    const keywords = ['剩余电量', '剩余', '余额', '电量', 'kWh'];
    for (const keyword of keywords) {
      console.log(`   搜索关键词: "${keyword}"`);
      const elements = document.querySelectorAll('*');
      for (const element of elements) {
        const text = element.textContent.trim();
        if (text.includes(keyword)) {
          console.log(`   找到包含关键词的文本: "${text}"`);
          const match = text.match(/(\d+\.?\d*)/);
          if (match) {
            const num = parseFloat(match[1]);
            console.log(`   提取的数字: ${num}`);
            // 缩小合理范围，实际电量通常在0-100kWh之间
            if (num > 0 && num <= 100) {
              remainingKwh = num;
              console.log(`   确定为电量值: ${num}`);
              break;
            }
          }
        }
      }
      if (remainingKwh !== null) break;
    }
  }
  
  // 3. 最后才考虑数字规则（兜底）
  if (remainingKwh === null) {
    console.log('\n3. 尝试通过数字规则提取（兜底）');
    const numberMatches = allText.match(/\d+\.?\d*/g);
    console.log(`   找到数字匹配: ${numberMatches ? numberMatches.length : 0} 个`);
    
    if (numberMatches) {
      // 筛选出合理的电量值（缩小范围到0-100kWh）
      const validNumbers = numberMatches
        .map(num => parseFloat(num))
        .filter(num => num > 0 && num <= 100 && num.toString().includes('.'))
        .sort((a, b) => b - a); // 按降序排列，取最大值
      
      console.log(`   有效数字: ${validNumbers.length} 个`);
      console.log(`   有效数字列表: ${validNumbers.join(', ')}`);
      
      if (validNumbers.length > 0) {
        remainingKwh = validNumbers[0];
        console.log(`   取最大值作为电量: ${validNumbers[0]}`);
      }
    }
  }

  console.log('\n=== 解析过程结束 ===');
  if (remainingKwh !== null) {
    console.log('最终解析结果:', remainingKwh, 'kWh');
  } else {
    console.log('解析失败，无法找到剩余电量');
  }

  // 保存HTML到文件用于分析
  const fs = require('fs');
  fs.writeFileSync('test_html.html', html);
  console.log('\nHTML已保存到 test_html.html 文件');

  return remainingKwh;
}

// 主函数
async function main() {
  try {
    console.log(`正在获取 ${targetUrl} 的HTML内容...`);
    const html = await makeHttpRequest(targetUrl);
    console.log('获取HTML成功，长度:', html.length, '字符');
    
    console.log('\n开始解析剩余电量...');
    const remainingKwh = parseHtml(html);
    
    return remainingKwh;
  } catch (error) {
    console.error('错误:', error.message);
    return null;
  }
}

// 执行测试
main();
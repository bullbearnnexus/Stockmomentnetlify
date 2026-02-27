// quote.js — fetch Yahoo chart data server-side (no CORS issues)
// ?sym=TCS.NS&range=5d   → price data (fast)
// ?sym=TCS.NS            → full 1yr chart (EMA/RSI)
const https = require('https');

exports.handler = async (event) => {
  const p = event.queryStringParameters || {};
  if (!p.sym) return resp(400, JSON.stringify({ error: 'Need ?sym=' }));

  const sym   = p.sym.trim();
  const range = p.range || '1y';

  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}&includePrePost=false`;
      const body = await get(url);
      return resp(200, body);
    } catch (e) { /* try next host */ }
  }
  return resp(502, JSON.stringify({ error: 'Yahoo unavailable for ' + sym }));
};

function resp(code, body) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body
  };
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/'
      },
      timeout: 12000
    }, res => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(b));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

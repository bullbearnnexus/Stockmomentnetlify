// quote.js — Netlify serverless Yahoo Finance proxy
// Routes: /.netlify/functions/quote?sym=TCS.NS&range=3y
//         /.netlify/functions/quote?sym=^NSEI&range=3mo (Nifty index)
const https = require('https');

const HEADERS_OUT = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=900' // 15min browser cache
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS_OUT, body: '' };
  }

  const p = event.queryStringParameters || {};
  if (!p.sym) return resp(400, { error: 'Need ?sym=' });

  const sym      = decodeURIComponent(p.sym.trim());
  const range    = p.range  || '3y';
  const interval = p.interval || '1d';

  const errors = [];
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
        `?interval=${interval}&range=${range}&includePrePost=false`;
      const body = await get(url);
      // Validate it's actual data
      const json = JSON.parse(body);
      if (json.chart && json.chart.error) throw new Error(json.chart.error.description || 'Yahoo error');
      if (!json.chart?.result?.[0]) throw new Error('No result');
      return { statusCode: 200, headers: HEADERS_OUT, body };
    } catch (e) {
      errors.push(e.message);
    }
  }
  return resp(502, { error: 'Yahoo unavailable: ' + errors.join(' | ') });
};

function resp(code, obj) {
  return { statusCode: code, headers: HEADERS_OUT, body: JSON.stringify(obj) };
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com'
      },
      timeout: 20000
    }, res => {
      if (res.statusCode === 429) { reject(new Error('Rate limited (429)')); return; }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(b));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

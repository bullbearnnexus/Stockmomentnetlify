// netlify/functions/quote.js
// Handles two modes:
//   ?sym=TCS.NS        → single chart (1 year history, for EMA/RSI/sparkline)
//   ?syms=TCS.NS,INFY.NS,...  → bulk quote (prices for up to 100 symbols at once)

const https = require('https');

exports.handler = async function(event) {
  const p = event.queryStringParameters || {};

  // ── BULK QUOTE MODE ──
  if (p.syms) {
    const syms = p.syms.split(',').slice(0, 100).map(s => s.trim()).filter(Boolean);
    if (!syms.length) return err(400, 'No symbols');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms.map(encodeURIComponent).join(',')}&fields=shortName,longName,regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketVolume,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap`;
    try {
      const body = await get(url);
      return ok(body);
    } catch(e) {
      // try query2
      try {
        const body2 = await get(url.replace('query1','query2'));
        return ok(body2);
      } catch(e2) {
        return err(502, 'Yahoo bulk quote failed: ' + e2.message);
      }
    }
  }

  // ── SINGLE CHART MODE ──
  if (p.sym) {
    const sym = p.sym.trim();
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y&includePrePost=false`;
        const body = await get(url);
        return ok(body);
      } catch(e) { /* try next host */ }
    }
    return err(502, 'Yahoo chart failed for ' + p.sym);
  }

  return err(400, 'Provide ?sym= or ?syms=');
};

function ok(body) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=600'   // cache 10 min
    },
    body
  };
}

function err(code, msg) {
  return {
    statusCode: code,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: msg })
  };
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    }, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// netlify/functions/quote.js
// ?syms=TCS.NS,INFY.NS  → bulk prices via Yahoo v7 (with v8 fallback per symbol)
// ?sym=TCS.NS           → full 1yr chart for EMA/RSI

const https = require('https');

exports.handler = async function(event) {
  const p = event.queryStringParameters || {};

  // ── BULK QUOTE ──
  if (p.syms) {
    const syms = p.syms.split(',').slice(0, 100).map(s => s.trim()).filter(Boolean);
    if (!syms.length) return err(400, 'No symbols');

    // Try Yahoo v7 quote first (fastest — 1 request for all symbols)
    const v7url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms.map(encodeURIComponent).join(',')}&fields=shortName,longName,regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent,regularMarketVolume,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap&formatted=false&lang=en-US&region=US`;
    
    for (const host of ['query1', 'query2']) {
      try {
        const url = v7url.replace('query1', host);
        const body = await get(url);
        const json = JSON.parse(body);
        const results = json.quoteResponse && json.quoteResponse.result;
        if (results && results.length > 0) {
          return ok(body); // v7 worked
        }
      } catch(e) {}
    }

    // v7 returned empty — fall back to v8 chart per symbol (parallel, 5d range)
    const CONC = 15;
    const allResults = [];
    for (let i = 0; i < syms.length; i += CONC) {
      const batch = syms.slice(i, i + CONC);
      const fetched = await Promise.all(batch.map(sym => fetchV8Quote(sym)));
      allResults.push(...fetched.filter(Boolean));
    }
    return ok(JSON.stringify({ quoteResponse: { result: allResults, error: null } }));
  }

  // ── SINGLE CHART (1yr for EMA/RSI) ──
  if (p.sym) {
    for (const host of ['query1', 'query2']) {
      try {
        const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(p.sym.trim())}?interval=1d&range=1y&includePrePost=false`;
        const body = await get(url);
        return ok(body);
      } catch(e) {}
    }
    return err(502, 'Chart failed: ' + p.sym);
  }

  return err(400, 'Provide ?sym= or ?syms=');
};

async function fetchV8Quote(sym) {
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d&includePrePost=false`;
      const body = await get(url);
      const j = JSON.parse(body);
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (!res) continue;
      const meta = res.meta || {};
      const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
      const closes = (q.close || []).filter(v => v != null);
      const price = meta.regularMarketPrice || (closes.length ? closes[closes.length-1] : null);
      const prev  = meta.chartPreviousClose || (closes.length >= 2 ? closes[closes.length-2] : null);
      if (!price) continue;
      return {
        symbol: meta.symbol || sym,
        shortName: meta.shortName || meta.longName || sym,
        longName: meta.longName || meta.shortName || sym,
        regularMarketPrice: price,
        regularMarketPreviousClose: prev,
        regularMarketChangePercent: price && prev ? (price - prev) / prev * 100 : null,
        regularMarketVolume: meta.regularMarketVolume || null,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow || null,
        marketCap: meta.marketCap || null,
      };
    } catch(e) {}
  }
  return null;
}

function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'public,max-age=300' },
    body
  };
}
function err(code, msg) {
  return { statusCode: code, headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({error:msg}) };
}
function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/'
      },
      timeout: 10000
    }, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

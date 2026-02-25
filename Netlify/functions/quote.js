// netlify/functions/quote.js
// ?syms=TCS.NS,INFY.NS,...  → bulk prices (up to 100 symbols)
// ?sym=TCS.NS               → full 1-year chart (EMA/RSI/sparkline)

const https = require('https');

exports.handler = async function(event) {
  const p = event.queryStringParameters || {};

  // ── BULK QUOTE MODE ──
  if (p.syms) {
    const syms = p.syms.split(',').slice(0, 100).map(s => s.trim()).filter(Boolean);
    if (!syms.length) return errResp(400, 'No symbols');

    // Try v8 chart with 5d range for each symbol in parallel batches
    // v8 is reliable; v7 quoteResponse is deprecated/blocked by Yahoo
    const CONC = 10;
    const results = [];
    for (let i = 0; i < syms.length; i += CONC) {
      const batch = syms.slice(i, i + CONC);
      const fetched = await Promise.all(batch.map(sym => fetchQuote(sym)));
      results.push(...fetched);
    }
    const map = {};
    results.forEach(r => { if (r) map[r.symbol] = r; });
    return okResp(JSON.stringify({ quoteResponse: { result: results.filter(Boolean) } }));
  }

  // ── SINGLE CHART MODE ──
  if (p.sym) {
    const sym = p.sym.trim();
    for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      try {
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y&includePrePost=false`;
        const body = await get(url);
        return okResp(body);
      } catch(e) { /* try next */ }
    }
    return errResp(502, 'Chart failed for ' + p.sym);
  }

  return errResp(400, 'Provide ?sym= or ?syms=');
};

// Fetch a single symbol's quote using v8 chart (5d) — always works
async function fetchQuote(sym) {
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d&includePrePost=false`;
      const body = await get(url);
      const json = JSON.parse(body);
      const res = json.chart && json.chart.result && json.chart.result[0];
      if (!res) continue;
      const meta = res.meta || {};
      const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
      const closes = (q.close || []).filter(v => v != null);
      const prev = closes.length >= 2 ? closes[closes.length - 2] : meta.chartPreviousClose;
      const price = meta.regularMarketPrice || (closes.length ? closes[closes.length - 1] : null);
      const pch = price && prev ? (price - prev) / prev * 100 : null;
      return {
        symbol: meta.symbol || sym,
        shortName: meta.shortName || meta.longName || sym,
        longName: meta.longName || meta.shortName || sym,
        regularMarketPrice: price,
        regularMarketPreviousClose: prev,
        regularMarketChangePercent: pch,
        regularMarketVolume: meta.regularMarketVolume || (q.volume ? q.volume[q.volume.length - 1] : null),
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || (closes.length ? Math.max(...closes) : null),
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow || (closes.length ? Math.min(...closes) : null),
        marketCap: meta.marketCap || null,
      };
    } catch(e) { /* try next host */ }
  }
  return null; // symbol not found
}

function okResp(body) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    },
    body
  };
}
function errResp(code, msg) {
  return { statusCode: code, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: msg }) };
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
      timeout: 12000
    }, res => {
      if (res.statusCode === 429) { reject(new Error('Rate limited')); return; }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// StockPulse — Yahoo Finance proxy for Netlify Functions
// Handles 403/429 with rotated user agents and proper cookies
const https = require('https');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=900'
};

const UA = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0'
];

exports.handler = function(event, context, callback) {
  if (event.httpMethod === 'OPTIONS') {
    return callback(null, { statusCode: 200, headers: CORS, body: '' });
  }

  var p = event.queryStringParameters || {};
  if (!p.sym) {
    return callback(null, { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing ?sym=' }) });
  }

  var sym      = decodeURIComponent(p.sym.trim());
  var range    = p.range    || '3y';
  var interval = p.interval || '1d';
  var ua       = UA[Math.floor(Math.random() * UA.length)];

  tryFetch(['query1', 'query2'], 0, sym, range, interval, ua, callback);
};

function tryFetch(hosts, i, sym, range, interval, ua, callback) {
  if (i >= hosts.length) {
    return callback(null, {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Yahoo Finance unavailable after all attempts' })
    });
  }

  var url = 'https://' + hosts[i] + '.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(sym) +
    '?interval=' + interval + '&range=' + range + '&includePrePost=false';

  var req = https.get(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://finance.yahoo.com/',
      'Origin': 'https://finance.yahoo.com',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124"',
      'sec-ch-ua-mobile': '?0',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site'
    },
    timeout: 25000
  }, function(res) {
    if (res.statusCode === 429 || res.statusCode === 403) {
      // Rate limited — try next host
      res.resume();
      return tryFetch(hosts, i + 1, sym, range, interval, ua, callback);
    }
    if (res.statusCode !== 200) {
      res.resume();
      return tryFetch(hosts, i + 1, sym, range, interval, ua, callback);
    }

    // Handle gzip — Node https auto-handles if we set encoding right
    var body = '';
    res.setEncoding('utf8');
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
      try {
        var json = JSON.parse(body);
        if (json.chart && json.chart.error) {
          return callback(null, { statusCode: 404, headers: CORS, body: JSON.stringify({ error: json.chart.error.description || 'Not found' }) });
        }
        callback(null, { statusCode: 200, headers: CORS, body: body });
      } catch(e) {
        tryFetch(hosts, i + 1, sym, range, interval, ua, callback);
      }
    });
  });

  req.on('error', function() { tryFetch(hosts, i + 1, sym, range, interval, ua, callback); });
  req.on('timeout', function() { req.destroy(); tryFetch(hosts, i + 1, sym, range, interval, ua, callback); });
}

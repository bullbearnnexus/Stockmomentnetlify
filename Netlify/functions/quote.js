// StockPulse — Yahoo Finance proxy for Netlify Functions
// Usage: /.netlify/functions/quote?sym=TCS.NS&range=3y&interval=1d

const https = require('https');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=900'
};

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

  var tried = 0;
  var hosts = ['query1', 'query2'];

  function tryHost(i) {
    if (i >= hosts.length) {
      return callback(null, {
        statusCode: 502,
        headers: CORS,
        body: JSON.stringify({ error: 'Yahoo Finance unavailable after ' + tried + ' attempts' })
      });
    }

    var url = 'https://' + hosts[i] + '.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(sym) +
      '?interval=' + interval +
      '&range=' + range +
      '&includePrePost=false';

    var req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/'
      },
      timeout: 20000
    }, function(res) {
      if (res.statusCode !== 200) {
        tried++;
        return tryHost(i + 1);
      }
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try {
          var json = JSON.parse(body);
          if (json.chart && json.chart.error) {
            tried++;
            return tryHost(i + 1);
          }
          callback(null, { statusCode: 200, headers: CORS, body: body });
        } catch (e) {
          tried++;
          tryHost(i + 1);
        }
      });
    });

    req.on('error', function() { tried++; tryHost(i + 1); });
    req.on('timeout', function() { req.destroy(); tried++; tryHost(i + 1); });
  }

  tryHost(0);
};

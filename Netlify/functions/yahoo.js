// Netlify Function - Yahoo Finance Proxy
// File: netlify/functions/yahoo.js

exports.handler = async function(event) {
  const sym = event.queryStringParameters.sym;
  if (!sym) {
    return { statusCode: 400, body: 'Missing sym parameter' };
  }

  // Clean symbol (add .NS if needed)
  let ticker = sym.toUpperCase();
  if (!ticker.endsWith('.NS') && !ticker.endsWith('.BO')) ticker += '.NS';

  // Main chart data (2 years daily)
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=2y&interval=1d`;

  // All-time high (ATH) data
  const athUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5y&interval=1d`;

  try {
    // Fetch both in parallel
    const [chartRes, athRes] = await Promise.all([
      fetch(chartUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
      fetch(athUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    ]);

    const chartData = await chartRes.json();
    const athData = await athRes.json();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ chart: chartData, ath: athData })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

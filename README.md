# StockPulse — NSE/BSE Momentum Terminal

Live momentum screener for Indian stocks. Tracks EMAs, phases, volume patterns, and momentum signals.

## Deploy to Netlify

1. Fork/clone this repo to GitHub
2. Connect repo to Netlify (auto-detects `netlify.toml`)
3. Deploy — no env vars needed

## Features
- 1000+ stocks via Yahoo Finance (server-side proxy, no CORS)
- Daily + Weekly EMA conditions (20/50/100/200)
- Composite Momentum Score
- NR7, RS vs Nifty, 1M/3M/6M returns
- Volume dry-up detector
- Dark/Light theme, column visibility, sort persistence

## Local Dev
Open `index.html` directly — uses Netlify function URL automatically when deployed.
For local dev with proxy: `npx netlify dev`

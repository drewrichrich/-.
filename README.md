# Pump Scanner

Next.js app that scans pump.fun and DexScreener every 20 seconds and ranks Solana memecoins for short-term (about 15 minute) trades.

## Deploy
1. Push this folder to a GitHub repo.
2. On vercel.com choose Add New Project, import the repo, and deploy. No configuration is required.
3. Optional environment variables (see `.env.example`): `SOLANA_RPC_URL` for reliable holder checks.

Run locally: `npm install && npm run dev`.

## How it works
- Feeds: pump.fun (new launches, latest trades, near graduation) plus DexScreener (boosts, new profiles, pumpswap search). If a feed is blocked, the rest still work and the page lists which feeds are down.
- Each coin is scored 0-100: momentum (25), volume acceleration (20), buy pressure (20), liquidity and market cap health (15), age (10), graduation proximity (10), minus penalties for dumping, sell-heavy flow, thin liquidity, dead trading, late parabolic entries, and concentrated holders.
- Top-10 holder share is checked for the 12 best candidates (the largest account, usually the curve or pool, is excluded).
- Tune weights in `lib/score.js` and the take-profit / stop / time-stop defaults in `PLAN`.

Scores are heuristics, not predictions. Not financial advice.

## Auto trader
Creates a dedicated trading wallet in the browser (key stored in localStorage, never sent to a server). Buys the top coin scoring at least the minimum score, then sells at take profit, stop loss, or time stop. Trades are built by PumpPortal and signed locally. Exits run only while the tab is open. Auto-trading always starts OFF after a reload and pauses after 3 losing trades in a row.

## Paper trading
`app/Paper.js` simulates trades with no money: every coin scoring at least the minimum is logged, then exited by take profit, stop, or time stop with assumed slippage and fees (a coin with no price for 5 minutes is booked as -90%). Results are grouped by score bucket, coin type and exit reason, with a win-rate confidence range and a first-half versus second-half check. Data lives in browser localStorage; use Download CSV to keep it.

## Ranking v2
Only coins whose pool is under 4 hours old are scored (`MAX_AGE_MIN` to change). New-coin discovery uses GeckoTerminal new and 5-minute trending pools alongside pump.fun and DexScreener. Weights: freshness 20, momentum 22 (early breakout, penalizes late chases), volume acceleration 16, buy pressure 16, holder concentration 16, liquidity and market cap 10, graduation proximity 6. The live trader requires verified holders.

## Live engine (app/engine.js)
Opens one WebSocket to PumpPortal (free, no key) and follows every new pump.fun coin from its first trade. Holders, unique buyers, creator holdings, net SOL flow and price moves over 15s/60s are computed locally, so no RPC and no polling delay. Heat score weights: velocity 28, buying surge 24, SOL flow 14, holder distribution 14, creator safety 10, structure 10. Paper trading and the live trader both read prices from this stream and check exits every 500ms. Use one browser tab only.

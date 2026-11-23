const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const ramp = (x, a, b) => clamp((x - a) / (b - a));
// 0 outside (lo, hi), rises to 1 at pLo, stays 1 until pHi, falls back to 0 at hi
const sweet = (x, lo, pLo, pHi, hi) =>
  x <= lo || x >= hi ? 0 : x < pLo ? (x - lo) / (pLo - lo) : x <= pHi ? 1 : (hi - x) / (hi - pHi);

// Default exit plan shown with every pick. Adjust to your own risk tolerance.
export const PLAN = { takeProfit: 25, stopLoss: -12, timeStopMin: 8 };

export function scorePair(p, x = {}) {
  const t5 = p.txns?.m5 || { buys: 0, sells: 0 };
  const v5 = p.volume?.m5 || 0, v1 = p.volume?.h1 || 0;
  const c5 = p.priceChange?.m5 ?? 0, c1 = p.priceChange?.h1 ?? 0;
  const liq = p.liquidity?.usd || 0;
  const mc = p.marketCap || p.fdv || 0;
  const age = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 60000 : null;
  const n5 = t5.buys + t5.sells;
  const buyRatio = n5 ? t5.buys / n5 : 0;
  const curve = p.dexId === 'pumpfun';
  const progress = curve ? (x.progress ?? clamp(mc / 69000)) : 1;
  const good = [], bad = [];

  const fresh = age == null ? 0 : sweet(age, 2, 5, 45, 240);
  const momentum = 0.65 * sweet(c5, 0, 4, 20, 60) + 0.35 * sweet(c1, 0, 8, 60, 180); // early breakout, not a late chase
  const accel = v5 / Math.max(v1 / 12, 1);
  const volume = 0.5 * sweet(accel, 0.8, 1.5, 4, 12) + 0.5 * ramp(v5, 300, 5000);
  const pressure = 0.6 * sweet(buyRatio, 0.45, 0.58, 0.8, 0.97) + 0.4 * ramp(n5, 8, 60);
  const holders = x.top10 == null ? 0.2 : sweet(x.top10, -1, 0, 22, 55);
  const health = 0.4 * ramp(liq, 4000, 30000) + 0.6 * sweet(mc, 8000, 20000, 120000, 600000);
  const grad = curve ? sweet(progress, 0.5, 0.7, 0.95, 1.01) : 0;

  let s = 20 * fresh + 22 * momentum + 16 * volume + 16 * pressure + 16 * holders + 10 * health + 6 * grad;

  if (age != null && age <= 45) good.push(`Fresh, only ${Math.round(age)}m old`);
  if (c5 >= 4 && c5 <= 20) good.push(`+${c5.toFixed(1)}% in 5m, early momentum`);
  if (accel >= 1.5 && v5 > 300) good.push(`5m volume at ${accel.toFixed(1)}x its hourly pace`);
  if (buyRatio >= 0.55 && n5 >= 12) good.push(`${Math.round(buyRatio * 100)}% buys over ${n5} trades (5m)`);
  if (curve && progress >= 0.7) good.push(`${Math.round(progress * 100)}% of the way to graduation`);
  if (x.top10 != null && x.top10 < 22) good.push(`Top-10 holders own only ${x.top10.toFixed(0)}%`);

  if (x.top10 == null) bad.push('Holders not verified');
  if (c5 < -5) { s -= 15; bad.push(`Dropping fast (${c5.toFixed(1)}% in 5m)`); }
  if (c5 > 50) { s -= 10; bad.push(`Already ran ${c5.toFixed(0)}% in 5m, late entry`); }
  if (c1 > 150) { s -= 15; bad.push(`Up ${c1.toFixed(0)}% in the last hour, likely extended`); }
  if (n5 >= 8 && buyRatio < 0.45) { s -= 15; bad.push(`Sellers dominate (${Math.round((1 - buyRatio) * 100)}% sells)`); }
  if (liq < 4000) { s -= 20; bad.push('Thin liquidity, exits will slip'); }
  else if (mc > 0 && liq / mc < 0.1) { s -= 8; bad.push('Liquidity is small next to market cap'); }
  if (n5 < 8) { s -= 15; bad.push('Too little trading in the last 5m'); }
  if (age != null && age < 2) { s -= 10; bad.push('Under 2 minutes old'); }
  if (x.top10 != null && x.top10 > 35) { s -= x.top10 > 50 ? 25 : 12; bad.push(`Top-10 holders own ${x.top10.toFixed(0)}%`); }

  const score = Math.round(clamp(s, 0, 100));
  return {
    score,
    grade: score >= 75 ? 'A' : score >= 62 ? 'B' : score >= 50 ? 'C' : 'D',
    tag: curve ? (progress >= 0.6 ? 'NEAR GRADUATION' : 'BONDING CURVE') : 'GRADUATED',
    progress: curve ? progress : null,
    good, bad,
  };
}

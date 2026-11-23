// Real-time pump.fun engine. One WebSocket to PumpPortal (free, no key) tracks every new coin from its first trade,
// so holders, buyers and price moves are computed here with no RPC and no polling delay.
const sweet = (x, lo, pLo, pHi, hi) => (x <= lo || x >= hi ? 0 : x < pLo ? (x - lo) / (pLo - lo) : x <= pHi ? 1 : (hi - x) / (hi - pHi));
const ramp = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));

const T = new Map(); // mint -> token state
let ws = null, cb = null, msgs = 0, rate = 0, status = 'connecting', started = false, n = 0;
const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

function connect() {
  const sock = new WebSocket('wss://pumpportal.fun/api/data');
  ws = sock;
  sock.onopen = () => {
    status = 'live';
    send({ method: 'subscribeNewToken' });
    const k = [...T.keys()];
    for (let i = 0; i < k.length; i += 100) send({ method: 'subscribeTokenTrade', keys: k.slice(i, i + 100) });
  };
  sock.onmessage = (e) => onMsg(e.data);
  sock.onclose = () => { if (ws !== sock) return; status = 'reconnecting'; setTimeout(() => started && ws === sock && connect(), 2000); };
  sock.onerror = () => sock.close();
}

function onMsg(raw) {
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m.mint || !m.txType) return;
  msgs++;
  const now = Date.now(), mc = Number(m.marketCapSol);
  if (m.txType === 'create') {
    if (T.has(m.mint) || !(mc > 0)) return;
    const t = { mint: m.mint, sym: m.symbol || '?', name: m.name || '', born: now, creator: m.traderPublicKey, mc, peak: mc, last: now,
      hist: [[now, mc]], ev: [], bal: new Map(), devSold: false, pin: 0 };
    if (Number(m.initialBuy) > 0) t.bal.set(m.traderPublicKey, Number(m.initialBuy));
    T.set(m.mint, t);
    send({ method: 'subscribeTokenTrade', keys: [m.mint] });
    return;
  }
  const t = T.get(m.mint);
  if (!t || !(mc > 0) || (m.txType !== 'buy' && m.txType !== 'sell')) return;
  const buy = m.txType === 'buy';
  t.mc = mc; t.last = now; t.peak = Math.max(t.peak, mc);
  t.hist.push([now, mc]); t.ev.push([now, buy ? 1 : -1, Number(m.solAmount) || 0, m.traderPublicKey]);
  if (m.newTokenBalance != null) t.bal.set(m.traderPublicKey, Number(m.newTokenBalance));
  if (!buy && m.traderPublicKey === t.creator) t.devSold = true;
  const cut = now - 90000;
  while (t.ev.length && t.ev[0][0] < cut) t.ev.shift();
  while (t.hist.length > 2 && t.hist[1][0] < cut) t.hist.shift();
}

function snap(t, now) {
  if (now - t.last > 60000) return null;
  const age = (now - t.born) / 1000;
  const at = (s) => { let v = t.hist[0][1]; for (const [ts, p] of t.hist) { if (ts <= now - s * 1000) v = p; else break; } return v; };
  const c15 = (t.mc / at(15) - 1) * 100, c60 = (t.mc / at(60) - 1) * 100;
  let b15 = 0, s15 = 0, b60 = 0, s60 = 0, bs = 0, ss = 0; const ub = new Set();
  for (const [ts, side, sol, who] of t.ev) {
    const d = now - ts;
    if (d <= 60000) side > 0 ? b60++ : s60++;
    if (d <= 15000) side > 0 ? b15++ : s15++;
    if (d <= 30000) { if (side > 0) { bs += sol; ub.add(who); } else ss += sol; }
  }
  if (b60 + s60 < 5) return null;
  const bals = [...t.bal.values()].filter((v) => v > 0).sort((a, b) => b - a);
  const sc = (bals[0] || 0) > 1.5e9 ? 1e6 : 1;
  const holders = bals.length, top10 = (bals.slice(0, 10).reduce((s, v) => s + v, 0) / sc / 1e9) * 100;
  const dev = ((t.bal.get(t.creator) || 0) / sc / 1e9) * 100;
  const accel = b15 / Math.max(b60 / 4, 1), flow = bs + ss ? bs / (bs + ss) : 0, net = bs - ss;
  const dd = (t.peak - t.mc) / t.peak;

  let s = 28 * (0.6 * sweet(c15, 0, 3, 18, 60) + 0.4 * sweet(c60, 2, 8, 45, 150))
    + 24 * (0.5 * sweet(accel, 0.9, 1.4, 4, 10) + 0.5 * ramp(ub.size, 3, 12))
    + 14 * (0.6 * sweet(flow, 0.5, 0.7, 0.95, 1.01) + 0.4 * ramp(net, 0.5, 6))
    + 14 * (0.5 * ramp(holders, 8, 40) + 0.5 * sweet(top10, -1, 0, 30, 60))
    + 10 * (0.5 * (t.devSold ? 0 : 1) + 0.5 * sweet(dev, -1, 0, 8, 25))
    + 10 * (0.5 * sweet(t.mc, 25, 30, 150, 400) + 0.5 * (1 - ramp(dd, 0.05, 0.25)));
  const good = [], bad = [];
  if (c15 >= 3 && c15 <= 18) good.push(`+${c15.toFixed(0)}% in 15s, early move`);
  if (accel >= 1.4 && b15 >= 3) good.push(`Buying is speeding up (${b15} buys in 15s)`);
  if (ub.size >= 8) good.push(`${ub.size} different buyers in 30s`);
  if (flow >= 0.7 && net > 1) good.push(`${Math.round(flow * 100)}% of SOL flow is buying`);
  if (holders >= 25 && top10 < 30) good.push(`${holders} holders, top 10 own ${top10.toFixed(0)}%`);
  if (s15 > b15) { s -= 12; bad.push('More sells than buys in the last 15s'); }
  if (c15 < -4) { s -= 15; bad.push(`Falling (${c15.toFixed(0)}% in 15s)`); }
  if (top10 > 50) { s -= 20; bad.push(`Top 10 holders own ${top10.toFixed(0)}%`); }
  if (t.devSold) { s -= 20; bad.push('Creator has sold'); }
  if (holders < 6) { s -= 10; bad.push('Very few holders'); }
  if (t.mc > 400) { s -= 10; bad.push('Market cap already high, late'); }
  if (dd > 0.25) { s -= 10; bad.push(`Down ${(dd * 100).toFixed(0)}% from its peak`); }
  if (age < 15) s *= 0.5;
  if (age > 600) s *= 0.6;
  const score = Math.round(Math.max(0, Math.min(100, s)));
  return { mint: t.mint, symbol: t.sym, name: t.name, score, tag: age < 60 ? 'under 1m' : age < 180 ? '1-3m' : age < 600 ? '3-10m' : '10m+',
    price: t.mc, mc: t.mc, age: Math.round(age), c15, c60, buys: b60, sells: s60, uniq: ub.size, net, holders, top10, dev, good, bad };
}

function sweep(now) {
  const drop = [];
  for (const [k, t] of T) {
    if (now - t.pin < 15000) continue;
    const age = (now - t.born) / 1000, idle = (now - t.last) / 1000;
    if (age > 1500 || (age > 120 && idle > 90)) drop.push(k);
  }
  if (T.size - drop.length > 800) [...T.values()].sort((a, b) => a.born - b.born).slice(0, T.size - drop.length - 800).forEach((t) => drop.push(t.mint));
  drop.forEach((k) => T.delete(k));
  for (let i = 0; i < drop.length; i += 100) send({ method: 'unsubscribeTokenTrade', keys: drop.slice(i, i + 100) });
}

function tick() {
  const now = Date.now();
  if (++n % 5 === 0) sweep(now);
  rate = msgs; msgs = 0;
  const rows = [];
  for (const t of T.values()) { const r = snap(t, now); if (r && r.score > 0) rows.push(r); }
  rows.sort((a, b) => b.score - a.score || b.c15 - a.c15);
  cb && cb(rows.slice(0, 40), { status, tracked: T.size, rate }, now);
}

// Latest price (market cap in SOL) for coins we hold. Calling this also keeps them from being evicted.
export function prices(mints) {
  const o = {};
  for (const m of mints) { const t = T.get(m); if (t) { t.pin = Date.now(); o[m] = { price: t.mc, last: t.last }; } }
  return o;
}

export function start(onTick) {
  cb = onTick; started = true;
  if (!ws) connect();
  const id = setInterval(tick, 1000);
  return () => { clearInterval(id); started = false; const s = ws; ws = null; s && s.close(); };
}

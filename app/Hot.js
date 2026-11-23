'use client';
const pct = (n) => `${n > 0 ? '+' : ''}${n.toFixed(0)}%`;
const grade = (s) => (s >= 75 ? 'A' : s >= 62 ? 'B' : s >= 50 ? 'C' : 'D');

export default function Hot({ rows, st }) {
  return (
    <section className="bot">
      <h2>Hot right now</h2>
      <p className="meta">{st.status === 'live' ? `Live from pump.fun. Watching ${st.tracked} coins from their first trade, ${st.rate} events per second.` : `Stream ${st.status}…`} Scores refresh every second.</p>
      {!rows.length && <p className="meta">Waiting for coins with enough activity.</p>}
      {rows.slice(0, 10).map((c, i) => (
        <article key={c.mint}>
          <div className={`score g${grade(c.score)}`}><b>{c.score}</b></div>
          <div className="body">
            <h2>{i + 1}. {c.symbol} <small>{c.name}</small></h2>
            <p className="tag">{c.age}s old</p>
            <dl>
              <div><dt>Move 15s</dt><dd className={c.c15 >= 0 ? 'up' : 'dn'}>{pct(c.c15)}</dd></div>
              <div><dt>Move 60s</dt><dd className={c.c60 >= 0 ? 'up' : 'dn'}>{pct(c.c60)}</dd></div>
              <div><dt>Buys / sells 60s</dt><dd>{c.buys} / {c.sells}</dd></div>
              <div><dt>Buyers 30s</dt><dd>{c.uniq}</dd></div>
              <div><dt>Net SOL 30s</dt><dd>{c.net.toFixed(1)}</dd></div>
              <div><dt>Holders</dt><dd>{c.holders}</dd></div>
              <div><dt>Top-10 own</dt><dd>{c.top10.toFixed(0)}%</dd></div>
              <div><dt>Creator holds</dt><dd>{c.dev.toFixed(0)}%</dd></div>
              <div><dt>Market cap</dt><dd>{c.mc.toFixed(0)} SOL</dd></div>
            </dl>
            <ul>{c.good.map((t) => <li key={t} className="up">{t}</li>)}{c.bad.map((t) => <li key={t} className="dn">{t}</li>)}</ul>
            <p className="links">
              <a href={`https://pump.fun/coin/${c.mint}`} target="_blank" rel="noreferrer">pump.fun</a>
              <button onClick={() => navigator.clipboard?.writeText(c.mint)}>Copy address</button>
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}

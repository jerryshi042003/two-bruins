// UCLA player dashboards — renders per-player panels from dashboard-data.json.
// Vanilla JS, no dependencies. Every value is a count or a rate over counts.

const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

let DATA = null, ENRICH = {}, gender = 'men', current = {};
const enr = (p) => ENRICH[`${gender}::${p.name}`] || {};

Promise.all([
  fetch('dashboard-data.json').then(r => r.json()),
  fetch('player_enrich.json').then(r => r.json()).catch(() => ({})),
]).then(([d, e]) => {
  DATA = d; ENRICH = e || {};
  const totals = ['men', 'women'].reduce((a, g) => {
    a.players += d[g].length; a.pts += d[g].reduce((s, p) => s + p.points, 0); return a;
  }, { players: 0, pts: 0 });
  document.getElementById('footTotals').textContent =
    `${totals.players} PLAYERS · ${totals.pts.toLocaleString()} POINTS`;
  document.getElementById('coverageNote').innerHTML =
    `Tracked players with match data: <strong>${d.men.length} men</strong> ` +
    `(${d.men.map(p => p.name).join(', ')}) and <strong>${d.women.length} women</strong> ` +
    `(${d.women.map(p => p.name).join(', ')}). Players without a pushed export are not shown — ` +
    `nothing here is estimated.`;

  document.querySelectorAll('.gTab').forEach(b => b.addEventListener('click', () => {
    gender = b.dataset.g;
    document.querySelectorAll('.gTab').forEach(x => x.classList.toggle('on', x === b));
    renderTabs();
  }));
  renderTabs();
});

function renderTabs() {
  const wrap = document.getElementById('playerTabs');
  wrap.innerHTML = '';
  DATA[gender].forEach((p, i) => {
    const b = el('button', 'pTab' + (gender === 'women' ? ' w' : ''),
      `${p.name}<small>${p.matchesTracked} match${p.matchesTracked > 1 ? 'es' : ''} · ${p.points} pts</small>`);
    b.addEventListener('click', () => { current[gender] = i; select(); });
    wrap.appendChild(b);
  });
  if (current[gender] == null) current[gender] = 0;
  renderLeaderboard();
  select();
}

function renderLeaderboard() {
  const wrap = document.getElementById('teamBoard');
  wrap.innerHTML = '';
  const list = DATA[gender].slice().sort((a, b) => (b.winPct || 0) - (a.winPct || 0));
  wrap.appendChild(el('div', 'tbHead',
    `TEAM OVERVIEW · ${gender === 'men' ? "MEN'S" : "WOMEN'S"} · ${list.length} PLAYERS · SORTED BY POINTS WON`));
  const table = el('div', 'tbTable' + (gender === 'women' ? ' w' : ''));
  const head = el('div', 'tbRow tbColHead');
  head.innerHTML = '<span>PLAYER</span><span>M</span><span>PTS</span><span>WIN%</span><span>1ST IN</span><span>BP CONV</span><span>W : E</span>';
  table.appendChild(head);
  list.forEach(p => {
    const r = el('div', 'tbRow');
    r.innerHTML =
      `<span class="tbP">${p.name}</span>` +
      `<span>${p.matchesTracked}</span>` +
      `<span>${p.points}</span>` +
      `<span class="tbV">${pct(p.winPct)}</span>` +
      `<span>${pct(p.firstInPct)}</span>` +
      `<span>${p.bp && p.bp.convPct != null ? pct(p.bp.convPct) : '—'}</span>` +
      `<span class="tbWE">${p.winTotal}:${p.errTotal}</span>`;
    r.addEventListener('click', () => {
      current[gender] = DATA[gender].indexOf(p);
      select();
      document.getElementById('playerPanel').scrollIntoView({ block: 'start' });
    });
    table.appendChild(r);
  });
  wrap.appendChild(table);
}

function select() {
  document.querySelectorAll('#playerTabs .pTab').forEach((b, i) =>
    b.classList.toggle('on', i === current[gender]));
  renderPanel(DATA[gender][current[gender]]);
}

function renderPanel(p) {
  const panel = document.getElementById('playerPanel');
  panel.innerHTML = '';

  const e = enr(p);
  // header
  const head = el('div', 'pHead');
  head.appendChild(el('h2', null, p.name));
  const utrTag = e.playerUtr ? `UTR ${e.playerUtr.toFixed(1)}` : 'UTR n/a';
  const sos = e.sos && e.sos.avgOppUtr ? ` · OPP AVG ${e.sos.avgOppUtr.toFixed(1)}` : '';
  head.appendChild(el('div', 'pMeta',
    `${utrTag}${sos}<br>${p.matchesTracked} MATCH${p.matchesTracked > 1 ? 'ES' : ''} · ${p.points.toLocaleString()} POINTS`));
  panel.appendChild(head);

  // KPI row
  const kpis = el('div', 'kpis');
  const bp = p.bp || {};
  const K = [
    ['v', pct(p.winPct), 'POINTS WON', `${p.ptsWon} of ${p.points}`],
    ['v', pct(p.firstInPct), '1ST SERVE IN', `${p.servePts} service pts`],
    ['v', bp.convN ? `${bp.conv}/${bp.convN}` : '—', 'BREAK PTS WON', bp.convPct != null ? pct(bp.convPct) + ' converted' : 'as returner'],
    ['v', String(p.aces) + ' / ' + String(p.df), 'ACES / DOUBLES', `${p.servePts} serves`],
  ];
  K.forEach(([, v, l, s]) => {
    const k = el('div', 'kpi');
    k.appendChild(el('div', 'v', v)); k.appendChild(el('div', 'l', l)); k.appendChild(el('div', 's', s));
    kpis.appendChild(k);
  });
  panel.appendChild(kpis);

  // ---- LEAD: how they win/lose, level & schedule, what's working ----
  panel.appendChild(signatureBlock(p, e));
  panel.appendChild(levelBlock(p, e));
  panel.appendChild(effectivenessBlock(p));

  // serve placement + rally (two columns)
  const grid1 = el('div', 'dgrid');
  grid1.appendChild(servePlacementBlock(p));
  grid1.appendChild(rallyBlock(p));
  const b1 = el('div', 'dblock'); b1.appendChild(grid1);
  panel.appendChild(b1);

  // shot-making
  panel.appendChild(shotMakingBlock(p));

  // break points + return
  const grid2 = el('div', 'dgrid');
  grid2.appendChild(bpBlock(p));
  grid2.appendChild(returnBlock(p));
  const b2 = el('div', 'dblock'); b2.appendChild(grid2);
  panel.appendChild(b2);

  // matches list (with YouTube where available)
  panel.appendChild(matchesBlock(p));
}

const pctI = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const C = { blue: '#2d68c4', gold: '#f2a900', win: '#1c8c4a', loss: '#d1372f', bg: '#e7edf7', ink: '#111', muted: '#666' };

function splitBar(aPct, aLabel, bPct, bLabel, aColor) {
  const wrap = el('div'); wrap.style.marginTop = '10px';
  const bar = el('div', 'sigSplit');
  const ai = el('i'); ai.style.width = Math.round(aPct * 100) + '%'; ai.style.background = aColor || C.blue;
  const bi = el('i'); bi.style.width = Math.round(bPct * 100) + '%'; bi.style.background = C.bg;
  bar.appendChild(ai); bar.appendChild(bi); wrap.appendChild(bar);
  const cap = el('div', 'sigCap');
  cap.innerHTML = `<span>${pctI(aPct)} ${aLabel}</span><span>${pctI(bPct)} ${bLabel}</span>`;
  wrap.appendChild(cap); return wrap;
}

function signatureBlock(p, e) {
  const b = block('THE SIGNATURE', `How ${p.name.split(' ')[0]} wins — and how they lose`);
  if (!e.winSig || !e.winSig.n) { b.appendChild(el('p', 'naNote', 'Not enough decided points to read a pattern yet.')); return b; }
  const ws = e.winSig, ls = e.lossSig;
  const grid = el('div', 'sigGrid');
  const win = el('div', 'sigCard');
  win.appendChild(el('div', 'sigK win', 'HOW THEY WIN'));
  win.appendChild(el('div', 'sigT', ws.oppErrorPct >= ws.ownWinnerPct
    ? `Mostly on <b>opponent errors</b> — ${pctI(ws.oppErrorPct)} of won points. Only ${pctI(ws.ownWinnerPct)} end on a winner of their own: a pressure game, not a highlight reel.`
    : `On their own <b>${ws.topWing || 'shotmaking'}</b> — ${pctI(ws.ownWinnerPct)} of won points are their winner. An aggressive, first-strike game.`));
  win.appendChild(splitBar(ws.ownWinnerPct, 'own winners', ws.oppErrorPct, 'forced errors', C.blue));
  grid.appendChild(win);
  const loss = el('div', 'sigCard');
  loss.appendChild(el('div', 'sigK loss', 'HOW THEY LOSE'));
  loss.appendChild(el('div', 'sigT', `Mostly on their own <b>${ls.topWing || 'errors'}</b> — ${pctI(ls.ownErrorPct)} of lost points are unforced errors. ${pctI(ls.oppWinnerPct)} are the opponent hitting through them.`));
  loss.appendChild(splitBar(ls.ownErrorPct, `own ${ls.topWing || 'errors'}`, ls.oppWinnerPct, 'opp winners', C.loss));
  grid.appendChild(loss);
  b.appendChild(grid);
  return b;
}

function levelBlock(p, e) {
  const b = block('LEVEL & SCHEDULE', 'Who they played, and how it went');
  const rated = (e.trend || []).filter(t => t.oppUtr);
  if (!e.playerUtr && !rated.length) { b.appendChild(el('p', 'naNote', 'Opponent UTR unavailable for this player’s matches.')); return b; }
  const W = 700, H = 150, m = { l: 20, r: 20, t: 30, b: 34 };
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'd3svg');
  const utrs = rated.map(t => t.oppUtr).concat(e.playerUtr ? [e.playerUtr] : []);
  const lo = Math.floor(Math.min(...utrs) - 0.5), hi = Math.ceil(Math.max(...utrs) + 0.5);
  const x = d3.scaleLinear().domain([lo, hi]).range([m.l, W - m.r]);
  const g = svg.append('g');
  // axis
  g.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', H - m.b).attr('y2', H - m.b).attr('stroke', '#ccc');
  x.ticks(Math.min(8, hi - lo)).forEach(t => {
    g.append('text').attr('x', x(t)).attr('y', H - m.b + 18).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', C.muted).text(t);
  });
  g.append('text').attr('x', W - m.r).attr('y', H - 4).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', C.muted).text('OPPONENT UTR →');
  // player marker
  if (e.playerUtr) {
    g.append('line').attr('x1', x(e.playerUtr)).attr('x2', x(e.playerUtr)).attr('y1', m.t - 10).attr('y2', H - m.b).attr('stroke', C.ink).attr('stroke-dasharray', '3 3');
    g.append('text').attr('x', x(e.playerUtr)).attr('y', m.t - 14).attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 700).attr('fill', C.ink).text(`${p.name.split(' ')[0]} ${e.playerUtr.toFixed(1)}`);
  }
  // opponent dots (win = green if won majority of points that match)
  const yBase = (m.t + H - m.b) / 2;
  rated.forEach((t, i) => {
    const won = t.winPct != null && t.winPct > 0.5;
    g.append('circle').attr('cx', x(t.oppUtr)).attr('cy', yBase + (i % 2 ? 12 : -12))
      .attr('r', 7).attr('fill', won ? C.win : C.loss).attr('fill-opacity', 0.85)
      .append('title').text(`${t.opp || 'opp'} · UTR ${t.oppUtr} · ${pctI(t.winPct)} pts won${t.date ? ' · ' + t.date : ''}`);
  });
  b.appendChild(svg.node());
  // legend + record vs stronger/weaker
  const s = e.sos || {};
  const vs = (a) => a && (a[0] + a[1]) ? `${Math.round(100 * a[0] / (a[0] + a[1]))}% pts (${a[0]}–${a[1]})` : 'n/a';
  b.appendChild(el('div', 'd3legend',
    `<span><i style="background:${C.win}"></i>won the match</span><span><i style="background:${C.loss}"></i>lost</span>`));
  b.appendChild(el('p', 'dnote',
    `Avg opponent UTR <b>${s.avgOppUtr || 'n/a'}</b> vs their own <b>${e.playerUtr ? e.playerUtr.toFixed(1) : 'n/a'}</b>. ` +
    `Against opponents rated at or above them: ${vs(s.vsStronger)}; against lower-rated: ${vs(s.vsWeaker)}. ` +
    `UTR is current (${new Date().getFullYear()}); most matches are 2024, so read it as an approximate level, not point-in-time.`));
  return b;
}

function effectivenessBlock(p) {
  const b = block("WHAT'S WORKING", 'Not what they do most — what actually wins');
  const cells = (p.placement || []).filter(c => c.n >= 4 && c.wonPct != null);
  if (cells.length < 2) { b.appendChild(el('p', 'naNote', 'Not enough serve volume to compare.')); return b; }
  const total = cells.reduce((s, c) => s + c.n, 0);
  cells.forEach(c => c.freq = c.n / total);
  const W = 700, H = 300, m = { l: 48, r: 20, t: 20, b: 44 };
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'd3svg');
  const x = d3.scaleLinear().domain([0, Math.max(0.35, d3.max(cells, c => c.freq) * 1.15)]).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([Math.min(0.3, d3.min(cells, c => c.wonPct) - 0.05), Math.max(0.8, d3.max(cells, c => c.wonPct) + 0.05)]).range([H - m.b, m.t]);
  const g = svg.append('g');
  // 50% reference
  g.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0.5)).attr('y2', y(0.5)).attr('stroke', '#bbb').attr('stroke-dasharray', '4 4');
  g.append('text').attr('x', W - m.r).attr('y', y(0.5) - 5).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', C.muted).text('break-even 50%');
  // axes labels
  g.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', C.muted).text('HOW OFTEN USED →');
  g.append('text').attr('transform', `rotate(-90)`).attr('x', -(m.t + H - m.b) / 2).attr('y', 14).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', C.muted).text('WIN % →');
  x.ticks(5).forEach(t => g.append('text').attr('x', x(t)).attr('y', H - m.b + 16).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', C.muted).text(Math.round(t * 100) + '%'));
  y.ticks(4).forEach(t => g.append('text').attr('x', m.l - 8).attr('y', y(t) + 4).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', C.muted).text(Math.round(t * 100) + '%'));
  cells.forEach(c => {
    const eff = c.wonPct >= 0.5;
    g.append('circle').attr('cx', x(c.freq)).attr('cy', y(c.wonPct)).attr('r', 6 + Math.sqrt(c.n)).attr('fill', eff ? C.blue : C.gold).attr('fill-opacity', 0.35).attr('stroke', eff ? C.blue : C.gold);
    g.append('text').attr('x', x(c.freq)).attr('y', y(c.wonPct) - 6 - Math.sqrt(c.n)).attr('text-anchor', 'middle').attr('font-size', 11).attr('font-weight', 700).attr('fill', C.ink).text(`${c.side[0]}·${c.spot}`);
  });
  b.appendChild(svg.node());
  const best = cells.slice().sort((a, c) => c.wonPct - a.wonPct)[0];
  const most = cells.slice().sort((a, c) => c.freq - a.freq)[0];
  b.appendChild(el('p', 'dnote',
    `Each dot is a serve target; size is how many went there. Their most effective serve: <b>${best.side} ${best.spot}</b>, ${pctI(best.wonPct)} won. ` +
    `Their most-used: <b>${most.side} ${most.spot}</b> at ${pctI(most.freq)} of serves, winning ${pctI(most.wonPct)}. ` +
    (most.wonPct < best.wonPct - 0.08 ? `The habit isn’t the payoff — there’s a better target being under-used.` : `Their go-to is also their best — keep feeding it.`)));
  return b;
}

function bpBlock(p) {
  const b = block('BREAK POINTS', 'The moments that decide sets');
  const bp = p.bp || {};
  const pair = el('div', 'pairStat');
  const items = [
    [bp.convN ? `${bp.conv} / ${bp.convN}` : '—', 'CONVERTED (RETURNING)', bp.convPct],
    [bp.saveN ? `${bp.saved} / ${bp.saveN}` : '—', 'SAVED (SERVING)', bp.savePct],
  ];
  items.forEach(([v, l]) => {
    const ps = el('div', 'ps'); ps.appendChild(el('div', 'v', v)); ps.appendChild(el('div', 'l', l)); pair.appendChild(ps);
  });
  b.appendChild(pair);
  const cv = bp.convPct != null ? pct(bp.convPct) : '—', sv = bp.savePct != null ? pct(bp.savePct) : '—';
  b.appendChild(el('p', 'dnote', `Converts ${cv} of the break points earned and saves ${sv} of those faced.`));
  return b;
}

function matchesBlock(p) {
  const b = block('THE MATCHES', `${p.matchesTracked} tracked, pooled above`);
  const wrap = el('div', 'matchList');
  p.matches.forEach(m => {
    const row = el('div', 'matchRow');
    const opp = (m.opp || '').replace(/^[.\s]+/, '').replace(/\s+\d[\d/]*$/, '').trim();
    row.appendChild(el('div', 'mo', `vs ${opp || m.team || '—'}`));
    row.appendChild(el('div', 'mn', `${m.n} pts`));
    const watch = el('div', 'mw');
    if (m.video) watch.innerHTML = `<a href="https://www.youtube.com/watch?v=${m.video}" target="_blank" rel="noopener">watch ▸</a>`;
    row.appendChild(watch);
    wrap.appendChild(row);
  });
  b.appendChild(wrap);
  return b;
}

function block(kicker, head) {
  const b = el('div', 'dblock');
  b.appendChild(el('h3', null, kicker));
  b.appendChild(el('p', 'dh', head));
  return b;
}

function servePlacementBlock(p) {
  const b = block('SERVE', 'Where the serve goes');
  const bySide = { Deuce: {}, Ad: {} };
  p.placement.forEach(c => { (bySide[c.side] = bySide[c.side] || {})[c.spot] = c; });
  const maxWin = Math.max(0.001, ...p.placement.map(c => c.wonPct || 0));
  ['Deuce', 'Ad'].forEach(side => {
    const g = el('div', 'serveGrid');
    ['Wide', 'Body', 'T'].forEach(spot => {
      const c = (bySide[side] || {})[spot];
      const cell = el('div', 'sCell');
      if (c && c.wonPct != null) {
        const a = 0.10 + (c.wonPct / 1) * 0.42;
        cell.style.background = `rgba(45,104,196,${a.toFixed(2)})`;
        if (c.wonPct >= 0.62) cell.style.color = '#fff';
      }
      cell.appendChild(el('div', 'z', `${side.toUpperCase()} · ${spot.toUpperCase()}`));
      cell.appendChild(el('div', 'cn', c ? String(c.n) : '—'));
      cell.appendChild(el('div', 'cw', c && c.wonPct != null ? pct(c.wonPct) + ' won' : ''));
      g.appendChild(cell);
    });
    b.appendChild(g);
    b.lastChild.style.marginTop = side === 'Ad' ? '6px' : '0';
  });
  b.appendChild(el('p', 'dnote', 'Each cell: first serves landed to that spot, shaded by how often the point was won. Second serves that landed are pooled in.'));
  return b;
}

function rallyBlock(p) {
  const b = block('RALLY LENGTH', 'How the points run');
  const total = p.rally.reduce((s, r) => s + r.n, 0) || 1;
  const labels = { '1-4': '1–4', '5-8': '5–8', '9-12': '9–12', '13+': '13+' };
  p.rally.forEach(r => {
    const row = el('div', 'hbar');
    row.appendChild(el('div', 'hl', labels[r.bucket] || r.bucket));
    const ht = el('div', 'ht'); const i = el('i'); i.style.width = Math.round(r.n / total * 100) + '%'; ht.appendChild(i);
    row.appendChild(ht);
    row.appendChild(el('div', 'hr', `${r.n} · ${pct(r.wonPct)} won`));
    b.appendChild(row);
  });
  b.appendChild(el('p', 'dnote', 'Share of points by shots in the rally, with how often each length was won.'));
  return b;
}

function shotMakingBlock(p) {
  const b = block('WHAT ENDS THE POINTS', 'Winners against errors');
  const leg = el('div', 'smLegend');
  leg.innerHTML = '<span><i style="background:var(--blue)"></i>WINNERS</span><span><i style="background:var(--gold)"></i>ERRORS</span>';
  b.appendChild(leg);
  const tot = p.winTotal + p.errTotal || 1;
  const split = el('div', 'smSplit');
  const wi = el('i', 'w'); wi.style.width = (p.winTotal / tot * 100) + '%';
  const ei = el('i', 'e'); ei.style.width = (p.errTotal / tot * 100) + '%';
  split.appendChild(wi); split.appendChild(ei);
  b.appendChild(split);
  const cap = el('div', 'smSplitCap');
  cap.innerHTML = `<span class="w">${p.winTotal} winners</span><span class="e">${p.errTotal} errors</span>`;
  b.appendChild(cap);

  // by wing
  const wings = [...new Set([...Object.keys(p.winners), ...Object.keys(p.errors)])]
    .sort((a, c) => (p.errors[c] || 0) + (p.winners[c] || 0) - (p.errors[a] || 0) - (p.winners[a] || 0));
  const wrap = el('div'); wrap.style.marginTop = '16px';
  wings.forEach(w => {
    const win = p.winners[w] || 0, err = p.errors[w] || 0, t = win + err || 1;
    const row = el('div', 'wingRow');
    row.appendChild(el('div', 'wn', w));
    const mini = el('div', 'mini');
    const mw = el('i', 'w'); mw.style.width = (win / t * 100) + '%';
    const me = el('i', 'e'); me.style.width = (err / t * 100) + '%';
    mini.appendChild(mw); mini.appendChild(me);
    row.appendChild(mini);
    row.appendChild(el('div', 'wc', `${win} W · ${err} E`));
    wrap.appendChild(row);
  });
  b.appendChild(wrap);
  b.appendChild(el('p', 'dnote', 'Every ball this player ended a point with. For every tracked Bruin, errors outnumber winners — the match turns on which side makes fewer.'));
  return b;
}

function netBlock(p) {
  const b = block('AT THE NET', 'Does going forward pay?');
  if (!p.net) {
    b.appendChild(el('p', 'naNote', 'Net position is not tracked in this player’s export, so it is left out rather than guessed.'));
    return b;
  }
  const reach = p.net.n / p.points;
  const pair = el('div', 'pairStat');
  [[String(p.net.n) + ' / ' + p.points, 'POINTS FINISHED AT NET'],
   [pct(reach), 'SHARE OF POINTS'],
   [pct(p.net.pct), 'WON AT NET']].forEach(([v, l]) => {
    const ps = el('div', 'ps'); ps.appendChild(el('div', 'v', v)); ps.appendChild(el('div', 'l', l)); pair.appendChild(ps);
  });
  b.appendChild(pair);
  b.appendChild(el('p', 'dnote', `Comes forward on ${pct(reach)} of points and wins ${pct(p.net.pct)} of them.`));
  return b;
}

function returnBlock(p) {
  const b = block('RETURN', 'Forehand or backhand, and where');
  if (!p.ret || !p.ret.n) {
    b.appendChild(el('p', 'naNote', 'Return wing is not tracked in this player’s matches.'));
    return b;
  }
  // FH vs BH split
  const fh = p.ret.fh || 0, bh = p.ret.bh || 0, t = fh + bh || 1;
  const split = el('div', 'smSplit'); split.style.height = '26px';
  const wi = el('i', 'w'); wi.style.width = (fh / t * 100) + '%';
  const ei = el('i', 'e'); ei.style.width = (bh / t * 100) + '%';
  split.appendChild(wi); split.appendChild(ei);
  b.appendChild(split);
  const cap = el('div', 'smSplitCap');
  cap.innerHTML = `<span class="w">${fh} forehand</span><span class="e">${bh} backhand</span>`;
  b.appendChild(cap);
  // direction bars
  if (p.ret.dir && p.ret.dir.length) {
    const tot = p.ret.dir.reduce((s, d) => s + d.n, 0) || 1;
    const wrap = el('div'); wrap.style.marginTop = '14px';
    p.ret.dir.sort((a, c) => c.n - a.n).forEach(d => {
      const row = el('div', 'hbar');
      const lab = el('div', 'hl', d.dir); lab.style.fontSize = '11px'; lab.style.fontWeight = '700';
      row.appendChild(lab);
      const ht = el('div', 'ht'); const i = el('i'); i.style.width = Math.round(d.n / tot * 100) + '%'; ht.appendChild(i);
      row.appendChild(ht);
      row.appendChild(el('div', 'hr', `${d.n} · ${pct(d.wonPct)} won`));
      wrap.appendChild(row);
    });
    b.appendChild(wrap);
  }
  b.appendChild(el('p', 'dnote', `${p.ret.n} returns put in play, wing split and direction.`));
  return b;
}

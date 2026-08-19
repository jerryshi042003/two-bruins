// UCLA player dashboards — renders per-player panels from dashboard-data.json.
// Vanilla JS, no dependencies. Every value is a count or a rate over counts.

const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

let DATA = null, gender = 'men', current = {};

fetch('dashboard-data.json').then(r => r.json()).then(d => {
  DATA = d;
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

  // header
  const head = el('div', 'pHead');
  head.appendChild(el('h2', null, p.name));
  head.appendChild(el('div', 'pMeta',
    `${p.matchesTracked} MATCH${p.matchesTracked > 1 ? 'ES' : ''} TRACKED · ${p.points.toLocaleString()} POINTS`));
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

// UCLA player dashboards — renders per-player panels from dashboard-data.json.
// Vanilla JS, no dependencies. Every value is a count or a rate over counts.

const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// SVG star path (adopted from the analytics-repo winner/serve visuals)
function starPath(outer, inner, n) {
  const pts = [], off = -Math.PI / 2, a = Math.PI / n;
  for (let i = 0; i < 2 * n; i++) { const r = i % 2 ? inner : outer; pts.push([Math.cos(i * a + off) * r, Math.sin(i * a + off) * r]); }
  return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join('L') + 'Z';
}

let DATA = null, ENRICH = {}, PAT = {}, SYN = {}, RAW = {}, gender = 'men', current = {};
const enr = (p) => ENRICH[`${gender}::${p.name}`] || {};
const pat = (p) => PAT[`${gender}::${p.name}`] || {};
const syn = (p) => SYN[`${gender}::${p.name}`] || {};
const raw = (p) => RAW[p.name] || null;   // raw SwingVision keyed by full name

Promise.all([
  fetch('dashboard-data.json').then(r => r.json()),
  fetch('player_enrich.json').then(r => r.json()).catch(() => ({})),
  fetch('player_patterns.json').then(r => r.json()).catch(() => ({})),
  fetch('player_synth.json').then(r => r.json()).catch(() => ({})),
  fetch('raw_players.json').then(r => r.json()).catch(() => ({})),
]).then(([d, e, pt, sy, rw]) => {
  DATA = d; ENRICH = e || {}; PAT = pt || {}; SYN = sy || {}; RAW = rw || {};
  // surface players who have rich raw SwingVision data but no Firestore entry (into the right gender)
  const fsAll = new Set([...DATA.men, ...DATA.women].map(p => p.name));
  Object.keys(RAW).forEach(name => {
    if (!fsAll.has(name)) {
      const g = RAW[name].gender === 'women' ? 'women' : 'men';
      DATA[g].push({ name, _rawOnly: true, matchesTracked: RAW[name].matches, points: RAW[name].shots });
    }
  });
  DATA.men.sort((a, b) => (b.matchesTracked || 0) - (a.matchesTracked || 0));
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
    const sub = p._rawOnly ? `${p.matchesTracked} matches · raw` : `${p.matchesTracked} match${p.matchesTracked > 1 ? 'es' : ''} · ${p.points} pts`;
    const b = el('button', 'pTab' + (gender === 'women' ? ' w' : ''), `${p.name}<small>${sub}</small>`);
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
    const rw = RAW[p.name];
    const we = (p.winTotal != null && p.errTotal != null) ? `${p.winTotal}:${p.errTotal}`
      : (rw && rw.serveSpeed ? `${Math.round(rw.serveSpeed.mean)}mph` : '—');
    r.innerHTML =
      `<span class="tbP">${p.name}${p._rawOnly ? ' <em class="rawtag">raw</em>' : ''}</span>` +
      `<span>${p.matchesTracked}</span>` +
      `<span>${p._rawOnly ? (rw ? Math.round(rw.shots / 1000) + 'k sh' : '—') : p.points}</span>` +
      `<span class="tbV">${pct(p.winPct)}</span>` +
      `<span>${p._rawOnly && rw && rw.serveP1 ? pct(rw.serveP1.fhShare) : pct(p.firstInPct)}</span>` +
      `<span>${p.bp && p.bp.convPct != null ? pct(p.bp.convPct) : '—'}</span>` +
      `<span class="tbWE">${we}</span>`;
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

  // raw-only men: rich SwingVision shot data, no Firestore point tagging
  if (p._rawOnly) {
    const rw = raw(p);
    const head = el('div', 'pHead');
    head.appendChild(el('h2', null, p.name));
    head.appendChild(el('div', 'pMeta', `RAW SWINGVISION<br>${rw.matches} matches · ${rw.shots.toLocaleString()} shots`));
    panel.appendChild(head);
    panel.appendChild(rawMetricsBlock(p, rw));
    panel.appendChild(rawServeCourt(p, rw));
    if ((rw.winnerLocs || []).length >= 20) panel.appendChild(rawPointEndCourt(p, rw));
    panel.appendChild(rawMatchesBlock(p, rw));
    return;
  }

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

  // ---- LEAD: the one-line read on this player, then the supporting patterns ----
  panel.appendChild(headlineBlock(p));
  const rw = raw(p);
  if (rw) panel.appendChild(rawMetricsBlock(p, rw));
  panel.appendChild(signatureBlock(p, e));
  if (rw) panel.appendChild(rawServeCourt(p, rw));
  else panel.appendChild(courtPatternBlock(p));
  if (rw && (rw.winnerLocs || []).length >= 20) panel.appendChild(rawPointEndCourt(p, rw));
  else panel.appendChild(pointEndBlock(p));
  panel.appendChild(levelBlock(p, e));
  panel.appendChild(trendBlock(p, e));
  panel.appendChild(effectivenessBlock(p));

  // supporting detail — rally + return, then break points (serve grid and
  // shot-making are intentionally dropped: the serve court and point-ending
  // court already cover placement and winners/errors)
  const grid1 = el('div', 'dgrid');
  grid1.appendChild(rallyBlock(p));
  grid1.appendChild(returnBlock(p));
  const b1 = el('div', 'dblock'); b1.appendChild(grid1);
  panel.appendChild(b1);
  panel.appendChild(bpBlock(p));

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
  const recency = e.playerUtr2024
    ? `Their UTR was about <b>${e.playerUtr2024.toFixed(1)}</b> during the 2024 season these matches are from &mdash; below today's ${e.playerUtr ? e.playerUtr.toFixed(1) : '—'}, so these results came when they were a lower-rated player. Opponent UTRs shown are current.`
    : `UTR shown is current${e.playerUtr ? '' : ' where a rating exists'}; most matches are from 2024, so read it as an approximate level, not point-in-time.`;
  b.appendChild(el('p', 'dnote',
    `Avg opponent UTR <b>${s.avgOppUtr || 'n/a'}</b> vs their own <b>${e.playerUtr ? e.playerUtr.toFixed(1) : 'n/a'}</b>. ` +
    `Against opponents rated at or above them: ${vs(s.vsStronger)}; against lower-rated: ${vs(s.vsWeaker)}. ` + recency));
  return b;
}

function headlineBlock(p) {
  const s = syn(p);
  const b = el('div', 'headline');
  const first = p.name.split(' ')[0];
  b.appendChild(el('div', 'archeTag', (s.archetype || 'all-court').toUpperCase()));
  const cap = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  if (s.strength) {
    const row = el('div', 'hlRow win');
    row.innerHTML = `<span class="hlLabel">WHAT WINS FOR ${first.toUpperCase()}</span><span class="hlText">${cap(s.strength)}.</span>`;
    b.appendChild(row);
  }
  if (s.weakness) {
    const row = el('div', 'hlRow loss');
    row.innerHTML = `<span class="hlLabel">WHAT COSTS ${first.toUpperCase()}</span><span class="hlText">${cap(s.weakness)}.</span>`;
    b.appendChild(row);
  }
  if (!s.strength && !s.weakness) b.appendChild(el('p', 'naNote', 'Sample still thin — read the sections below directly.'));
  return b;
}

function rawMatchesBlock(p, rw) {
  const b = block('THE MATCHES', `${rw.matches} tracked in the raw data`);
  const wrap = el('div', 'matchList');
  (rw.matchNames || []).forEach(nm => {
    const clean = nm.replace(/\.xlsx$/i, '').replace(/_/g, ' ').replace(/\b\d[\d\-.:]*\b/g, '').trim();
    const row = el('div', 'matchRow');
    row.appendChild(el('div', 'mo', clean));
    row.appendChild(el('div', 'mn', ''));
    row.appendChild(el('div', 'mw', ''));
    wrap.appendChild(row);
  });
  b.appendChild(wrap);
  return b;
}

function rawMetricsBlock(p, rw) {
  const b = block('SWINGVISION', `${rw.matches} matches, ${rw.shots.toLocaleString()} shots — from the raw ball-tracking`);
  const kpis = el('div', 'kpis');
  const mph = (s) => s ? `${Math.round(s.mean)}` : '—';
  const m = (s) => s ? `${s.mean.toFixed(2)}m` : '—';
  const K = [
    [rw.serveSpeed ? `${Math.round(rw.serveSpeed.mean)}` : '—', 'AVG SERVE MPH', rw.serveSpeed ? `top 10%: ${Math.round(rw.serveSpeed.p90)}` : ''],
    [rw.fhSpeed ? `${Math.round(rw.fhSpeed.mean)}` : '—', 'AVG FOREHAND MPH', rw.bhSpeed ? `bh ${Math.round(rw.bhSpeed.mean)}` : ''],
    [m(rw.gsContactHt), 'GROUNDSTROKE CONTACT HT', rw.contactDepth ? `steps in ${m(rw.contactDepth)} inside baseline` : (rw.gsContactHt ? `serve ${m(rw.serveContactHt)}` : '')],
    [rw.serveP1 && rw.serveP1.fhShare != null ? Math.round(rw.serveP1.fhShare * 100) + '%' : '—', 'SERVE+1 FOREHAND', rw.serveP1 ? `${rw.serveP1.n} serve+1 balls` : ''],
  ];
  K.forEach(([v, l, s]) => {
    const k = el('div', 'kpi');
    k.appendChild(el('div', 'v', v)); k.appendChild(el('div', 'l', l)); k.appendChild(el('div', 's', s));
    kpis.appendChild(k);
  });
  b.appendChild(kpis);
  return b;
}

function rawServeCourt(p, rw) {
  const b = block('SERVE PLACEMENT', 'Where they serve — and how often the point is won from each spot');
  const sv = rw.serveBounces || [];
  const sig = rw.serveSignature || {};
  if (sv.length < 20 && !Object.keys(sig).length) { b.appendChild(el('p', 'naNote', 'Not enough tracked serves.')); return b; }
  const SINGLES = 4.115, NET = 11.885, SVC = 6.4;
  const W = 460, H = 360, mL = 34, mR = 34, mT = 62, mB = 30;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'd3svg');
  const g = svg.append('g');
  const x = d3.scaleLinear().domain([-SINGLES, SINGLES]).range([mL, W - mR]);
  const y = d3.scaleLinear().domain([0, SVC]).range([mT, H - mB]);   // 0 = net (top), 6.4 = service line (bottom)
  const WH = '#ffffff';
  // surface + boxes
  g.append('rect').attr('x', x(-SINGLES)).attr('y', y(0)).attr('width', x(SINGLES) - x(-SINGLES)).attr('height', y(SVC) - y(0)).attr('fill', '#d7e3ef');
  // wide|T dashed dividers (each box split at half its width)
  [-SINGLES / 2, SINGLES / 2].forEach(zx => g.append('line').attr('x1', x(zx)).attr('x2', x(zx)).attr('y1', y(0)).attr('y2', y(SVC)).attr('stroke', WH).attr('stroke-dasharray', '4 4').attr('stroke-width', 1));
  // center service line + singles sidelines + service line
  [0, -SINGLES, SINGLES].forEach(sx => g.append('line').attr('x1', x(sx)).attr('x2', x(sx)).attr('y1', y(0)).attr('y2', y(SVC)).attr('stroke', WH).attr('stroke-width', 2));
  g.append('line').attr('x1', x(-SINGLES)).attr('x2', x(SINGLES)).attr('y1', y(SVC)).attr('y2', y(SVC)).attr('stroke', WH).attr('stroke-width', 2);
  g.append('line').attr('x1', x(-SINGLES)).attr('x2', x(SINGLES)).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', '#2b3a4a').attr('stroke-width', 3); // net
  g.append('text').attr('x', x(-SINGLES) - 6).attr('y', y(0) + 3).attr('text-anchor', 'end').attr('font-size', 9).attr('fill', C.muted).text('net');
  g.append('text').attr('x', x(-SINGLES) - 6).attr('y', y(SVC) + 3).attr('text-anchor', 'end').attr('font-size', 9).attr('fill', C.muted).text('svc');
  // serve dots placed by real depth + lateral, coloured by point outcome
  let aces = 0;
  sv.forEach(s => {
    const spot = s[4]; if (!spot) return;
    const side = spot.split('|')[0];
    const d = Math.min(SVC, Math.abs(s[1] - NET));
    const lat = Math.min(SINGLES, Math.abs(s[0]));
    const px = side === 'ad' ? lat : -lat;
    if (String(s[2]).toLowerCase() === 'ace') { aces++; g.append('path').attr('transform', `translate(${x(px)},${y(d)})`).attr('d', starPath(6, 3, 5)).attr('fill', C.gold).attr('stroke', '#3a3a3a').attr('stroke-width', 0.5); return; }
    g.append('circle').attr('cx', x(px)).attr('cy', y(d)).attr('r', 3).attr('fill', s[3] === 1 ? C.win : '#cf8d8d').attr('fill-opacity', 0.5).attr('stroke', '#3a3a3a').attr('stroke-width', 0.35);
  });
  // zone Win% / Freq chips above the net (from the serve signature)
  const wins = Object.values(sig).map(z => z.winPct).filter(v => v != null);
  const maxW = Math.max(...wins), minW = Math.min(...wins);
  const totalIn = Object.values(sig).reduce((a, z) => a + (z.winN || 0), 0) || 1;
  const zoneX = { 'deuce|wide': -SINGLES * 0.75, 'deuce|T': -SINGLES * 0.25, 'ad|T': SINGLES * 0.25, 'ad|wide': SINGLES * 0.75 };
  Object.entries(zoneX).forEach(([k, zx]) => {
    const z = sig[k]; const cx = x(zx);
    g.append('text').attr('x', cx).attr('y', y(0) + 14).attr('text-anchor', 'middle').attr('font-size', 9).attr('font-weight', 700).attr('fill', '#33475a').text(k.split('|')[1].toUpperCase());
    if (!z) return;
    const wp = z.winPct;
    const col = wp == null ? '#8a8a8a' : (wins.length > 1 && wp === maxW ? C.win : (wins.length > 1 && wp === minW ? C.loss : C.blue));
    g.append('rect').attr('x', cx - 26).attr('y', 8).attr('width', 52).attr('height', 36).attr('rx', 8).attr('fill', col);
    g.append('text').attr('x', cx).attr('y', 24).attr('text-anchor', 'middle').attr('font-size', 14).attr('font-weight', 700).attr('fill', '#fff').text(wp == null ? '—' : Math.round(wp * 100) + '%');
    g.append('text').attr('x', cx).attr('y', 38).attr('text-anchor', 'middle').attr('font-size', 8.5).attr('fill', 'rgba(255,255,255,.85)').text(`${Math.round((z.winN || 0) / totalIn * 100)}% · ${z.winN}`);
  });
  g.append('text').attr('x', x(-SINGLES / 2)).attr('y', H - mB + 16).attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 700).attr('fill', C.muted).text('DEUCE COURT');
  g.append('text').attr('x', x(SINGLES / 2)).attr('y', H - mB + 16).attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 700).attr('fill', C.muted).text('AD COURT');
  b.appendChild(svg.node());
  b.appendChild(el('div', 'd3legend', `<span><i style="background:${C.win}"></i>point won</span><span><i style="background:#cf8d8d"></i>point lost</span><span><i style="background:${C.gold}"></i>ace</span>`));
  // pick the best + worst spot for the note
  const spots = Object.entries(sig).filter(([, z]) => z.winPct != null && z.winN >= 15).sort((a, b2) => b2[1].winPct - a[1].winPct);
  const nice = k => k.replace('|', ' ').replace('deuce', 'deuce-court').replace('ad', 'ad-court');
  const best = spots[0], worst = spots[spots.length - 1];
  b.appendChild(el('p', 'dnote',
    `Chips show the point win% from each serve spot and how much of their serve diet lands there. ` +
    (best && worst && best[0] !== worst[0]
      ? `Their <b>${nice(best[0])}</b> serve is the weapon — <b>${Math.round(best[1].winPct * 100)}%</b> of points won (${best[1].winN}); the <b>${nice(worst[0])}</b> is the soft spot at <b>${Math.round(worst[1].winPct * 100)}%</b>. `
      : '') +
    `${sv.length} serves plotted, ${aces} aces` + (rw.serveSpeed ? `, averaging ${Math.round(rw.serveSpeed.mean)} mph up to ${Math.round(rw.serveSpeed.p90)}.` : '.')));
  return b;
}

function courtPatternBlock(p) {
  const P = pat(p);
  const b = block('SERVE PATTERN', 'Where they serve — and what comes back');
  if (!P.serve || !P.serve.length) { b.appendChild(el('p', 'naNote', 'No serve-placement data for this player.')); return b; }
  const byKey = {}; P.serve.forEach(s => byKey[s.side + '|' + s.zone] = s);
  const W = 440, H = 400, netY = 34, svcY = 200, baseY = 350, cx0 = 70, cx1 = 370, midX = 220, sw = 50;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'd3svg');
  const g = svg.append('g');
  const line = (x1, y1, x2, y2, c, w) => g.append('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2).attr('stroke', c || '#c4c4c4').attr('stroke-width', w || 1.2);
  g.append('rect').attr('x', cx0).attr('y', netY).attr('width', cx1 - cx0).attr('height', baseY - netY).attr('fill', '#f7faf7').attr('stroke', '#c4c4c4').attr('stroke-width', 1.2);
  line(cx0, svcY, cx1, svcY); line(midX, netY, midX, svcY); line(midX, svcY, midX, baseY, '#e2e2e2');
  line(cx0, netY, cx1, netY, '#333', 2.5);
  g.append('text').attr('x', cx0 - 6).attr('y', netY + 4).attr('text-anchor', 'end').attr('font-size', 9).attr('fill', C.muted).text('NET');
  const win = d3.scaleLinear().domain([0.3, 0.85]).range(['#e7edf7', '#123f7f']).clamp(true);
  const zones = [['Deuce', 'Wide', cx0], ['Deuce', 'Body', cx0 + sw], ['Deuce', 'T', cx0 + 2 * sw],
                 ['Ad', 'T', midX], ['Ad', 'Body', midX + sw], ['Ad', 'Wide', midX + 2 * sw]];
  zones.forEach(([side, zone, x]) => {
    const s = byKey[side + '|' + zone];
    g.append('rect').attr('x', x).attr('y', netY).attr('width', sw).attr('height', svcY - netY)
      .attr('fill', s && s.winPct != null ? win(s.winPct) : '#eee').attr('stroke', '#fff').attr('stroke-width', 1);
    g.append('text').attr('x', x + sw / 2).attr('y', netY + 15).attr('text-anchor', 'middle').attr('font-size', 8).attr('font-weight', 700).attr('fill', s && s.winPct >= 0.6 ? '#dfe8f7' : '#888').text(zone.toUpperCase());
    if (s) {
      const dark = s.winPct != null && s.winPct >= 0.6;
      g.append('text').attr('x', x + sw / 2).attr('y', (netY + svcY) / 2 + 4).attr('text-anchor', 'middle').attr('font-size', 14).attr('font-weight', 700).attr('fill', dark ? '#fff' : '#333').text(s.n);
      g.append('text').attr('x', x + sw / 2).attr('y', (netY + svcY) / 2 + 20).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', dark ? '#cfe' : '#666').text(s.winPct != null ? pctI(s.winPct) : '');
    }
  });
  g.append('text').attr('x', (cx0 + midX) / 2).attr('y', baseY + 18).attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 700).attr('fill', C.muted).text('DEUCE COURT');
  g.append('text').attr('x', (midX + cx1) / 2).attr('y', baseY + 18).attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 700).attr('fill', C.muted).text('AD COURT');
  const sig = P.signature;
  if (sig && sig.topReturn) {
    const zx = { 'Deuce|Wide': cx0 + 25, 'Deuce|Body': cx0 + 75, 'Deuce|T': cx0 + 125, 'Ad|T': midX + 25, 'Ad|Body': midX + 75, 'Ad|Wide': midX + 125 }[sig.side + '|' + sig.zone];
    const crosscourt = /cross/i.test(sig.topReturn);
    const ex = crosscourt ? (sig.side === 'Deuce' ? cx1 - 34 : cx0 + 34) : zx;
    g.append('defs').html('<marker id="ah" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="' + C.gold + '"/></marker>');
    g.append('line').attr('x1', zx).attr('y1', svcY - 16).attr('x2', ex).attr('y2', baseY - 16).attr('stroke', C.gold).attr('stroke-width', 3).attr('marker-end', 'url(#ah)').attr('opacity', 0.9);
    g.append('circle').attr('cx', zx).attr('cy', svcY - 16).attr('r', 4).attr('fill', C.gold);
  }
  b.appendChild(svg.node());
  b.appendChild(el('div', 'd3legend', `<span><i style="background:#e7edf7"></i>loses more</span><span><i style="background:#123f7f"></i>wins more</span><span><i style="background:${C.gold};border-radius:0;width:16px;height:3px"></i>return comes back</span>`));
  if (sig) b.appendChild(el('p', 'dnote',
    `Cells are their serve targets, shaded by how often they win the point from that spot; the gold arrow is where the return usually comes back. ` +
    `Their signature serve is the <b>${sig.side} ${sig.zone}</b> — ${sig.n} times, <b>${pctI(sig.winPct)}</b> won (${sig.lift >= 0 ? '+' : ''}${Math.round(sig.lift * 100)} vs their average), returned mostly <b>${sig.topReturn.toLowerCase()}</b>` +
    (sig.s1winPct != null ? `; <b>${pctI(sig.s1winPct)}</b> of those points are won inside three shots — the serve+1 quick strike.` : '.')));
  return b;
}

function rawPointEndCourt(p, rw) {
  const b = block('WHERE WINNERS LAND', 'Every winner at its real bounce point, with the direction it was travelling');
  const NET = 11.885, BASE = 23.77, SINGLES = 4.115, DOUBLES = 5.485, SVC = 6.4;
  const W = 360, H = 440, mL = 24, mR = 24, mT = 22, mB = 40;
  const FH = C.win, BH = C.blue;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'd3svg');
  const g = svg.append('g');
  const x = d3.scaleLinear().domain([-DOUBLES, DOUBLES]).range([mL, W - mR]);
  const y = d3.scaleLinear().domain([NET, BASE]).range([H - mB, mT]);   // net at bottom, far baseline at top
  const WH = '#ffffff';
  g.append('defs').html('<marker id="warr" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#222"/></marker>');
  // surface (doubles) + singles inset
  g.append('rect').attr('x', x(-DOUBLES)).attr('y', y(BASE)).attr('width', x(DOUBLES) - x(-DOUBLES)).attr('height', y(NET) - y(BASE)).attr('fill', '#dbe7f1');
  g.append('rect').attr('x', x(-SINGLES)).attr('y', y(BASE)).attr('width', x(SINGLES) - x(-SINGLES)).attr('height', y(NET) - y(BASE)).attr('fill', '#d0e0ee');
  // lines: doubles + singles sidelines, baseline, service line, centre service line + centre mark
  [-DOUBLES, DOUBLES, -SINGLES, SINGLES].forEach(sx => g.append('line').attr('x1', x(sx)).attr('x2', x(sx)).attr('y1', y(NET)).attr('y2', y(BASE)).attr('stroke', WH).attr('stroke-width', 2));
  g.append('line').attr('x1', x(-SINGLES)).attr('x2', x(SINGLES)).attr('y1', y(BASE)).attr('y2', y(BASE)).attr('stroke', WH).attr('stroke-width', 2); // baseline
  g.append('line').attr('x1', x(-SINGLES)).attr('x2', x(SINGLES)).attr('y1', y(NET + SVC)).attr('y2', y(NET + SVC)).attr('stroke', WH).attr('stroke-width', 2); // service line
  g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', y(NET)).attr('y2', y(NET + SVC)).attr('stroke', WH).attr('stroke-width', 2); // centre service line
  g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', y(BASE)).attr('y2', y(BASE - 0.4)).attr('stroke', WH).attr('stroke-width', 2); // centre mark
  g.append('line').attr('x1', x(-DOUBLES)).attr('x2', x(DOUBLES)).attr('y1', y(NET)).attr('y2', y(NET)).attr('stroke', '#2b3a4a').attr('stroke-width', 3); // net
  g.append('text').attr('x', x(-DOUBLES) - 4).attr('y', y(NET) + 3).attr('text-anchor', 'end').attr('font-size', 9).attr('fill', C.muted).text('net');
  g.append('text').attr('x', x(-DOUBLES) - 4).attr('y', y(BASE) + 3).attr('text-anchor', 'end').attr('font-size', 9).attr('fill', C.muted).text('base');
  const clampX = v => Math.max(-DOUBLES, Math.min(DOUBLES, v));
  let fhW = 0, bhW = 0, vol = 0;
  (rw.winnerLocs || []).forEach(w => {
    let bx = w[0], by = w[1], hx = w[3], hy = w[4];
    if (by < NET) { by = BASE - by; bx = -bx; if (hx != null) { hx = -hx; hy = BASE - hy; } }  // fold to far half
    if (by < NET || by > BASE + 0.6) return;
    const px = x(clampX(bx)), py = y(Math.min(BASE, by));
    const isVol = w[5] === 1; const col = isVol ? C.gold : (w[2] === 'B' ? BH : FH);
    if (w[2] === 'B') bhW++; else if (w[2] === 'F') fhW++; if (isVol) vol++;
    // direction arrow: from just before the landing, along the contact->bounce heading, arrowhead at the bounce
    if (hx != null && hy != null) {
      const dx = bx - hx, dy = by - hy, L = Math.hypot(dx, dy) || 1, u = 1.4;
      g.append('line').attr('x1', x(clampX(bx - dx / L * u))).attr('y1', y(by - dy / L * u)).attr('x2', px).attr('y2', py)
        .attr('stroke', '#222').attr('stroke-width', 0.7).attr('stroke-opacity', 0.35).attr('marker-end', 'url(#warr)');
    }
    if (isVol) g.append('path').attr('transform', `translate(${px},${py})`).attr('d', starPath(6, 3, 5)).attr('fill', col).attr('stroke', '#222').attr('stroke-width', 0.6);
    else g.append('circle').attr('cx', px).attr('cy', py).attr('r', 3.6).attr('fill', col).attr('fill-opacity', 0.72).attr('stroke', '#222').attr('stroke-width', 0.5);
  });
  b.appendChild(svg.node());
  b.appendChild(el('div', 'd3legend', `<span><i style="background:${FH}"></i>forehand</span><span><i style="background:${BH}"></i>backhand</span><span><i style="background:${C.gold}"></i>volley</span>`));
  const errs = rw.errorLocs || [];
  const net = errs.filter(e => e[3] === 'net').length, out = errs.filter(e => e[3] === 'out').length;
  const fhE = errs.filter(e => e[2] === 'F').length, bhE = errs.filter(e => e[2] === 'B').length;
  b.appendChild(el('p', 'dnote',
    `${fhW + bhW + vol} winners at their real landing point (both ends folded together); each arrow is the ball's heading as it landed. ` +
    `Forehand ${fhW} winners vs ${fhE} errors; backhand ${bhW} vs ${bhE}${vol ? `; ${vol} at the net` : ''}. ` +
    `Of ${errs.length} errors, ${net} found the net and ${out} sailed long — ${net > out ? 'more tentative than wild' : 'more over-hitting than tentative'}.`));
  return b;
}

function pointEndBlock(p) {
  const P = pat(p);
  const b = block('POINT ENDINGS', 'How and where they finish — winners vs errors');
  const wins = P.winners || [], errs = P.errors || [];
  if (!wins.length && !errs.length) { b.appendChild(el('p', 'naNote', 'No shot-ending data.')); return b; }
  // aggregate by (wing, dir)
  const agg = {};
  const put = (rows, kind) => rows.forEach(r => {
    if (!r.dir) return; const k = r.wing + '|' + r.dir; (agg[k] = agg[k] || { wing: r.wing, dir: r.dir, w: 0, e: 0 })[kind] += r.n;
  });
  put(wins, 'w'); put(errs, 'e');
  const items = Object.values(agg).filter(a => a.w + a.e >= 3);
  const W = 440, H = 380, netY = 30, baseY = 330, cx0 = 70, cx1 = 370, midX = 220;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'd3svg');
  const g = svg.append('g');
  g.append('rect').attr('x', cx0).attr('y', netY).attr('width', cx1 - cx0).attr('height', baseY - netY).attr('fill', '#f7faf7').attr('stroke', '#c4c4c4').attr('stroke-width', 1.2);
  g.append('line').attr('x1', cx0).attr('x2', cx1).attr('y1', (netY + baseY) / 2).attr('y2', (netY + baseY) / 2).attr('stroke', '#333').attr('stroke-width', 2); // net mid
  g.append('text').attr('x', cx1 + 2).attr('y', (netY + baseY) / 2 + 3).attr('font-size', 9).attr('fill', C.muted).text('net');
  const player = [midX, baseY - 8];
  g.append('text').attr('x', player[0]).attr('y', baseY + 14).attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 700).attr('fill', C.muted).text(p.name.split(' ')[0].toUpperCase());
  // four distinct targets spread across the far baseline (no collisions)
  const targY = netY + 46;
  const targX = { 'Forehand|cross': cx0 + 42, 'Forehand|line': midX - 34, 'Backhand|line': midX + 34, 'Backhand|cross': cx1 - 42 };
  g.append('defs').html(
    `<marker id="mw" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${C.blue}"/></marker>` +
    `<marker id="me" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${C.gold}"/></marker>`);
  items.forEach(a => {
    const cc = /cross/i.test(a.dir);
    const tx = targX[a.wing + '|' + (cc ? 'cross' : 'line')]; if (tx == null) return;
    const winnerDom = a.w >= a.e, tot = a.w + a.e, wpx = Math.min(6, 1.5 + tot / 14);
    g.append('line').attr('x1', player[0]).attr('y1', player[1]).attr('x2', tx).attr('y2', targY + 6)
      .attr('stroke', winnerDom ? C.blue : C.gold).attr('stroke-width', wpx).attr('opacity', 0.7)
      .attr('marker-end', winnerDom ? 'url(#mw)' : 'url(#me)');
    g.append('text').attr('x', tx).attr('y', targY - 6).attr('text-anchor', 'middle').attr('font-size', 10).attr('font-weight', 700).attr('fill', winnerDom ? C.blue : '#a8790a')
      .text(`${a.wing[0] + (cc ? 'x' : '↓')}`);
    g.append('text').attr('x', tx).attr('y', targY + 8).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', C.muted)
      .text(`${a.w}W·${a.e}E`);
  });
  g.append('circle').attr('cx', player[0]).attr('cy', player[1]).attr('r', 5).attr('fill', C.ink);
  b.appendChild(svg.node());
  b.appendChild(el('div', 'd3legend', `<span><i style="background:${C.blue}"></i>winner-heavy</span><span><i style="background:${C.gold}"></i>error-heavy</span>`));
  // biggest winner shot + biggest error shot
  const topWin = wins.filter(w => w.dir).sort((a, c) => c.n - a.n)[0];
  const topErr = errs.filter(w => w.dir).sort((a, c) => c.n - a.n)[0];
  b.appendChild(el('p', 'dnote',
    `Arrows are their point-ending shots to each target (F/B = forehand/backhand, x = crosscourt, ↓ = down the line), blue where winners outweigh errors, gold where errors do. ` +
    (topWin ? `Their go-to winner: <b>${topWin.wing.toLowerCase()} ${topWin.dir.toLowerCase()}</b> (${topWin.n}). ` : '') +
    (topErr ? `Where they miss most: <b>${topErr.wing.toLowerCase()} ${topErr.dir.toLowerCase()}</b> (${topErr.n}).` : '')));
  return b;
}

function trendBlock(p, e) {
  const b = block('OVER TIME', 'Has the level of play changed?');
  const t = (e.trend || []).filter(x => x.date && x.winPct != null);
  if (t.length < 2) { b.appendChild(el('p', 'naNote', 'Only one dated match tracked — no trajectory yet.')); return b; }
  const W = 700, H = 210, m = { l: 40, r: 16, t: 18, b: 46 };
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'd3svg');
  const g = svg.append('g');
  const x = d3.scalePoint().domain(t.map((_, i) => i)).range([m.l, W - m.r]).padding(0.5);
  const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
  // 50% gridline
  g.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0.5)).attr('y2', y(0.5)).attr('stroke', '#ddd').attr('stroke-dasharray', '4 4');
  [0.25, 0.5, 0.75].forEach(v => g.append('text').attr('x', m.l - 8).attr('y', y(v) + 4).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', C.muted).text(Math.round(v * 100) + '%'));
  // UTR color scale for opponent strength
  const utrs = t.map(d => d.oppUtr).filter(Boolean);
  const col = d3.scaleLinear().domain([Math.min(...utrs, 10), Math.max(...utrs, 14)]).range(['#9cc0f0', '#123f7f']);
  // line
  const line = d3.line().x((_, i) => x(i)).y(d => y(d.winPct));
  g.append('path').datum(t).attr('fill', 'none').attr('stroke', C.blue).attr('stroke-width', 2.5).attr('d', line);
  // dots + date labels
  t.forEach((d, i) => {
    g.append('circle').attr('cx', x(i)).attr('cy', y(d.winPct)).attr('r', 6)
      .attr('fill', d.oppUtr ? col(d.oppUtr) : '#bbb').attr('stroke', '#fff').attr('stroke-width', 1.5)
      .append('title').text(`${d.opp || 'opp'}${d.oppUtr ? ' · UTR ' + d.oppUtr : ''} · ${pctI(d.winPct)} pts won · ${d.date}`);
    g.append('text').attr('x', x(i)).attr('y', H - m.b + 16).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', C.muted)
      .text((d.date || '').slice(5));
  });
  b.appendChild(svg.node());
  b.appendChild(el('div', 'd3legend', `<span><i style="background:#9cc0f0"></i>weaker opp</span><span><i style="background:#123f7f"></i>stronger opp</span>`));
  const first = t[0].winPct, last = t[t.length - 1].winPct, dir = last > first + 0.05 ? 'up' : (last < first - 0.05 ? 'down' : 'flat');
  b.appendChild(el('p', 'dnote',
    `Point-win rate per match, oldest to newest (dot colour = opponent strength). ` +
    (dir === 'flat' ? 'Steady across the tracked span.' : `Trending ${dir}: ${pctI(first)} in the earliest tracked match, ${pctI(last)} in the latest.`) +
    ` A rising line against darker dots is the real sign of improvement.`));
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

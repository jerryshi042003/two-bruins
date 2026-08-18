/* D3 visuals rebuilt against the Bruin Tennis Consulting analytics library
   (visuals/compilation/*.js).  Court geometry, palette, pill badges and legend
   chrome all follow that source; the data is 2026 SwingVision, converted to the
   same court units (1 m = 38.28, net at y = 0). */

const BTC = {
  W: 1000, H: 800,
  court: "#6092ce",
  green: "#86ac91",         // classic sage backdrop
  won: "#00cc00", lost: "red", dead: "#808080", ace: "#f8c84f",
  pillMax: "#32a852", pillMin: "red", pillMid: "#3395f6", freq: "#d3d3d3",
  // court line-work, straight from the BTC source
  lines: [
    { x1: 210, y1: -25, x2: 210, y2: 455 },
    { x1: -210, y1: -25, x2: -210, y2: 455 },
    { x1: 157.5, y1: -25, x2: 157.5, y2: 455 },
    { x1: -157.5, y1: -25, x2: -157.5, y2: 455 },
    { x1: 240, y1: 0, x2: -240, y2: 0, width: 7 },
    { x1: 0, y1: -25, x2: 0, y2: 245 },
    { x1: 157.5, y1: 245, x2: -157.5, y2: 245 },
    { x1: 211.25, y1: 455, x2: -211.25, y2: 455 },
    { x1: 0, y1: 445, x2: 0, y2: 455 },
  ],
};

/* Light theme keeps the identical geometry and encodings, swapping only the
   backdrop so the visual can sit on a white editorial page. */
const THEMES = {
  classic: { bg: BTC.green, court: BTC.court, line: "#fff", text: "#fff", chrome: "#fff" },
  light:   { bg: "#ffffff", court: "#7ba4d8", line: "#fff", text: "#1a1a1a", chrome: "#333" },
};

const pct1 = (v) => (v * 100).toFixed(1) + "%";
const pct0 = (v) => Math.round(v * 100) + "%";

function svgBase(sel, theme, vb) {
  const t = THEMES[theme] || THEMES.classic;
  const svg = d3.select(sel).html("")
    .attr("viewBox", vb || `0 0 ${BTC.W} ${BTC.H}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("class", "chart");
  svg.append("rect").attr("x", 0).attr("y", 0)
    .attr("width", "100%").attr("height", "100%").attr("fill", t.bg);
  return { svg, t };
}

function drawCourt(svg, x, y, t, opts) {
  opts = opts || {};
  svg.append("rect")
    .attr("x", x(-210)).attr("y", y(455))
    .attr("width", x(210) - x(-210)).attr("height", y(-25) - y(455))
    .attr("fill", t.court);
  svg.append("g").selectAll("line").data(BTC.lines).enter().append("line")
    .attr("x1", (d) => x(d.x1)).attr("y1", (d) => y(d.y1))
    .attr("x2", (d) => x(d.x2)).attr("y2", (d) => y(d.y2))
    .attr("stroke", t.line).attr("stroke-width", (d) => d.width || 4);
}

/* Rounded Win% / Freq badge pair, exactly the BTC treatment. */
function pills(svg, x, y, items, yWin, yFreq, t) {
  const vals = items.map((d) => d.win);
  const mx = d3.max(vals), mn = d3.min(vals);
  items.forEach((d) => {
    const fill = items.length < 2 ? BTC.pillMid
      : d.win === mx ? BTC.pillMax : d.win === mn ? BTC.pillMin : BTC.pillMid;
    svg.append("rect").attr("x", x(d.x) - 34).attr("y", y(yWin) - 13)
      .attr("width", 68).attr("height", 26).attr("rx", 13)
      .attr("fill", fill).attr("stroke", "#fff").attr("stroke-width", 1);
    svg.append("text").attr("x", x(d.x)).attr("y", y(yWin) + 6)
      .attr("text-anchor", "middle").attr("fill", "#fff")
      .attr("font-weight", 700).attr("font-size", 17).text(pct0(d.win));
    svg.append("rect").attr("x", x(d.x) - 22).attr("y", y(yFreq) - 13)
      .attr("width", 44).attr("height", 26).attr("rx", 13)
      .attr("fill", BTC.freq).attr("stroke", "#000").attr("stroke-width", 1);
    svg.append("text").attr("x", x(d.x)).attr("y", y(yFreq) + 6)
      .attr("text-anchor", "middle").attr("fill", "#000")
      .attr("font-weight", 700).attr("font-size", 16).text(d.n);
  });
  // the two outline keys on the right-hand side
  [["Win %", yWin], ["Freq", yFreq]].forEach(([label, yy]) => {
    svg.append("rect").attr("x", x(183.75) - 36).attr("y", y(yy) - 13)
      .attr("width", 72).attr("height", 26).attr("rx", 13)
      .attr("fill", "none").attr("stroke", t.chrome).attr("stroke-width", 2);
    svg.append("text").attr("x", x(183.75)).attr("y", y(yy) + 6)
      .attr("text-anchor", "middle").attr("fill", t.text).attr("font-size", 15).text(label);
  });
}

function star(cx, cy, R, r) {
  let p = "";
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 === 0 ? R : r;
    p += `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)} `;
  }
  return p.trim();
}

function legendBox(svg, cx, cy, items, t, w) {
  w = w || 340;
  svg.append("rect").attr("x", cx - w / 2).attr("y", cy - 21)
    .attr("width", w).attr("height", 42).attr("rx", 12)
    .attr("fill", "none").attr("stroke", t.chrome).attr("stroke-width", 2);
  const step = w / items.length;
  items.forEach((it, i) => {
    const gx = cx - w / 2 + step * (i + 0.5) - 26;
    if (it.shape === "star") {
      svg.append("polygon").attr("points", star(gx, cy, 8, 4))
        .attr("fill", it.color).attr("stroke", "#000").attr("stroke-width", 1);
    } else if (it.shape === "tri") {
      svg.append("polygon").attr("points", `${gx},${cy - 7} ${gx - 7},${cy + 6} ${gx + 7},${cy + 6}`)
        .attr("fill", it.color).attr("stroke", "#000").attr("stroke-width", 1);
    } else {
      svg.append("circle").attr("cx", gx).attr("cy", cy).attr("r", 6)
        .attr("fill", it.color).attr("stroke", "#000").attr("stroke-width", 1);
    }
    svg.append("text").attr("x", gx + 14).attr("y", cy + 6)
      .attr("fill", t.text).attr("font-size", 17).text(it.label);
  });
}

const title = (svg, x, y, txt, t, yy) =>
  svg.append("text").attr("x", x(0)).attr("y", y(yy))
    .attr("text-anchor", "middle").attr("fill", t.text)
    .attr("font-size", 26).attr("font-weight", 700).text(txt);

/* ================================================================== *
 * A. SERVE PLACEMENT — six zones, Win% / Freq pills          (BTC)
 * ================================================================== */
function serveCourt(sel, p, theme) {
  const { svg, t } = svgBase(sel, theme);
  const x = d3.scaleLinear().domain([-350, 350]).range([0, BTC.W]);
  const y = d3.scaleLinear().domain([-150, 600]).range([BTC.H, 0]);
  drawCourt(svg, x, y, t);

  svg.append("g").selectAll("line")
    .data([52.5, 105, -52.5, -105]).enter().append("line")
    .attr("x1", (d) => x(d)).attr("y1", y(245))
    .attr("x2", (d) => x(d)).attr("y2", y(0))
    .attr("stroke", "#fff").attr("stroke-width", 2).attr("stroke-dasharray", "5,5");

  [["T", 26.25], ["T", -26.25], ["Body", 78.75], ["Body", -78.75],
   ["Wide", 131.25], ["Wide", -131.25]].forEach(([l, xx]) => {
    svg.append("text").attr("x", x(xx)).attr("y", y(20) + 5).attr("text-anchor", "middle")
      .attr("fill", "#fff").attr("font-weight", 700).attr("font-size", 18).text(l);
  });
  [["Deuce", -78.25], ["Ad", 78.25]].forEach(([l, xx]) => {
    svg.append("text").attr("x", x(xx)).attr("y", y(260) + 5).attr("text-anchor", "middle")
      .attr("fill", "#fff").attr("font-weight", 700).attr("font-size", 20).text(l);
  });

  svg.append("g").selectAll("circle").data(p.serves.filter((d) => !d.ace))
    .enter().append("circle")
    .attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y)).attr("r", 6)
    .attr("fill", (d) => (d.won ? BTC.won : BTC.lost))
    .attr("stroke", "#000").attr("stroke-width", 0.6)
    .append("title").text((d) => `${Math.round(d.mph)} mph ${d.spin} · ${d.side} ${d.zone} · ${d.won ? "won" : "lost"}`);

  svg.append("g").selectAll("polygon").data(p.serves.filter((d) => d.ace))
    .enter().append("polygon")
    .attr("points", (d) => star(x(d.x), y(d.y), 9, 4.5))
    .attr("fill", BTC.ace).attr("stroke", "#000").attr("stroke-width", 0.6)
    .append("title").text((d) => `Ace · ${Math.round(d.mph)} mph`);

  // one badge pair per zone, ordered the way the court reads left-to-right
  const order = [["Deuce", "Wide", -131.25], ["Deuce", "Body", -78.75], ["Deuce", "T", -26.25],
                 ["Ad", "T", 26.25], ["Ad", "Body", 78.75], ["Ad", "Wide", 131.25]];
  const items = order.map(([side, zone, xx]) => {
    const g = p.serves.filter((s) => s.side === side && s.zone === zone);
    return g.length ? { x: xx, n: g.length, win: d3.mean(g, (d) => (d.won ? 1 : 0)) } : null;
  }).filter(Boolean);
  pills(svg, x, y, items, -47.5, -80, t);

  legendBox(svg, x(-25), 250, [
    { label: "Won", color: BTC.won }, { label: "Lost", color: BTC.lost },
    { label: "Ace", color: BTC.ace, shape: "star" },
  ], t, 330);
  title(svg, x, y, "Serve Placement", t, -125);
}

/* ================================================================== *
 * B. RETURN CONTACT — how far behind the baseline he takes it (BTC)
 * ================================================================== */
function returnCourt(sel, p, theme) {
  const { svg, t } = svgBase(sel, theme, `0 0 ${BTC.W} 620`);
  const x = d3.scaleLinear().domain([-350, 350]).range([0, BTC.W]);
  const y = d3.scaleLinear().domain([-640, -300]).range([560, 70]);   // court on top
  const FT = 455 / 39;                       // BTC units per foot
  const B = -455, B3 = B - 3 * FT;           // baseline, and three feet behind it

  svg.append("rect").attr("x", x(-210)).attr("y", y(-300))
    .attr("width", x(210) - x(-210)).attr("height", y(B) - y(-300)).attr("fill", t.court);
  [[-210, "s"], [210, "s"], [-157.5, "s"], [157.5, "s"]].forEach(([sx]) => {
    svg.append("line").attr("x1", x(sx)).attr("y1", y(-300)).attr("x2", x(sx)).attr("y2", y(B))
      .attr("stroke", "#fff").attr("stroke-width", 4);
  });
  svg.append("line").attr("x1", x(-211.25)).attr("y1", y(B)).attr("x2", x(211.25)).attr("y2", y(B))
    .attr("stroke", "#fff").attr("stroke-width", 4);
  [B, B3].forEach((yy) => {
    svg.append("line").attr("x1", 10).attr("y1", y(yy)).attr("x2", BTC.W - 10).attr("y2", y(yy))
      .attr("stroke", t.chrome).attr("stroke-width", 3).attr("stroke-dasharray", "9,7");
  });
  svg.append("text").attr("x", 44).attr("y", (y(B) + y(B3)) / 2 + 6)
    .attr("fill", t.text).attr("font-size", 17).attr("font-weight", 700).text("3 ft");

  const band = (d) => (d.y > B ? "in" : d.y > B3 ? "near" : "deep");
  const shape = (g, sel2, tri) => g.append(tri ? "polygon" : "circle");
  p.returns.forEach((d) => {
    const col = d.res !== "i" ? BTC.dead : d.won ? BTC.won : BTC.lost;
    const cx = x(d.x), cy = y(Math.max(-635, d.y));
    if (d.wing === "B") {
      svg.append("polygon").attr("points", `${cx},${cy - 7} ${cx - 7},${cy + 6} ${cx + 7},${cy + 6}`)
        .attr("fill", col).attr("stroke", "#000").attr("stroke-width", 0.8)
        .append("title").text(`Backhand return · ${d.res === "i" ? (d.won ? "point won" : "point lost") : "missed"}`);
    } else {
      svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 6.5)
        .attr("fill", col).attr("stroke", "#000").attr("stroke-width", 0.8)
        .append("title").text(`Forehand return · ${d.res === "i" ? (d.won ? "point won" : "point lost") : "missed"}`);
    }
  });

  // win% / count per depth band, down the right-hand margin
  [["in", -300, B], ["near", B, B3], ["deep", B3, -640]].forEach(([k, a, b]) => {
    const g = p.returns.filter((d) => band(d) === k);
    if (!g.length) return;
    const yy = (y(a) + y(b)) / 2, w = d3.mean(g, (d) => (d.won ? 1 : 0));
    const fill = w >= 0.55 ? BTC.pillMax : w <= 0.4 ? BTC.pillMin : BTC.pillMid;
    svg.append("rect").attr("x", BTC.W - 148).attr("y", yy - 14).attr("width", 70)
      .attr("height", 28).attr("rx", 14).attr("fill", fill).attr("stroke", "#fff");
    svg.append("text").attr("x", BTC.W - 113).attr("y", yy + 6).attr("text-anchor", "middle")
      .attr("fill", "#fff").attr("font-weight", 700).attr("font-size", 17).text(pct0(w));
    svg.append("rect").attr("x", BTC.W - 68).attr("y", yy - 14).attr("width", 48)
      .attr("height", 28).attr("rx", 14).attr("fill", BTC.freq).attr("stroke", "#000");
    svg.append("text").attr("x", BTC.W - 44).attr("y", yy + 6).attr("text-anchor", "middle")
      .attr("fill", "#000").attr("font-weight", 700).attr("font-size", 16).text(g.length);
  });

  legendBox(svg, x(-95), 30, [
    { label: "FH won", color: BTC.won }, { label: "BH won", color: BTC.won, shape: "tri" },
    { label: "Lost", color: BTC.lost }, { label: "Missed", color: BTC.dead },
  ], t, 460);
  svg.append("text").attr("x", x(0)).attr("y", 605).attr("text-anchor", "middle")
    .attr("fill", t.text).attr("font-size", 26).attr("font-weight", 700).text("Return Contact Depth");
}

/* ================================================================== *
 * C. SHOT PLACEMENT — where balls that landed IN came down, with the
 *    direction they were travelling.  Misses live in the net-error view
 *    below, so this court stays readable.               (BTC winners/return-place)
 * ================================================================== */
function placementCourt(sel, p, theme, opts) {
  opts = opts || {};
  const { svg, t } = svgBase(sel, theme, `0 0 ${BTC.W} 880`);
  const x = d3.scaleLinear().domain([-350, 350]).range([0, BTC.W]);
  const y = d3.scaleLinear().domain([-130, 545]).range([742, 96]);
  drawCourt(svg, x, y, t);

  svg.append("defs").append("marker").attr("id", "arw" + (opts.id || ""))
    .attr("viewBox", "0 0 10 10").attr("refX", 7).attr("refY", 5)
    .attr("markerWidth", 4).attr("markerHeight", 4).attr("orient", "auto")
    .append("path").attr("d", "M 0 0 L 10 5 L 0 10 Z").attr("fill", "#111");

  [-52.5, 52.5].forEach((xx) => {
    svg.append("line").attr("x1", x(xx)).attr("y1", y(0)).attr("x2", x(xx)).attr("y2", y(455))
      .attr("stroke", "#fff").attr("stroke-width", 2).attr("stroke-dasharray", "6,6");
  });

  // only balls that actually landed in the court keep this map honest
  let data = p.ground.filter((d) => d.res === "i" && d.bx !== null && d.by !== null
                                    && d.by > 0 && d.by < 470 && Math.abs(d.bx) < 240);
  if (opts.filter) data = data.filter(opts.filter);

  const g = svg.append("g");
  data.forEach((d) => {
    const px = x(d.bx), py = y(d.by);
    const dx = d.bx - d.x, dy = d.by - d.y, L = Math.hypot(dx, dy) || 1;
    g.append("line")
      .attr("x1", px - (dx / L) * 38).attr("y1", py + (dy / L) * 38)
      .attr("x2", px).attr("y2", py)
      .attr("stroke", "#111").attr("stroke-width", 1.6).attr("opacity", 0.55)
      .attr("marker-end", `url(#arw${opts.id || ""})`);
    const col = d.won ? BTC.won : BTC.lost;
    const node = d.wing === "B"
      ? g.append("polygon").attr("points", `${px},${py - 7} ${px - 6.5},${py + 5.5} ${px + 6.5},${py + 5.5}`)
      : g.append("circle").attr("cx", px).attr("cy", py).attr("r", 6.2);
    node.attr("fill", col).attr("stroke", "#000").attr("stroke-width", 0.8)
      .append("title").text(
        `${d.wing === "F" ? "Forehand" : "Backhand"}` +
        `${d.dir === "C" ? " crosscourt" : d.dir === "L" ? " down the line" : ""}` +
        ` · point ${d.won ? "won" : "lost"}${d.mph ? " · " + Math.round(d.mph) + " mph" : ""}`);
  });

  const bands = [[-350, -52.5, -105], [-52.5, 52.5, 0], [52.5, 350, 105]];
  const items = bands.map(([lo, hi, xx]) => {
    const gg = data.filter((d) => d.bx >= lo && d.bx < hi);
    return gg.length ? { x: xx, n: gg.length, win: d3.mean(gg, (d) => (d.won ? 1 : 0)) } : null;
  }).filter(Boolean);
  pills(svg, x, y, items, -60, -105, t);

  legendBox(svg, x(0), 46, [
    { label: "FH", color: BTC.won }, { label: "BH", color: BTC.won, shape: "tri" },
    { label: "Point won", color: BTC.won }, { label: "Point lost", color: BTC.lost },
  ], t, 470);
  svg.append("text").attr("x", x(0)).attr("y", 858).attr("text-anchor", "middle")
    .attr("fill", t.text).attr("font-size", 26).attr("font-weight", 700)
    .text(opts.title || "Shot Placement");
  svg.append("text").attr("x", x(0)).attr("y", 828).attr("text-anchor", "middle")
    .attr("fill", t.text).attr("font-size", 15).attr("opacity", .85)
    .text(`${data.length} balls that landed in · arrow shows direction of travel`);
}

/* ================================================================== *
 * C2. NET / LONG ERRORS — contact point of every miss     (BTC net-errors)
 * ================================================================== */
function errorCourt(sel, p, theme, opts) {
  opts = opts || {};
  const { svg, t } = svgBase(sel, theme, `0 0 ${BTC.W} 760`);
  const x = d3.scaleLinear().domain([-350, 350]).range([0, BTC.W]);
  const y = d3.scaleLinear().domain([-640, 120]).range([640, 60]);

  svg.append("rect").attr("x", x(-210)).attr("y", y(25))
    .attr("width", x(210) - x(-210)).attr("height", y(-455) - y(25)).attr("fill", t.court);
  [{ x1: 210, y1: 25, x2: 210, y2: -455 }, { x1: -210, y1: 25, x2: -210, y2: -455 },
   { x1: 157.5, y1: 25, x2: 157.5, y2: -455 }, { x1: -157.5, y1: 25, x2: -157.5, y2: -455 },
   { x1: 240, y1: 0, x2: -240, y2: 0, width: 7 }, { x1: 0, y1: 25, x2: 0, y2: -245 },
   { x1: 157.5, y1: -245, x2: -157.5, y2: -245 },
   { x1: 211.25, y1: -455, x2: -211.25, y2: -455 }].forEach((d) => {
    svg.append("line").attr("x1", x(d.x1)).attr("y1", y(d.y1))
      .attr("x2", x(d.x2)).attr("y2", y(d.y2))
      .attr("stroke", "#fff").attr("stroke-width", d.width || 4);
  });

  svg.append("defs").append("marker").attr("id", "arwE")
    .attr("viewBox", "0 0 10 10").attr("refX", 7).attr("refY", 5)
    .attr("markerWidth", 4).attr("markerHeight", 4).attr("orient", "auto")
    .append("path").attr("d", "M 0 0 L 10 5 L 0 10 Z").attr("fill", "#111");

  // contact point of every ball that did not land in, mirrored onto the hitter's half
  let miss = p.ground.filter((d) => d.res !== "i");
  if (opts.filter) miss = miss.filter(opts.filter);
  const g = svg.append("g");
  miss.forEach((d) => {
    const px = x(d.x), py = y(Math.max(-635, Math.min(115, d.y)));
    if (d.bx !== null) {
      const dx = d.bx - d.x, dy = (d.by - d.y), L = Math.hypot(dx, dy) || 1;
      g.append("line").attr("x1", px).attr("y1", py)
        .attr("x2", px + (dx / L) * 46).attr("y2", py - (dy / L) * 46)
        .attr("stroke", "#111").attr("stroke-width", 1.8).attr("opacity", .7)
        .attr("marker-end", "url(#arwE)");
    }
    const col = d.res === "n" ? "#d1372f" : "#f2a900";
    const node = d.wing === "B"
      ? g.append("polygon").attr("points", `${px},${py - 7} ${px - 6.5},${py + 5.5} ${px + 6.5},${py + 5.5}`)
      : g.append("circle").attr("cx", px).attr("cy", py).attr("r", 6.2);
    node.attr("fill", col).attr("stroke", "#000").attr("stroke-width", 0.8)
      .append("title").text(`${d.wing === "F" ? "Forehand" : "Backhand"} · ${d.res === "n" ? "into the net" : "long or wide"}`);
  });

  const nNet = miss.filter((d) => d.res === "n").length;
  const nOut = miss.filter((d) => d.res === "o").length;
  [["Into the net", nNet, "#d1372f", -105], ["Long or wide", nOut, "#f2a900", 105]].forEach(([l, n, c, xx]) => {
    svg.append("rect").attr("x", x(xx) - 78).attr("y", y(60) - 15).attr("width", 156)
      .attr("height", 30).attr("rx", 15).attr("fill", c).attr("stroke", "#fff");
    svg.append("text").attr("x", x(xx)).attr("y", y(60) + 6).attr("text-anchor", "middle")
      .attr("fill", "#fff").attr("font-weight", 700).attr("font-size", 16).text(`${l}: ${n}`);
  });

  legendBox(svg, x(0), y(-150), [
    { label: "FH", color: "#d1372f" }, { label: "BH", color: "#d1372f", shape: "tri" },
    { label: "Net", color: "#d1372f" }, { label: "Long / wide", color: "#f2a900" },
  ], t, 430);
  svg.append("text").attr("x", x(0)).attr("y", 735).attr("text-anchor", "middle")
    .attr("fill", t.text).attr("font-size", 26).attr("font-weight", 700)
    .text(opts.title || "Where the Misses Came From");
}

/* ================================================================== *
 * D. HEAD-TO-HEAD SUMMARY BARS                              (BTC)
 * ================================================================== */
function h2hStats(sel, p) {
  const me = p.me, opp = p.oppName, S = p.h2h;
  const A = S[me], B = S[opp];
  const rows = [
    { label: "Aces", a: A.aces, b: B.aces, raw: true },
    { label: "Double Faults", a: A.df, b: B.df, raw: true, lowGood: true },
    { label: "1st Serve In", a: A.firstIn, b: B.firstIn },
    { label: "Service Points Won", a: A.svcPts, b: B.svcPts },
    { label: "Groundstrokes In", a: A.gsIn, b: B.gsIn },
    { label: `Rally 0–4 shots`, a: null, b: null, head: true },
  ];
  S.rally.forEach((r) => rows.push({
    label: `Rally ${r.b} shots`, a: [r.mine, r.n], b: [r.n - r.mine, r.n],
  }));
  rows.splice(rows.findIndex((r) => r.head), 1);

  const W = 1000, rowH = 74, top = 74, H = top + rows.length * rowH + 20;
  const svg = d3.select(sel).html("").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet").attr("class", "chart");
  svg.append("rect").attr("width", "100%").attr("height", "100%").attr("fill", "#fff");

  svg.append("text").attr("x", 20).attr("y", 34).attr("font-size", 23).attr("font-weight", 700).text(me);
  svg.append("text").attr("x", W - 20).attr("y", 34).attr("text-anchor", "end")
    .attr("font-size", 23).attr("font-weight", 700).text(opp);

  const mid = W / 2, half = 300, gap = 6;
  rows.forEach((r, i) => {
    const gy = top + i * rowH;
    const val = (v) => (Array.isArray(v) ? (v[1] ? v[0] / v[1] : 0) : v);
    const av = val(r.a), bv = val(r.b);
    const share = r.raw ? (av + bv ? av / (av + bv) : 0.5) : av / ((av + bv) || 1);
    const aFrac = r.raw ? share : (av + bv ? av / (av + bv) : 0.5);

    svg.append("text").attr("x", mid).attr("y", gy - 8).attr("text-anchor", "middle")
      .attr("font-size", 19).attr("fill", "#555").text(r.label);

    svg.append("rect").attr("x", mid - half - gap).attr("y", gy + 4).attr("width", half)
      .attr("height", 22).attr("rx", 11).attr("fill", "#d4e5f3");
    svg.append("rect").attr("x", mid + gap).attr("y", gy + 4).attr("width", half)
      .attr("height", 22).attr("rx", 11).attr("fill", "#fef7cd");
    svg.append("rect").attr("x", mid - gap - half * aFrac).attr("y", gy + 4)
      .attr("width", half * aFrac).attr("height", 22).attr("rx", 11).attr("fill", "#2596be");
    svg.append("rect").attr("x", mid + gap).attr("y", gy + 4)
      .attr("width", half * (1 - aFrac)).attr("height", 22).attr("rx", 11).attr("fill", "#fcd404");

    const show = (v) => (Array.isArray(v) ? pct0(v[1] ? v[0] / v[1] : 0) : String(v));
    const sub = (v) => (Array.isArray(v) ? `(${v[0]}/${v[1]})` : "");
    const better = r.raw ? (r.lowGood ? av < bv : av > bv) : av > bv;

    if (better) {
      svg.append("rect").attr("x", mid - half - gap - 96).attr("y", gy + 1)
        .attr("width", 78).attr("height", 28).attr("rx", 14)
        .attr("fill", "none").attr("stroke", "#2974af").attr("stroke-width", 2);
    }
    svg.append("text").attr("x", mid - half - gap - 57).attr("y", gy + 21)
      .attr("text-anchor", "middle").attr("font-size", 20).attr("font-weight", 700).text(show(r.a));
    svg.append("text").attr("x", mid - half - gap - 57).attr("y", gy + 40)
      .attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#777").text(sub(r.a));
    svg.append("text").attr("x", mid + half + gap + 57).attr("y", gy + 21)
      .attr("text-anchor", "middle").attr("font-size", 20).attr("font-weight", 700).text(show(r.b));
    svg.append("text").attr("x", mid + half + gap + 57).attr("y", gy + 40)
      .attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#777").text(sub(r.b));
  });

  svg.append("text").attr("x", mid).attr("y", H - 4).attr("text-anchor", "middle")
    .attr("font-size", 17).attr("fill", "#555")
    .text(`Average rally length: ${p.h2h.avgRally} shots`);
}

/* ================================================================== *
 * E. RALLY-LENGTH BARS — the editorial alternative
 * ================================================================== */
function rallyBars(sel, p, accent) {
  const W = 1000, H = 430, m = { t: 70, r: 30, b: 82, l: 70 };
  const svg = d3.select(sel).html("").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet").attr("class", "chart");
  svg.append("rect").attr("width", "100%").attr("height", "100%").attr("fill", "#fff");
  const data = p.rally;
  const x = d3.scaleBand().domain(data.map((d) => d.bucket)).range([m.l, W - m.r]).padding(0.3);
  const y = d3.scaleLinear().domain([0, 0.8]).range([H - m.b, m.t]);

  svg.append("text").attr("x", m.l - 12).attr("y", 38).attr("font-size", 19)
    .attr("font-weight", 700).attr("fill", "#555").text("Share of points won, by rally length");
  svg.append("line").attr("x1", m.l - 10).attr("x2", W - m.r).attr("y1", y(0.5)).attr("y2", y(0.5))
    .attr("stroke", "#bbb").attr("stroke-dasharray", "6,6").attr("stroke-width", 2);
  svg.append("text").attr("x", m.l - 16).attr("y", y(0.5) + 5).attr("text-anchor", "end")
    .attr("font-size", 15).attr("fill", "#777").text("50%");

  svg.selectAll("rect.b").data(data).enter().append("rect")
    .attr("x", (d) => x(d.bucket)).attr("width", x.bandwidth())
    .attr("y", (d) => y(d.won)).attr("height", (d) => H - m.b - y(d.won))
    .attr("rx", 9).attr("fill", (d) => (d.won >= 0.5 ? accent : "#d5d5d5"));
  svg.selectAll("text.v").data(data).enter().append("text")
    .attr("x", (d) => x(d.bucket) + x.bandwidth() / 2).attr("y", (d) => y(d.won) - 14)
    .attr("text-anchor", "middle").attr("font-size", 30).attr("font-weight", 700)
    .text((d) => pct0(d.won));
  svg.selectAll("text.l").data(data).enter().append("text")
    .attr("x", (d) => x(d.bucket) + x.bandwidth() / 2).attr("y", H - m.b + 30)
    .attr("text-anchor", "middle").attr("font-size", 19).attr("fill", "#333")
    .text((d) => d.bucket + " shots");
  svg.selectAll("text.n").data(data).enter().append("text")
    .attr("x", (d) => x(d.bucket) + x.bandwidth() / 2).attr("y", H - m.b + 52)
    .attr("text-anchor", "middle").attr("font-size", 15).attr("fill", "#888")
    .text((d) => d.n + " pts");
  svg.append("line").attr("x1", m.l - 10).attr("x2", W - m.r)
    .attr("y1", H - m.b).attr("y2", H - m.b).attr("stroke", "#222").attr("stroke-width", 2);
}

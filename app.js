/* Page assembly. Every visual slot offers more than one option so the final
   look can be chosen by eye; the tab strip above each chart switches between
   them and the theme control at the top switches all courts at once. */

const VIDEO = {
  spencer: "NVhM0fEcu3U",   // Johnson vs Djuric (USC) — UCLA Tennis Consulting channel
  rudy: "6iLvp5WOi-Q",      // Quan vs Trouve (USC)
};

const THEME = "classic";
const REGISTRY = [];

const mmss = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

/* Mount a slot: builds the tab strip, renders the active option. */
function slot(hostSel, options) {
  const host = document.querySelector(hostSel);
  if (!host) return;
  host.innerHTML =
    `<div class="vizTabs"></div><div class="vizStage"><svg></svg></div>`;
  const tabs = host.querySelector(".vizTabs");
  const svg = host.querySelector("svg");
  const entry = { host, options, active: 0, svg };
  REGISTRY.push(entry);

  if (options.length < 2) tabs.style.display = "none";
  options.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "vizTab" + (i === 0 ? " on" : "");
    b.textContent = o.name;
    b.onclick = () => {
      entry.active = i;
      [...tabs.children].forEach((c, j) => c.classList.toggle("on", j === i));
      draw(entry);
    };
    tabs.appendChild(b);
  });
  draw(entry);
}

function draw(entry) {
  const o = entry.options[entry.active];
  entry.host.querySelector(".vizStage").className =
    "vizStage" + (o.dark === false ? "" : " dark");
  o.render(entry.svg, THEME);
}

function redrawAll() { REGISTRY.forEach(draw); }

/* ---------------- clips ---------------- */
function pickClips(p) {
  const mine = p.clips.filter((c) => c.winner === p.me);
  const out = [];
  ["Longest rally", "Biggest serve", "Cleanest strike"].forEach((k) => {
    const c = mine.find((x) => x.kind === k);
    if (c) out.push(c);
  });
  mine.forEach((c) => { if (out.length < 3 && !out.includes(c)) out.push(c); });
  return out.slice(0, 3);
}

function renderClips(sel, p, key) {
  const host = document.querySelector(sel);
  if (!host) return;
  const vid = VIDEO[key];
  host.innerHTML = pickClips(p).map((c) => {
    const t = Math.max(0, Math.floor(c.t) - 4);
    const frame = vid
      ? `<iframe src="https://www.youtube.com/embed/${vid}?start=${t}&rel=0" title="${c.kind}"
           loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
      : `<div class="placeholder"><div class="l">MATCH VIDEO AT</div><div class="t">${mmss(c.t)}</div></div>`;
    const inner = `
      <div class="frame">${frame}</div>
      <div class="body">
        <div class="k">${c.kind.toUpperCase()}</div>
        <div class="n">${c.note.charAt(0).toUpperCase() + c.note.slice(1)}</div>
        <div class="w">Point won by ${c.winner} &middot; ${mmss(c.t)}</div>
      </div>`;
    return vid
      ? `<a class="clip" href="https://www.youtube.com/watch?v=${vid}&t=${t}s" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="clip">${inner}</div>`;
  }).join("");
}

/* ---------------- build ---------------- */
d3.json("data.json").then((data) => {
  const sp = data.spencer, ru = data.rudy;

  /* ---- Spencer ---- */
  slot("#sp-flow", [
    { name: "Match flow", dark: false, render: (el) => flowChart(el, sp, "#2d68c4", "Point margin — Johnson vs Djuric") },
    { name: "How points ended", dark: false, render: (el) => endedBars(el, sp, "#2d68c4") },
  ]);
  slot("#sp-rally", [
    { name: "Rally length bars", dark: false, render: (el) => rallyBars(el, sp, "#2d68c4") },
    { name: "Head-to-head summary", dark: false, render: (el) => h2hStats(el, sp) },
  ]);

  slot("#sp-serve", [
    { name: "Serve placement", render: (el) => serveCourt(el, sp, THEME) },
    { name: "Light", render: (el) => serveCourt(el, sp, "light"), dark: false },
  ]);

  slot("#sp-shots", [
    { name: "Miss map", render: (el) => errorCourt(el, sp, THEME) },
    { name: "FH landing spots", render: (el) => placementCourt(el, sp, THEME, { id: "spf", filter: (d) => d.wing === "F", title: "Forehand Placement" }) },
    { name: "Point-enders", render: (el) => placementCourt(el, sp, THEME, { id: "spl", filter: (d) => d.last, title: "Point-Ending Shots" }) },
  ]);

  slot("#sp-return", [
    { name: "Return contact depth", render: (el) => returnCourt(el, sp, THEME) },
  ]);

  renderClips("#sp-clips", sp, "spencer");
  slot("#sp-season", [
    { name: "Season strips", dark: false, render: (el) => seasonStrip(el, sp.season.strip, "#2d68c4", "USC") },
  ]);
  workOn("#sp-work", sp.season.cards, "#2d68c4");

  /* ---- Rudy ---- */
  slot("#ru-ended", [
    { name: "How points ended", dark: false, render: (el) => endedBars(el, ru, "#f2a900") },
  ]);
  slot("#ru-flow", [
    { name: "Match flow", dark: false, render: (el) => flowChart(el, ru, "#f2a900", "Point margin — Quan vs Trouve") },
  ]);
  slot("#ru-rally", [
    { name: "Rally length bars", dark: false, render: (el) => rallyBars(el, ru, "#f2a900") },
    { name: "Head-to-head summary", dark: false, render: (el) => h2hStats(el, ru) },
  ]);

  slot("#ru-serve", [
    { name: "Serve placement", render: (el) => serveCourt(el, ru, THEME) },
    { name: "Light", render: (el) => serveCourt(el, ru, "light"), dark: false },
  ]);

  slot("#ru-shots", [
    { name: "Miss map", render: (el) => errorCourt(el, ru, THEME) },
    { name: "FH landing spots", render: (el) => placementCourt(el, ru, THEME, { id: "ruf", filter: (d) => d.wing === "F", title: "Forehand Placement" }) },
    { name: "Point-enders", render: (el) => placementCourt(el, ru, THEME, { id: "rul", filter: (d) => d.last, title: "Point-Ending Shots" }) },
  ]);

  slot("#ru-return", [
    { name: "Return contact depth", render: (el) => returnCourt(el, ru, THEME) },
  ]);

  renderClips("#ru-clips", ru, "rudy");
  slot("#ru-season", [
    { name: "Season strips", dark: false, render: (el) => seasonStrip(el, ru.season.strip, "#f2a900", "USC (Feb)") },
  ]);
  workOn("#ru-work", ru.season.cards, "#f2a900");
}).catch((e) => console.error("data.json failed to load", e));

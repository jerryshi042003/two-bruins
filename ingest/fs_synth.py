#!/usr/bin/env python3
"""Per-player synthesis: read every computed signal (stats + enrichment +
patterns), score candidate insights by how far above/below baseline they are,
and pick each player's defining STRENGTH and WEAKNESS + an archetype. This is
the 'analyze a lot, then decide what matters for THIS player' layer that lets
each dashboard lead with its own headline instead of a fixed template."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))

def load(f): return json.load(open(os.path.join(HERE, '..', f)))
DD = load('dashboard-data.json')
EN = load('player_enrich.json')
PT = load('player_patterns.json')

def pct(x): return None if x is None else round(x * 100)

def synth(gender, p):
    key = f'{gender}::{p["name"]}'
    e = EN.get(key, {}); pt = PT.get(key, {})
    first = p['name'].split()[0]
    S = []  # strengths (score, text)
    W = []  # weaknesses (score, text)

    # --- serve zones (from patterns) ---
    serve = pt.get('serve', [])
    base = pt.get('baseWin', 0.5)
    for s in serve:
        if s['n'] >= 8 and s['winPct'] is not None:
            lift = s['winPct'] - base
            label = f"{s['side']} {s['zone']}".lower()
            if lift >= 0.12:
                S.append((abs(lift) + s['n'] / 200, f"the {label} serve is a weapon — {pct(s['winPct'])}% won over {s['n']} tries"))
            if lift <= -0.10:
                W.append((abs(lift) + s['n'] / 200, f"the {label} serve leaks — only {pct(s['winPct'])}% won ({s['n']} tries)"))

    # --- win/loss signature ---
    ws, ls = e.get('winSig', {}), e.get('lossSig', {})
    if ws.get('oppErrorPct', 0) >= 0.75:
        S.append((0.30 + ws['oppErrorPct'] - 0.75, f"relentless consistency — {pct(ws['oppErrorPct'])}% of won points come from forcing errors, not swinging for winners"))
    if ws.get('ownWinnerPct', 0) >= 0.34:
        S.append((0.28 + ws['ownWinnerPct'] - 0.34, f"a first-strike game — ends {pct(ws['ownWinnerPct'])}% of won points with an outright winner ({ws.get('topWing','')})"))
    if ls.get('ownErrorPct', 0) >= 0.80:
        W.append((0.30 + ls['ownErrorPct'] - 0.80, f"gives too much away — {pct(ls['ownErrorPct'])}% of lost points are unforced errors, mostly the {ls.get('topWing','forehand')}"))

    # --- shot-making by wing (from stats) ---
    for wing in ('Forehand', 'Backhand'):
        w = p.get('winners', {}).get(wing, 0); er = p.get('errors', {}).get(wing, 0)
        if er >= 25 and er >= 3 * max(1, w):
            W.append((0.25 + er / 200, f"the {wing.lower()} is a liability — {w} winners against {er} errors"))
        if w >= 15 and w >= er:
            S.append((0.22 + w / 200, f"the {wing.lower()} does damage — {w} winners to {er} errors"))

    # --- net ---
    net = p.get('net')
    if net and net['n'] >= 12:
        reach = net['n'] / p['points']
        if net['pct'] and net['pct'] >= 0.62 and reach < 0.16:
            S.append((0.20 + net['pct'] - 0.62, f"lethal but shy at net — wins {pct(net['pct'])}% up there yet comes in on only {pct(reach)}% of points"))

    # --- break points ---
    bp = p.get('bp', {})
    if bp.get('convN', 0) >= 12 and bp.get('convPct') is not None:
        if bp['convPct'] >= 0.55: S.append((0.18 + bp['convPct'] - 0.55, f"clutch on return — converts {pct(bp['convPct'])}% of break points ({bp['conv']}/{bp['convN']})"))
        if bp['convPct'] <= 0.35: W.append((0.18 + 0.35 - bp['convPct'], f"leaves breaks out there — only {pct(bp['convPct'])}% of break points converted"))

    # --- rally length tendency ---
    rally = {r['bucket']: r for r in p.get('rally', [])}
    short, long = rally.get('1-4'), rally.get('13+')
    if short and long and short['wonPct'] and long['wonPct']:
        if short['wonPct'] - long['wonPct'] >= 0.15:
            S.append((0.16, f"a quick-strike player — {pct(short['wonPct'])}% won in 1–4 shots but fades in long rallies ({pct(long['wonPct'])}%)"))
        if long['wonPct'] - short['wonPct'] >= 0.15:
            S.append((0.16, f"an attritional player — only {pct(short['wonPct'])}% early but {pct(long['wonPct'])}% once past 13 shots"))

    S.sort(reverse=True); W.sort(reverse=True)
    strength = S[0][1] if S else None
    weakness = W[0][1] if W else None

    # archetype
    arche = 'all-court'
    if serve:
        best = max(serve, key=lambda s: (s['winPct'] or 0) if s['n'] >= 8 else 0)
        if ws.get('oppErrorPct', 0) >= 0.78: arche = 'grinder'
        elif ws.get('ownWinnerPct', 0) >= 0.35: arche = 'ball-striker'
        elif best and best.get('s1winPct', 0) and best['s1winPct'] >= 0.5: arche = 'big server'
    return dict(name=p['name'], gender=gender, archetype=arche, strength=strength, weakness=weakness,
                keyStat=None)

def main():
    out = {}
    for g in ('men', 'women'):
        for p in DD[g]:
            out[f'{g}::{p["name"]}'] = synth(g, p)
    json.dump(out, open(os.path.join(HERE, '..', 'player_synth.json'), 'w'), indent=1)
    for k in sorted(out):
        s = out[k]
        print(f"{k}\n   [{s['archetype']}] STRENGTH: {s['strength']}\n   WEAKNESS: {s['weakness']}")

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Deep per-player pattern analysis for the court visuals. For each player,
computes every serve/return/point-ending pattern from the raw points, plus a
serve+1 read (server finishing in <=3 shots), then flags the single most
significant, above-baseline pattern so each player's dashboard can lead with
what actually matters for THEM (not a generic section)."""
import json, os
from collections import defaultdict, Counter
import fs_build2 as F2
import fs_build as B

HERE = os.path.dirname(os.path.abspath(__file__))
PH = B.PLACEHOLDER

def rate(a, b): return round(a / b, 3) if b else None

def analyze(U, docs):
    # accumulators
    serve = defaultdict(lambda: {'n': 0, 'won': 0, 'ace': 0, 's1win': 0, 's1err': 0, 's1n': 0})  # (side,zone)
    ret = defaultdict(lambda: {'n': 0, 'won': 0})          # (wing,dir)
    endW = defaultdict(int)                                 # (wing,dir) winners by player
    endE = defaultdict(int)                                 # (wing,dir) errors by player
    serveReturn = defaultdict(lambda: Counter())            # serve zone -> return direction faced (what comes back)
    totals = {'servePts': 0, 'retPts': 0, 'points': 0, 'won': 0}

    for U2, f in docs:
        for p in f['points']:
            wb = p.get('pointWonBy')
            if wb in PH: continue
            won = (wb == U2)
            totals['points'] += 1
            if won: totals['won'] += 1
            rc = p.get('rallyCount') or 0
            try: rc = int(rc)
            except: rc = 0
            # SERVE (player serving)
            if p.get('serverName') == U2:
                totals['servePts'] += 1
                side = 'Ad' if 'Ad' in str(p.get('side', '')) else 'Deuce'
                z = p.get('firstServeZone') if str(p.get('firstServeIn')) in ('1', '1.0', 'True') else p.get('secondServeZone')
                if z in ('T', 'Body', 'Wide'):
                    k = (side, z)
                    serve[k]['n'] += 1
                    if won: serve[k]['won'] += 1
                    if str(p.get('isAce')).strip() in ('1', 'True', 'true', 'Yes'): serve[k]['ace'] += 1
                    # serve+1: how often this serve produces a quick point win (<=3 shots),
                    # i.e. the serve set up an easy finish rather than a long rally.
                    if rc <= 3 and won:
                        serve[k]['s1win'] += 1
                    rd = p.get('returnDirection')
                    if rd: serveReturn[k][rd] += 1
            # RETURN (player returning)
            if p.get('returnerName') == U2:
                totals['retPts'] += 1
                wing = p.get('returnFhBh'); d = p.get('returnDirection')
                if wing:
                    k = (wing, d or '')
                    ret[k]['n'] += 1
                    if won: ret[k]['won'] += 1
            # POINT ENDING by player
            if p.get('lastShotHitBy') == U2:
                wing = p.get('lastShotFhBh'); d = p.get('lastShotDirection'); res = p.get('lastShotResult')
                if wing and res == 'Winner': endW[(wing, d or '')] += 1
                elif wing and res == 'Error': endE[(wing, d or '')] += 1

    baseWin = rate(totals['won'], totals['points']) or 0.5
    serveRows = [dict(side=s, zone=z, n=v['n'], won=v['won'], winPct=rate(v['won'], v['n']),
                      ace=v['ace'], quickWin=v['s1win'], s1winPct=rate(v['s1win'], v['n']),
                      topReturn=serveReturn[(s, z)].most_common(1)[0][0] if serveReturn[(s, z)] else None)
                 for (s, z), v in serve.items()]
    retRows = [dict(wing=w, dir=d, n=v['n'], winPct=rate(v['won'], v['n'])) for (w, d), v in ret.items()]
    winRows = [dict(wing=w, dir=d, n=n) for (w, d), n in sorted(endW.items(), key=lambda x: -x[1])]
    errRows = [dict(wing=w, dir=d, n=n) for (w, d), n in sorted(endE.items(), key=lambda x: -x[1])]

    # ---- pick the single most significant serve pattern (>=8 uses, biggest win%-vs-baseline) ----
    sig = None
    for r in serveRows:
        if r['n'] >= 8 and r['winPct'] is not None:
            lift = r['winPct'] - baseWin
            if sig is None or abs(lift) > abs(sig['lift']):
                sig = dict(kind='serve', side=r['side'], zone=r['zone'], n=r['n'],
                           winPct=r['winPct'], lift=round(lift, 3),
                           s1winPct=r['s1winPct'], topReturn=r['topReturn'])
    return dict(baseWin=baseWin, servePts=totals['servePts'], serve=serveRows, ret=retRows,
                winners=winRows, errors=errRows, signature=sig)

def main():
    groups = defaultdict(list)
    for key, (col, f, rc) in F2.best.items():
        nm = f.get('name', '') or ''
        if nm and B.is_excluded(nm): continue
        g = F2.gender_of(col, f)
        if g is None: continue
        U, disp = F2.identify2(f)
        if U is None: continue
        groups[(g, disp)].append((U, f))
    out = {}
    for (g, disp), docs in groups.items():
        out[f'{g}::{disp}'] = analyze(None, docs)
    json.dump(out, open(os.path.join(HERE, '..', 'player_patterns.json'), 'w'), indent=1)
    for k in sorted(out):
        s = out[k]['signature']
        if s:
            print(f"{k:28} {s['side']} {s['zone']} serve: {int(s['winPct']*100)}% ({s['n']}x, {'+' if s['lift']>=0 else ''}{int(s['lift']*100)} vs avg), "
                  f"return comes back {s['topReturn']}")
    print('\nwrote player_patterns.json')

if __name__ == '__main__':
    main()

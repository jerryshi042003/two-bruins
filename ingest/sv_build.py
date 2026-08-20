#!/usr/bin/env python3
"""Batch-parse every raw SwingVision match in data-collection into per-UCLA-player
rich analytics: real serve-bounce coordinates (heatmap), contact height, speed,
serve+1 (explicitly tagged), court position, and winners/errors with coordinates.
Run with /usr/bin/python3 (has openpyxl)."""
import os, json, glob, re
from collections import defaultdict
import sv_parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, 'raw', 'data-collection')

# UCLA roster (surnames as they appear in SwingVision host/guest names)
UCLA = {
    'quan': 'Rudy Quan', 'johnson': 'Spencer Johnson', 'hoogmartens': 'Alexander Hoogmartens',
    'revelli': 'Giacomo Revelli', 'ballotta': 'Gianluca Ballotta', 'ballota': 'Gianluca Ballotta',
    'nanda': 'Govind Nanda', 'bigun': 'Kaylan Bigun', 'tripathi': 'Aadarsh Tripathi',
    'sels': 'Emon Van Loben Sels', 'bismarck': 'Leo Von Bismarck', 'bismark': 'Leo Von Bismarck',
    'visaya': 'Azuma Visaya', 'gonzalez': 'Jorge Plans Gonzalez', 'plans': 'Jorge Plans Gonzalez',
    'chinlund': 'Cassius Chinlund', 'chindlund': 'Cassius Chinlund', 'nguyen': 'Andy Nguyen',
    # women (raw exports pulled from the UCLA tennis email)
    'tian fang ran': 'Tian Fang Ran', 'fang ran': 'Tian Fang Ran', 'tian': 'Tian Fang Ran',
    'wagle': 'Elise Wagle', 'elise': 'Elise Wagle', 'hance': 'Kimmi Hance', 'kimberly': 'Kimmi Hance',
    'guichard': 'Ahmani Guichard', 'lutkemeyer': 'Anne Lutkemeyer', 'fernandez': 'Bianca Fernandez',
    'vagramov': 'Sasha Vagramov', 'alexandra vagramov': 'Sasha Vagramov',
}
GENDER = {'Tian Fang Ran': 'women', 'Elise Wagle': 'women', 'Kimmi Hance': 'women',
          'Ahmani Guichard': 'women', 'Anne Lutkemeyer': 'women', 'Bianca Fernandez': 'women',
          'Sasha Vagramov': 'women'}
def ucla_of(name):
    n = (name or '').lower()
    for k, v in UCLA.items():
        if k in n: return v
    return None

def stats(L):
    if not L: return None
    L = sorted(L)
    return dict(n=len(L), mean=round(sum(L) / len(L), 2), p10=round(L[len(L) // 10], 2), p90=round(L[len(L) * 9 // 10], 2))

def blank():
    return dict(matches=0, shots=0, serveBounces=[], winnerLocs=[], errorLocs=[],
               serveHt=[], gsHt=[], speedServe=[], speedFH=[], speedBH=[], contactY=[],
               s1n=0, s1fh=0, s1win=0, points=0, won=0, matchNames=[],
               # serve signature: 'side|placement' -> [attempts, in, ptsWon, ptsStarted]
               serveSig=defaultdict(lambda: [0, 0, 0, 0]),
               # spin mix per wing: stroke -> {Topspin/Flat/Slice: n}
               spin=defaultdict(lambda: defaultdict(int)),
               gsN=0, gsHigh=0,               # high-contact groundstrokes (hz > 1.3m)
               riseAlong=[], riseEarly=0)     # incoming-bounce -> contact distance (on the rise)

NET = 11.885
def serve_spot(s):
    """(side, placement) for a serve from SwingVision's own tags; None if untagged."""
    zone = str(s['bounceZone'] or ''); d = str(s['direction'] or '').lower()
    side = 'deuce' if 'deuce' in zone else ('ad' if 'ad' in zone else None)
    place = 'wide' if 'wide' in d else ('T' if 'the t' in d else None)
    return (side, place) if side and place else None

def main():
    players = defaultdict(blank)
    files = sorted(glob.glob(os.path.join(ROOT, '**', '*.xlsx'), recursive=True))
    files += sorted(glob.glob(os.path.join(HERE, 'raw', 'email', '*.xlsx')))
    parsed = 0
    for f in files:
        if '~$' in f: continue
        try:
            shots, meta, points = sv_parse.read_shots(f)
        except Exception as e:
            continue
        if not shots or not meta: continue
        U = ucla_of(meta.get('host')) or ucla_of(meta.get('guest')) or ucla_of(os.path.basename(f))
        if not U: continue
        # which tagged name in shots is the UCLA player?
        names = set(s['player'] for s in shots)
        target = None
        for nm in names:
            if ucla_of(nm) == U: target = nm; break
        if not target:
            # host/guest match
            if ucla_of(meta.get('host')) == U: target = meta.get('host')
            elif ucla_of(meta.get('guest')) == U: target = meta.get('guest')
        if not target or target not in names: continue
        # UCLA player's role in this match, for linking serves to point winners
        role = 'host' if ucla_of(meta.get('host')) == U else ('guest' if ucla_of(meta.get('guest')) == U else None)
        a = players[U]; a['matches'] += 1; a['matchNames'].append(os.path.basename(f)[:44]); parsed += 1
        for s in shots:
            mine = (s['player'] == target)
            if mine:
                a['shots'] += 1
                if s['stroke'] == 'Serve':
                    if s['hz']: a['serveHt'].append(s['hz'])
                    if s['speed']: a['speedServe'].append(s['speed'])
                    inplay = str(s['result']).lower() in ('in', 'ace')
                    spot = serve_spot(s)
                    info = points.get((s['set'], s['game'], s['point']))
                    won = 1 if (inplay and info and role and info['winner'] == role) else 0
                    # serve bounce (where the serve lands) — only serves that went in;
                    # carry outcome + spot so the court visual can colour won/lost/ace by zone
                    if s['bx'] is not None and s['by'] is not None and inplay:
                        a['serveBounces'].append([round(s['bx'], 2), round(s['by'], 2), str(s['result']),
                                                  won, ('%s|%s' % spot) if spot else None])
                    # serve signature: attempts / in / point outcome by spot
                    if spot:
                        sig = a['serveSig']['%s|%s' % spot]; sig[0] += 1
                        if inplay:
                            sig[1] += 1
                            if info and role:               # this serve started the point
                                sig[3] += 1
                                if info['winner'] == role: sig[2] += 1
                elif s['stroke'] in ('Forehand', 'Backhand'):
                    a['gsN'] += 1
                    if s['spin']: a['spin'][s['stroke']][str(s['spin'])] += 1
                    if s['hz']:
                        a['gsHt'].append(s['hz'])
                        if s['hz'] > 1.3: a['gsHigh'] += 1
                    if s['speed']: (a['speedFH'] if s['stroke'] == 'Forehand' else a['speedBH']).append(s['speed'])
                    # court position folded to the player's OWN baseline: min(hy, L-hy).
                    # 0 = struck on the baseline; larger = contact taken deeper inside the
                    # court (earlier / on the rise); negative = struck behind the baseline.
                    # Groundstrokes only — a raw mean of hy is bimodal across the two ends
                    # and collapses to the net, so it must be folded before averaging.
                    if s['hy'] is not None and 0 <= s['hy'] <= 23.77:
                        a['contactY'].append(round(min(s['hy'], 23.77 - s['hy']), 2))
                if s['shotType'] == 'serve_plus_one':
                    a['s1n'] += 1
                    if s['stroke'] == 'Forehand': a['s1fh'] += 1
        # point endings: last shot of each point, by the UCLA player -> winner (In) or error (Net/Out)
        from collections import defaultdict as _dd
        pts = _dd(list)
        for s in shots:
            pts[(s['set'], s['game'], s['point'])].append(s)
        for _, ss in pts.items():
            last = ss[-1]
            if last['player'] == target and last['stroke'] != 'Serve':
                res = str(last['result']).lower(); wing = (last['stroke'] or '?')[0]
                vol = 1 if ('volley' in str(last['stroke']).lower() or 'volley' in str(last['shotType']).lower()) else 0
                hx = round(last['hx'], 2) if last['hx'] is not None else None
                hy = round(last['hy'], 2) if last['hy'] is not None else None
                if res == 'in' and last['bx'] is not None:
                    # bounce, wing, contact point (for the direction arrow), volley flag
                    a['winnerLocs'].append([round(last['bx'], 2), round(last['by'], 2), wing, hx, hy, vol])
                elif res in ('net', 'out') and last['bx'] is not None:
                    a['errorLocs'].append([round(last['bx'], 2), round(last['by'], 2), wing, res])
            # on the rise: how far past the incoming bounce the player took the ball.
            # incoming ball = previous shot's bounce, on the same side as this contact.
            for i, s in enumerate(ss):
                if i == 0 or s['player'] != target or s['stroke'] not in ('Forehand', 'Backhand'): continue
                prev = ss[i - 1]
                if s['hy'] is None or prev['by'] is None: continue
                if (prev['by'] < NET) != (s['hy'] < NET): continue   # bounce landed on this player's side
                along = abs(s['hy'] - prev['by'])
                a['riseAlong'].append(round(along, 2))
                if along < 1.0: a['riseEarly'] += 1

    def sig_out(sig):
        o = {}
        for k, (att, inn, won, den) in sig.items():
            if att < 4: continue
            o[k] = dict(att=att, inPct=round(inn / att, 3),
                        winPct=round(won / den, 3) if den else None, winN=den)
        return o or None

    def spin_out(spin):
        o = {}
        for wing in ('Forehand', 'Backhand'):
            tot = sum(spin[wing].values())
            if tot < 15: continue
            o[wing] = {k: round(v / tot, 3) for k, v in spin[wing].items()}
            o[wing]['n'] = tot
        return o or None

    out = {}
    for U, a in players.items():
        out[U] = dict(
            gender=GENDER.get(U, 'men'),
            matches=a['matches'], shots=a['shots'], matchNames=a['matchNames'],
            serveContactHt=stats(a['serveHt']), gsContactHt=stats(a['gsHt']),
            serveSpeed=stats(a['speedServe']), fhSpeed=stats(a['speedFH']), bhSpeed=stats(a['speedBH']),
            contactDepth=stats(a['contactY']),
            serveP1=dict(n=a['s1n'], fhShare=round(a['s1fh'] / a['s1n'], 3) if a['s1n'] else None),
            serveSignature=sig_out(a['serveSig']),
            spinMix=spin_out(a['spin']),
            htRegime=dict(highPct=round(a['gsHigh'] / a['gsN'], 3), n=a['gsN']) if a['gsN'] else None,
            onRise=dict(medAlong=stats(a['riseAlong'])['mean'] if a['riseAlong'] else None,
                        earlyPct=round(a['riseEarly'] / len(a['riseAlong']), 3) if a['riseAlong'] else None,
                        n=len(a['riseAlong'])) if a['riseAlong'] else None,
            serveBounces=a['serveBounces'][:600], winnerLocs=a['winnerLocs'][:300], errorLocs=a['errorLocs'][:400],
        )
    # write to the repo root — this is the file the dashboard actually fetches
    json.dump(out, open(os.path.join(HERE, '..', 'raw_players.json'), 'w'))
    print(f'parsed {parsed} matches across {len(out)} UCLA players\n')
    for U in sorted(out, key=lambda k: -out[k]['matches']):
        o = out[U]
        print(f"  {U:22} {o['matches']:>2}m {o['shots']:>5}sh  serveHt {o['serveContactHt']['mean'] if o['serveContactHt'] else '-'}m  "
              f"gsHt {o['gsContactHt']['mean'] if o['gsContactHt'] else '-'}m  serveSpd {o['serveSpeed']['mean'] if o['serveSpeed'] else '-'}  "
              f"depth {o['contactDepth']['mean'] if o['contactDepth'] else '-'}m  +1FH {o['serveP1']['fhShare']}  serves-plotted {len(o['serveBounces'])}")

if __name__ == '__main__':
    main()

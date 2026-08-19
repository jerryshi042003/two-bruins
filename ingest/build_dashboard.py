#!/usr/bin/env python3
"""Unified per-player dashboard builder for every UCLA player with tracked data.

Two raw formats are normalized into one schema:
  - Tennis-Viz shot-level CSVs (one row per shot)
  - tennis-hawkeye-data point-level CSVs (one row per point)

Every metric shown is computed from raw rows. Where a format cannot supply a
metric (e.g. net play is not tracked in the point-level export) the field is
left null and the dashboard omits it rather than inventing a number.
"""
import csv, json, os
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))

def num(x):
    try: return float(x)
    except (TypeError, ValueError): return None

def truthy(x):
    return str(x).strip() in ('1', '1.0', 'True', 'TRUE', 'true')

def bucket(rc):
    if rc is None: return None
    if rc <= 4: return '1-4'
    if rc <= 8: return '5-8'
    if rc <= 12: return '9-12'
    return '13+'

WING = {'Forehand': 'Forehand', 'Backhand': 'Backhand',
        'Forehand Volley': 'Forehand', 'Backhand Volley': 'Backhand',
        'Overhead': 'Overhead', 'Forehand Overhead': 'Overhead',
        'Dropshot': 'Dropshot', 'Lob': 'Lob'}

# ---------- accumulator ----------
def blank():
    return dict(points=0, ptsWon=0, servePts=0, firstIn=0, aces=0, df=0,
               placement=defaultdict(lambda: [0, 0]),   # (side,spot) -> [n, won]
               plus1N=0, plus1Fh=0,
               rally=defaultdict(lambda: [0, 0]),        # bucket -> [n, won]
               winners=Counter(), errors=Counter(),
               netN=0, netWon=0, hasNet=False,
               retN=0, retDepth=defaultdict(lambda: [0, 0]),
               matches=[])

# ---------- Tennis-Viz shot-level ----------
def add_shotlevel(acc, path, player):
    rows = list(csv.DictReader(open(path, newline='')))
    if not rows: return
    pts = defaultdict(list)
    for r in rows: pts[r.get('pointNumber')].append(r)
    opp = next((rows[0].get(k) for k in ('player1Name', 'player2Name')
                if rows[0].get(k) and rows[0].get(k) != player), '?')
    acc['matches'].append(dict(opp=opp, date=rows[0].get('Date', ''),
                               event=rows[0].get('Event', '') or rows[0].get('opponentTeam', ''),
                               fmt='shot'))
    acc['hasNet'] = True
    hand = rows[0].get('player1Hand') if rows[0].get('player1Name') == player else rows[0].get('player2Hand')
    if hand and not acc.get('hand'): acc['hand'] = hand
    for pn, shots in pts.items():
        if pn in (None, '', 'pointNumber'): continue
        shots.sort(key=lambda s: num(s.get('shotInRally')) or 0)
        first = shots[0]
        won_by = next((s['pointWonBy'] for s in reversed(shots) if s.get('pointWonBy')), None)
        won = (won_by == player)
        acc['points'] += 1
        if won: acc['ptsWon'] += 1
        server = first.get('serverName', '')
        if server == player:
            acc['servePts'] += 1
            side = first.get('side', '')
            fsi = num(first.get('firstServeIn'))
            if fsi == 1:
                acc['firstIn'] += 1
                z = first.get('firstServeZone', '')
                if z: _pl(acc, side, z, won)
            else:
                ssi = num(first.get('secondServeIn'))
                z = first.get('secondServeZone', '')
                if ssi == 1 and z: _pl(acc, side, z, won)
                elif ssi == 0: acc['df'] += 1
            if truthy(first.get('isAce')): acc['aces'] += 1
            for s in shots:
                if num(s.get('shotInRally')) == 3 and s.get('shotHitBy') == player:
                    acc['plus1N'] += 1
                    if s.get('shotFhBh') == 'Forehand': acc['plus1Fh'] += 1
        if first.get('returnerName') == player:
            for s in shots:
                if num(s.get('shotInRally')) == 2 and s.get('shotHitBy') == player:
                    d = s.get('depth', '')
                    if d:
                        acc['retN'] += 1
                        acc['retDepth'][d][0] += 1
                        if won: acc['retDepth'][d][1] += 1
        rc = num(first.get('rallyCount')) or max((num(s.get('shotInRally')) or 0) for s in shots)
        b = bucket(rc)
        if b:
            acc['rally'][b][0] += 1
            if won: acc['rally'][b][1] += 1
        p1 = player == first.get('player1Name')
        at_net = any(truthy(s.get('atNetPlayer1') if p1 else s.get('atNetPlayer2')) for s in shots)
        if at_net:
            acc['netN'] += 1
            if won: acc['netWon'] += 1
        for s in shots:
            if s.get('shotHitBy') != player: continue
            w = WING.get(s.get('shotFhBh', ''), s.get('shotFhBh', ''))
            if truthy(s.get('isWinner')) and w: acc['winners'][w] += 1
            if any(truthy(s.get(e)) for e in ('isErrorWideR', 'isErrorWideL', 'isErrorNet', 'isErrorLong')) and w:
                acc['errors'][w] += 1

def _pl(acc, side, spot, won):
    side = 'Ad' if 'Ad' in side else ('Deuce' if 'Deuce' in side else side)
    if spot not in ('T', 'Body', 'Wide'): return
    acc['placement'][(side, spot)][0] += 1
    if won: acc['placement'][(side, spot)][1] += 1

# ---------- hawkeye point-level ----------
def add_pointlevel(acc, path, player):
    rows = list(csv.DictReader(open(path, newline='')))
    if not rows: return
    opp = next((rows[0].get(k) for k in ('x: Player B', 'x: Player A')
                if rows[0].get(k) and rows[0].get(k) != player), '?')
    acc['matches'].append(dict(opp=opp, date=rows[0].get('x: Date', ''),
                               event=rows[0].get('x: Event', '') or rows[0].get('x: Opponent Team', ''),
                               fmt='point'))
    for r in rows:
        wonp = r.get('F1: Point Won', '')
        if not wonp: continue
        won = (wonp == player)
        acc['points'] += 1
        if won: acc['ptsWon'] += 1
        if r.get('A1: Server', '') == player:
            acc['servePts'] += 1
            sd = r.get('A2: Serve Data', '')
            if 'Ace' in sd: acc['aces'] += 1
            if sd.startswith('1st Serve'): acc['firstIn'] += 1
            if sd == 'Double Fault': acc['df'] += 1
            sp = r.get('A3: Serve Placement', '')
            side = 'Ad' if 'Ad' in r.get('H2: Deuce Ad', '') else 'Deuce'
            if sp in ('T', 'Body', 'Wide'): _pl(acc, side, sp, won)
            p1 = r.get('C1: Serve +1 Stroke', '')
            if p1:
                acc['plus1N'] += 1
                if 'Forehand' in p1: acc['plus1Fh'] += 1
        b = {'1 to 4': '1-4', '5 to 8': '5-8', '9 to 12': '9-12', '13+': '13+'}.get(r.get('H1: Stroke Count', ''))
        if b:
            acc['rally'][b][0] += 1
            if won: acc['rally'][b][1] += 1
        fsp = r.get('K1: Final Shot Player', '')
        stroke = WING.get(r.get('K2: Final Shot Stroke', ''), r.get('K2: Final Shot Stroke', ''))
        if fsp == f'Winner {player}' and stroke: acc['winners'][stroke] += 1
        elif fsp == f'Error {player}' and stroke: acc['errors'][stroke] += 1

# ---------- finalize ----------
def finalize(acc, name, gender):
    def rate(a, b): return round(a / b, 3) if b else None
    placement = [dict(side=s, spot=z, n=v[0], won=v[1],
                      wonPct=rate(v[1], v[0])) for (s, z), v in sorted(acc['placement'].items())]
    order = {'1-4': 0, '5-8': 1, '9-12': 2, '13+': 3}
    rally = [dict(bucket=b, n=v[0], wonPct=rate(v[1], v[0]))
             for b, v in sorted(acc['rally'].items(), key=lambda kv: order.get(kv[0], 9))]
    winT = sum(acc['winners'].values()); errT = sum(acc['errors'].values())
    ret = None
    if acc['retN']:
        ret = dict(n=acc['retN'], depth=[dict(zone=z, n=v[0], wonPct=rate(v[1], v[0]))
                   for z, v in acc['retDepth'].items()])
    return dict(
        name=name, gender=gender, hand=acc.get('hand', ''),
        matchesTracked=len(acc['matches']), matches=acc['matches'],
        points=acc['points'], ptsWon=acc['ptsWon'], winPct=rate(acc['ptsWon'], acc['points']),
        servePts=acc['servePts'], firstInPct=rate(acc['firstIn'], acc['servePts']),
        aces=acc['aces'], df=acc['df'],
        placement=placement,
        plus1N=acc['plus1N'], plus1FhSharePct=rate(acc['plus1Fh'], acc['plus1N']),
        rally=rally,
        winners=dict(acc['winners']), errors=dict(acc['errors']),
        winTotal=winT, errTotal=errT,
        net=(dict(n=acc['netN'], won=acc['netWon'], pct=rate(acc['netWon'], acc['netN']))
             if acc['hasNet'] and acc['netN'] else None),
        ret=ret,
    )

# roster: player -> (gender, [(file, format)]), season context from data.json
ROSTER = {
    'Spencer Johnson': ('men', [('johnson_pinto.csv', 'shot'), ('johnson_brunkow.csv', 'point')]),
    'Rudy Quan':       ('men', [('quan_thanos.csv', 'shot')]),
    'Govind Nanda':    ('men', [('nanda_basavareddy.csv', 'shot')]),
    'Anne Lutkemeyer': ('women', [('lutkemeyer_gagnon.csv', 'shot')]),
    'Elise Wagle':     ('women', [('wagle_chan.csv', 'shot'), ('wagle_komac.csv', 'shot')]),
    'Ahmani Guichard': ('women', [('guichard_cheong.csv', 'point')]),
}
SEASON = {'Spencer Johnson': 11, 'Rudy Quan': 19}

def main():
    out = {'men': [], 'women': []}
    for name, (gender, files) in ROSTER.items():
        acc = blank()
        for fn, fmt in files:
            path = os.path.join(HERE, fn)
            if not os.path.exists(path):
                print('MISSING', path); continue
            (add_shotlevel if fmt == 'shot' else add_pointlevel)(acc, path, name)
        p = finalize(acc, name, gender)
        p['seasonMatches'] = SEASON.get(name)
        out[gender].append(p)
    out['men'].sort(key=lambda p: -p['points'])
    out['women'].sort(key=lambda p: -p['points'])
    dest = os.path.join(HERE, '..', 'dashboard-data.json')
    json.dump(out, open(dest, 'w'), indent=1)
    for g in ('men', 'women'):
        print(f'== {g} ==')
        for p in out[g]:
            print(f"  {p['name']:16} {p['matchesTracked']}m {p['points']:>4}pt  win {p['winPct']}  "
                  f"1stIn {p['firstInPct']}  +1FH {p['plus1FhSharePct']}  W:E {p['winTotal']}:{p['errTotal']}  "
                  f"net {p['net']['pct'] if p['net'] else '-'}")
    print('wrote', os.path.normpath(dest))

if __name__ == '__main__':
    main()

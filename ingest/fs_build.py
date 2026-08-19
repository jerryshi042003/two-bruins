#!/usr/bin/env python3
"""Build per-player dashboards for every UCLA player from the full Firestore corpus.
One row per point (Firestore `points` array). Identifies the UCLA player per match,
merges name spellings, excludes test/demo/doubles/intra-squad matches, and aggregates
every match a player has into one normalized dashboard record."""
import json, os, re
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'fs_cache')

def truthy(x):
    return str(x).strip().lower() in ('1', 'true', 'yes', 'y')

WING = {'Forehand': 'Forehand', 'Backhand': 'Backhand',
        'Forehand Volley': 'Forehand Volley', 'Backhand Volley': 'Backhand Volley',
        'Overhead': 'Overhead', 'Volley': 'Volley'}

# exclude obvious non-match / test / doubles / intra-squad
EXCLUDE_SUB = ['stc', 'demo', 'babab', 'test', ' & ']
def is_excluded(name):
    n = (name or '').lower()
    if any(s in n for s in EXCLUDE_SUB): return True
    # intra-squad: "(UCLA)" appears on the opponent side (after vs)
    parts = re.split(r'\bvs\.?\b', name or '', maxsplit=1, flags=re.I)
    if len(parts) == 2 and 'ucla' in parts[1].lower(): return True
    return False

# canonical display-name merges
CANON = {
    'Tian Fangran': 'Tian Fang Ran', 'Tian Fang Ran': 'Tian Fang Ran',
    'Anne-Christine Lutkemeyer': 'Anne Lutkemeyer', 'Anne Lutkemeyer': 'Anne Lutkemeyer',
    'Gianluca Ballota': 'Gianluca Ballotta', 'Gianluca Ballotta': 'Gianluca Ballotta',
    'Jorge Gonzalez': 'Jorge Plans Gonzalez', 'Jorge Plans Gonzalez': 'Jorge Plans Gonzalez',
    'Nanda, Govind': 'Govind Nanda', 'Govind Nanda': 'Govind Nanda',
}
def canon(name):
    if not name: return name
    name = re.sub(r'\s*\(UCLA\)\s*', '', name).strip()
    if ',' in name:  # "Last, First" -> "First Last"
        a, b = [x.strip() for x in name.split(',', 1)]
        name = f'{b} {a}'
    return CANON.get(name, name)

PLACEHOLDER = ('Player1', 'Player2', 'Player 1', 'Player 2', 'None', '', None)
def norm(n):
    return ''.join(sorted(re.findall('[a-z]+', (n or '').lower())))

def real_names(pts):
    c = Counter()
    for p in pts:
        for k in ('pointWonBy', 'serverName', 'returnerName', 'lastShotHitBy', 'player1Name', 'player2Name'):
            v = p.get(k)
            if v not in PLACEHOLDER:
                c[v] += 1
    return c

def match_left(doc):
    left = re.split(r'\bvs\.?\b', doc.get('name', ''), maxsplit=1, flags=re.I)[0]
    left = re.sub(r'\s*UCLA\s*$', '', left, flags=re.I).strip()
    cp = doc.get('clientPlayer')
    if isinstance(cp, dict) and cp.get('firstName'):
        left = f"{cp.get('firstName','').strip()} {cp.get('lastName','').strip()}".strip()
    return left

def identify(doc):
    """Return (tagged_client_name, display_name, opponent) or (None,None,None) if unusable."""
    pts = doc.get('points') or []
    left = match_left(doc)
    display = canon(left)
    # require real point-winner data
    won_real = sum(1 for p in pts if p.get('pointWonBy') not in PLACEHOLDER)
    rn = real_names(pts)
    if won_real < 15 or not rn:
        return None, None, None
    # client tagged name: prefer player1Name (client convention), else fuzzy-match to match title
    p1 = Counter(p.get('player1Name') for p in pts if p.get('player1Name') not in PLACEHOLDER)
    if p1:
        U = p1.most_common(1)[0][0]
    else:
        cands = list(rn)
        exact = [n for n in cands if norm(n) == norm(left)]
        if exact:
            U = exact[0]
        else:
            lt = set(re.findall('[a-z]+', left.lower()))
            def score(n):
                nt = set(re.findall('[a-z]+', n.lower()))
                return sum(1 for a in lt for b in nt if a[:4] == b[:4])
            U = max(cands, key=score)
    others = [n for n in rn if n != U]
    opp = max(others, key=lambda n: rn[n]) if others else None
    return U, display, opp

def bucket(rc):
    try: rc = int(rc)
    except (TypeError, ValueError): return None
    if rc <= 4: return '1-4'
    if rc <= 8: return '5-8'
    if rc <= 12: return '9-12'
    return '13+'

def blank():
    return dict(points=0, ptsWon=0, servePts=0, firstIn=0, aces=0, df=0,
               placement=defaultdict(lambda: [0, 0]), rally=defaultdict(lambda: [0, 0]),
               winners=Counter(), errors=Counter(), netN=0, netWon=0,
               retN=0, retFh=0, retBh=0, retDir=defaultdict(lambda: [0, 0]),
               bpServeN=0, bpSaved=0, bpRetN=0, bpConv=0, matches=[])

def add_match(acc, doc, U):
    pts = doc.get('points') or []
    opp = re.split(r'\bvs\.?\b', doc.get('name', ''), maxsplit=1, flags=re.I)
    oppname = opp[1].strip() if len(opp) > 1 else doc.get('opponentTeam', '')
    acc['matches'].append(dict(name=doc.get('name', ''), opp=oppname[:48],
                               team=doc.get('opponentTeam', ''), video=doc.get('videoId', ''), n=len(pts)))
    for p in pts:
        won = (p.get('pointWonBy') == U)
        acc['points'] += 1
        if won: acc['ptsWon'] += 1
        uP1 = (p.get('player1Name') == U)
        bp = truthy(p.get('isBreakPoint'))
        if p.get('serverName') == U:
            acc['servePts'] += 1
            side = 'Ad' if 'Ad' in str(p.get('side', '')) else 'Deuce'
            fsi = p.get('firstServeIn')
            zone = None
            if str(fsi) in ('1', '1.0', 'True', 'true'):
                acc['firstIn'] += 1; zone = p.get('firstServeZone')
            else:
                ssi = p.get('secondServeIn')
                if str(ssi) in ('1', '1.0', 'True', 'true'): zone = p.get('secondServeZone')
                elif str(ssi) in ('0', '0.0', 'False', 'false'): acc['df'] += 1
            if zone in ('T', 'Body', 'Wide'):
                acc['placement'][(side, zone)][0] += 1
                if won: acc['placement'][(side, zone)][1] += 1
            if truthy(p.get('isAce')): acc['aces'] += 1
            if bp:
                acc['bpServeN'] += 1
                if won: acc['bpSaved'] += 1
        if p.get('returnerName') == U:
            fb = p.get('returnFhBh')
            if fb == 'Forehand': acc['retN'] += 1; acc['retFh'] += 1
            elif fb == 'Backhand': acc['retN'] += 1; acc['retBh'] += 1
            d = p.get('returnDirection')
            if d:
                acc['retDir'][d][0] += 1
                if won: acc['retDir'][d][1] += 1
            if bp:
                acc['bpRetN'] += 1
                if won: acc['bpConv'] += 1
        b = bucket(p.get('rallyCount'))
        if b:
            acc['rally'][b][0] += 1
            if won: acc['rally'][b][1] += 1
        nf = p.get('atNetPlayer1') if uP1 else p.get('atNetPlayer2')
        if truthy(nf):
            acc['netN'] += 1
            if won: acc['netWon'] += 1
        if p.get('lastShotHitBy') == U:
            wing = WING.get(p.get('lastShotFhBh'), p.get('lastShotFhBh'))
            res = p.get('lastShotResult')
            if wing and res == 'Winner': acc['winners'][wing] += 1
            elif wing and res == 'Error': acc['errors'][wing] += 1

def rate(a, b): return round(a / b, 3) if b else None

def finalize(name, gender, acc):
    order = {'1-4': 0, '5-8': 1, '9-12': 2, '13+': 3}
    return dict(
        name=name, gender=gender,
        matchesTracked=len(acc['matches']),
        matches=sorted(acc['matches'], key=lambda m: -m['n']),
        points=acc['points'], ptsWon=acc['ptsWon'], winPct=rate(acc['ptsWon'], acc['points']),
        servePts=acc['servePts'], firstInPct=rate(acc['firstIn'], acc['servePts']),
        aces=acc['aces'], df=acc['df'],
        placement=[dict(side=s, spot=z, n=v[0], won=v[1], wonPct=rate(v[1], v[0]))
                   for (s, z), v in sorted(acc['placement'].items())],
        rally=[dict(bucket=b, n=v[0], wonPct=rate(v[1], v[0]))
               for b, v in sorted(acc['rally'].items(), key=lambda kv: order.get(kv[0], 9))],
        winners=dict(acc['winners']), errors=dict(acc['errors']),
        winTotal=sum(acc['winners'].values()), errTotal=sum(acc['errors'].values()),
        net=(dict(n=acc['netN'], won=acc['netWon'], pct=rate(acc['netWon'], acc['netN'])) if acc['netN'] else None),
        ret=(dict(n=acc['retN'], fh=acc['retFh'], bh=acc['retBh'],
                  dir=[dict(dir=d, n=v[0], wonPct=rate(v[1], v[0])) for d, v in acc['retDir'].items()])
             if acc['retN'] else None),
        bp=dict(saveN=acc['bpServeN'], saved=acc['bpSaved'], savePct=rate(acc['bpSaved'], acc['bpServeN']),
                convN=acc['bpRetN'], conv=acc['bpConv'], convPct=rate(acc['bpConv'], acc['bpRetN'])),
    )

def main():
    index = json.load(open(os.path.join(HERE, 'fs_index.json')))
    players = {}   # (gender, canon) -> acc
    report = []
    for row in index:
        doc = json.load(open(os.path.join(CACHE, row['id'] + '.json')))
        name = doc.get('name', '')
        if is_excluded(name):
            report.append(('SKIP', name[:50])); continue
        team = str(doc.get('clientTeam', ''))
        gender = 'men' if '(M)' in team else ('women' if '(W)' in team else None)
        if gender is None:
            # infer from name context is unreliable; skip unknown-gender test rows
            report.append(('SKIP-nogender', name[:50])); continue
        U, disp, opp = identify(doc)
        if U is None:
            report.append(('SKIP-untagged', name[:50])); continue
        key = (gender, disp)
        if key not in players: players[key] = blank()
        add_match(players[key], doc, U)
        report.append(('OK', gender, disp, f'(tag={U})', name[:40]))

    out = {'men': [], 'women': []}
    for (gender, disp), acc in players.items():
        out[gender].append(finalize(disp, gender, acc))
    for g in out: out[g].sort(key=lambda p: -p['points'])

    dest = os.path.join(HERE, '..', 'dashboard-data.json')
    json.dump(out, open(dest, 'w'), indent=1)

    for row in report:
        print('  ', ' | '.join(str(x) for x in row))
    print()
    for g in ('men', 'women'):
        print(f'== {g}: {len(out[g])} players ==')
        for p in out[g]:
            print(f"   {p['name']:24} {p['matchesTracked']}m {p['points']:>4}pt  win {p['winPct']}  "
                  f"1stIn {p['firstInPct']}  W:E {p['winTotal']}:{p['errTotal']}  "
                  f"net {p['net']['pct'] if p['net'] else '-'}  bpConv {p['bp']['convPct']}")
    print('\nwrote', os.path.normpath(dest))

if __name__ == '__main__':
    main()

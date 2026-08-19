#!/usr/bin/env python3
import json, urllib.request

KEY = 'AIzaSyBOvEiiwKE_Q_aTWdyOpTIDmYmbPHA9KOg'
BASE = 'https://firestore.googleapis.com/v1/projects/match-viewing-dashboard/databases/(default)/documents'

def unwrap(v):
    if not isinstance(v, dict): return v
    if 'mapValue' in v: return {k: unwrap(x) for k, x in v['mapValue'].get('fields', {}).items()}
    if 'arrayValue' in v: return [unwrap(x) for x in v['arrayValue'].get('values', [])]
    for t in ('stringValue', 'booleanValue', 'doubleValue'):
        if t in v: return v[t]
    if 'integerValue' in v: return int(v['integerValue'])
    if 'nullValue' in v: return None
    return v

def getdoc(mid):
    req = urllib.request.Request(f'{BASE}/matches/{mid}?key={KEY}', headers={'User-Agent': 'curl/8'})
    return json.load(urllib.request.urlopen(req))

def player_name(f):
    cp = unwrap(f.get('clientPlayer', {})) if 'clientPlayer' in f else None
    if isinstance(cp, dict) and cp.get('firstName'):
        return f"{cp.get('firstName','').strip()} {cp.get('lastName','').strip()}".strip()
    # fall back to parsing the name string: "<Player> UCLA vs ..." or "<Player> vs ..."
    nm = str(f.get('name', {}).get('stringValue', ''))
    import re
    m = re.split(r'\s+(?:UCLA\s+)?vs\.?\s+', nm, maxsplit=1, flags=re.I)
    left = m[0].strip()
    left = re.sub(r'\s+UCLA$', '', left, flags=re.I).strip()
    return left

manifest = json.load(open('fs_matches_manifest.json'))
ucla = [r for r in manifest if any(s in str(r.get('clientTeam', '')) for s in ('UCLA', 'Rudy Quan', 'Los Angeles'))]

withdata = []
dumped = False
for r in ucla:
    try:
        d = getdoc(r['_id'])
    except Exception as e:
        print('ERR', r['_id'], e); continue
    f = d.get('fields', {})
    pts = unwrap(f.get('points', {})) or []
    if not isinstance(pts, list): pts = []
    if len(pts) >= 5:
        team = str(f.get('clientTeam', {}).get('stringValue', ''))
        withdata.append(dict(id=r['_id'], name=str(f.get('name', {}).get('stringValue', '')),
                             player=player_name(f), team=team, video=str(f.get('videoId', {}).get('stringValue', '')),
                             n=len(pts)))
        if not dumped:
            print('=== SAMPLE POINT KEYS ===')
            print(json.dumps(pts[0], indent=1)[:2500])
            dumped = True
withdata.sort(key=lambda x: -x['n'])
print(f'\n{len(withdata)} UCLA matches with >=5 tagged points:\n')
gender = lambda t: 'M' if '(M)' in t else ('W' if '(W)' in t else '?')
from collections import defaultdict
byp = defaultdict(list)
for w in withdata:
    byp[(gender(w['team']), w['player'])].append(w['n'])
    print(f"  {w['n']:>4}  [{gender(w['team'])}] {w['player']:22} vs {w['name'][:50]}")
print(f'\n== {len(byp)} distinct player-genders ==')
for (g, p), ns in sorted(byp.items()):
    print(f'  [{g}] {p:24} {len(ns)} matches, {sum(ns)} pts')
json.dump(withdata, open('fs_withdata.json', 'w'), indent=1)
print('\nwrote fs_withdata.json')

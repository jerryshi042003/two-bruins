#!/usr/bin/env python3
"""Fetch + cache every tagged UCLA match across ALL Firestore collections
(matches, UCLA (M), UCLA (W), tag), identify the UCLA player, dedupe, report."""
import json, os, re, urllib.request, urllib.parse
from collections import Counter, defaultdict

KEY = 'AIzaSyBOvEiiwKE_Q_aTWdyOpTIDmYmbPHA9KOg'
BASE = 'https://firestore.googleapis.com/v1/projects/match-viewing-dashboard/databases/(default)/documents'
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'fs_all_cache')
os.makedirs(CACHE, exist_ok=True)
COLLECTIONS = ['matches', 'UCLA (M)', 'UCLA (W)', 'tag']
PLACEHOLDER = ('', None, 'None', 'Player1', 'Player2', 'Player 1', 'Player 2')

def unwrap(v):
    if not isinstance(v, dict): return v
    if 'mapValue' in v: return {k: unwrap(x) for k, x in v['mapValue'].get('fields', {}).items()}
    if 'arrayValue' in v: return [unwrap(x) for x in v['arrayValue'].get('values', [])]
    for t in ('stringValue', 'booleanValue', 'doubleValue'):
        if t in v: return v[t]
    if 'integerValue' in v: return int(v['integerValue'])
    if 'nullValue' in v: return None
    return v

def getj(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'curl/8'})))

def list_ids(col):
    ids, token = [], None
    while True:
        q = [('key', KEY), ('pageSize', '300'), ('mask.fieldPaths', 'name')]
        if token: q.append(('pageToken', token))
        d = getj(f'{BASE}/{urllib.parse.quote(col)}?' + urllib.parse.urlencode(q))
        ids += [doc['name'].rsplit('/', 1)[1] for doc in d.get('documents', [])]
        token = d.get('nextPageToken')
        if not token: break
    return ids

def fetch(col, mid):
    safe = urllib.parse.quote(col) + '__' + mid
    path = os.path.join(CACHE, safe + '.json')
    if os.path.exists(path):
        return json.load(open(path))
    doc = getj(f'{BASE}/{urllib.parse.quote(col)}/{urllib.parse.quote(mid)}?key={KEY}')
    f = {k: unwrap(v) for k, v in doc.get('fields', {}).items()}
    json.dump(f, open(path, 'w'))
    return f

def dedupe_points(pts):
    seen, out = set(), []
    for p in pts:
        k = (p.get('pointNumber'), p.get('Position'), p.get('pointWonBy'), p.get('serverName'))
        if k in seen: continue
        seen.add(k); out.append(p)
    return out

def real_names(pts):
    c = Counter()
    for p in pts:
        for k in ('pointWonBy', 'serverName', 'returnerName', 'lastShotHitBy', 'player1Name', 'player2Name'):
            v = p.get(k)
            if v not in PLACEHOLDER:
                c[v] += 1
    return c

def norm(n): return ''.join(sorted(re.findall('[a-z]+', (n or '').lower())))

# ---------- pass 1: collect all tagged docs ----------
docs = []   # (col, id, fields, pts)
for col in COLLECTIONS:
    ids = list_ids(col)
    kept = 0
    for mid in ids:
        f = fetch(col, mid)
        if f.get('_deleted'): continue
        pts = f.get('points') or []
        if not isinstance(pts, list): continue
        pts = dedupe_points(pts)
        real = sum(1 for p in pts if p.get('pointWonBy') not in PLACEHOLDER)
        if real >= 15:
            docs.append((col, mid, f, pts)); kept += 1
    print(f'  {col!r}: {len(ids)} docs, {kept} tagged')
print(f'total tagged docs: {len(docs)}')

# ---------- build UCLA roster + opponent set from any doc with a name ----------
roster, opponents = Counter(), Counter()
def match_left(f):
    nm = f.get('name', '') or ''
    left = re.split(r'\bvs\.?\b', nm, maxsplit=1, flags=re.I)[0]
    return re.sub(r'\s*UCLA.*$', '', left, flags=re.I).strip()
def match_right(f):
    nm = f.get('name', '') or ''
    parts = re.split(r'\bvs\.?\b', nm, maxsplit=1, flags=re.I)
    return parts[1].strip() if len(parts) > 1 else ''

for col, mid, f, pts in docs:
    left = match_left(f)
    if left and len(left) > 2:
        rn = real_names(pts)
        # the point-name matching the title-left is a confirmed UCLA player
        for n in rn:
            if norm(n) == norm(left):
                roster[n] += 1
        right = match_right(f)
        for n in rn:
            if right and norm(n) and norm(n) in norm(right):
                opponents[n] += 1
rosterset = set(roster)
print(f'\nseed roster ({len(rosterset)}):', sorted(rosterset))

if __name__ == '__main__':
    json.dump([(c, m) for c, m, f, p in docs], open(os.path.join(HERE, 'fs_all_index.json'), 'w'))
    print('\ncached + indexed', len(docs), 'tagged docs across collections')

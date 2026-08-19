#!/usr/bin/env python3
"""Fetch + cache every UCLA match's full tagged point data from Firestore."""
import json, os, urllib.request, time

KEY = 'AIzaSyBOvEiiwKE_Q_aTWdyOpTIDmYmbPHA9KOg'
BASE = 'https://firestore.googleapis.com/v1/projects/match-viewing-dashboard/databases/(default)/documents'
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fs_cache')
os.makedirs(CACHE, exist_ok=True)

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

manifest = json.load(open(os.path.join(os.path.dirname(__file__), 'fs_matches_manifest.json')))
ucla = [r for r in manifest if any(s in str(r.get('clientTeam', '')) for s in ('UCLA', 'Rudy Quan', 'Los Angeles'))]

fetched = 0
index = []
for r in ucla:
    mid = r['_id']
    path = os.path.join(CACHE, mid + '.json')
    if os.path.exists(path):
        doc = json.load(open(path))
    else:
        try:
            raw = getdoc(mid)
        except Exception as e:
            print('ERR', mid, e); continue
        f = raw.get('fields', {})
        doc = {k: unwrap(v) for k, v in f.items()}
        json.dump(doc, open(path, 'w'))
        fetched += 1
        time.sleep(0.05)
    pts = doc.get('points') or []
    if isinstance(pts, list) and len(pts) >= 5:
        index.append(dict(id=mid, name=doc.get('name', ''), clientTeam=doc.get('clientTeam', ''),
                          opponentTeam=doc.get('opponentTeam', ''), video=doc.get('videoId', ''),
                          clientPlayer=doc.get('clientPlayer'), n=len(pts)))
json.dump(index, open(os.path.join(os.path.dirname(__file__), 'fs_index.json'), 'w'), indent=1)
print(f'cached {fetched} new; {len(index)} matches with >=5 points indexed')

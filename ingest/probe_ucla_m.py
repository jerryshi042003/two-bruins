import json, urllib.request, urllib.parse
from collections import Counter
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

def getj(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'curl/8'})))

# list all UCLA (M) ids
ids, token = [], None
while True:
    q = [('key', KEY), ('pageSize', '300'), ('mask.fieldPaths', 'name')]
    if token: q.append(('pageToken', token))
    d = getj(BASE + '/' + urllib.parse.quote('UCLA (M)') + '?' + urllib.parse.urlencode(q))
    ids += [doc['name'].rsplit('/', 1)[1] for doc in d.get('documents', [])]
    token = d.get('nextPageToken')
    if not token: break
print('UCLA (M) total docs:', len(ids))

tagged = 0
schema_shown = 0
for mid in ids:
    doc = getj(BASE + '/' + urllib.parse.quote('UCLA (M)') + '/' + urllib.parse.quote(mid) + '?key=' + KEY)
    f = {k: unwrap(v) for k, v in doc.get('fields', {}).items()}
    pts = f.get('points') or []
    real = sum(1 for p in pts if p.get('pointWonBy') not in ('', None, 'None', 'Player1', 'Player2'))
    if real >= 15:
        tagged += 1
        if schema_shown < 2:
            print(f'\n=== TAGGED DOC {mid}  ({real} real pts of {len(pts)}) ===')
            print('players:', json.dumps(f.get('players'))[:300])
            print('teams:', json.dumps(f.get('teams'))[:200])
            print('matchDetails:', json.dumps(f.get('matchDetails'))[:160])
            print('sample point winners:', dict(Counter(str(p.get('pointWonBy')) for p in pts).most_common(3)))
            print('sample serverName:', dict(Counter(str(p.get('serverName')) for p in pts).most_common(3)))
            schema_shown += 1
print(f'\nUCLA (M): {tagged} docs with >=15 real tagged points')

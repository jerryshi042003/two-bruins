#!/usr/bin/env python3
"""Page through the Firestore `matches` collection and build a metadata manifest.
Public web API key (client-embedded, safe). Excludes the heavy `points` map via
a field mask so we can enumerate every match cheaply."""
import json, urllib.request, urllib.parse

KEY = 'AIzaSyBOvEiiwKE_Q_aTWdyOpTIDmYmbPHA9KOg'
BASE = 'https://firestore.googleapis.com/v1/projects/match-viewing-dashboard/databases/(default)/documents'
FIELDS = ['name', 'clientTeam', 'clientPlayer', 'opponentTeam', 'opponentPlayer',
          'date', 'videoId', 'published', '_deleted', 'collection', 'singlesDoubles', 'matchType']

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'curl/8'})
    return json.load(urllib.request.urlopen(req))

def val(f):
    if f is None: return None
    for k in ('stringValue', 'booleanValue', 'integerValue', 'doubleValue'):
        if k in f: return f[k]
    if 'nullValue' in f: return None
    return f

def page(col, token=None):
    q = [('key', KEY), ('pageSize', '300')]
    for fp in FIELDS: q.append(('mask.fieldPaths', fp))
    if token: q.append(('pageToken', token))
    return get(f'{BASE}/{col}?' + urllib.parse.urlencode(q))

def all_docs(col):
    out, token = [], None
    while True:
        d = page(col, token)
        for doc in d.get('documents', []):
            row = {k: val(v) for k, v in doc.get('fields', {}).items()}
            row['_id'] = doc['name'].rsplit('/', 1)[1]
            out.append(row)
        token = d.get('nextPageToken')
        if not token: break
    return out

if __name__ == '__main__':
    rows = all_docs('matches')
    live = [r for r in rows if not r.get('_deleted')]
    ucla = [r for r in live if 'UCLA' in str(r.get('clientTeam', ''))]
    men = [r for r in ucla if '(M)' in str(r.get('clientTeam'))]
    women = [r for r in ucla if '(W)' in str(r.get('clientTeam'))]
    other = [r for r in ucla if r not in men and r not in women]
    print(f'total docs: {len(rows)}  live: {len(live)}  UCLA: {len(ucla)}  (M {len(men)} / W {len(women)} / other {len(other)})')
    from collections import Counter
    print('clientTeam values:', dict(Counter(str(r.get('clientTeam')) for r in live)))
    print('\n== distinct UCLA players ==')
    for g, lst in [('M', men), ('W', women), ('?', other)]:
        players = Counter(str(r.get('clientPlayer')) for r in lst)
        print(f'  [{g}] {len(players)} players:')
        for p, c in players.most_common():
            print(f'      {p}: {c} matches')
    json.dump(rows, open('fs_matches_manifest.json', 'w'), indent=1)
    print('\nwrote fs_matches_manifest.json  (', len(rows), 'docs )')

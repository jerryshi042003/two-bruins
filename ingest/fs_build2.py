#!/usr/bin/env python3
"""Unified dashboard build across ALL Firestore collections (deduped)."""
import os, json, re, urllib.parse
import fs_build as B  # safe: guarded by __main__

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'fs_all_cache')

def dedupe_points(pts):
    seen, out = set(), []
    for p in pts:
        k = (p.get('pointNumber'), p.get('Position'), p.get('pointWonBy'), p.get('serverName'))
        if k in seen: continue
        seen.add(k); out.append(p)
    return out

def real_count(pts):
    return sum(1 for p in pts if p.get('pointWonBy') not in B.PLACEHOLDER)

# load all cached docs
index = json.load(open(os.path.join(HERE, 'fs_all_index.json')))
docs = []
for col, mid in index:
    path = os.path.join(CACHE, urllib.parse.quote(col) + '__' + mid + '.json')
    f = json.load(open(path))
    f['points'] = dedupe_points(f.get('points') or [])
    docs.append((col, f))

# roster from named docs
roster = set()
for col, f in docs:
    left = B.match_left(f)
    if left and len(left) > 2:
        for n in B.real_names(f['points']):
            if B.norm(n) == B.norm(left):
                roster.add(n)

# dedupe by videoId (keep the copy with most real points)
best = {}
for col, f in docs:
    vid = f.get('videoId') or ''
    name = f.get('name') or ''
    key = f'vid:{vid}' if vid else f'nov:{B.norm(name)}:{len(f["points"])}'
    rc = real_count(f['points'])
    if key not in best or rc > best[key][2]:
        best[key] = (col, f, rc)

def gender_of(col, f):
    if col == 'UCLA (M)': return 'men'
    if col == 'UCLA (W)': return 'women'
    t = str(f.get('clientTeam', ''))
    return 'men' if '(M)' in t else ('women' if '(W)' in t else None)

def identify2(f):
    rn = B.real_names(f['points'])
    left = B.match_left(f)
    left = re.sub(r'\s+UCLA\b.*$', '', left, flags=re.I).strip()  # strip "UCLA (W)/(M)" tail
    if left and len(left) > 2:
        for n in rn:
            if B.norm(n) == B.norm(left):
                return n, B.canon(left)
        # fuzzy by shared token prefixes
        lt = set(re.findall('[a-z]+', left.lower()))
        cand = max(rn, key=lambda n: sum(1 for a in lt for b in set(re.findall('[a-z]+', n.lower())) if a[:4] == b[:4]), default=None)
        if cand:
            return cand, B.canon(left)
    # blank name: pick the roster member among the point names
    cands = [n for n in rn if n in roster]
    if cands:
        U = max(cands, key=lambda n: rn[n])
        return U, B.canon(U)
    return None, None

players = {}
report = {'ok': 0, 'skip_id': [], 'skip_ex': []}
for key, (col, f, rc) in best.items():
    name = f.get('name', '') or ''
    if name and B.is_excluded(name):
        report['skip_ex'].append(name[:44]); continue
    gender = gender_of(col, f)
    if gender is None:
        report['skip_ex'].append('(nogender) ' + name[:40]); continue
    U, disp = identify2(f)
    if U is None:
        report['skip_id'].append(f'[{col}] {name[:36]} names={list(B.real_names(f["points"]))[:3]}'); continue
    k = (gender, disp)
    if k not in players: players[k] = B.blank()
    B.add_match(players[k], f, U)
    report['ok'] += 1

out = {'men': [], 'women': []}
for (gender, disp), acc in players.items():
    out[gender].append(B.finalize(disp, gender, acc))
for g in out: out[g].sort(key=lambda p: -p['points'])

if __name__ == '__main__':
    dest = os.path.join(HERE, '..', 'dashboard-data.json')
    json.dump(out, open(dest, 'w'), indent=1)
    print(f"ok={report['ok']}  excluded={len(report['skip_ex'])}  unidentified={len(report['skip_id'])}")
    print('\n-- UNIDENTIFIED (need roster) --')
    for s in report['skip_id']: print('   ', s)
    for g in ('men', 'women'):
        print(f'\n== {g}: {len(out[g])} players ==')
        for p in out[g]:
            print(f"   {p['name']:24} {p['matchesTracked']}m {p['points']:>4}pt  win {p['winPct']}  "
                  f"W:E {p['winTotal']}:{p['errTotal']}  bpConv {p['bp']['convPct']}")
    print('\nwrote', os.path.normpath(dest))

#!/usr/bin/env python3
"""Thorough audit: every UCLA doc across all collections, real-point count,
dedup + exclusion decisions, per-player match totals. Answers 'how many matches
really exist and why did some not make the dashboard'."""
import json, os, re, urllib.parse
from collections import defaultdict
import fs_build2 as F2   # reuses best/identify2/gender_of
import fs_build as B

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'fs_all_cache')
PH = B.PLACEHOLDER

def real(pts):
    return sum(1 for p in pts if p.get('pointWonBy') not in PH)

# 1. Raw scan of ALL cached docs (every collection), any point data
idx = json.load(open(os.path.join(HERE, 'fs_all_index.json')))
alldocs = []
for col, mid in idx:
    p = os.path.join(CACHE, urllib.parse.quote(col) + '__' + mid + '.json')
    if not os.path.exists(p): continue
    f = json.load(open(p))
    pts = F2.dedupe_points(f.get('points') or [])
    alldocs.append((col, mid, f, pts, real(pts)))

print(f'cached tagged docs (>=15 real): {len(idx)}')
print(f'docs with 1-14 real points (currently excluded):')
low = [(f.get("name","")[:48], r, col) for col,mid,f,pts,r in alldocs if 0 < r < 15]
# also scan for ANY doc in fs_all_index that had <15 — but index only has >=15. Re-scan caches dir fully:
import glob
extra = []
seen_ids = {mid for col,mid in idx}
for path in glob.glob(os.path.join(CACHE, '*.json')):
    base = os.path.basename(path)[:-5]
    col, mid = base.split('__', 1)
    if mid in seen_ids: continue
    f = json.load(open(path))
    if f.get('_deleted'): continue
    pts = F2.dedupe_points(f.get('points') or [])
    r = real(pts)
    if r >= 1:
        extra.append((urllib.parse.unquote(col), mid, f, r))
print(f'  cached-but-not-indexed docs with real points: {len(extra)}')
for col, mid, f, r in sorted(extra, key=lambda x: -x[3])[:25]:
    print(f'    {r:>4} real  [{col}] {f.get("name","")[:44]}')

# 2. What the dashboard actually has
dd = json.load(open(os.path.join(HERE, '..', 'dashboard-data.json')))
print('\n=== dashboard per-player match counts ===')
for g in ('men', 'women'):
    for p in dd[g]:
        print(f'  [{g[0]}] {p["name"]:22} {p["matchesTracked"]} matches, {p["points"]} pts')

# 3. Dedup audit: how many docs collapsed
kept = len(F2.best)
print(f'\ndeduped unique keys in F2.best: {kept}  (from {len(alldocs)} indexed docs)')

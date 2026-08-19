#!/usr/bin/env python3
"""UTR lookup via the public UTR search API (no auth needed).
Disambiguates by college / name match. Caches results to utr_cache.json."""
import json, os, re, urllib.request, urllib.parse, time

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(HERE, 'utr_cache.json')
CACHE = json.load(open(CACHE_PATH)) if os.path.exists(CACHE_PATH) else {}

def _get(query):
    url = 'https://api.utrsports.net/v2/search/players?' + urllib.parse.urlencode({'query': query, 'top': 8})
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    return json.load(urllib.request.urlopen(req)).get('hits', [])

def _tokens(s):
    return set(re.findall('[a-z]+', (s or '').lower()))

def _norm(s):
    return ''.join(sorted(re.findall('[a-z]+', (s or '').lower())))

def lookup(name, college=None, save=True):
    """Return dict with singles/doubles UTR + matched profile, or None."""
    key = f'{name}||{college or ""}'
    if key in CACHE:
        return CACHE[key]
    try:
        hits = _get(name)
    except Exception as e:
        return {'name': name, 'error': str(e)}
    want_name = _tokens(name)
    want_col = (college or '').lower()
    best, best_score = None, -1
    want_last = name.strip().split()[-1].lower() if name.strip().split() else ''
    cands = []
    for h in hits:
        s = h.get('source', {})
        dn = s.get('displayName')
        if not dn:
            continue
        nt = _tokens(dn)
        # Require a real identity match — surname, OR >=2 shared tokens, OR normalized
        # full-name match (handles reordered/spelling variants). This kills same-first-name
        # mismatches (Hoogmartens -> Zverev share only "alexander") without over-filtering.
        if not (want_last in nt or len(want_name & nt) >= 2 or _norm(name) == _norm(dn)):
            continue
        col = ''
        pc = s.get('playerCollege') or s.get('college')
        if isinstance(pc, dict):
            col = pc.get('name') or ''
        col = col or s.get('collegeName') or ''
        colmatch = 1 if (want_col and want_col in col.lower()) else 0
        hr = s.get('historicRatings') or {}
        live = s.get('singlesUtr') or 0
        hist = hr.get('historicSinglesRating') or 0
        eff = live if live > 0 else hist           # last-known UTR when currently inactive/unrated
        cands.append(dict(name=dn, id=s.get('id'),
                          singlesUtr=round(eff, 2) if eff else None,
                          utrKind='live' if live > 0 else ('historic' if hist > 0 else 'none'),
                          ratingDate=None if live > 0 else hr.get('historicSinglesRatingDate'),
                          status='Rated' if live > 0 else ('Historic' if hist > 0 else 'Unrated'),
                          doublesUtr=s.get('doublesUtr'), college=col, nationality=s.get('nationality'),
                          _col=colmatch, _rated=1 if eff > 0 else 0, _live=1 if live > 0 else 0,
                          _utr=eff, _overlap=len(want_name & nt)))
    # college is a strong preference, not a hard filter (school-name formats vary widely).
    # Prefer any real rating (live or last-known historic), live over historic on ties.
    pool = cands
    if pool:
        pool.sort(key=lambda c: (c['_col'], c['_rated'], c['_live'], c['_utr'], c['_overlap']), reverse=True)
        best = {k: v for k, v in pool[0].items() if not k.startswith('_')}
    result = best or {'name': name, 'notfound': True, 'reason': 'no surname/college match'}
    if save:
        CACHE[key] = result
        json.dump(CACHE, open(CACHE_PATH, 'w'), indent=1)
        time.sleep(0.15)
    return result

# UCLA players (canonical names from the corpus)
UCLA_MEN = ['Spencer Johnson', 'Alexander Hoogmartens', 'Giacomo Revelli', 'Jorge Plans Gonzalez',
            'Govind Nanda', 'Rudy Quan', 'Gianluca Ballotta', 'Emon Van Loben Sels', 'Leo Von Bismark',
            'Azuma Visaya']
UCLA_WOMEN = ['Elise Wagle', 'Kimmi Hance', 'Ahmani Guichard', 'Anne Lutkemeyer', 'Tian Fang Ran',
              'Bianca Fernandez', 'Sasha Vagramov']

if __name__ == '__main__':
    print('== UCLA MEN ==')
    for n in UCLA_MEN:
        r = lookup(n, 'UCLA')
        print(f"  {n:24} UTR {r.get('singlesUtr')}  ({r.get('status')})  col={r.get('college')}")
    print('== UCLA WOMEN ==')
    for n in UCLA_WOMEN:
        r = lookup(n, 'UCLA')
        print(f"  {n:24} UTR {r.get('singlesUtr')}  ({r.get('status')})  col={r.get('college')}")

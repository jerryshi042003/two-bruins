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

# verified nickname -> UTR-profile-name aliases for known UCLA players
ALIAS = {
    'Kimmi Hance': 'Kimberly Hance',
    'Sasha Vagramov': 'Alexandra Vagramov',
    'Jorge Plans Gonzalez': 'Jorge Plans',
    'Jorge Gonzalez': 'Jorge Plans',
}

# Verified UTR pins for the 14 known UCLA players (duplicate profiles make name-search
# unreliable). Values confirmed against each player's UTR profile via the authed session.
# kind: 'live' current rating, 'historic' last reliable rating for a between-seasons player.
PINNED = {
    'Spencer Johnson':      {'id': 2580878, 'singlesUtr': 14.24, 'status': 'Rated',    'utrKind': 'live'},
    'Rudy Quan':            {'id': 168171,  'singlesUtr': 13.59, 'status': 'Rated',    'utrKind': 'live'},
    'Jorge Plans Gonzalez': {'id': 5004687, 'singlesUtr': 13.25, 'status': 'Rated',    'utrKind': 'live'},
    'Gianluca Ballotta':    {'id': 2920230, 'singlesUtr': 12.00, 'status': 'Rated',    'utrKind': 'live'},
    'Alexander Hoogmartens':{'id': 2871883, 'singlesUtr': 13.00, 'status': 'Historic', 'utrKind': 'historic', 'ratingDate': '2025-05-11'},
    'Giacomo Revelli':      {'id': 277105,  'singlesUtr': 12.00, 'status': 'Historic', 'utrKind': 'historic'},
    'Govind Nanda':         {'id': 4337229, 'singlesUtr': 13.00, 'status': 'Historic', 'utrKind': 'historic'},
    'Elise Wagle':          {'singlesUtr': 10.00, 'status': 'Historic', 'utrKind': 'historic'},
    'Kimmi Hance':          {'singlesUtr': 10.00, 'status': 'Historic', 'utrKind': 'historic'},
    'Ahmani Guichard':      {'id': 4333248, 'singlesUtr': 10.15, 'status': 'Rated', 'utrKind': 'live'},
    'Anne Lutkemeyer':      {'id': 4843357, 'singlesUtr': 10.80, 'status': 'Rated', 'utrKind': 'live'},
    'Tian Fang Ran':        {'id': 4338119, 'singlesUtr': 11.45, 'status': 'Rated', 'utrKind': 'live'},
    'Bianca Fernandez':     {'id': 809877,  'singlesUtr': 10.03, 'status': 'Rated', 'utrKind': 'live'},
    'Sasha Vagramov':       {'id': 4392698, 'singlesUtr': 10.43, 'status': 'Rated', 'utrKind': 'live'},
}

def lookup(name, college=None, save=True):
    """Return dict with singles/doubles UTR + matched profile, or None."""
    if name in PINNED:
        return dict(PINNED[name], name=name, college='UCLA')
    key = f'{name}||{college or ""}'
    if key in CACHE:
        return CACHE[key]
    name = ALIAS.get(name, name)
    try:
        hits = _get(name)
    except Exception as e:
        return {'name': name, 'error': str(e)}
    want_name = _tokens(name)
    want_col = (college or '').lower()
    best, best_score = None, -1
    _parts = name.strip().split()
    want_last = _parts[-1].lower() if _parts else ''
    want_first = re.sub(r'[^a-z]', '', _parts[0].lower()) if _parts else ''
    cands = []
    for h in hits:
        s = h.get('source', {})
        dn = s.get('displayName')
        if not dn:
            continue
        nt = _tokens(dn)
        # Require BOTH surname and a compatible first name (equal, or one is an initial
        # of the other). Surname-alone let "Kimmi Hance" match "Keaton Hance"; first-name-
        # alone let "Alexander Hoogmartens" match "Alexander Zverev". Normalized full-name
        # match is the escape hatch for reordered/spelling variants.
        def _firstok():
            for t in nt:
                if t == want_first: return True
                if len(want_first) == 1 and t.startswith(want_first): return True
                if len(t) == 1 and want_first.startswith(t): return True
            return False
        if not ((want_last in nt and _firstok()) or _norm(name) == _norm(dn)):
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

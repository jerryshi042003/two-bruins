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
    for h in hits:
        s = h.get('source', {})
        if not s.get('displayName'):
            continue
        score = len(want_name & _tokens(s.get('displayName')))
        col = ''
        pc = s.get('playerCollege') or s.get('college')
        if isinstance(pc, dict):
            col = (pc.get('name') or '')
        col = col or s.get('collegeName') or ''
        if want_col and want_col in col.lower():
            score += 5
        utr = s.get('singlesUtr') or 0
        # strongly prefer profiles that actually carry a rating
        if s.get('ratingStatusSingles') == 'Rated' and utr > 0:
            score += 4
        if not utr:
            score -= 3
        if score > best_score:
            best_score = score
            best = dict(name=s.get('displayName'), id=s.get('id'),
                        singlesUtr=s.get('singlesUtr'), doublesUtr=s.get('doublesUtr'),
                        status=s.get('ratingStatusSingles'), college=col,
                        nationality=s.get('nationality'), score=score)
    # fallback: if the college-matched best carries no rating, take the highest-rated
    # hit whose name tokens fully contain the query tokens (distinct names only)
    if (not best) or best.get('status') != 'Rated' or not (best.get('singlesUtr') or 0):
        if len(want_name) >= 2:
            cand = None
            for h in hits:
                s = h.get('source', {})
                nm = _tokens(s.get('displayName'))
                utrv = s.get('singlesUtr') or 0
                if want_name <= nm and s.get('ratingStatusSingles') == 'Rated' and utrv > 0:
                    if cand is None or utrv > cand.get('singlesUtr', 0):
                        col = ''
                        pc = s.get('playerCollege') or s.get('college')
                        if isinstance(pc, dict): col = pc.get('name') or ''
                        cand = dict(name=s.get('displayName'), id=s.get('id'),
                                    singlesUtr=utrv, doublesUtr=s.get('doublesUtr'),
                                    status='Rated', college=col or s.get('collegeName') or '',
                                    nationality=s.get('nationality'), score=best_score, fallback=True)
            if cand:
                best = cand
    result = best or {'name': name, 'notfound': True}
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

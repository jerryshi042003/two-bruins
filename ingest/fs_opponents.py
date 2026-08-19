#!/usr/bin/env python3
"""For every deduped UCLA match, extract the opponent (tagged name + school) and
look up their UTR. Writes match_context.json: per match -> ucla player, opponent,
opponent UTR, ucla UTR, result."""
import json, os, re
import fs_build2 as F2   # importing runs its module-level build (best, identify2)
import utr

B = F2.B
HERE = os.path.dirname(os.path.abspath(__file__))

def clean_school(t):
    if not t: return ''
    t = re.sub(r'\s*\((M|W)\)\s*$', '', str(t)).strip()
    return t

# UCLA player UTRs (from utr.py roster)
ucla_utr = {}
for n in utr.UCLA_MEN + utr.UCLA_WOMEN:
    r = utr.lookup(n, 'UCLA')
    ucla_utr[n] = r.get('singlesUtr') if (r.get('singlesUtr') or 0) > 0 else None

rows = []
for key, (col, f, rc) in F2.best.items():
    name = f.get('name', '') or ''
    if name and B.is_excluded(name):
        continue
    gender = F2.gender_of(col, f)
    if gender is None:
        continue
    U, disp = F2.identify2(f)
    if U is None:
        continue
    rn = B.real_names(f['points'])
    others = [n for n in rn if n != U]
    oppName = max(others, key=lambda n: rn[n]) if others else None
    school = clean_school(f.get('opponentTeam'))
    won = sum(1 for p in f['points'] if p.get('pointWonBy') == U)
    lost = sum(1 for p in f['points'] if p.get('pointWonBy') == oppName)
    ur = utr.lookup(oppName, school) if oppName else None
    opp_utr = ur.get('singlesUtr') if ur and (ur.get('singlesUtr') or 0) > 0 else None
    # canonical UCLA UTR (by canon display name)
    canon_u = disp
    p_utr = None
    for k, v in ucla_utr.items():
        if B.norm(k) == B.norm(canon_u):
            p_utr = v; break
    rows.append(dict(player=disp, gender=gender, oppName=oppName, school=school,
                     oppUtr=opp_utr, playerUtr=p_utr, ptsWon=won, ptsLost=lost,
                     video=f.get('videoId', ''), matchName=name[:60]))

json.dump(rows, open(os.path.join(HERE, 'match_context.json'), 'w'), indent=1)

resolved = sum(1 for r in rows if r['oppUtr'] is not None)
print(f'{len(rows)} matches; opponent UTR resolved: {resolved} ({100*resolved//max(1,len(rows))}%)')
print()
for r in sorted(rows, key=lambda x: (x['gender'], x['player'])):
    pu = f"{r['playerUtr']:.1f}" if r['playerUtr'] else ' n/a'
    ou = f"{r['oppUtr']:.1f}" if r['oppUtr'] else ' n/a'
    print(f"  [{r['gender'][0]}] {r['player'][:20]:20} (UTR {pu}) vs {str(r['oppName'])[:22]:22} ({r['school'][:16]:16}) UTR {ou}")

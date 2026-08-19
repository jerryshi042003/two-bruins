#!/usr/bin/env python3
"""Compute per-player win/loss signature, over-time trend, and strength-of-schedule.
Reads the deduped corpus (via fs_build2) + opponent UTR (match_context) + player UTR.
Writes player_enrich.json keyed 'gender::Player Name'."""
import json, os, re
from collections import Counter, defaultdict
import fs_build2 as F2
import utr

B = F2.B
HERE = os.path.dirname(os.path.abspath(__file__))
WING = {'Forehand': 'forehand', 'Backhand': 'backhand',
        'Forehand Volley': 'forehand volley', 'Backhand Volley': 'backhand volley',
        'Overhead': 'overhead'}
PH = B.PLACEHOLDER

ctx = {(r['player'], r['oppName']): r for r in json.load(open(os.path.join(HERE, 'match_context.json')))}

def parse_date(name):
    m = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', name or '')
    if not m: return None
    mo, da, yr = m.groups()
    yr = ('20' + yr) if len(yr) == 2 else yr
    return f'{yr}-{int(mo):02d}-{int(da):02d}'

def player_utr(disp):
    r = utr.lookup(disp, 'UCLA')
    return r.get('singlesUtr') if (r.get('singlesUtr') or 0) > 0 else None

# gather per (gender,player) -> list of match docs (deduped)
groups = defaultdict(list)
for key, (col, f, rc) in F2.best.items():
    name = f.get('name', '') or ''
    if name and B.is_excluded(name): continue
    gender = F2.gender_of(col, f)
    if gender is None: continue
    U, disp = F2.identify2(f)
    if U is None: continue
    groups[(gender, disp)].append((U, f))

enrich = {}
for (gender, disp), matches in groups.items():
    winEnd = Counter(); lossEnd = Counter()
    winWing = Counter(); lossWing = Counter()
    trend = []
    utrs = []
    rec_vs_stronger = [0, 0]; rec_vs_weaker = [0, 0]   # [ptsWon, ptsLost] vs stronger/weaker opp
    p_utr = player_utr(disp)
    for U, f in matches:
        pts = f['points']
        rn = B.real_names(pts)
        others = [n for n in rn if n != U]
        oppName = max(others, key=lambda n: rn[n]) if others else None
        won = lost = 0
        for p in pts:
            wb = p.get('pointWonBy')
            is_win = (wb == U)
            is_loss = (wb not in PH and wb != U)
            if is_win: won += 1
            elif is_loss: lost += 1
            end_by = p.get('lastShotHitBy'); res = p.get('lastShotResult')
            wing = WING.get(p.get('lastShotFhBh'), (p.get('lastShotFhBh') or '').lower())
            if is_win:
                if end_by == U and res == 'Winner':
                    winEnd['own winner'] += 1
                    if wing: winWing[wing] += 1
                elif end_by and end_by != U and res == 'Error':
                    winEnd['opponent error'] += 1
            elif is_loss:
                if end_by == U and res == 'Error':
                    lossEnd['own error'] += 1
                    if wing: lossWing[wing] += 1
                elif end_by and end_by != U and res == 'Winner':
                    lossEnd['opponent winner'] += 1
        c = ctx.get((disp, oppName)) or {}
        oppUtr = c.get('oppUtr')
        if oppUtr: utrs.append(oppUtr)
        if oppUtr and p_utr:
            if oppUtr >= p_utr: rec_vs_stronger[0] += won; rec_vs_stronger[1] += lost
            else: rec_vs_weaker[0] += won; rec_vs_weaker[1] += lost
        trend.append(dict(date=parse_date(f.get('name', '')), opp=oppName, oppUtr=oppUtr,
                          won=won, lost=lost, winPct=round(won / (won + lost), 3) if won + lost else None))
    trend.sort(key=lambda t: (t['date'] or '9999'))
    wtot = sum(winEnd.values()) or 1
    ltot = sum(lossEnd.values()) or 1
    enrich[f'{gender}::{disp}'] = dict(
        playerUtr=p_utr,
        winSig=dict(ownWinnerPct=round(winEnd['own winner'] / wtot, 3),
                    oppErrorPct=round(winEnd['opponent error'] / wtot, 3),
                    topWing=winWing.most_common(1)[0][0] if winWing else None,
                    n=sum(winEnd.values())),
        lossSig=dict(ownErrorPct=round(lossEnd['own error'] / ltot, 3),
                     oppWinnerPct=round(lossEnd['opponent winner'] / ltot, 3),
                     topWing=lossWing.most_common(1)[0][0] if lossWing else None,
                     n=sum(lossEnd.values())),
        winWings=dict(winWing.most_common(4)), lossWings=dict(lossWing.most_common(4)),
        sos=dict(avgOppUtr=round(sum(utrs) / len(utrs), 2) if utrs else None, nRated=len(utrs),
                 vsStronger=rec_vs_stronger, vsWeaker=rec_vs_weaker),
        trend=trend,
    )

json.dump(enrich, open(os.path.join(HERE, '..', 'player_enrich.json'), 'w'), indent=1)
if __name__ == '__main__':
    for k in sorted(enrich):
        e = enrich[k]
        ws, ls = e['winSig'], e['lossSig']
        print(f"{k:30} UTR {e['playerUtr']} | WIN: {int(ws['oppErrorPct']*100)}% opp-err, {int(ws['ownWinnerPct']*100)}% own-win (top {ws['topWing']}) | "
              f"LOSS: {int(ls['ownErrorPct']*100)}% own-err (top {ls['topWing']}) | SoS {e['sos']['avgOppUtr']}")

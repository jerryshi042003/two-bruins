import parse

rows = []
for fn, player in parse.JOBS:
    try:
        rows.append(parse.analyze(fn, player))
    except Exception as e:
        rows.append({'file': fn, 'error': str(e)})

def pct(x):
    return '' if x is None else f'{x*100:.0f}%'

hdr = f"{'Player':16}{'Opp':20}{'Pts':>5}{'Win%':>6}{'1stIn':>7}{'Net':>8}{'NetW%':>7}{'+1FH%':>7}{'FH W:E':>8}{'BH W:E':>8}{'Ral':>6}"
print(hdr)
print('-' * len(hdr))
for r in rows:
    if 'error' in r:
        print(r['file'], r['error']); continue
    wf = r['winnersByWing'].get('Forehand', 0); ef = r['errorsByWing'].get('Forehand', 0)
    wb = r['winnersByWing'].get('Backhand', 0); eb = r['errorsByWing'].get('Backhand', 0)
    net = f"{r['netWon']}/{r['netPts']}"
    print(f"{r['me']:16}{r['opp'][:19]:20}{r['points']:>5}{pct(r['ptWinPct']):>6}{pct(r['firstInPct']):>7}"
          f"{net:>8}{pct(r['netWinPct']):>7}{pct(r['plus1']['fhSharePct']):>7}"
          f"{f'{wf}:{ef}':>8}{f'{wb}:{eb}':>8}{(r['avgRally'] or 0):>6}")

# roster-wide net thesis check
print()
print("NET THESIS (freq + win%):")
for r in rows:
    if 'error' in r or not r['netPts']:
        continue
    freq = r['netPts'] / r['points']
    print(f"  {r['me']:16} reaches net {r['netPts']:>3}/{r['points']} pts ({freq*100:.0f}%), wins {pct(r['netWinPct'])}")

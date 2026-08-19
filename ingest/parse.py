#!/usr/bin/env python3
"""Parse Tennis-Viz Shot_Visuals CSVs into per-UCLA-player analytics.
One row per shot. UCLA player = the player on clientTeam side (shotHitBy / serverName).
Computes the same families of metrics the two-bruins site already shows so new
players slot into the existing chart vocabulary. Real data only; counts kept
alongside every rate so small samples stay honest.
"""
import csv, sys, json
from collections import defaultdict, Counter

def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None

def load(path):
    with open(path, newline='') as f:
        return list(csv.DictReader(f))

def analyze(path, ucla_player):
    rows = load(path)
    # group shots by pointNumber
    pts = defaultdict(list)
    for r in rows:
        pts[r.get('pointNumber')].append(r)

    P = {'file': path, 'me': ucla_player}
    # opponent name
    names = set()
    for r in rows:
        for k in ('player1Name', 'player2Name'):
            if r.get(k): names.add(r[k])
    P['opp'] = next((n for n in names if n != ucla_player), '?')
    P['clientTeam'] = rows[0].get('clientTeam', '')
    P['opponentTeam'] = rows[0].get('opponentTeam', '')
    P['date'] = rows[0].get('Date', '')
    P['event'] = rows[0].get('Event', '')

    n_pts = 0
    pts_won = 0
    serve_pts = 0
    first_in = 0
    aces = 0
    df = 0
    serve_zone = Counter()          # (side, zone) -> count when this player serving
    serve_zone_won = Counter()
    rally_lengths = []
    net_pts = 0
    net_pts_won = 0
    winners_by_wing = Counter()
    errors_by_wing = Counter()
    winners_by_dir = Counter()
    plus1_fh = 0                    # serve+1 (3rd shot of point) hit by server, forehand
    plus1_total = 0
    plus1_fh_won = 0
    plus1_total_won = 0
    ret_depth = Counter()
    ret_depth_won = Counter()

    for pn, shots in pts.items():
        if pn in (None, '', 'pointNumber'):
            continue
        shots = sorted(shots, key=lambda s: num(s.get('shotInRally')) or 0)
        first = shots[0]
        server = first.get('serverName', '')
        won_by = None
        for s in shots:
            if s.get('pointWonBy'):
                won_by = s['pointWonBy']
        this_won = (won_by == ucla_player)
        n_pts += 1
        if this_won:
            pts_won += 1

        # serve metrics when UCLA player serves
        if server == ucla_player:
            serve_pts += 1
            fsi = num(first.get('firstServeIn'))
            side = first.get('side', '')
            if fsi == 1:
                first_in += 1
                z = first.get('firstServeZone', '')
                if z:
                    serve_zone[(side, z)] += 1
                    if this_won: serve_zone_won[(side, z)] += 1
            else:
                ssi = num(first.get('secondServeIn'))
                z = first.get('secondServeZone', '')
                if ssi == 1 and z:
                    serve_zone[(side, z)] += 1
                    if this_won: serve_zone_won[(side, z)] += 1
                elif ssi == 0:
                    df += 1
            if str(first.get('isAce', '')).strip() in ('1', '1.0', 'True', 'TRUE'):
                aces += 1
            # serve+1 = shot #2 by server? In this schema shot 1 = serve; the
            # server's next ball is shotInRally==3 (3rd contact). Find it.
            for s in shots:
                if (num(s.get('shotInRally')) == 3) and s.get('shotHitBy') == ucla_player:
                    plus1_total += 1
                    if this_won: plus1_total_won += 1
                    if s.get('shotFhBh') == 'Forehand':
                        plus1_fh += 1
                        if this_won: plus1_fh_won += 1

        # returns when UCLA player returns (returnerName)
        if first.get('returnerName') == ucla_player:
            for s in shots:
                if (num(s.get('shotInRally')) == 2) and s.get('shotHitBy') == ucla_player:
                    d = s.get('depth', '')
                    if d:
                        ret_depth[d] += 1
                        if this_won: ret_depth_won[d] += 1

        # rally length
        rc = num(first.get('rallyCount'))
        if rc is None:
            rc = max((num(s.get('shotInRally')) or 0) for s in shots)
        rally_lengths.append(rc)

        # net points (UCLA player at net)
        p1 = ucla_player == first.get('player1Name')
        at_net = False
        for s in shots:
            flag = s.get('atNetPlayer1') if p1 else s.get('atNetPlayer2')
            if str(flag).strip() in ('1', '1.0', 'True', 'TRUE'):
                at_net = True
        if at_net:
            net_pts += 1
            if this_won: net_pts_won += 1

        # winners / errors by this player
        for s in shots:
            if s.get('shotHitBy') != ucla_player:
                continue
            wing = s.get('shotFhBh', '')
            direction = s.get('shotDirection', '')
            if str(s.get('isWinner', '')).strip() in ('1', '1.0', 'True', 'TRUE'):
                if wing: winners_by_wing[wing] += 1
                if direction: winners_by_dir[direction] += 1
            for ek in ('isErrorWideR', 'isErrorWideL', 'isErrorNet', 'isErrorLong'):
                if str(s.get(ek, '')).strip() in ('1', '1.0', 'True', 'TRUE'):
                    if wing: errors_by_wing[wing] += 1

    P['points'] = n_pts
    P['ptsWon'] = pts_won
    P['ptWinPct'] = round(pts_won / n_pts, 3) if n_pts else None
    P['servePts'] = serve_pts
    P['firstInPct'] = round(first_in / serve_pts, 3) if serve_pts else None
    P['aces'] = aces
    P['df'] = df
    P['avgRally'] = round(sum(rally_lengths) / len(rally_lengths), 2) if rally_lengths else None
    P['netPts'] = net_pts
    P['netWon'] = net_pts_won
    P['netWinPct'] = round(net_pts_won / net_pts, 3) if net_pts else None
    P['plus1'] = {'total': plus1_total, 'fh': plus1_fh,
                  'fhSharePct': round(plus1_fh / plus1_total, 3) if plus1_total else None,
                  'fhWon': plus1_fh_won, 'totalWon': plus1_total_won}
    P['serveZone'] = {f"{s}|{z}": {'n': serve_zone[(s, z)], 'won': serve_zone_won[(s, z)]}
                      for (s, z) in serve_zone}
    P['winnersByWing'] = dict(winners_by_wing)
    P['errorsByWing'] = dict(errors_by_wing)
    P['winnersByDir'] = dict(winners_by_dir)
    P['retDepth'] = {d: {'n': ret_depth[d], 'won': ret_depth_won[d]} for d in ret_depth}
    return P

JOBS = [
    ('nanda_basavareddy.csv', 'Govind Nanda'),
    ('quan_thanos.csv', 'Rudy Quan'),
    ('johnson_pinto.csv', 'Spencer Johnson'),
    ('lutkemeyer_gagnon.csv', 'Anne Lutkemeyer'),
    ('wagle_chan.csv', 'Elise Wagle'),
    ('wagle_komac.csv', 'Elise Wagle'),
]

if __name__ == '__main__':
    out = []
    for fn, player in JOBS:
        try:
            out.append(analyze(fn, player))
        except Exception as e:
            out.append({'file': fn, 'error': str(e)})
    print(json.dumps(out, indent=2))

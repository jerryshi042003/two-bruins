# Regeneration pipeline (Firestore -> dashboards)

Repeatable build for the UCLA player dashboards. Run in order:

1. `python3 fs_manifest.py`   # list all match docs (metadata)
2. `python3 fs_all.py`        # fetch+cache every tagged match across collections
3. `python3 fs_build2.py`     # -> ../dashboard-data.json  (per-player stats, deduped)
4. `python3 utr.py`           # UCLA player UTRs (public UTR API, no auth)
5. `python3 fs_opponents.py`  # -> match_context.json      (opponent UTRs / strength of schedule)
6. `python3 fs_enrich.py`     # -> ../player_enrich.json   (win/loss signature, over-time, SoS)

Data source: Firestore project `match-viewing-dashboard`, collections
`matches` + `UCLA (M)` + `UCLA (W)` + `tag`, deduped by YouTube videoId.
UTR from the public `api.utrsports.net/v2/search/players` endpoint.
Caches (fs_cache/, fs_all_cache/, *.json) are gitignored; delete to force refetch.

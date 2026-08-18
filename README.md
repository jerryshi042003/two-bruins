# Two Bruins, Two Plans

A shot-level report on two UCLA men's singles wins from the same dual against USC,
**21 February 2026**, built entirely from raw SwingVision match exports.

- **Spencer Johnson** def. Branko Djuric (USC) 4–6, 6–2, 6–3 — 747 tracked shots
- **Rudy Quan** def. Nathan Trouve (USC) 7–5, 7–5 — 864 tracked shots

## What it does

Reads the raw SwingVision `.xlsx` export (one row per ball struck: stroke, spin,
speed, direction, result, contact and bounce coordinates in metres, plus the
position of the shot in the match video), mirrors every shot into a single court
frame, and converts to the court units used by the Bruin Tennis Consulting
analytics library (1 m = 38.28 units, net at y = 0) so the existing D3 court
visuals, zone splits and Win% / Freq badges apply unchanged.

No manual tagging is added — point outcomes are derived from the final ball of
each rally.

## Visuals

Every chart slot offers several options, switchable in the page:

| Slot | Options |
| --- | --- |
| Rally length | bar chart · head-to-head summary bars |
| Serve | six-zone placement map (classic / light) |
| Shot placement | miss map · FH landing · BH landing · point-enders · FH misses |
| Return | contact-depth bands (classic / light) |

A **court style** switch at the top toggles all courts between the BTC sage-green
treatment and a light variant.

## Match video

`app.js` has a `VIDEO` map at the top. Drop in a YouTube id per match and the clip
cards become real embeds cued to the exact second each point starts; leave it
`null` and the cards show the timestamp to scrub to.

## Run locally

```bash
python3 -m http.server 8912   # then open http://localhost:8912
```

## Credits

Court geometry, palette and badge chrome follow
[bruin-tennis-consulting/analytics](https://github.com/bruin-tennis-consulting/analytics).
Source data from
[bruin-tennis-consulting/data-collection](https://github.com/bruin-tennis-consulting/data-collection).

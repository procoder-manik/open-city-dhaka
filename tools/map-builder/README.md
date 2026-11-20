# map-builder

Turns OpenStreetMap data into streamed game map chunks.

```bash
pnpm map:fetch   # Overpass API (mirrors + backoff) → assets-src/osm/mohammadpur.json (git-ignored)
pnpm map:build   # → apps/web/public/assets/map/mohammadpur/
```

- Projects lat/lon to metres, finds the straightest 260 m of **Tajmahal Road** and aligns it with the
  hand-built street block (origin, +Z), so the detailed block sits on the real road.
- Roads (type, width), buildings (footprint, levels from OSM or plausible 4–9 floors, road-facing edges
  get shops + signboards), parks, water, POIs, road names.
- 256 m chunks (`c_<i>_<j>.json`, decimetre ints), `colliders.json` (oriented boxes for every building),
  `minimap.json` (road segments), `index.json` (bounds, chunk list, POIs, road labels).
- Add a new area: change `BBOX` in `fetch-osm.mjs` (or make it a CLI arg), pick an anchor road, rebuild.

Map data © OpenStreetMap contributors (ODbL) — attribution is shown on the website.

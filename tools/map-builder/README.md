# map-builder (Phase 2)

Turns OpenStreetMap data into streamed game map chunks.

Planned pipeline:
1. Export area (e.g. Mohammadpur bounding box) from Overpass API → `zones/<zone>.osm.json`
2. Roads → lane graph + road meshes (lanes, footpaths, medians)
3. Building footprints → procedural Dhaka-style buildings (4–10 floors, balconies, signboards)
4. Landmark overrides from `zones/<zone>.json` (hand-made models replace procedural ones)
5. Split into 128 m chunks → `apps/web/public/assets/chunks/<zone>/<x>_<z>.glb` + colliders + navmesh tiles
6. Minimap / full map texture from the same data

Map data © OpenStreetMap contributors (ODbL) — attribution is required on the credits page.

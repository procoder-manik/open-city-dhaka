// Download Mohammadpur map data from OpenStreetMap (Overpass API), with mirrors + backoff.
// Usage: node tools/map-builder/fetch-osm.mjs   → assets-src/osm/mohammadpur.json (git-ignored)
// Map data © OpenStreetMap contributors, ODbL.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'assets-src', 'osm', 'mohammadpur.json');

/** Mohammadpur, Dhaka (south-west of Shyamoli, Beribadh on the west). */
export const BBOX = { s: 23.749, w: 90.346, n: 23.772, e: 90.372 };

const query = `[out:json][timeout:120];
(
  way["highway"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
  way["building"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
  way["natural"="water"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
  way["waterway"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
  way["leisure"~"park|playground|pitch"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
  way["landuse"~"grass|recreation_ground"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
  node["amenity"~"place_of_worship|police|bus_station|marketplace|hospital|school"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
  node["name"]["place"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
);
out body;
>;
out skel qt;`;

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wait = 15000;
for (let attempt = 1; attempt <= 40; attempt++) {
  const url = MIRRORS[attempt % MIRRORS.length];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'game-map-builder' },
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(180000),
    });
    const text = await res.text();
    if (res.ok && text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      if (Array.isArray(data.elements) && data.elements.length > 1000) {
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, text);
        console.log(`OK ${url}: ${data.elements.length} elements, ${(text.length / 1e6).toFixed(1)} MB`);
        process.exit(0);
      }
    }
    console.log(`attempt ${attempt} ${url}: HTTP ${res.status}`);
  } catch (err) {
    console.log(`attempt ${attempt} ${url}: ${err.message}`);
  }
  await sleep(wait);
  wait = Math.min(wait * 1.5, 120000);
}
console.error('FAILED to download OSM data');
process.exit(1);

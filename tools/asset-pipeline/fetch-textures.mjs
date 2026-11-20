// Download CC0 PBR textures from Poly Haven, verify checksums, and make
// game-ready versions: 1024 px (desktop) and 512 px (phones).
// Usage: pnpm assets:textures
// Originals → assets-src/polyhaven/<id>/ (git-ignored); outputs →
// apps/web/public/assets/textures/<name>_<map>_<size>.jpg
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const srcDir = join(root, 'assets-src', 'polyhaven');
const outDir = join(root, 'apps', 'web', 'public', 'assets', 'textures');

/** Poly Haven id → our short name. All CC0 (public domain). */
const TEXTURES = {
  asphalt_02: 'asphalt',
  beige_wall_001: 'plaster',
  cracked_concrete_wall: 'concrete',
  brick_pavement_02: 'pavement',
  rusted_shutter: 'shutter',
  corrugated_iron: 'tin',
};
const MAPS = { Diffuse: 'diff', nor_gl: 'nor' };
const SIZES = [1024, 512];
const UA = { 'User-Agent': 'game-asset-pipeline' };

mkdirSync(outDir, { recursive: true });
const credits = [
  '# Texture credits',
  '',
  'All textures from [Poly Haven](https://polyhaven.com) — CC0 (public domain).',
  '',
];

for (const [id, name] of Object.entries(TEXTURES)) {
  const files = await (
    await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })
  ).json();
  const dir = join(srcDir, id);
  mkdirSync(dir, { recursive: true });
  for (const [mapKey, mapName] of Object.entries(MAPS)) {
    const entry = files[mapKey]?.['1k']?.jpg;
    if (!entry) {
      console.warn(`! ${id}: no ${mapKey} 1k jpg`);
      continue;
    }
    const src = join(dir, `${mapName}_1k.jpg`);
    if (!existsSync(src)) {
      const res = await fetch(entry.url, { headers: UA });
      if (!res.ok) throw new Error(`${id} ${mapKey}: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const md5 = createHash('md5').update(buf).digest('hex');
      if (md5 !== entry.md5) throw new Error(`${id} ${mapKey}: checksum mismatch`);
      writeFileSync(src, buf);
      console.log(`↓ ${id} ${mapKey} (${(buf.length / 1024).toFixed(0)} KB, md5 ok)`);
    }
    for (const size of SIZES) {
      const out = join(outDir, `${name}_${mapName}_${size}.jpg`);
      await sharp(readFileSync(src))
        .resize(size, size)
        .jpeg({ quality: mapName === 'nor' ? 88 : 80, mozjpeg: true })
        .toFile(out);
    }
  }
  credits.push(`- \`${name}\` ← [${id}](https://polyhaven.com/a/${id})`);
}
writeFileSync(join(outDir, 'CREDITS.md'), credits.join('\n') + '\n');
console.log('✓ Textures ready in apps/web/public/assets/textures');

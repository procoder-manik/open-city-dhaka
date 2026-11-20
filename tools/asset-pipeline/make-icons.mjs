// Render PNG app icons + the social share image from each brand's icon.svg (sharp).
// Usage: node tools/asset-pipeline/make-icons.mjs
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const brandDir = join(root, 'apps', 'web', 'public', 'brand');
const brandCfg = JSON.parse(readFileSync(join(root, 'brand.config.json'), 'utf8'));

for (const dir of readdirSync(brandDir)) {
  const svgPath = join(brandDir, dir, 'icon.svg');
  if (!existsSync(svgPath)) continue;
  const svg = readFileSync(svgPath);
  for (const [name, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180],
  ]) {
    await sharp(svg, { density: 300 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(join(brandDir, dir, name));
  }
  // Maskable: icon inside the 80% safe zone on the brand background
  const inner = await sharp(svg, { density: 300 }).resize(400, 400).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#120d0a' } })
    .composite([{ input: inner, left: 56, top: 56 }])
    .png({ compressionLevel: 9 })
    .toFile(join(brandDir, dir, 'icon-maskable-512.png'));

  // 1200×630 share card (English text: renders the same on every machine)
  const preset =
    Object.values(brandCfg.presets ?? {}).find(
      (p) => p.logoDir === dir || p.logoDir?.endsWith(`/${dir}`),
    ) ?? {};
  const title = (preset.fullName ?? preset.displayName ?? dir.toUpperCase()).replace(/&/g, '&amp;');
  const tag = (preset.tagline ?? 'Open-world action comedy in Dhaka').replace(/&/g, '&amp;');
  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs>
      <radialGradient id="bg" cx="0.7" cy="0.3" r="0.9">
        <stop offset="0" stop-color="#3a1d10"/><stop offset="1" stop-color="#120d0a"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <text x="80" y="330" font-family="Arial Black, Impact, sans-serif" font-size="72" font-weight="900" fill="#ff9f1c">${title}</text>
    <text x="80" y="400" font-family="Arial, sans-serif" font-size="38" fill="#fff3e0">${tag}</text>
    <text x="80" y="490" font-family="Arial, sans-serif" font-size="30" fill="#c9b8a6">Free in your browser · Phone · Tablet · PC · Dhaka, Mohammadpur</text>
  </svg>`;
  const logo = await sharp(svg, { density: 300 }).resize(150, 150).png().toBuffer();
  await sharp(Buffer.from(card))
    .composite([{ input: logo, left: 80, top: 70 }])
    .png({ compressionLevel: 9 })
    .toFile(join(brandDir, dir, 'og.png'));
  console.log('icons + og for', dir);
}

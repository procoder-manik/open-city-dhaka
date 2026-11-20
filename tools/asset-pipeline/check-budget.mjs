// Fails (exit 1) if any game asset is over its size budget. Run in CI: `pnpm budget`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const assetsDir = join(root, 'apps', 'web', 'public', 'assets');
const { rules, totalFirstPlayableMb } = JSON.parse(
  readFileSync(join(here, 'budgets.json'), 'utf8'),
);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let failed = 0;
let total = 0;
for (const file of walk(assetsDir)) {
  const rel = relative(assetsDir, file).split(sep).join('/');
  const kb = statSync(file).size / 1024;
  total += kb;
  const rule = rules.find((r) => rel.includes(r.match) && rel.endsWith(r.ext));
  if (rule && kb > rule.maxKb) {
    console.error(`✗ ${rel}: ${kb.toFixed(0)} KB > ${rule.maxKb} KB`);
    failed++;
  }
}
const totalMb = total / 1024;
console.log(
  `Assets total: ${totalMb.toFixed(2)} MB (first-playable budget ${totalFirstPlayableMb} MB)`,
);
if (totalMb > totalFirstPlayableMb) {
  console.warn(
    '! Total exceeds first-playable budget — make sure most of it is streamed, not preloaded.',
  );
}
if (failed) {
  console.error(`${failed} asset(s) over budget`);
  process.exit(1);
}
console.log('✓ All assets within budget');
